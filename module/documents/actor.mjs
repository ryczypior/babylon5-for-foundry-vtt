import { B5 } from "../config.mjs";

/**
 * Base Actor document. Derived data lives in the type data models; this class holds the
 * roll pipeline and the damage rules that are shared by every actor type.
 */
export default class B5Actor extends Actor {

  /** @override */
  getRollData() {
    const data = { ...this.system };
    if (this.system.abilities) {
      for (const [key, ability] of Object.entries(this.system.abilities)) {
        data[key] = ability.mod;
      }
    }
    data.level = this.system.progression?.level ?? 0;
    data.bab = this.system.attributes?.bab?.value ?? 0;
    return data;
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /**
   * Skill check: 1d20 + ranks + ability mod + misc + synergy − armour check penalty.
   * @param {string} skillKey  key in `system.skills`, or an Item id for a subtyped skill
   * @param {object} [options] {situational, flavour}
   */
  async rollSkill(skillKey, options = {}) {
    const skill = this.system.skills?.[skillKey];
    const item = skill ? null : this.items.get(skillKey);
    if (!skill && !item) return null;

    const total = skill ? skill.total : item.system.total;
    const label = skill
      ? game.i18n.localize(`B5.Skill.${skillKey}`)
      : item.name;

    return this.#rollCheck({
      formula: "1d20",
      modifier: total,
      situational: options.situational ?? 0,
      flavour: options.flavour ?? game.i18n.format("B5.Roll.SkillCheck", { skill: label })
    });
  }

  /** Saving throw: 1d20 + class bonus + ability mod + misc. */
  async rollSave(saveKey, options = {}) {
    const save = this.system.saves?.[saveKey];
    if (!save) return null;
    return this.#rollCheck({
      formula: "1d20",
      modifier: save.total,
      situational: options.situational ?? 0,
      flavour: options.flavour ?? game.i18n.format("B5.Roll.SaveCheck", {
        save: game.i18n.localize(`B5.Save.${saveKey}`)
      })
    });
  }

  /** One of the four attack lines (or feint / resist feint). */
  async rollAttack(lineKey, options = {}) {
    const line = this.system.attacks?.[lineKey];
    if (!line) return null;
    return this.#rollCheck({
      formula: "1d20",
      modifier: line.total,
      situational: options.situational ?? 0,
      flavour: game.i18n.format("B5.Roll.AttackCheck", {
        line: game.i18n.localize(`B5.Attack.${lineKey}`)
      })
    });
  }

  /** Initiative is a plain Dex check. */
  async rollInitiativeCheck(options = {}) {
    return this.#rollCheck({
      formula: "1d20",
      modifier: this.system.attributes?.initiative?.total ?? 0,
      situational: options.situational ?? 0,
      flavour: game.i18n.localize("B5.Roll.Initiative")
    });
  }

  /**
   * Influence check — 2d6, not d20. Repeated attempts on the same faction within a week
   * take a cumulative −4.
   */
  async rollInfluence(itemId, options = {}) {
    const item = this.items.get(itemId);
    if (item?.type !== "influence") return null;
    return this.#rollCheck({
      formula: B5.INFLUENCE_DICE,
      modifier: item.system.value + item.system.repeatPenalty,
      situational: options.situational ?? 0,
      flavour: game.i18n.format("B5.Roll.InfluenceCheck", { faction: item.name })
    });
  }

  async #rollCheck({ formula, modifier, situational, flavour }) {
    const parts = [formula];
    if (modifier) parts.push(`${modifier}`);
    if (situational) parts.push(`${situational}`);
    const roll = await new Roll(parts.join(" + "), this.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: flavour
    });
    return roll;
  }

  /* -------------------------------------------- */
  /*  Damage                                      */
  /* -------------------------------------------- */

  /**
   * Apply damage through the system's pipeline: `damage − max(0, DR − AP)`.
   * DR may reduce a hit to zero — this overrides the usual "minimum 1 damage".
   * Nonlethal damage is tracked separately and never subtracted from hit points.
   */
  async applyDamage(amount, { ap = 0, nonlethal = false, ignoreDr = false } = {}) {
    const dr = ignoreDr ? 0 : (this.system.attributes?.dr?.total ?? 0);
    const reduced = Math.max(0, amount - Math.max(0, dr - ap));
    if (!reduced) return { applied: 0, dr };

    if (nonlethal) {
      const current = this.system.attributes.hp.nonlethal;
      await this.update({ "system.attributes.hp.nonlethal": current + reduced });
    } else {
      const hp = this.system.attributes.hp;
      await this.update({ "system.attributes.hp.value": hp.value - reduced });
    }
    return { applied: reduced, dr };
  }

  /* -------------------------------------------- */

  /** @override — seed a sensible starting state so a fresh actor is not empty. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    const updates = {};
    if (!data.prototypeToken?.actorLink && this.type === "character") {
      updates.prototypeToken = { actorLink: true, sight: { enabled: true }, disposition: 1 };
    }
    if (foundry.utils.isEmpty(updates)) return;
    this.updateSource(updates);
  }
}
