import { B5 } from "../config.mjs";
import B5OrderTests from "./order-tests.mjs";
import { isSoloCraft } from "../system/orders.mjs";
import {
  IMPAIRMENT_CHECKS, IMPAIRMENT_DC, RAPID_FIRE_PENALTY,
  allocateCraftDamage, areasNeedingImpairment, interceptableOffence, interceptorsReady,
  resolveMitigation, shieldDivisor, targetingComputerBonus, totalOffence, weaponInArc,
  weaponInRange, weaponQualities, weaponsNeedingImpairment
} from "../system/gunnery.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Firing a craft's weapons (book pp. 193–197).
 *
 * One barrage is one order's worth of shooting: every selected weapon rolls separately, the
 * hits are folded into a single Total Offence, and what gets through the target's Armour is
 * spent one point per structural space.
 *
 * What is left to the table, deliberately:
 *  - **which order** the barrage belongs to. The order engine already resolves *Fire At Will!*
 *    and its siblings; this is the shooting that follows, and the two are not chained so a GM
 *    can fire without an order and issue orders without firing.
 *  - **interception**. The number of points intercepted is typed in, because a target's
 *    interceptors are its own *Fire Interceptors!* order and beam weapons ignore them.
 *  - **where a target's spaces are allocated inside an arc**, which the book gives to the
 *    defending player; the mounts are filled in listed order instead.
 */
export default class B5AttackTests {

  /* -------------------------------------------- */
  /*  Who fires                                   */
  /* -------------------------------------------- */

  /**
   * The attack bonus for this craft's guns. A solo pilot fires on BAB + Dex, a gunner aboard a
   * larger ship on BAB + Int, and anything no character mans falls back to the crew's BAB.
   */
  static resolveGunner(craft) {
    const solo = isSoloCraft(craft);
    const role = solo ? "pilot" : "gunner";
    const line = solo ? "spaceSoloCraft" : "spaceGunnery";
    const actor = B5OrderTests.stationActor(craft, role);
    const bonus = actor?.system?.attacks?.[line]?.total;

    if (actor && Number.isFinite(bonus)) {
      return {
        actor, bonus, line, role,
        label: game.i18n.format("B5.Order.byStation", {
          name: actor.name, role: game.i18n.localize(`B5.CraftRole.${role}`)
        })
      };
    }
    return {
      actor: null,
      bonus: craft.system.crew.effectiveBab ?? 0,
      line: null,
      role: null,
      label: game.i18n.localize("B5.Order.byCrew")
    };
  }

  /* -------------------------------------------- */
  /*  Dialog                                      */
  /* -------------------------------------------- */

  /** Pick a target and the weapons that fire at it, then resolve the barrage. */
  static async promptBarrage(craft) {
    if (!craft.isOwner) return null;
    if (craft.system.combat.destroyed) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.craftDestroyed"));
      return null;
    }

    const weapons = craft.itemTypes.craftWeapon.filter(w => !w.system.destroyed);
    if (!weapons.length) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noCraftWeapons"));
      return null;
    }

    const band = craft.system.combat.band;
    const gunner = this.resolveGunner(craft);
    const targeting = targetingComputerBonus(craft);

    const targeted = [...game.user.targets]
      .map(token => token.actor)
      .find(actor => actor?.type === "craft" && actor.id !== craft.id);
    const candidates = game.actors.filter(a => a.type === "craft" && a.id !== craft.id);

    // What the target has waiting from its own Fire Interceptors! order, so the number in the
    // field is not typed from memory. The check itself happens during resolution.
    const ready = targeted ? interceptorsReady(targeted) : [];
    const chaff = targeted?.system.combat.interceptors.chaff ?? 0;
    const readyInterception = [
      ...ready.map(entry => `${entry.name} ${entry.value}`),
      ...(chaff ? [`${game.i18n.localize("B5.Barrage.activeChaff")} ${chaff}`] : [])
    ].join(", ");

    const targetOptions = [`<option value="">${game.i18n.localize("B5.Barrage.noTarget")}</option>`]
      .concat(candidates.map(a => `<option value="${a.id}" ${a.id === targeted?.id ? "selected" : ""}>`
        + `${a.name} — ${game.i18n.localize("B5.Field.dv")} ${a.system.attributes.dv.total}, `
        + `${game.i18n.localize("B5.Field.armour")} ${a.system.attributes.armour.value}</option>`))
      .join("");

    const rows = weapons.map(weapon => {
      const quality = weaponQualities(weapon);
      const inRange = weaponInRange(weapon, band);
      const notes = [];
      if (quality.rapidFire > 1) {
        notes.push(game.i18n.format("B5.Barrage.rapidFireNote",
          { count: quality.rapidFire, penalty: RAPID_FIRE_PENALTY }));
      }
      if (quality.beam) notes.push(game.i18n.format("B5.Barrage.beamNote", { dice: quality.beam }));
      if (quality.array && targeting) notes.push(game.i18n.localize("B5.Barrage.arrayNote"));
      if (quality.electroPulse) notes.push(game.i18n.localize("B5.Barrage.electroPulseNote"));
      if (weapon.system.impaired) notes.push(game.i18n.localize("B5.Barrage.impairedNote"));
      if (!inRange) notes.push(game.i18n.localize("B5.Barrage.outOfRange"));

      return `<label class="b5-barrage-row${inRange ? "" : " out-of-range"}">
        <input type="checkbox" data-weapon-id="${weapon.id}" ${inRange ? "checked" : "disabled"}>
        <span class="b5-barrage-name">${weapon.name}</span>
        <span class="b5-barrage-meta">
          ${game.i18n.localize(`B5.Arc.${weapon.system.arc}`)} ·
          ${game.i18n.localize(`B5.Range.${weapon.system.range}`)} ·
          ${game.i18n.localize("B5.Field.offence")} ${weapon.system.effectiveOffence}
        </span>
        ${notes.length ? `<span class="b5-barrage-note">${notes.join(" · ")}</span>` : ""}
      </label>`;
    }).join("");

    const globalMod = craft.system.status.checkModifier;
    const content = `
      <p class="b5-hint">${game.i18n.format("B5.Barrage.firedBy", {
        executor: gunner.label, bonus: gunner.bonus >= 0 ? `+${gunner.bonus}` : gunner.bonus,
        band: game.i18n.localize(`B5.Range.${band}`)
      })}</p>
      ${globalMod ? `<p class="b5-warning-inline">${game.i18n.format("B5.Barrage.controlPenalty", { value: globalMod })}</p>` : ""}
      <div class="form-group"><label>${game.i18n.localize("B5.Barrage.target")}</label>
        <select name="targetId">${targetOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Barrage.dvOverride")}</label>
        <input type="number" name="dv" placeholder="${game.i18n.localize("B5.Barrage.dvOverrideHint")}"></div>
      <fieldset class="b5-barrage-weapons">
        <legend>${game.i18n.localize("B5.Section.craftWeapons")}</legend>
        ${rows}
      </fieldset>
      ${targeting ? `<div class="form-group"><label>
        <input type="checkbox" name="lockedOn" checked>
        ${game.i18n.format("B5.Barrage.lockedOn", { bonus: targeting })}</label></div>` : ""}
      ${readyInterception ? `<p class="b5-hint">${game.i18n.format("B5.Barrage.interceptorsReady", {
        target: targeted?.name ?? "", detail: readyInterception })}</p>` : ""}
      <div class="form-group"><label>${game.i18n.localize("B5.Barrage.intercepted")}</label>
        <input type="number" name="intercepted" value="0"
               placeholder="${game.i18n.localize("B5.Barrage.interceptedHint")}"></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Field.misc")}</label>
        <input type="number" name="modifier" value="0"></div>`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("B5.Barrage.fire") },
      classes: ["b5-dialog"],
      content,
      ok: {
        label: game.i18n.localize("B5.Barrage.fire"),
        callback: (event, button) => {
          const data = new foundry.applications.ux.FormDataExtended(button.form).object;
          // Read the checkboxes off the form rather than through names: an object keyed by
          // item id survives `expandObject`, but reading the DOM is unambiguous.
          data.weaponIds = [...button.form.querySelectorAll("input[data-weapon-id]:checked")]
            .map(input => input.dataset.weaponId);
          return data;
        }
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.fireBarrage(craft, {
      targetId: result.targetId || null,
      dv: Number.isNumeric(result.dv) && result.dv !== null ? Number(result.dv) : null,
      intercepted: Number(result.intercepted) || 0,
      modifier: Number(result.modifier) || 0,
      lockedOn: !!result.lockedOn,
      weaponIds: result.weaponIds ?? []
    });
  }

  /* -------------------------------------------- */
  /*  Resolution                                  */
  /* -------------------------------------------- */

  /**
   * Roll every selected weapon, fold the hits into one Total Offence and — when the target is
   * ours to update — spend the damage on its structural spaces.
   */
  static async fireBarrage(craft, {
    targetId = null, dv = null, intercepted = 0, modifier = 0, lockedOn = false, weaponIds = []
  } = {}) {
    const target = targetId ? game.actors.get(targetId) : null;
    const weapons = weaponIds
      .map(id => craft.items.get(id))
      .filter(w => w?.type === "craftWeapon" && !w.system.destroyed);

    if (!weapons.length) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noWeaponsSelected"));
      return null;
    }

    const targetDv = Number.isFinite(dv) ? dv : (target?.system.attributes.dv.total ?? null);
    if (targetDv === null) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noTargetDv"));
      return null;
    }

    // One offensive order covers one arc — turrets excepted, which `weaponInArc` knows. Firing
    // across two arcs is a rules error, but a GM may have a reason: warn and fire anyway.
    const oneArc = B5.craftArcs.some(arc => weapons.every(w => weaponInArc(w, arc)));
    if (!oneArc) ui.notifications.warn(game.i18n.localize("B5.Warning.mixedArcs"));

    const gunner = this.resolveGunner(craft);
    const targeting = lockedOn ? targetingComputerBonus(craft) : 0;
    const globalMod = craft.system.status.checkModifier;

    const shots = [];
    for (const weapon of weapons) {
      const quality = weaponQualities(weapon);
      const count = Math.max(1, quality.rapidFire);
      const penalty = (count > 1 ? RAPID_FIRE_PENALTY : 0) + weapon.system.attackPenalty;
      // An Array cannot benefit from a weapons lock.
      const lockBonus = quality.array ? 0 : targeting;
      const bonus = gunner.bonus + lockBonus + globalMod + modifier + penalty;

      for (let shot = 0; shot < count; shot++) {
        shots.push(await this.#rollShot({ weapon, quality, bonus, dv: targetDv, index: shot, of: count }));
      }
    }

    // Electro-Pulse hits carry no Offence at all; they threaten a control space instead.
    const hits = shots.filter(s => s.hit && !s.quality.electroPulse);
    const contributions = hits.map(s => ({
      offence: s.weapon.system.effectiveOffence, crit: s.crit, beam: !!s.quality.beam
    }));
    const offence = totalOffence(contributions);

    // The target's own Fire Interceptors! order, resolved here because this is the moment its
    // DC exists — the barrage's highest attack roll. A number typed into the dialog wins.
    const interception = (target && !intercepted && offence > 0)
      ? await this.#rollInterception(target, contributions, hits)
      : null;
    if (interception) intercepted = interception.applied;

    const divisor = target ? shieldDivisor(target) : 1;
    const armour = target?.system.attributes.armour.value ?? 0;
    const mitigation = resolveMitigation(offence, { intercepted, divisor, armour });

    // Beam armour damage is rolled after the barrage's damage is known, and only if it caused any.
    const beams = [];
    if (mitigation.damage > 0) {
      for (const shot of hits.filter(s => s.quality.beam)) {
        const roll = await new Roll(shot.quality.beam).evaluate();
        beams.push({ name: shot.weapon.name, dice: shot.quality.beam, total: roll.total, roll });
      }
    }
    const beamArmour = beams.reduce((sum, b) => sum + b.total, 0);

    const report = {
      craft, target, shots, hits, mitigation, beams, beamArmour, interception,
      gunner, targeting: lockedOn ? targeting : 0, modifier, globalMod, dv: targetDv,
      electroPulse: shots.filter(s => s.hit && s.quality.electroPulse)
    };

    await this.#postBarrageCard(report);

    if (!target) {
      ui.notifications.info(game.i18n.format("B5.Barrage.noTargetResult", { damage: mitigation.damage }));
      return report;
    }
    if (!target.isOwner) {
      ui.notifications.warn(game.i18n.format("B5.Warning.targetNotOwned", { name: target.name }));
      return report;
    }

    report.damage = await this.applyBarrageDamage(target, mitigation.damage, {
      beamArmour, electroPulse: report.electroPulse.length
    });
    return report;
  }

  /**
   * Resolve the target's interception against this barrage (book p. 195).
   *
   * Active Chaff needs no check and lasts the round, so it is never spent. One designated
   * interceptor system may fire per barrage, against a DC equal to the barrage's highest attack
   * roll, and it is spent whether or not it connects. Beam weapons ignore interceptors, so the
   * whole thing is capped at the Total Offence the barrage would have had without its beams —
   * a barrage of nothing but beams cannot be intercepted at all.
   */
  static async #rollInterception(target, contributions, hits) {
    const state = target.system.combat.interceptors;
    const ready = interceptorsReady(target);
    if (!ready.length && !state.chaff) return null;

    const ceiling = interceptableOffence(contributions);
    if (!ceiling) return { applied: 0, ceiling: 0, beamsOnly: true, chaff: 0, system: null };

    const system = ready[0];
    let roll = null;
    let success = null;
    let dc = null;
    let executor = null;

    if (system) {
      dc = Math.max(...hits.map(shot => shot.roll.total));
      executor = B5OrderTests.resolveExecutor(target, {
        skill: { skill: "operations", subtype: "gunnery" }
      });
      roll = await new Roll("1d20 + @bonus", { bonus: executor.bonus + state.penalty }).evaluate();
      success = roll.total >= dc;

      // Spent whether or not it connected — each system fires once per round.
      await target.update({ "system.combat.interceptors.used": [...state.used, system.id] });
    }

    return {
      applied: Math.min(ceiling, state.chaff + (success ? system.value : 0)),
      ceiling,
      chaff: state.chaff,
      penalty: state.penalty,
      system: system ? { name: system.name, value: system.value } : null,
      dc,
      executor: executor?.label ?? null,
      total: roll?.total ?? null,
      success,
      beamsOnly: false
    };
  }

  /**
   * One attack roll. A natural 20 always hits and is re-rolled immediately: if the second roll
   * beats the Defence Value it is a critical, whatever it shows. A natural 1 always misses.
   */
  static async #rollShot({ weapon, quality, bonus, dv, index, of }) {
    const roll = await new Roll("1d20 + @bonus", { bonus }).evaluate();
    const natural = roll.dice[0]?.total ?? 0;
    const hit = natural !== 1 && (natural === 20 || roll.total >= dv);

    let confirmation = null;
    let crit = false;
    if (natural === 20) {
      confirmation = await new Roll("1d20 + @bonus", { bonus }).evaluate();
      crit = confirmation.total >= dv;
    }
    return { weapon, quality, roll, confirmation, natural, hit, crit, bonus, index, of };
  }

  /* -------------------------------------------- */
  /*  Damage                                      */
  /* -------------------------------------------- */

  /**
   * Spend the damage on the target: the 2d6 cascade for the structural spaces, an impairment
   * check for every area left standing but hurt, and Armour loss from beams and from anything
   * the cascade could not place.
   */
  static async applyBarrageDamage(target, damage, { beamArmour = 0, electroPulse = 0 } = {}) {
    const plan = damage > 0
      ? await allocateCraftDamage(target, damage)
      : { steps: [], spaces: {}, weapons: [], featuresLost: [], armourLoss: 0, unallocated: 0, rolls: [] };

    const updates = {};
    for (const [key, pool] of Object.entries(plan.spaces)) {
      if (pool.lost) updates[`system.spaces.${key}.value`] = pool.value;
    }

    const armourLoss = plan.armourLoss + beamArmour;
    if (armourLoss) {
      updates["system.attributes.armour.value"] =
        Math.max(0, target.system.attributes.armour.value - armourLoss);
    }

    const itemUpdates = [
      ...plan.weapons.filter(w => w.hit > 0).map(w => ({ _id: w.id, "system.spacesLost": w.lost })),
      ...plan.featuresLost.map(f => ({ _id: f.id, "system.destroyed": true }))
    ];

    if (!foundry.utils.isEmpty(updates)) await target.update(updates);
    if (itemUpdates.length) await target.updateEmbeddedDocuments("Item", itemUpdates);

    // The checks come after the spaces are gone, because the bonus counts what is left.
    const impairment = await this.#rollImpairment(target, plan);
    const pulse = electroPulse ? await this.#rollElectroPulse(target, electroPulse) : null;

    await this.#postDamageCard(target, { damage, plan, impairment, armourLoss, beamArmour, pulse });
    return { plan, impairment, armourLoss, pulse };
  }

  /**
   * DC 25 per hurt area, +1 for every ten spaces of that type still remaining. A natural 1
   * always fails and a natural 20 always succeeds. Weapon systems are checked one by one.
   */
  static async #rollImpairment(craft, plan) {
    const results = [];
    if (!Object.keys(plan.spaces).length) return results;

    const roll = async ({ area, bonus, label, itemId }) => {
      const executor = B5OrderTests.resolveExecutor(craft, { skill: IMPAIRMENT_CHECKS[area] });
      const check = await new Roll("1d20 + @bonus", { bonus: executor.bonus + bonus }).evaluate();
      const natural = check.dice[0]?.total ?? 0;
      const success = natural === 20 || (natural !== 1 && check.total >= IMPAIRMENT_DC);
      results.push({ area, label, itemId, bonus, executor, roll: check, natural, success });
    };

    for (const area of areasNeedingImpairment(craft, plan)) {
      await roll({ ...area, label: game.i18n.localize(`B5.Space.${area.area}`) });
    }
    for (const weapon of weaponsNeedingImpairment(craft, plan)) {
      await roll({ area: "weapons", bonus: weapon.bonus, label: weapon.name, itemId: weapon.id });
    }

    const updates = {};
    const itemUpdates = [];
    for (const result of results.filter(r => !r.success)) {
      if (result.itemId) itemUpdates.push({ _id: result.itemId, "system.impaired": true });
      else updates[`system.spaces.${result.area}.impaired`] = true;
    }
    if (!foundry.utils.isEmpty(updates)) await craft.update(updates);
    if (itemUpdates.length) await craft.updateEmbeddedDocuments("Item", itemUpdates);

    return results;
  }

  /**
   * Electro-Pulse: the hit does no damage, but the target loses a control space unless it makes
   * an Operations (systems) check at DC 20.
   */
  static async #rollElectroPulse(craft, count) {
    const results = [];
    let lost = 0;
    for (let i = 0; i < count; i++) {
      const executor = B5OrderTests.resolveExecutor(craft, {
        skill: { skill: "operations", subtype: "systems" }
      });
      const roll = await new Roll("1d20 + @bonus", { bonus: executor.bonus }).evaluate();
      const success = roll.total >= 20;
      if (!success) lost += 1;
      results.push({ roll, success, executor });
    }
    if (lost) {
      const control = craft.system.spaces.control;
      await craft.update({ "system.spaces.control.value": Math.max(0, control.value - lost) });
    }
    return { results, lost };
  }

  /* -------------------------------------------- */
  /*  Chat                                        */
  /* -------------------------------------------- */

  static async #postBarrageCard(report) {
    const { mitigation } = report;
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/barrage.hbs", {
        craft: report.craft,
        targetName: report.target?.name ?? null,
        executor: report.gunner.label,
        bonus: report.gunner.bonus,
        targeting: report.targeting,
        modifier: report.modifier,
        globalMod: report.globalMod,
        dv: report.dv,
        shots: report.shots.map(shot => ({
          name: shot.weapon.name,
          offence: shot.weapon.system.effectiveOffence,
          total: shot.roll.total,
          natural: shot.natural,
          hit: shot.hit,
          crit: shot.crit,
          confirmation: shot.confirmation?.total ?? null,
          repeated: shot.of > 1 ? `${shot.index + 1}/${shot.of}` : null,
          electroPulse: shot.quality.electroPulse
        })),
        anyHit: report.hits.length > 0,
        offence: mitigation.offence,
        intercepted: mitigation.intercepted,
        interception: report.interception,
        divisor: mitigation.divisor,
        shielded: mitigation.divisor > 1,
        afterShielding: mitigation.afterShielding,
        armour: mitigation.armour,
        damage: mitigation.damage,
        hasTarget: !!report.target,
        beams: report.beams.map(b => ({ name: b.name, dice: b.dice, total: b.total })),
        beamArmour: report.beamArmour,
        electroPulse: report.electroPulse.length
      });

    const rolls = report.shots.flatMap(s => [s.roll, s.confirmation].filter(Boolean))
      .concat(report.beams.map(b => b.roll));

    await this.#post(report.craft, content, rolls);
  }

  static async #postDamageCard(target, { damage, plan, impairment, armourLoss, beamArmour, pulse }) {
    if (!damage && !armourLoss && !pulse?.lost) return;

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/craft-damage.hbs", {
        craft: target,
        damage,
        steps: plan.steps.map(step => ({ ...step, label: B5AttackTests.#stepLabel(step) })),
        featuresLost: plan.featuresLost.map(f => f.name),
        impairment: impairment.map(i => ({
          label: i.label, total: i.roll.total, success: i.success, dc: IMPAIRMENT_DC
        })),
        impairmentDc: IMPAIRMENT_DC,
        armourLoss,
        beamArmour,
        armour: target.system.attributes.armour.value,
        spaces: Object.entries(target.system.spaces).map(([key, pool]) => ({
          label: game.i18n.localize(`B5.Space.${key}`),
          value: pool.value, max: pool.max, impaired: pool.impaired
        })).filter(s => s.max > 0),
        drifting: target.system.status.drifting,
        destroyed: target.system.combat.destroyed,
        pulseLost: pulse?.lost ?? 0
      });

    const rolls = impairment.map(i => i.roll).concat(pulse?.results.map(r => r.roll) ?? []);
    await this.#post(target, content, rolls);
  }

  /** A cascade step reads as an area, an arc within the weapons area, or one of its endings. */
  static #stepLabel(step) {
    if (step.arc) {
      return `${game.i18n.localize("B5.Space.weapons")} — ${game.i18n.localize(`B5.Arc.${step.arc}`)}`;
    }
    if (["special", "cascadeExhausted", "engineOverflow"].includes(step.area)) {
      return game.i18n.localize(`B5.Damage.${step.area}`);
    }
    return game.i18n.localize(`B5.Space.${step.area}`);
  }

  static async #post(actor, content, rolls) {
    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls,
      sound: rolls.length ? CONFIG.sounds.dice : null
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }
}
