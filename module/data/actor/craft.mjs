import { B5 } from "../../config.mjs";
import { int, num, str, bool, html } from "../fields.mjs";

const fields = foundry.data.fields;

/**
 * Spacecraft, aircraft and surface vehicles share one stat block (book pp. 216–233):
 * Size/Type, Defence Value, Armour, Handling, Sensors, Stealth, Stress, Features, Crew,
 * structural spaces and weapons by arc. Damage is counted in structural spaces — each
 * point destroys one space — and a craft explodes when its Armour reaches 0.
 */
export default class CraftData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const spaceField = () => new fields.SchemaField({
      value: int(),      // remaining
      max: int()
    });

    return {
      details: new fields.SchemaField({
        craftType: str("spacecraft"),        // spacecraft | aircraft | surfaceVehicle
        craftClass: str(),                   // "Hyperion Heavy Cruiser"
        race: str(),
        size: str("medium"),
        description: html(),
        notes: html()
      }),

      attributes: new fields.SchemaField({
        dv: new fields.SchemaField({
          base: int(10),
          sizeMod: int(),
          handlingMod: int(),
          misc: int(),
          total: int(10)                     // derived
        }),
        armour: new fields.SchemaField({ value: int(), max: int() }),
        handling: int(),
        sensors: int(),
        stealth: int(),
        stress: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null }),
        speed: int(),                        // surface/atmospheric craft only
        ordersPerTurn: int(1),
        hangarCapacity: int(),
        cargoCapacity: num()
      }),

      /** The six structural-space pools; damage is located on 2d6 (book p. 196). */
      spaces: new fields.SchemaField(
        Object.fromEntries(B5.craftSpaces.map(k => [k, spaceField()]))
      ),

      crew: new fields.SchemaField({
        race: str(),
        grade: str("trained"),               // green | trained | veteran | elite
        bab: int(),
        training: int(),
        complement: int(1),
        passengers: int(),
        /** station key → Actor uuid */
        stations: new fields.ObjectField({ initial: {} })
      }),

      combat: new fields.SchemaField({
        band: str("long"),                   // long | medium | close
        initiative: int(),
        ordersUsed: int(),
        drifting: bool(false),
        destroyed: bool(false)
      })
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    const a = this.attributes;
    a.dv.sizeMod = B5.sizes[this.details.size]?.mod ?? 0;
    a.dv.total = a.dv.base + a.dv.sizeMod + a.dv.handlingMod + a.dv.misc;

    // Total structural spaces left drives the impairment check DC (25 + 1 per 10 spaces).
    this.spacesRemaining = Object.values(this.spaces).reduce((sum, s) => sum + s.value, 0);
    this.spacesTotal = Object.values(this.spaces).reduce((sum, s) => sum + s.max, 0);
    this.combat.destroyed = this.attributes.armour.value <= 0 && this.attributes.armour.max > 0;
  }

  /** Total Offence = highest weapon Offence + half of every other hit (book p. 194). */
  static totalOffence(offences = []) {
    if (!offences.length) return 0;
    const sorted = [...offences].sort((a, b) => b - a);
    return sorted[0] + sorted.slice(1).reduce((sum, o) => sum + Math.floor(o / 2), 0);
  }
}
