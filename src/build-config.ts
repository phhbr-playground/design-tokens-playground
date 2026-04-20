import StyleDictionary, {
  type Config,
  type PlatformConfig,
  type File,
  type Transform
} from "style-dictionary";

/**
 * Custom transform to handle CSS functions properly
 */
export const cssFunctionTransform: Transform = {
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

export interface BuildOptions {
  outputDir?: string;
  prefix?: string;
  includeReferences?: boolean;
  generateTypes?: boolean;
  generateJson?: boolean;
  generateCss?: boolean;
  generateJs?: boolean;
}

/**
 * Creates Style Dictionary platform configurations
 */
export class BuildConfig {
  constructor(private options: BuildOptions) {}

  /**
   * Create CSS Variables platform configuration
   */
  createCssPlatform(): PlatformConfig {
    const cssFileConfig: File = {
      format: "css/variables",
      destination: "variables.css",
    };

    return {
      transformGroup: "css",
      buildPath: `${this.options.outputDir}/css/`,
      prefix: this.options.prefix,
      options: {
        outputReferences: this.options.includeReferences,
      },
      files: [cssFileConfig],
    };
  }

  /**
   * Create JavaScript platform configuration
   */
  createJsPlatform(): PlatformConfig {
    const jsFileConfig: File = {
      format: "javascript/es6",
      destination: "tokens.js",
    };

    return {
      transformGroup: "js",
      transforms: ["size/rem"],
      buildPath: `${this.options.outputDir}/`,
      prefix: this.options.prefix,
      files: [jsFileConfig],
    };
  }

  /**
   * Create TypeScript platform configuration
   */
  createTsPlatform(): PlatformConfig {
    const tsFileConfig: File = {
      format: "typescript/es6-declarations",
      destination: "tokens.d.ts",
    };

    return {
      transformGroup: "js",
      transforms: ["size/rem"],
      buildPath: `${this.options.outputDir}/`,
      prefix: this.options.prefix,
      files: [tsFileConfig],
    };
  }

  /**
   * Create the complete Style Dictionary configuration
   */
  createConfig(tokens: Record<string, unknown>): Config {
    const platforms: Record<string, PlatformConfig> = {};

    if (this.options.generateCss) platforms.css = this.createCssPlatform();
    if (this.options.generateJs) platforms.js = this.createJsPlatform();
    if (this.options.generateTypes) platforms.ts = this.createTsPlatform();

    return {
      tokens,
      platforms,
    };
  }
}