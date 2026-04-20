import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads and merges token files from the filesystem
 */
export class TokenLoader {
  private static readonly TOKENS_ROOT = "tokens";

  private discoverTokenFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.discoverTokenFiles(fullPath));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".tokens.json")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Load all token files and merge them into a single object
   */
  loadTokens(): Record<string, unknown> {
    const allTokens: Record<string, unknown> = {};
    const tokensRoot = join(process.cwd(), TokenLoader.TOKENS_ROOT);

    let tokenFiles: string[];
    try {
      tokenFiles = this.discoverTokenFiles(tokensRoot).sort();
    } catch (error) {
      throw new Error(
        `Could not read token directory '${TokenLoader.TOKENS_ROOT}': ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (tokenFiles.length === 0) {
      throw new Error(`No token files found under '${TokenLoader.TOKENS_ROOT}/'`);
    }

    for (const file of tokenFiles) {
      try {
        const content = JSON.parse(readFileSync(file, "utf-8"));
        this.mergeTokens(allTokens, content);
      } catch (error) {
        throw new Error(
          `Could not load token file '${file}': ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return allTokens;
  }

  /**
   * Deep merge tokens from source into target
   */
  private mergeTokens(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== "object") {
          target[key] = {};
        }
        this.mergeTokens(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        target[key] = source[key];
      }
    }
  }
}