#!/usr/bin/env node

import StyleDictionary, {
  type Config,
  type PlatformConfig,
  type File,
  type Transform
} from "style-dictionary";
import { processTokens } from "@tokens-studio/tokenscript-interpreter";
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Custom transform to handle CSS functions properly
const cssFunctionTransform: Transform = {
  name: "css/function-preserve",
  type: "value",
  transitive: true,
  matcher: (token) => {
    // Apply to all tokens that might contain CSS functions
    return typeof token.value === "string" &&
           (token.value.includes("clamp(") ||
            token.value.includes("minmax(") ||
            token.value.includes("calc(") ||
            token.value.includes("var("));
  },
  transformer: (token) => {
    // Ensure CSS functions are preserved as-is
    return token.value;
  }
};

interface BuildOptions {
  outputDir?: string;
  prefix?: string;
  includeReferences?: boolean;
  generateTypes?: boolean;
  generateJson?: boolean;
  generateCss?: boolean;
  generateJs?: boolean;
}

async function buildTokens(options: BuildOptions = {}) {
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

  // Load and interpret tokens with tokenscript-interpreter
  console.log("🎯 Interpreting tokens with tokenscript-interpreter... (temporarily disabled)");
  const allTokens: Record<string, unknown> = {};
  const tokenFiles = [
    "tokens/color/base.tokens.json",
    "tokens/spacing/base.tokens.json",
    "tokens/semantic/colors.tokens.json",
    "tokens/component/base.tokens.json"
  ];

  // Load all token files
  for (const file of tokenFiles) {
    try {
      const content = JSON.parse(readFileSync(join(process.cwd(), file), 'utf-8'));
      mergeTokens(allTokens, content);
    } catch (e) {
      // File might not exist, continue
    }
  }

  // For now, use tokens directly without TokenScript processing to ensure basic functionality works
  const interpretedTokens = allTokens;

  // CSS Variables Platform
  const cssFileConfig: File = {
    format: "css/variables",
    destination: "variables.css",
  };

  const cssPlatformConfig: PlatformConfig = {
    transformGroup: "css",
    buildPath: `${outputDir}/css/`,
    prefix,
    options: {
      outputReferences: includeReferences,
    },
    files: [cssFileConfig],
  };

  // JavaScript/ESM Platform
  const jsFileConfig: File = {
    format: "javascript/es6",
    destination: "tokens.js",
  };

  const jsPlatformConfig: PlatformConfig = {
    transformGroup: "js",
    transforms: ["size/rem"],
    buildPath: `${outputDir}/`,
    prefix,
    files: [jsFileConfig],
  };

  // TypeScript Definition Platform
  const tsFileConfig: File = {
    format: "typescript/es6-declarations",
    destination: "tokens.d.ts",
  };

  const tsPlatformConfig: PlatformConfig = {
    transformGroup: "js",
    transforms: ["size/rem"],
    buildPath: `${outputDir}/`,
    prefix,
    files: [tsFileConfig],
  };

  const platforms: Record<string, PlatformConfig> = {};

  if (generateCss) platforms.css = cssPlatformConfig;
  if (generateJs) platforms.js = jsPlatformConfig;
  if (generateTypes) platforms.ts = tsPlatformConfig;

  const config: Config = {
    tokens: interpretedTokens,
    platforms,
  };

  const sd = new StyleDictionary(config);

  // Note: CSS functions like clamp() are handled by default Style Dictionary transforms

  // Build all platforms
  await sd.buildAllPlatforms();

  // Generate enhanced JSON export with resolved references
  if (generateJson) {
    console.log("📄 Generating enhanced JSON export...");

    // Create structured interpreted tokens (flat with objects) for advanced use cases
    const structuredInterpretedTokens: Record<string, unknown> = {};
    // For now, just use empty object since we're not processing with TokenScript

    // Resolve references and create resolved version
    const resolvedTokens = resolveTokenReferences(interpretedTokens);

    writeFileSync(
      join(process.cwd(), outputDir, "tokens.json"),
      JSON.stringify(allTokens, null, 2)
    );

    writeFileSync(
      join(process.cwd(), outputDir, "tokens.resolved.json"),
      JSON.stringify(resolvedTokens, null, 2)
    );

    writeFileSync(
      join(process.cwd(), outputDir, "tokens.interpreted.json"),
      JSON.stringify(structuredInterpretedTokens, null, 2)
    );
  }

  console.log("✅ Design tokens built successfully!");
  console.log(`   📁 Output directory: ${outputDir}/`);

  if (generateCss) {
    console.log(`   🎨 CSS variables: ${outputDir}/css/variables.css`);
  }

  if (generateJs) {
    console.log(`   📦 JavaScript module: ${outputDir}/tokens.js`);
  }

  if (generateTypes) {
    console.log(`   🔷 TypeScript types: ${outputDir}/tokens.d.ts`);
  }

  if (generateJson) {
    console.log(`   📋 Raw tokens: ${outputDir}/tokens.json`);
    console.log(`   🔍 Resolved tokens: ${outputDir}/tokens.resolved.json`);
  }
}

// Deep merge tokens
function mergeTokens(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      mergeTokens(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      target[key] = source[key];
    }
  }
}

// Resolve token references like {color.primary}
function resolveTokenReferences(tokens: Record<string, unknown>): Record<string, unknown> {
  const resolved = JSON.parse(JSON.stringify(tokens));

  function resolveValue(value: unknown, path: string[] = []): unknown {
    if (typeof value === "string") {
      // Check for token references {path.to.token}
      const referenceMatch = value.match(/^\{([^}]+)\}$/);
      if (referenceMatch) {
        const refPath = referenceMatch[1].split(".");
        let current: unknown = resolved;

        for (const part of refPath) {
          if (current && typeof current === "object" && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            console.warn(`⚠️  Unresolved reference: {${refPath.join(".")}} at ${path.join(".")}`);
            return value; // Return original reference if unresolved
          }
        }

        // If the referenced value is an object with $value, return the $value
        if (current && typeof current === "object" && "$value" in current) {
          return (current as { $value: unknown }).$value;
        }

        return current;
      }

      // Handle complex values that might contain references
      if (value.includes("{") && value.includes("}")) {
        // For complex CSS functions, we might need more sophisticated parsing
        // For now, return as-is
        return value;
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => resolveValue(item, [...path, index.toString()]));
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = resolveValue(val, [...path, key]);
      }
      return result;
    }

    return value;
  }

  return resolveValue(resolved) as Record<string, unknown>;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🎨 Design Tokens Builder

Usage: npm run build [options]

Options:
  --output-dir, -o    Output directory (default: dist)
  --prefix, -p        CSS variable prefix (default: ds)
  --no-references     Don't include references in CSS output
  --no-types          Don't generate TypeScript definitions
  --no-json           Don't generate JSON exports
  --no-css            Don't generate CSS variables
  --no-js             Don't generate JavaScript module
  --help, -h          Show this help

Examples:
  npm run build
  npm run build --prefix myapp --output-dir build
  npm run build --no-types --no-json
`);
    return;
  }

  const options: BuildOptions = {
    outputDir: "dist",
    prefix: "ds",
    includeReferences: true,
    generateTypes: true,
    generateJson: true,
    generateCss: true,
    generateJs: true,
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--output-dir":
      case "-o":
        options.outputDir = args[++i];
        break;
      case "--prefix":
      case "-p":
        options.prefix = args[++i];
        break;
      case "--no-references":
        options.includeReferences = false;
        break;
      case "--no-types":
        options.generateTypes = false;
        break;
      case "--no-json":
        options.generateJson = false;
        break;
      case "--no-css":
        options.generateCss = false;
        break;
      case "--no-js":
        options.generateJs = false;
        break;
    }
  }

  try {
    await buildTokens(options);
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { buildTokens, type BuildOptions };

