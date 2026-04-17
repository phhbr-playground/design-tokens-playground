#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Type definitions
interface TokenValue {
  $value: string | number | object | boolean;
  $description?: string;
}

interface TokenObject {
  [key: string]: TokenValue | TokenObject;
}

interface TokenData {
  action: "create" | "update" | "delete";
  category: string;
  name?: string;
  group?: string;
  tokenPath?: string;
  value?: string;
  description?: string;
}

// Parse command line arguments
const argv = await yargs(hideBin(process.argv))
  .option("action", {
    alias: "a",
    type: "string",
    description: "Token action: create, update, or delete",
    choices: ["create", "update", "delete"],
    demandOption: true,
  })
  .option("category", {
    alias: "c",
    type: "string",
    description: "Token category (e.g., color, typography)",
    demandOption: true,
  })
  .option("name", {
    alias: "n",
    type: "string",
    description: "Token name",
  })
  .option("value", {
    alias: "v",
    type: "string",
    description: "Token value",
  })
  .option("group", {
    alias: "g",
    type: "string",
    description: "Token group (dot-separated path)",
  })
  .option("token-path", {
    alias: "p",
    type: "string",
    description: "Full token path (required for update/delete)",
  })
  .option("description", {
    alias: "d",
    type: "string",
    description: "Token description",
  })
  .strict()
  .parseAsync();

const tokenData: TokenData = {
  action: argv.action as "create" | "update" | "delete",
  category: argv.category,
  name: argv.name,
  group: argv.group,
  tokenPath: argv["token-path"],
  value: argv.value,
  description: argv.description,
};

const TOKENS_DIR: string = join(process.cwd(), "tokens");

/**
 * Parse a token value, handling complex types like typography objects
 */
function parseTokenValue(value: string): TokenValue {
  // Try to parse as JSON first (for complex values like typography)
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object") {
      return { $value: parsed };
    }
    return { $value: parsed };
  } catch {
    // Return as string $value
    return { $value: value.trim() };
  }
}

/**
 * Set a nested value in an object using dot notation path
 */
function setNestedValue(
  obj: TokenObject,
  pathStr: string,
  value: TokenValue | TokenObject
): void {
  const parts: string[] = pathStr.split(".");
  let current: TokenObject | TokenValue | any = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part: string = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      (current as TokenObject)[part] = {} as TokenObject;
    }
    current = (current as TokenObject)[part] as TokenObject | TokenValue;
  }

  (current as TokenObject)[parts[parts.length - 1]] = value;
}

/**
 * Delete a nested value from an object using dot notation path
 */
function deleteNestedValue(obj: TokenObject, pathStr: string): boolean {
  const parts: string[] = pathStr.split(".");
  let current: TokenObject | TokenValue | any = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part: string = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      return false; // Path doesn't exist
    }
    current = (current as TokenObject)[part] as TokenObject | TokenValue;
  }

  const lastPart: string = parts[parts.length - 1];
  if (lastPart in current) {
    delete (current as TokenObject)[lastPart];
    return true;
  }
  return false;
}

/**
 * Get a nested value from an object using dot notation path
 */
function getNestedValue(
  obj: TokenObject,
  pathStr: string
): TokenValue | TokenObject | undefined {
  const parts: string[] = pathStr.split(".");
  let current: TokenObject | TokenValue | undefined = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as TokenObject)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Clean empty parent objects after deletion
 */
function cleanEmptyParents(obj: TokenObject, pathStr: string): void {
  const parts: string[] = pathStr.split(".");

  // Work backwards through the path
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath: string = parts.slice(0, i).join(".");
    const parent = getNestedValue(obj, parentPath);

    if (parent && typeof parent === "object" && Object.keys(parent).length === 0) {
      deleteNestedValue(obj, parentPath);
    } else {
      break; // Stop if parent is not empty
    }
  }
}

/**
 * Get or create the token file for a category
 */
function getTokenFilePath(category: string): string {
  const categoryDir: string = join(TOKENS_DIR, category);

  // Ensure category directory exists
  if (!existsSync(categoryDir)) {
    mkdirSync(categoryDir, { recursive: true });
  }

  return join(categoryDir, "base.tokens.json");
}

/**
 * Read token file or return empty object
 */
function readTokenFile(filePath: string): TokenObject {
  if (existsSync(filePath)) {
    const content: string = readFileSync(filePath, "utf8");
    return JSON.parse(content) as TokenObject;
  }
  return {};
}

/**
 * Write token file with pretty formatting
 */
function writeTokenFile(filePath: string, data: TokenObject): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Build the full token path including group
 */
function buildTokenPath(tokenName: string, tokenGroup?: string): string {
  if (tokenGroup && tokenGroup.trim()) {
    return `${tokenGroup.trim()}.${tokenName}`;
  }
  return tokenName;
}

/**
 * Create a new token
 */
function createToken(data: TokenData): void {
  const filePath: string = getTokenFilePath(data.category);
  const tokens: TokenObject = readTokenFile(filePath);

  if (!data.name) {
    console.error("Token name is required for create action");
    process.exit(1);
  }

  const tokenPath: string = buildTokenPath(data.name, data.group);
  const tokenValue: TokenValue = parseTokenValue(data.value ?? "");

  // Add description/comment if provided
  if (data.description) {
    tokenValue.$description = data.description;
  }

  // Check if token already exists
  if (getNestedValue(tokens, tokenPath)) {
    console.log(`Token already exists at path: ${tokenPath}`);
    console.log("Use update action to modify existing tokens.");
    process.exit(0);
  }

  setNestedValue(tokens, tokenPath, tokenValue);
  writeTokenFile(filePath, tokens);

  console.log(
    `Created token: ${tokenPath} = ${JSON.stringify(tokenValue)}`
  );
}

/**
 * Update an existing token
 */
function updateToken(data: TokenData): void {
  const filePath: string = getTokenFilePath(data.category);
  const tokens: TokenObject = readTokenFile(filePath);

  if (!data.tokenPath) {
    console.error("Token path (--token-path) is required for update action");
    process.exit(1);
  }

  const tokenPath: string = data.tokenPath;
  const existing = getNestedValue(tokens, tokenPath);

  if (!existing) {
    console.log(`Token not found at path: ${tokenPath}`);
    process.exit(1);
  }

  const tokenValue: TokenValue = parseTokenValue(data.value ?? "");

  // Preserve existing comment if no new description
  if (
    typeof existing === "object" &&
    "$description" in existing &&
    !data.description
  ) {
    tokenValue.$description = (existing as TokenValue).$description;
  } else if (data.description) {
    tokenValue.$description = data.description;
  }

  setNestedValue(tokens, tokenPath, tokenValue);
  writeTokenFile(filePath, tokens);

  console.log(
    `Updated token: ${tokenPath} = ${JSON.stringify(tokenValue)}`
  );
}

/**
 * Delete a token
 */
function deleteToken(data: TokenData): void {
  const filePath: string = getTokenFilePath(data.category);
  const tokens: TokenObject = readTokenFile(filePath);

  if (!data.tokenPath) {
    console.error("Token path (--token-path) is required for delete action");
    process.exit(1);
  }

  const tokenPath: string = data.tokenPath;

  if (!getNestedValue(tokens, tokenPath)) {
    console.log(`Token not found at path: ${tokenPath}`);
    process.exit(1);
  }

  deleteNestedValue(tokens, tokenPath);
  cleanEmptyParents(tokens, tokenPath);
  writeTokenFile(filePath, tokens);

  console.log(`Deleted token: ${tokenPath}`);
}

// Main execution
console.log("Processing token request:", tokenData);

switch (tokenData.action) {
  case "create":
    createToken(tokenData);
    break;
  case "update":
    updateToken(tokenData);
    break;
  case "delete":
    deleteToken(tokenData);
    break;
  default:
    console.error(`Unknown action: ${tokenData.action}`);
    process.exit(1);
}
