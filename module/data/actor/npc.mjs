import CharacterData from "./character.mjs";
import { int, str, html } from "../fields.mjs";

const fields = foundry.data.fields;

/**
 * NPCs are built exactly like characters (same classes, skills and feats) — the sheet is
 * simply trimmed to a stat block. Only bookkeeping fields are added here.
 */
export default class NpcData extends CharacterData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      npc: new fields.SchemaField({
        role: str(),                 // e.g. "Narn security officer"
        disposition: str(),
        challenge: int(1),
        gmNotes: html()
      })
    };
  }
}
