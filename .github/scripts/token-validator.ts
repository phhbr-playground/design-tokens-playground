/**
 * Schema validation for Design Tokens according to W3C DTCG spec
 * Design Tokens Format Module 2025.10+
 * https://tr.w3.org/design-tokens/
 */

export interface DesignTokenValue {
  $type?:
    | "color"
    | "dimension"
    | "duration"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "lineHeight"
    | "letterSpacing"
    | "paragraphSpacing"
    | "textDecoration"
    | "textTransform"
    | "fontStyle"
    | "fontVariant"
    | "fontVariationSettings"
    | "textIndent"
    | "opacity"
    | "border"
    | "borderRadius"
    | "shadow"
    | "gradient"
    | "strokeStyle"
    | "transition"
    | "typography"
    | "transform"
    | "composition";
  $value: string | number | boolean | object | DesignTokenValue[];
  $description?: string;
  $extensions?: Record<string, unknown>;
  $deprecated?: boolean | string;
}

export interface TokenGroup {
  [key: string]: DesignTokenValue | TokenGroup;
}

const VALID_TYPES = new Set([
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "paragraphSpacing",
  "textDecoration",
  "textTransform",
  "fontStyle",
  "fontVariant",
  "fontVariationSettings",
  "textIndent",
  "opacity",
  "border",
  "borderRadius",
  "shadow",
  "gradient",
  "strokeStyle",
  "transition",
  "typography",
  "transform",
  "composition",
]);

export class TokenValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  validate(tokens: TokenGroup, path: string = ""): boolean {
    this.errors = [];
    this.warnings = [];

    this.validateTokenGroup(tokens, path);

    return this.errors.length === 0;
  }

  private validateTokenGroup(group: TokenGroup, basePath: string = ""): void {
    for (const [key, value] of Object.entries(group)) {
      const currentPath = basePath ? `${basePath}.${key}` : key;

      if (this.isDesignToken(value)) {
        this.validateToken(value as DesignTokenValue, currentPath);
      } else if (typeof value === "object" && value !== null) {
        this.validateTokenGroup(value as TokenGroup, currentPath);
      } else {
        this.errors.push(`Invalid token at path '${currentPath}': must be an object`);
      }
    }
  }

  private isDesignToken(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      ("$value" in (value as Record<string, unknown>))
    );
  }

  private validateToken(token: DesignTokenValue, path: string): void {
    // Check required $value
    if (!("$value" in token)) {
      this.errors.push(`Token at path '${path}' is missing required $value property`);
      return;
    }

    // Validate $type if present
    if (token.$type && !VALID_TYPES.has(token.$type)) {
      this.errors.push(
        `Token at path '${path}' has invalid $type '${token.$type}'. Valid types: ${Array.from(VALID_TYPES).join(", ")}`
      );
    }

    // Validate $description
    if (token.$description && typeof token.$description !== "string") {
      this.errors.push(`Token at path '${path}': $description must be a string`);
    }

    // Validate $deprecated
    if (token.$deprecated && typeof token.$deprecated !== "boolean" && typeof token.$deprecated !== "string") {
      this.errors.push(
        `Token at path '${path}': $deprecated must be a boolean or string`
      );
    }

    // Validate $extensions
    if (token.$extensions && typeof token.$extensions !== "object") {
      this.errors.push(`Token at path '${path}': $extensions must be an object`);
    }

    // Type-specific validations
    this.validateTokenValue(token, path);
  }

  private validateTokenValue(token: DesignTokenValue, path: string): void {
    const value = token.$value;

    switch (token.$type) {
      case "color":
        if (!this.isValidColor(value)) {
          this.errors.push(
            `Token at path '${path}': invalid color value. Expected hex, rgb, hsl, or reference`
          );
        }
        break;

      case "dimension":
      case "fontSize":
      case "lineHeight":
      case "letterSpacing":
      case "paragraphSpacing":
      case "textIndent":
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          !this.isTokenReference(String(value))
        ) {
          this.errors.push(
            `Token at path '${path}': invalid dimension value`
          );
        }
        break;

      case "duration":
        if (!this.isValidDuration(String(value))) {
          this.errors.push(
            `Token at path '${path}': invalid duration value. Expected format like '100ms' or '0.5s'`
          );
        }
        break;

      case "fontFamily":
      case "fontStyle":
      case "fontVariant":
      case "fontVariationSettings":
      case "textDecoration":
      case "textTransform":
        if (typeof value !== "string" && !this.isTokenReference(String(value))) {
          this.errors.push(
            `Token at path '${path}': invalid font/text value. Expected string or reference`
          );
        }
        break;

      case "fontWeight":
        if (
          !this.isValidFontWeight(value) &&
          !this.isTokenReference(String(value))
        ) {
          this.errors.push(
            `Token at path '${path}': invalid fontWeight. Expected 100-900, or keyword (normal, bold, etc.), or reference`
          );
        }
        break;

      case "opacity":
        if (!this.isValidOpacity(value)) {
          this.errors.push(
            `Token at path '${path}': invalid opacity. Expected value between 0 and 1, or 0-100%`
          );
        }
        break;

      case "border":
      case "borderRadius":
      case "shadow":
      case "gradient":
      case "strokeStyle":
      case "transition":
      case "typography":
      case "transform":
        if (typeof value !== "object" && typeof value !== "string") {
          this.warnings.push(
            `Token at path '${path}': complex type should be an object or string`
          );
        }
        break;
    }
  }

  private isValidColor(value: unknown): boolean {
    if (typeof value !== "string") return false;
    // Hex
    if (/^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(value)) return true;
    // RGB/RGBA
    if (/^rgba?\(/.test(value)) return true;
    // HSL/HSLA
    if (/^hsla?\(/.test(value)) return true;
    // Named colors
    const namedColors = [
      "red",
      "blue",
      "green",
      "black",
      "white",
      "gray",
      "transparent",
    ];
    if (namedColors.includes(value.toLowerCase())) return true;
    // Token reference
    if (this.isTokenReference(value)) return true;
    return false;
  }

  private isTokenReference(value: string): boolean {
    return /^\{[a-zA-Z0-9._-]+\}$/.test(value);
  }

  private isValidDuration(value: string): boolean {
    return /^\d+(\.\d+)?(ms|s)$/.test(value) || this.isTokenReference(value);
  }

  private isValidFontWeight(value: unknown): boolean {
    if (typeof value === "number" && value >= 100 && value <= 900) return true;
    if (typeof value === "string") {
      const validKeywords = [
        "thin",
        "extralight",
        "light",
        "normal",
        "medium",
        "semibold",
        "bold",
        "extrabold",
        "black",
      ];
      return validKeywords.includes(value.toLowerCase());
    }
    return false;
  }

  private isValidOpacity(value: unknown): boolean {
    if (typeof value === "number") {
      return (value >= 0 && value <= 1) || (value >= 0 && value <= 100);
    }
    if (typeof value === "string") {
      if (this.isTokenReference(value)) return true;
      if (value.endsWith("%")) {
        const num = parseFloat(value);
        return num >= 0 && num <= 100;
      }
      const num = parseFloat(value);
      return num >= 0 && num <= 1;
    }
    return false;
  }

  getErrors(): string[] {
    return this.errors;
  }

  getWarnings(): string[] {
    return this.warnings;
  }

  getReport(): { valid: boolean; errors: string[]; warnings: string[] } {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}
