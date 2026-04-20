#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { updateToken, type TokenData } from "./token-common.ts";

const argv = await yargs(hideBin(process.argv))
  .option("namespace-level", {
    type: "string",
    description: "Namespace level (universal, system, semantic, component)",
  })
  .option("namespace-theme", {
    type: "string",
    description: "Namespace theme for system level (light, dark, high-contrast)",
  })
  .option("namespace-domain", {
    type: "string",
    description: "Namespace domain (color, spacing, typography, etc.)",
  })
  .option("object-path", {
    alias: "o",
    type: "string",
    description: "Object path within the namespace (dot notation)",
  })
  .option("hierarchy-level", {
    alias: "l",
    type: "string",
    description: "Hierarchy level (universal, system, semantic, component)",
  })
  .option("domain", {
    alias: "m",
    type: "string",
    description: "Token domain/category",
  })
  .option("category", {
    alias: "c",
    type: "string",
    description: "Legacy token category",
  })
  .option("token-path", {
    alias: "p",
    type: "string",
    description: "Full token path to update",
  })
  .option("value", {
    alias: "v",
    type: "string",
    description: "Token value",
    demandOption: true,
  })
  .option("description", {
    alias: "d",
    type: "string",
    description: "Token description",
  })
  .check((args) => {
    if (!args["token-path"] && !args["object-path"]) {
      throw new Error("Provide --object-path (or legacy --token-path)");
    }
    return true;
  })
  .strict()
  .parseAsync();

const tokenData: TokenData = {
  action: "update",
  category: argv.category,
  namespaceLevel: argv["namespace-level"],
  namespaceTheme: argv["namespace-theme"],
  namespaceDomain: argv["namespace-domain"],
  objectPath: argv["object-path"],
  hierarchyLevel: argv["hierarchy-level"],
  domain: argv.domain,
  tokenPath: argv["token-path"],
  value: argv.value,
  description: argv.description,
};

updateToken(tokenData);
