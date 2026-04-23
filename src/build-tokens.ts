import { writeFileSync } from "node:fs";
import { join } from "node:path";
import StyleDictionary from "style-dictionary";
import { Color, Fn } from "@tokens-studio/schema-validation";
import {
  builders,
  Config as TokenScriptConfig,
  processTokens,
} from "@tokens-studio/tokenscript-interpreter";
import { TokenLoader, type Hierarchy } from "./token-loader.js";
import { TokenReferenceResolver } from "./token-reference-resolver.js";
import { TokenValidator, type TokenGroup } from "./token-validator.js";
import { BuildConfig, type BuildOptions } from "./build-config.js";

const tokenLoader = new TokenLoader();

const OKLCH_SCHEMA_URI = "https://schema.tokenscript.dev.gcp.tokens.studio/custom/oklch/1";
const CLAMP_FUNCTION_SCHEMA_URI = "https://schema.tokenscript.dev.gcp.tokens.studio/custom/function-clamp/1";

/**
 * Builds an interpreter config with custom schemas used by this repository.
 */
function createTokenScriptRuntimeConfig(): TokenScriptConfig {
  const oklchSchema = Color.parseColorSpec({
    name: "Oklch",
    description: "OKLCH color schema with an initializer for oklch(l, c, h, alpha?).",
    type: "color",
    schema: {
      type: "object",
      order: ["l", "c", "h", "alpha"],
      required: ["l", "c", "h"],
      properties: {
        l: { type: "number" },
        c: { type: "number" },
        h: { type: "number" },
        alpha: { type: "number" },
      },
    },
    initializers: [
      {
        keyword: "oklch",
        schema: {
          type: "array",
          items: { type: "number" },
          minItems: 3,
          maxItems: 4,
        },
        script: {
          type: "https://schema.tokenscript.dev.gcp.tokens.studio/api/v1/core/tokenscript/0/initializer",
          script:
            "variable output: Color.Oklch;\n" +
            "output.l = {input}.get(0).get(0);\n" +
            "output.c = {input}.get(0).get(1);\n" +
            "output.h = {input}.get(0).get(2);\n\n" +
            "if ({input}.get(0).length() == 4) [\n" +
            "  output.alpha = {input}.get(0).get(3);\n" +
            "]\n\n" +
            "return output;",
        },
      },
    ],
    conversions: [],
  });

  const clampFunctionSchema = Fn.parseFunctionSpec({
    name: "Clamp",
    type: "function",
    keyword: "clamp",
    description: "Returns a CSS clamp() string without evaluating mixed-unit arithmetic.",
    input: {
      type: "object",
      properties: {
        min: { type: "string" },
        preferred: { type: "string" },
        max: { type: "string" },
      },
    },
    script: {
      type: "https://schema.tokenscript.dev.gcp.tokens.studio/api/v1/core/tokenscript/0/function",
      script:
        "variable minValue: String = {input}.get(0);\n" +
        "variable preferredValue: String = {input}.get(1);\n" +
        "variable maxValue: String = {input}.get(2);\n\n" +
        "return \"clamp(\".concat(minValue).concat(\", \" ).concat(preferredValue).concat(\", \" ).concat(maxValue).concat(\")\");",
    },
  });

  return new TokenScriptConfig().registerSchemas([
    {
      uri: OKLCH_SCHEMA_URI,
      schema: oklchSchema,
    },
    {
      uri: CLAMP_FUNCTION_SCHEMA_URI,
      schema: clampFunctionSchema,
    },
  ]);
}

/**
 * Creates a JSON-safe deep clone for token trees.
 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Normalizes unknown runtime output into an object map.
 */
function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Converts flat primitive arrays into CSS-like space-delimited values.
 */

/**
 * Strips $value/$type/$description/$extensions from nodes that are both a
 * token leaf and a group (mixed nodes). Turns them into pure groups so
 * Style Dictionary can process their children without emitting an invalid
 * top-level token for the parent.
 */
function normalizeMixedNodes(tokens: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const node = value as Record<string, unknown>;
      const hasValue = "$value" in node;
      const childKeys = Object.keys(node).filter((k) => !k.startsWith("$"));
      if (hasValue && childKeys.length > 0) {
        // Mixed node: keep children only, drop leaf properties.
        const childOnly: Record<string, unknown> = {};
        for (const ck of childKeys) {
          childOnly[ck] = node[ck];
        }
        result[key] = normalizeMixedNodes(childOnly);
      } else if (hasValue) {
        result[key] = node;
      } else {
        result[key] = normalizeMixedNodes(node);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function normalizeInterpretedValue(value: unknown): unknown {
  if (Array.isArray(value) && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
    return value.join(" ");
  }

  return value;
}

/**
 * Applies interpreted value normalization across flat token path maps.
 */
function normalizeFlatInterpretedValues(flatValues: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(flatValues).map(([tokenPath, interpretedValue]) => [
      tokenPath,
      normalizeInterpretedValue(interpretedValue),
    ])
  );
}

/**
 * Sets a value at a dotted path represented as a path segment array.
 */
function setNestedValue(target: Record<string, unknown>, path: string[], nextValue: unknown): void {
  let current: Record<string, unknown> = target;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const isLeaf = i === path.length - 1;

    if (isLeaf) {
      current[key] = nextValue;
      return;
    }

    const node = current[key];
    if (!node || typeof node !== "object") {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  }
}

/**
 * Applies interpreted token values onto `$value` properties in a token tree.
 *
 * Token paths that cannot be resolved in the current tree are skipped.
 */
function applyInterpretedValues(
  tokens: Record<string, unknown>,
  flatInterpretedValues: Record<string, unknown>
): Record<string, unknown> {
  const cloned = deepClone(tokens);

  for (const [tokenPath, resolvedValue] of Object.entries(flatInterpretedValues)) {
    const pathParts = tokenPath.split(".");
    let current: unknown = cloned;

    for (const part of pathParts) {
      if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
        current = null;
        break;
      }

      current = (current as Record<string, unknown>)[part];
    }

    if (current && typeof current === "object" && "$value" in (current as Record<string, unknown>)) {
      (current as { $value: unknown }).$value = resolvedValue;
    }
  }

  return cloned;
}

/**
 * Builds a flattened interpreted JSON output used by `tokens.interpreted.json`.
 */
function buildInterpretedJson(
  interpretedTokenTree: Record<string, unknown>,
  flatInterpretedValues: Record<string, unknown>
): Record<string, unknown> {
  const result = deepClone(interpretedTokenTree);

  for (const [tokenPath, resolvedValue] of Object.entries(flatInterpretedValues)) {
    setNestedValue(result, tokenPath.split("."), resolvedValue);
  }

  return result;
}

/**
 * Converts interpreter issue maps into concise warning lines for logs.
 */
function formatIssues(issues: Map<string, unknown[]>, maxLines = 20): string {
  const lines: string[] = [];

  for (const [tokenPath, tokenIssues] of issues) {
    for (const issue of tokenIssues) {
      if (lines.length >= maxLines) {
        return `${lines.join("\n")}\n...and more issues omitted`;
      }

      if (issue && typeof issue === "object") {
        const issueObj = issue as Record<string, unknown>;
        const message =
          typeof issueObj.message === "string"
            ? issueObj.message
            : typeof issueObj.code === "string"
              ? issueObj.code
              : JSON.stringify(issueObj);
        lines.push(`- ${tokenPath}: ${message}`);
      } else {
        lines.push(`- ${tokenPath}: ${String(issue)}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Runs the complete token build pipeline.
 *
 * Flow:
 * 1. Load and merge token files.
 * 2. Validate token schema and hierarchy.
 * 3. Interpret values via TokenScript (best effort).
 * 4. Build CSS/JS/types outputs with Style Dictionary.
 * 5. Write raw/resolved/interpreted JSON artifacts.
 *
 * @param options Optional build customization values.
 * @throws Error when token validation or hierarchy validation fails.
 */
export async function buildTokens(options: BuildOptions = {}) {
  const {
    outputDir = "dist",
    prefix = "ds",
    includeReferences = true,
    generateTypes = true,
    generateJson = true,
    generateCss = true,
    generateJs = true,
  } = options;

  console.log("🔨 Building design tokens...");

  // Load source tokens — by hierarchy for validation, merged for build
  const tokensByHierarchy = tokenLoader.loadTokensByHierarchy();
  const allTokens = tokenLoader.loadTokens();
  const validator = new TokenValidator();

  if (!validator.validate(tokensByHierarchy as Map<Hierarchy, TokenGroup>)) {
    const errors = validator.getErrors().map((error) => `- ${error}`).join("\n");
    throw new Error(`Token validation failed:\n${errors}`);
  }

  const warnings = validator.getWarnings();
  if (warnings.length > 0) {
    console.warn("⚠️  Token validation warnings:");
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }

  console.log("🎯 Interpreting tokens with tokenscript-interpreter...");
  const tokenScriptConfig = createTokenScriptRuntimeConfig();
  const processed = processTokens(allTokens, {
    builder: new builders.FlatObjectBuilder(),
    config: tokenScriptConfig,
  });

  if (processed.issues && processed.issues.size > 0) {
    console.warn("⚠️  TokenScript interpretation reported issues. Falling back to original values for affected tokens.");
    console.warn(formatIssues(processed.issues));
  }

  const flatInterpretedValues = normalizeFlatInterpretedValues(toObject(processed.output));
  const interpretedTokens = applyInterpretedValues(allTokens, flatInterpretedValues);

  // Normalize mixed nodes before passing to Style Dictionary.
  const sdTokens = normalizeMixedNodes(interpretedTokens);

  // Generate Style Dictionary platforms
  const config = new BuildConfig({
    outputDir,
    prefix,
    includeReferences,
    generateTypes,
    generateJson,
    generateCss,
    generateJs,
  }).createConfig(sdTokens);

  const sd = new StyleDictionary(config);

  await sd.buildAllPlatforms();

  if (generateJson) {
    console.log("📄 Generating enhanced JSON export...");

    const resolvedTokens = new TokenReferenceResolver().resolveReferences(interpretedTokens);
    const interpretedOutput = buildInterpretedJson(interpretedTokens, flatInterpretedValues);

    writeFileSync(join(process.cwd(), outputDir, "tokens.json"), JSON.stringify(allTokens, null, 2));
    writeFileSync(join(process.cwd(), outputDir, "tokens.pre-script.json"), JSON.stringify(allTokens, null, 2));
    writeFileSync(join(process.cwd(), outputDir, "tokens.resolved.json"), JSON.stringify(resolvedTokens, null, 2));
    writeFileSync(join(process.cwd(), outputDir, "tokens.interpreted.json"), JSON.stringify(interpretedOutput, null, 2));
  }

  console.log("✅ Design tokens built successfully!");
  console.log(`   📁 Output directory: ${outputDir}/`);
  if (generateCss) console.log(`   🎨 CSS variables: ${outputDir}/css/variables.css`);
  if (generateJs) console.log(`   📦 JavaScript module: ${outputDir}/tokens.js`);
  if (generateTypes) console.log(`   🔷 TypeScript types: ${outputDir}/tokens.d.ts`);
  if (generateJson) {
    console.log(`   📋 Raw tokens: ${outputDir}/tokens.json`);
    console.log(`   🧪 Pre-script tokens: ${outputDir}/tokens.pre-script.json`);
    console.log(`   🔍 Resolved tokens: ${outputDir}/tokens.resolved.json`);
  }
}
