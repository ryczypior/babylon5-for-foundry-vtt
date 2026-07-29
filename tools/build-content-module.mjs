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
 * and there is exactly one copy on disk.
 *
 * Usage: npm run content   (after npm run pack, with Foundry shut down)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKS } from "./packs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODULE_ID = "babylon5-content";

/** The printed label each pack carries in the sidebar, in both languages. */
const LABELS = {
  classes: ["Classes", "Klasy"],
  races: ["Races", "Rasy"],
  feats: ["Feats", "Atuty"],
  equipment: ["Equipment", "Ekwipunek"],
  telepathy: ["Telepathic Abilities", "Zdolności telepatyczne"],
  influences: ["Influences", "Wpływy"],
  craft: ["Craft", "Jednostki"]
};

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

const version = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8")).version;
const moduleDir = path.join(dataPath(), "modules", MODULE_ID);

/* The two packs each source produces, described the way a module manifest wants them. */
const declarations = [];
for (const pack of PACKS) {
  const [en, pl] = LABELS[pack.en] ?? [pack.en, pack.en];
  declarations.push(
    { name: pack.en, label: en, path: `packs/${pack.en}`, type: pack.document ?? "Item" },
    { name: pack.pl, label: `${pl} (PL)`, path: `packs/${pack.pl}`, type: pack.document ?? "Item" }
  );
}

const manifest = {
  id: MODULE_ID,
  title: "Babylon 5 2nd Edition — Compendium Content",
  description: "Compendium packs for the Babylon 5 2nd Edition system. Built locally from"
    + " packs/_source; not distributed with the system.",
  version,
  compatibility: { minimum: "13" },
  // No `compatibility` on the relationship: that field bounds the **system's own** version, not
  // core's, so a `minimum: "13"` there asks for babylon5 13.x and makes the module unavailable —
  // it then cannot be enabled at all, silently.
  relationships: { systems: [{ id: "babylon5", type: "system" }] },
  packs: declarations,
  packFolders: [{
    name: "Babylon 5",
    sorting: "m",
    packs: PACKS.map(pack => pack.en),
    folders: [{ name: "Polski", sorting: "m", packs: PACKS.map(pack => pack.pl) }]
  }]
};

fs.mkdirSync(path.join(moduleDir, "packs"), { recursive: true });
fs.writeFileSync(path.join(moduleDir, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);

let linked = 0;
const missing = [];
for (const declaration of declarations) {
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

console.log(`${path.join(moduleDir, "module.json")}: ${declarations.length} packs declared, `
  + `${linked} linked`);
if (missing.length) {
  console.log(`Not built yet (run npm run pack): ${missing.join(", ")}`);
}
console.log(`Enable "${manifest.title}" in the world's module settings to load them.`);
