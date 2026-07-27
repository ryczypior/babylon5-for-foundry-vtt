/**
 * Symlink this repository into the Foundry data directory.
 *
 * The repository root *is* the system directory (no bundler, no build output to copy —
 * only the stylesheet is compiled, in place), so a symlink is all the deployment needed.
 *
 * Usage: npm run link
 * Reads the Foundry data path from foundryconfig.json: { "path": "/path/to/FoundryVTT/Data" }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configPath = path.join(root, "foundryconfig.json");

if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}. Create it with: { "path": "/path/to/FoundryVTT/Data" }`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const dataPath = config.path ?? config.dataPath;
if (!dataPath) {
  console.error(`${configPath} must contain a "path" entry pointing at the Foundry Data directory.`);
  process.exit(1);
}
const target = path.join(dataPath, "systems", "babylon5");

if (fs.existsSync(target)) {
  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    console.error(`${target} exists and is not a symlink — refusing to touch it.`);
    process.exit(1);
  }
  fs.unlinkSync(target);
}

fs.symlinkSync(root, target, "dir");
console.log(`Linked ${target} -> ${root}`);
