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

/** source file → the two packs it produces. `document` defaults to Item. */
const PACKS = [
  { source: "classes.json", en: "classes", pl: "classes-pl" },
  { source: "races.json", en: "races", pl: "races-pl" },
  { source: "feats.json", en: "feats", pl: "feats-pl" },
  { source: "equipment.json", en: "equipment", pl: "equipment-pl" },
  { source: "telepathy.json", en: "telepathy", pl: "telepathy-pl" },
  { source: "influences.json", en: "influences", pl: "influences-pl" },
  { source: "craft.json", en: "craft", pl: "craft-pl", document: "Actor" }
];

/** The LevelDB key prefix each document type is stored under. */
const KEY_PREFIX = { Item: "!items!", Actor: "!actors!" };

/**
 * Strip every `<key>Pl` field (English pack) or promote it over its base key (Polish pack),
 * recursively — class features, racial traits and ability variations all carry their own pair,
 * and a nested list that grew a translated field would otherwise leak `namePl` into the pack.
 */
function localiseData(value, lang) {
  if (Array.isArray(value)) return value.map(item => localiseData(item, lang));
  if (value === null || typeof value !== "object") return value;

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith("Pl")) continue;                    // reached through its base key
    const translated = value[`${key}Pl`];
    const chosen = lang === "pl" && translated ? translated : entry;
    out[key] = localiseData(chosen, lang);
  }
  return out;
}

const stats = () => ({
  systemId: "babylon5",
  systemVersion: JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8")).version,
  coreVersion: "13.351",
  createdTime: 0,
  modifiedTime: 0,
  lastModifiedBy: null
});

function localise(entry, lang, document = "Item") {
  const base = {
    _id: entry._id,
    _key: `${KEY_PREFIX[document]}${entry._id}`,
    name: lang === "pl" && entry.namePl ? entry.namePl : entry.name,
    type: entry.type,
    img: entry.img ?? "icons/svg/item-bag.svg",
    system: localiseData(entry.system, lang),
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats()
  };

  if (document !== "Actor") return base;
  return {
    ...base,
    prototypeToken: { name: base.name, actorLink: false, disposition: -1 },
    // The parent stores its embedded documents as a list of **ids**; the documents themselves
    // are separate records (see `embeddedItems`).
    items: (entry.items ?? []).map(item => item._id)
  };
}

/**
 * An Actor's embedded documents get **keys of their own** in a v13 pack —
 * `!actors.items!<actorId>.<itemId>` — *and* the parent lists their ids. Doing only one of the
 * two builds a pack that opens and indexes perfectly and simply has no weapons on any craft,
 * which is a quiet enough failure to be worth this comment.
 */
function embeddedItems(entry, lang) {
  return (entry.items ?? []).map(item => ({
    _id: item._id,
    _key: `!actors.items!${entry._id}.${item._id}`,
    name: lang === "pl" && item.namePl ? item.namePl : item.name,
    type: item.type,
    img: item.img ?? "icons/svg/item-bag.svg",
    system: localiseData(item.system, lang),
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: stats()
  }));
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
  const document = pack.document ?? "Item";
  const build = lang => [
    ...source.map(e => localise(e, lang, document)),
    ...(document === "Actor" ? source.flatMap(e => embeddedItems(e, lang)) : [])
  ];
  console.log(`${pack.source}:`);
  await writePack(pack.en, build("en"));
  await writePack(pack.pl, build("pl"));
}

console.log("Packs built.");
