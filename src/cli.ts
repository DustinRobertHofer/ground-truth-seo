#!/usr/bin/env node
/** The `ground-truth-seo` executable. See ./cli/main.ts and README.md. */

import { readFileSync } from "node:fs";
import { main } from "./cli/main.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
main({ version });
