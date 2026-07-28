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
      max: int(),
      /** Set when the area lost some but not all of its spaces and failed its DC 25 check. */
      impaired: bool(false)
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
        /** Keys of the orders issued this round — drives the once-per-round limits. */
        ordersIssued: new fields.ArrayField(str(), { initial: [] }),
        /** Executing orders gives the craft away: −5 Stealth each, cleared every turn. */
        stealthPenalty: int(),

        /**
         * What *Fire Interceptors!* designated this round. The order does not roll against a
         * target number of its own — the check happens per incoming barrage, against that
         * barrage's highest attack roll — so all the order does is set this up.
         */
        interceptors: new fields.SchemaField({
          /** Item ids of the designated Interceptor-trait mounts. */
          designated: new fields.ArrayField(str(), { initial: [] }),
          /** Each system fires once per round. */
          used: new fields.ArrayField(str(), { initial: [] }),
          /** Active Chaff intercepts this much automatically, no check. */
          chaff: int(),
          /** −4 when the order itself failed, −6 as a response. */
          penalty: int()
        }),
        drifting: bool(false),
        destroyed: bool(false)
      })
    };
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    const a = this.attributes;
    const spaces = this.spaces;

    /* Damaged areas (book p. 197). An area with no spaces at all was never fitted and cannot
       be destroyed; only one that had spaces and lost them all counts. */
    const gone = key => spaces[key].max > 0 && spaces[key].value <= 0;
    const engineDestroyed = gone("engine");
    const controlDestroyed = gone("control");
    const crewDestroyed = gone("crew");
    const drifting = this.combat.drifting || engineDestroyed || controlDestroyed;

    this.status = {
      engineDestroyed,
      controlDestroyed,
      crewDestroyed,
      drifting,
      // Control damage is the one status that touches every roll the craft makes.
      checkModifier: controlDestroyed ? -4 : (spaces.control.impaired ? -2 : 0),
      crewPenalty: crewDestroyed ? -4 : (spaces.crew.impaired ? -2 : 0)
    };

    // A drifting craft is treated as Handling −5 whatever it started with.
    const handlingPenalty = (spaces.engine.impaired ? 2 : 0) + (spaces.control.impaired ? 2 : 0);
    a.effectiveHandling = drifting ? -5 : a.handling - handlingPenalty;

    // Superscale, not the personal size table: a Huge spacecraft is −4, not −2.
    a.dv.sizeMod = B5.superscaleSizes[this.details.size] ?? 0;
    const handlingMod = drifting ? -5 : a.dv.handlingMod - handlingPenalty;
    a.dv.total = a.dv.base + a.dv.sizeMod + handlingMod + a.dv.misc;

    a.effectiveSensors = a.sensors - (controlDestroyed ? 6 : (spaces.control.impaired ? 4 : 0));

    // Crew casualties cost the ship's own rolls, which is what an unmanned station falls back to.
    this.crew.effectiveBab = this.crew.bab + this.status.crewPenalty;
    this.crew.effectiveTraining = this.crew.training + this.status.crewPenalty;

    // Total structural spaces left drives the impairment check bonus (+1 per 10 remaining).
    this.spacesRemaining = Object.values(spaces).reduce((sum, s) => sum + s.value, 0);
    this.spacesTotal = Object.values(spaces).reduce((sum, s) => sum + s.max, 0);

    // Every order executed this round costs 5 Stealth — this is what Lock Weapons rolls against.
    a.effectiveStealth = Math.max(0, a.stealth - this.combat.stealthPenalty);

    this.combat.drifting = drifting;
    this.combat.destroyed = a.armour.value <= 0 && a.armour.max > 0;
  }
}
