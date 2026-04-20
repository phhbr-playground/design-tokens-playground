/**
 * Resolves token references in the format {path.to.token}
 */
export class TokenReferenceResolver {
  /**
   * Resolve all token references in a token object
   */
  resolveReferences(tokens: Record<string, unknown>): Record<string, unknown> {
    const resolved = JSON.parse(JSON.stringify(tokens));
    return this.resolveValue(resolved) as Record<string, unknown>;
  }

  /**
   * Recursively resolve references in values
   */
  private resolveValue(value: unknown, path: string[] = []): unknown {
    if (typeof value === "string") {
      // Check for token references {path.to.token}
      const referenceMatch = value.match(/^\{([^}]+)\}$/);
      if (referenceMatch) {
        return this.resolveReference(referenceMatch[1], path);
      }

      // Handle complex values that might contain references
      if (value.includes("{") && value.includes("}")) {
        // For complex CSS functions, return as-is for now
        return value;
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => this.resolveValue(item, [...path, index.toString()]));
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.resolveValue(val, [...path, key]);
      }
      return result;
    }

    return value;
  }

  /**
   * Resolve a single reference path
   */
  private resolveReference(refPath: string, currentPath: string[]): unknown {
    const parts = refPath.split(".");
    let current: unknown = this.tokens;

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        console.warn(`⚠️  Unresolved reference: {${refPath}} at ${currentPath.join(".")}`);
        return `{${refPath}}`; // Return original reference if unresolved
      }
    }

    // If the referenced value is an object with $value, return the $value
    if (current && typeof current === "object" && "$value" in current) {
      return (current as { $value: unknown }).$value;
    }

    return current;
  }

  private tokens: Record<string, unknown> = {};

  /**
   * Set the tokens object for reference resolution
   */
  setTokens(tokens: Record<string, unknown>): void {
    this.tokens = tokens;
  }
}