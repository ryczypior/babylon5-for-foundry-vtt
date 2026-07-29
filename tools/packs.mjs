/**
 * Which compendium packs exist, and which source builds them.
 *
 * Its own file because two tools need the list and importing either of them must not run the
 * other: `build-packs.mjs` builds on import, and `build-content-module.mjs` only wants the names.
 *
 * Each source produces **two** packs — one per language — because Foundry has no built-in
 * translation for compendium contents. `document` defaults to Item.
 */
export const PACKS = [
  { source: "classes.json", en: "classes", pl: "classes-pl" },
  { source: "races.json", en: "races", pl: "races-pl" },
  { source: "feats.json", en: "feats", pl: "feats-pl" },
  { source: "equipment.json", en: "equipment", pl: "equipment-pl" },
  { source: "telepathy.json", en: "telepathy", pl: "telepathy-pl" },
  { source: "influences.json", en: "influences", pl: "influences-pl" },
  { source: "craft.json", en: "craft", pl: "craft-pl", document: "Actor" }
];
