import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TokenLoader } from "../src/token-loader.js";
import { createFixtureLoader } from "./test-helpers.js";

describe("TokenLoader", () => {
  it("loads each hierarchy from the valid fixture", () => {
    const loader = createFixtureLoader("valid");

    const tokensByHierarchy = loader.loadTokensByHierarchy();

    expect(Array.from(tokensByHierarchy.keys())).toEqual([
      "design-values",
      "universal",
      "system",
      "semantic",
      "component",
    ]);
    expect(tokensByHierarchy.get("universal")).toMatchObject({
      color: {
        blue: {
          500: {
            $value: "#3B82F6",
            $type: "color",
          },
        },
      },
    });
  });

  it("merges hierarchy token trees into one object", () => {
    const loader = createFixtureLoader("valid");

    expect(loader.loadTokens()).toMatchObject({
      color: {
        blue: {
          500: {
            $value: "#3B82F6",
            $type: "color",
          },
        },
      },
      light: {
        color: {
          brand: {
            primary: {
              $value: "{color.blue.500}",
              $type: "color",
            },
          },
        },
      },
    });
  });

  it("rejects unexpected hierarchy directories", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "token-loader-invalid-hierarchy-"));
    mkdirSync(join(rootDir, "brand"), { recursive: true });
    writeFileSync(join(rootDir, "brand", "tokens.json"), JSON.stringify({}));

    try {
      expect(() => new TokenLoader(rootDir).loadTokensByHierarchy()).toThrow(
        "Unexpected hierarchy 'brand/'"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects nested directories inside a hierarchy", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "token-loader-invalid-layout-"));
    mkdirSync(join(rootDir, "universal", "nested"), { recursive: true });
    writeFileSync(join(rootDir, "universal", "nested", "tokens.json"), JSON.stringify({}));

    try {
      expect(() => new TokenLoader(rootDir).loadTokensByHierarchy()).toThrow(
        "Nested directories are not allowed under 'universal/'"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("loads and merges all json files under a hierarchy", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "token-loader-multi-json-"));
    mkdirSync(join(rootDir, "universal"), { recursive: true });
    writeFileSync(
      join(rootDir, "universal", "colors.json"),
      JSON.stringify({
        color: {
          blue: {
            500: {
              $value: "#3B82F6",
              $type: "color",
            },
          },
        },
      })
    );
    writeFileSync(
      join(rootDir, "universal", "spacing.json"),
      JSON.stringify({
        space: {
          4: {
            $value: "1rem",
            $type: "dimension",
          },
        },
      })
    );

    try {
      const tokensByHierarchy = new TokenLoader(rootDir).loadTokensByHierarchy();

      expect(tokensByHierarchy.get("universal")).toMatchObject({
        color: {
          blue: {
            500: {
              $value: "#3B82F6",
              $type: "color",
            },
          },
        },
        space: {
          4: {
            $value: "1rem",
            $type: "dimension",
          },
        },
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects non-json files inside a hierarchy", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "token-loader-non-json-"));
    mkdirSync(join(rootDir, "universal"), { recursive: true });
    writeFileSync(join(rootDir, "universal", "colors.json"), JSON.stringify({}));
    writeFileSync(join(rootDir, "universal", "notes.txt"), "not allowed");

    try {
      expect(() => new TokenLoader(rootDir).loadTokensByHierarchy()).toThrow(
        "Unexpected file 'universal/notes.txt'"
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});