/**
 * Generate the local `babylon5-content` module, which is what makes the built packs loadable.
 *
 * The published system declares **no compendium packs**: the packs are not distributed with it,
 * and a system manifest that declares packs it does not ship gives every fresh install a row of
 * empty compendia. Foundry has no way to declare a pack after the fact — so whoever *has* the
 * packs gets them through a module instead, which is the ordinary way content is kept separate
 * from a system.
 *
 * The module is written into the Foundry data directory, never into this repository, and its packs
 * are symlinks to `packs/<name>` here — so `npm run pack` keeps being the only way to rebuild them
 * and there is exactly one copy on disk. For a copy to hand to somebody else, which cannot contain
 * symlinks, use `npm run content:zip`.
 *
 * Usage: npm run content   (after npm run pack, with Foundry shut down)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_ID, MODULE_TITLE, declarations, manifest } from "./content-module.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function dataPath() {
  const configPath = path.join(root, "foundryconfig.json");
  if (!fs.existsSync(configPath)) {
    console.error(`Missing ${configPath}. Create it with: { "path": "/path/to/FoundryVTT/Data" }`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const value = config.path ?? config.dataPath;
  if (!value) {
    console.error(`${configPath} must contain a "path" entry pointing at the Foundry Data directory.`);
    process.exit(1);
  }
  return value;
}

const system = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const version = system.version;
const moduleDir = path.join(dataPath(), "modules", MODULE_ID);
const packs = declarations();

fs.mkdirSync(path.join(moduleDir, "packs"), { recursive: true });
fs.writeFileSync(path.join(moduleDir, "module.json"),
  `${JSON.stringify(manifest(version, system.compatibility), null, 2)}\n`);

let linked = 0;
const missing = [];
for (const declaration of packs) {
  const source = path.join(root, declaration.path);
  const target = path.join(moduleDir, declaration.path);

  if (!fs.existsSync(source)) {
    missing.push(declaration.name);
    continue;
  }

  // A stale link from an earlier run is replaced — `lstat` rather than `exists`, so a link left
  // dangling by a rebuild is caught too. A real directory is not touched: it would be somebody's
  // own copy of the content and not ours to remove.
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isSymbolicLink()) {
      console.error(`${target} exists and is not a symlink — refusing to touch it.`);
      process.exit(1);
    }
    fs.unlinkSync(target);
  }

  fs.symlinkSync(source, target, "dir");
  linked++;
}

console.log(`${path.join(moduleDir, "module.json")}: ${packs.length} packs declared, ${linked} linked`);
if (missing.length) console.log(`Not built yet (run npm run pack): ${missing.join(", ")}`);
console.log(`Enable "${MODULE_TITLE}" in the world's module settings to load them.`);
