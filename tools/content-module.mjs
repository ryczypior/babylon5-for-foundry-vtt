/**
 * The `babylon5-content` module manifest, shared by the two tools that write it.
 *
 * The system declares no compendium packs (see the README), so the content is loaded as a module —
 * `build-content-module.mjs` writes it into the Foundry data directory with symlinks for local
 * work, and `pack-content-zip.mjs` writes a self-contained copy for handing to somebody else.
 * Both need the same manifest, hence this file.
 */
import { PACKS } from "./packs.mjs";

export const MODULE_ID = "babylon5-content";
export const MODULE_TITLE = "Babylon 5 2nd Edition — Compendium Content";

/** What each pack is called in the sidebar, in both languages. */
const LABELS = {
  classes: ["Classes", "Klasy"],
  races: ["Races", "Rasy"],
  feats: ["Feats", "Atuty"],
  equipment: ["Equipment", "Ekwipunek"],
  telepathy: ["Telepathic Abilities", "Zdolności telepatyczne"],
  influences: ["Influences", "Wpływy"],
  craft: ["Craft", "Jednostki"]
};

/** One declaration per pack — two per source, because each source builds both languages. */
export function declarations() {
  return PACKS.flatMap(pack => {
    const [en, pl] = LABELS[pack.en] ?? [pack.en, pack.en];
    const type = pack.document ?? "Item";
    return [
      { name: pack.en, label: en, path: `packs/${pack.en}`, type },
      { name: pack.pl, label: `${pl} (PL)`, path: `packs/${pack.pl}`, type }
    ];
  });
}

export function manifest(version) {
  return {
    id: MODULE_ID,
    title: MODULE_TITLE,
    description: "Compendium packs for the Babylon 5 2nd Edition system. Built locally from"
      + " packs/_source; not distributed with the system.",
    version,
    compatibility: { minimum: "13" },
    // No `compatibility` on the relationship: that field bounds the **system's own** version, not
    // core's, so a `minimum: "13"` there asks for babylon5 13.x and makes the module unavailable —
    // it then cannot be enabled at all, silently.
    relationships: { systems: [{ id: "babylon5", type: "system" }] },
    packs: declarations(),
    packFolders: [{
      name: "Babylon 5",
      sorting: "m",
      packs: PACKS.map(pack => pack.en),
      folders: [{ name: "Polski", sorting: "m", packs: PACKS.map(pack => pack.pl) }]
    }]
  };
}
