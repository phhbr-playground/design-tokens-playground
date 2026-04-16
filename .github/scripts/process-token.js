#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tokenData = JSON.parse(process.argv[2]);

const TOKENS_DIR = join(process.cwd(), 'tokens');

/**
 * Parse a token value, handling complex types like typography objects
 */
function parseTokenValue(value) {
  // Try to parse as JSON first (for complex values like typography)
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object') {
      return { value: parsed };
    }
    return { value: parsed };
  } catch {
    // Return as string value
    return { value: value.trim() };
  }
}

/**
 * Set a nested value in an object using dot notation path
 */
function setNestedValue(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }
  
  current[parts[parts.length - 1]] = value;
}

/**
 * Delete a nested value from an object using dot notation path
 */
function deleteNestedValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      return false; // Path doesn't exist
    }
    current = current[part];
  }
  
  const lastPart = parts[parts.length - 1];
  if (lastPart in current) {
    delete current[lastPart];
    return true;
  }
  return false;
}

/**
 * Get a nested value from an object using dot notation path
 */
function getNestedValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * Clean empty parent objects after deletion
 */
function cleanEmptyParents(obj, pathStr) {
  const parts = pathStr.split('.');
  
  // Work backwards through the path
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('.');
    const parent = getNestedValue(obj, parentPath);
    
    if (parent && typeof parent === 'object' && Object.keys(parent).length === 0) {
      deleteNestedValue(obj, parentPath);
    } else {
      break; // Stop if parent is not empty
    }
  }
}

/**
 * Get or create the token file for a category
 */
function getTokenFilePath(category) {
  const categoryDir = join(TOKENS_DIR, category);
  
  // Ensure category directory exists
  if (!existsSync(categoryDir)) {
    mkdirSync(categoryDir, { recursive: true });
  }
  
  return join(categoryDir, 'base.json');
}

/**
 * Read token file or return empty object
 */
function readTokenFile(filePath) {
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }
  return {};
}

/**
 * Write token file with pretty formatting
 */
function writeTokenFile(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Build the full token path including group
 */
function buildTokenPath(tokenName, tokenGroup) {
  if (tokenGroup && tokenGroup.trim()) {
    return `${tokenGroup.trim()}.${tokenName}`;
  }
  return tokenName;
}

/**
 * Create a new token
 */
function createToken(data) {
  const filePath = getTokenFilePath(data.category);
  const tokens = readTokenFile(filePath);
  
  const tokenPath = buildTokenPath(data.tokenName, data.tokenGroup);
  const tokenValue = parseTokenValue(data.tokenValue);
  
  // Add description/comment if provided
  if (data.description) {
    tokenValue.comment = data.description;
  }
  
  // Check if token already exists
  if (getNestedValue(tokens, tokenPath)) {
    console.log(`Token already exists at path: ${tokenPath}`);
    console.log('Use update action to modify existing tokens.');
    process.exit(0);
  }
  
  setNestedValue(tokens, tokenPath, tokenValue);
  writeTokenFile(filePath, tokens);
  
  console.log(`Created token: ${tokenPath} = ${JSON.stringify(tokenValue)}`);
}

/**
 * Update an existing token
 */
function updateToken(data) {
  const filePath = getTokenFilePath(data.category);
  const tokens = readTokenFile(filePath);
  
  const tokenPath = data.tokenPath;
  const existing = getNestedValue(tokens, tokenPath);
  
  if (!existing) {
    console.log(`Token not found at path: ${tokenPath}`);
    process.exit(1);
  }
  
  const tokenValue = parseTokenValue(data.tokenValue);
  
  // Preserve existing comment if no new description
  if (existing.comment && !data.description) {
    tokenValue.comment = existing.comment;
  } else if (data.description) {
    tokenValue.comment = data.description;
  }
  
  setNestedValue(tokens, tokenPath, tokenValue);
  writeTokenFile(filePath, tokens);
  
  console.log(`Updated token: ${tokenPath} = ${JSON.stringify(tokenValue)}`);
}

/**
 * Delete a token
 */
function deleteToken(data) {
  const filePath = getTokenFilePath(data.category);
  const tokens = readTokenFile(filePath);
  
  const tokenPath = data.tokenPath;
  
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
console.log('Processing token request:', tokenData);

switch (tokenData.action) {
  case 'create':
    createToken(tokenData);
    break;
  case 'update':
    updateToken(tokenData);
    break;
  case 'delete':
    deleteToken(tokenData);
    break;
  default:
    console.error(`Unknown action: ${tokenData.action}`);
    process.exit(1);
}
