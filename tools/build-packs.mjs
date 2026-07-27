/**
 * Build the compendium packs from the editable sources in `packs/_source/`.
 *
 * Each source entry carries both languages: `name`/`description` in English and
 * `namePl`/`descriptionPl` alongside them (the same for every feature and racial trait).
 * One source therefore produces two packs — `classes` and `classes-pl` — so a Polish table
 * simply opens the Polish compendium. Foundry has no built-in translation for pack contents.
 *
 * Usage: npm run pack
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "packs", "_source");

/** source file → the two packs it produces */
const PACKS = [
  { source: "classes.json", en: "classes", pl: "classes-pl" },
  { source: "races.json", en: "races", pl: "races-pl" }
];

/** Strip the *Pl fields (English pack) or promote them (Polish pack). */
function localise(entry, lang) {
  const pick = (obj, key) => {
    const plKey = `${key}Pl`;
    const value = lang === "pl" && obj[plKey] ? obj[plKey] : obj[key];
    return value;
  };

  const system = { ...entry.system };
  system.description = pick(system, "description");
  delete system.descriptionPl;

  for (const listKey of ["features", "traits"]) {
    if (!Array.isArray(system[listKey])) continue;
    system[listKey] = system[listKey].map(item => {
      const out = { ...item, name: pick(item, "name"), description: pick(item, "description") };
      delete out.namePl;
      delete out.descriptionPl;
      return out;
    });
  }

  return {
    _id: entry._id,
    _key: `!items!${entry._id}`,
    name: pick(entry, "name"),
    type: entry.type,
    img: entry.img ?? "icons/svg/item-bag.svg",
    system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: {
      systemId: "babylon5",
      systemVersion: JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8")).version,
      coreVersion: "13.351",
      createdTime: 0,
      modifiedTime: 0,
      lastModifiedBy: null
    }
  };
}

async function writePack(packName, entries) {
  const packPath = path.join(root, "packs", packName);
  fs.rmSync(packPath, { recursive: true, force: true });
  fs.mkdirSync(packPath, { recursive: true });

  const db = new ClassicLevel(packPath, { valueEncoding: "json" });
  await db.open();                       // classic-level 3 does not defer batch() until open
  const batch = db.batch();
  for (const entry of entries) batch.put(entry._key, entry);
  await batch.write();
  await db.close();

  console.log(`  ${packName.padEnd(12)} ${entries.length} entries`);
}

for (const pack of PACKS) {
  const source = JSON.parse(fs.readFileSync(path.join(sourceDir, pack.source), "utf8"));
  console.log(`${pack.source}:`);
  await writePack(pack.en, source.map(e => localise(e, "en")));
  await writePack(pack.pl, source.map(e => localise(e, "pl")));
}

console.log("Packs built.");
