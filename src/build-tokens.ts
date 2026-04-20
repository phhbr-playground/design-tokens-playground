import { writeFileSync } from "node:fs";
import { join } from "node:path";
import StyleDictionary from "style-dictionary";
import { TokenLoader } from "./token-loader.js";
import { TokenReferenceResolver } from "./token-reference-resolver.js";
import { BuildConfig, type BuildOptions } from "./build-config.js";

const tokenLoader = new TokenLoader();
const referenceResolver = new TokenReferenceResolver();

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

  // Load and merge source tokens
  const allTokens = tokenLoader.loadTokens();

  console.log("🎯 Interpreting tokens with tokenscript-interpreter... (temporarily disabled)");
  const interpretedTokens = allTokens;

  // Generate Style Dictionary platforms
  const config = new BuildConfig({
    outputDir,
    prefix,
    includeReferences,
    generateTypes,
    generateJson,
    generateCss,
    generateJs,
  }).createConfig(interpretedTokens);

  const sd = new StyleDictionary(config);

  await sd.buildAllPlatforms();

  if (generateJson) {
    console.log("📄 Generating enhanced JSON export...");

    const resolvedTokens = new TokenReferenceResolver().resolveReferences(interpretedTokens);

    writeFileSync(join(process.cwd(), outputDir, "tokens.json"), JSON.stringify(allTokens, null, 2));
    writeFileSync(join(process.cwd(), outputDir, "tokens.resolved.json"), JSON.stringify(resolvedTokens, null, 2));
    writeFileSync(join(process.cwd(), outputDir, "tokens.interpreted.json"), JSON.stringify({}, null, 2));
  }

  console.log("✅ Design tokens built successfully!");
  console.log(`   📁 Output directory: ${outputDir}/`);
  if (generateCss) console.log(`   🎨 CSS variables: ${outputDir}/css/variables.css`);
  if (generateJs) console.log(`   📦 JavaScript module: ${outputDir}/tokens.js`);
  if (generateTypes) console.log(`   🔷 TypeScript types: ${outputDir}/tokens.d.ts`);
  if (generateJson) {
    console.log(`   📋 Raw tokens: ${outputDir}/tokens.json`);
    console.log(`   🔍 Resolved tokens: ${outputDir}/tokens.resolved.json`);
  }
}
