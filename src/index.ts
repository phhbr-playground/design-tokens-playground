import StyleDictionary, {
  type Config,
  type PlatformConfig,
  type File
} from "style-dictionary";

const cssFileConfig: File = {
  format: "css/variables",
  destination: "variables.css",
};

const cssPlatformConfig: PlatformConfig = {
  transformGroup: "css",
  buildPath: "dist/css/",
  options: {
    outputReferences: true,
  },
  files: [cssFileConfig],
};

const config: Config = {
  source: ["tokens/**/*.tokens.json"],
  platforms: {
    css: cssPlatformConfig,
  },
};

const sd = new StyleDictionary(config);

await sd.buildAllPlatforms();
