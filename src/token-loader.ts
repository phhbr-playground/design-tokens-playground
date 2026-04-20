import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads and merges token files from the filesystem
 */
export class TokenLoader {
  private tokenFiles = [
    "tokens/color/base.tokens.json",
    "tokens/spacing/base.tokens.json",
    "tokens/semantic/colors.tokens.json",
    "tokens/component/base.tokens.json"
  ];

  /**
   * Load all token files and merge them into a single object
   */
  loadTokens(): Record<string, unknown> {
    const allTokens: Record<string, unknown> = {};

    for (const file of this.tokenFiles) {
      try {
        const content = JSON.parse(readFileSync(join(process.cwd(), file), 'utf-8'));
        this.mergeTokens(allTokens, content);
      } catch (error) {
        // File might not exist, continue silently
        console.warn(`Warning: Could not load ${file}:`, error);
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