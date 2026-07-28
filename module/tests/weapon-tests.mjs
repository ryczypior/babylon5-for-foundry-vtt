import { partsTotal } from "../system/roll-modifiers.mjs";
import { liveTotal, modifierFooter, modifierGroups, readModifierParts } from "./roll-dialog.mjs";
import {
  BURST_ATTACKS, BURST_PENALTY, BURST_SHOTS, NON_PROFICIENT_PENALTY,
  TWO_WEAPON_PENALTIES, WEAPON_FEATS, WEAPON_FOCUS_ATTACK, WEAPON_SPECIALISATION_DAMAGE,
  addsStrengthToDamage, damageFormula, hasWeaponFeat, isAutomatic, isLight, isNonlethalWeapon,
  isProficient, isRapidFire, parseCritical, rangePenalty, strengthDamage, widenThreat
} from "../system/weapons.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Attacking with a personal weapon (book pp. 156–172).
 *
 * The four attack lines already live on the actor and are already rolled on their own; this is
 * the weapon on top of them — its line, its range penalty, its threat range and multiplier, its
 * damage dice and the Strength the grip carries into them, and the ammunition it spends.
 *
 * A full attack rolls every iterative the BAB grants, which is why the dialog asks for the
 * action rather than assuming one swing.
 *
 * Left to the table on purpose: full rapid fire (spraying an area is a Reflex save per shot
 * against a DC that moves with range and cover — a targeting problem, not a roll), attacks of
 * opportunity, and the manoeuvres.
 */
export default class B5WeaponTests {

  /* -------------------------------------------- */
  /*  Assembling the attack                       */
  /* -------------------------------------------- */

  /**
   * Everything about this weapon in this character's hands that does not depend on the shot:
   * which line it uses, its threat range, whether the character is proficient with it.
   */
  static profile(actor, weapon) {
    const line = weapon.system.attackLine;
    const critical = parseCritical(weapon.system.critical);
    const improved = hasWeaponFeat(actor, weapon, WEAPON_FEATS.improvedCritical);

    return {
      line,
      lineTotal: actor.system.attacks?.[line]?.total ?? 0,
      threat: improved ? widenThreat(critical.threat) : critical.threat,
      multiplier: critical.multiplier,
      improvedCritical: improved,
      focus: hasWeaponFeat(actor, weapon, WEAPON_FEATS.focus),
      specialisation: hasWeaponFeat(actor, weapon, WEAPON_FEATS.specialisation),
      proficient: isProficient(actor, weapon),
      light: isLight(weapon),
      burstCapable: isAutomatic(weapon) || isRapidFire(weapon),
      iteratives: actor.system.attributes?.bab?.iteratives ?? [0]
    };
  }

  /** Ask for the shot, then resolve it. */
  static async promptAttack(actor, itemId) {
    const weapon = actor.items.get(itemId);
    if (weapon?.type !== "weapon" || !actor.isOwner) return null;

    const profile = this.profile(actor, weapon);
    const ammo = weapon.system.ammo;

    // Weapon-specific lines, offered as ordinary modifier rows so they sum with everything else.
    const extra = [];
    if (!profile.proficient) {
      extra.push({
        key: "nonProficient", value: NON_PROFICIENT_PENALTY,
        labelKey: "B5.Modifier.nonProficient", checked: true
      });
    }
    if (profile.focus) {
      extra.push({
        key: "weaponFocus", value: WEAPON_FOCUS_ATTACK,
        labelKey: "B5.Modifier.weaponFocus", checked: true
      });
    }

    const twoWeaponOptions = Object.entries(TWO_WEAPON_PENALTIES).map(([key, value]) => {
      const [light, feat] = key.split("-");
      return `<option value="${key}">`
        + `${game.i18n.localize(`B5.Weapon.twoWeapon.${light === "true" ? "light" : "normal"}`)}`
        + `${feat === "true" ? ` + ${game.i18n.localize("B5.Weapon.twoWeapon.feat")}` : ""}`
        + ` — ${value.primary} / ${value.offHand}</option>`;
    }).join("");

    const content = `
      <p class="b5-hint b5-modifier-head">
        ${weapon.name} — ${game.i18n.localize(`B5.Attack.${profile.line}`)}
        <strong>${profile.lineTotal >= 0 ? "+" : ""}${profile.lineTotal}</strong>
        · ${weapon.system.damage}
        · ${profile.threat >= 20 ? "20" : `${profile.threat}–20`}/×${profile.multiplier}
        ${profile.improvedCritical ? `(${game.i18n.localize("B5.Modifier.improvedCritical")})` : ""}
      </p>
      ${ammo.usesAmmo ? `<p class="${ammo.current > 0 ? "b5-hint" : "b5-warning-inline"}">
        ${game.i18n.localize("B5.Field.ammo")}: ${ammo.current} / ${ammo.capacity}</p>` : ""}

      <div class="form-group"><label>${game.i18n.localize("B5.Weapon.action")}</label>
        <select name="action">
          <option value="single">${game.i18n.localize("B5.Weapon.singleAttack")}</option>
          <option value="full">${game.i18n.format("B5.Weapon.fullAttack",
            { attacks: profile.iteratives.map(b => (b >= 0 ? `+${b}` : b)).join(" / ") })}</option>
          ${profile.burstCapable ? `<option value="burst">${game.i18n.format("B5.Weapon.burst",
            { rolls: BURST_ATTACKS, penalty: BURST_PENALTY, shots: BURST_SHOTS })}</option>` : ""}
        </select></div>

      <div class="form-group"><label>${game.i18n.localize("B5.Weapon.target")}</label>
        <input type="number" name="dv" placeholder="${game.i18n.localize("B5.Weapon.dvHint")}"></div>

      ${weapon.system.rangeIncrement ? `<div class="form-group">
        <label>${game.i18n.format("B5.Weapon.increments", { feet: weapon.system.rangeIncrement })}</label>
        <input type="number" name="increments" value="1" min="1"></div>` : ""}

      ${addsStrengthToDamage(weapon) ? `<div class="form-group">
        <label>${game.i18n.localize("B5.Weapon.grip")}</label>
        <select name="grip">
          <option value="oneHanded">${game.i18n.localize("B5.Weapon.oneHanded")}</option>
          <option value="twoHanded">${game.i18n.localize("B5.Weapon.twoHanded")}</option>
          <option value="offHand">${game.i18n.localize("B5.Weapon.offHand")}</option>
        </select></div>` : ""}

      <div class="form-group"><label>${game.i18n.localize("B5.Weapon.twoWeaponFighting")}</label>
        <select name="twoWeapon">
          <option value="">—</option>${twoWeaponOptions}
        </select></div>
      <div class="form-group"><label>
        <input type="checkbox" name="offHandAttack"> ${game.i18n.localize("B5.Weapon.thisIsOffHand")}</label></div>

      <div class="form-group"><label>
        <input type="checkbox" name="nonlethal" ${isNonlethalWeapon(weapon) ? "checked" : ""}>
        ${game.i18n.localize("B5.Weapon.nonlethal")}</label></div>

      ${modifierGroups(actor, { kind: "attack", subtype: profile.line, extra })}
      ${modifierFooter(profile.lineTotal)}`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.format("B5.Weapon.attackWith", { weapon: weapon.name }) },
      classes: ["b5-dialog"],
      content,
      render: liveTotal(profile.lineTotal),
      ok: {
        label: game.i18n.localize("B5.Weapon.attack"),
        callback: (event, button) => {
          const form = button.form;
          const data = new foundry.applications.ux.FormDataExtended(form).object;
          data.parts = readModifierParts(form);
          return data;
        }
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.attack(actor, itemId, {
      action: result.action,
      dv: Number.isNumeric(result.dv) && result.dv !== null ? Number(result.dv) : null,
      increments: Math.max(1, Number(result.increments) || 1),
      grip: result.grip ?? "oneHanded",
      twoWeapon: result.twoWeapon || null,
      offHandAttack: !!result.offHandAttack,
      nonlethal: !!result.nonlethal,
      parts: result.parts ?? [],
      rollMode: result.rollMode
    });
  }

  /* -------------------------------------------- */
  /*  Resolution                                  */
  /* -------------------------------------------- */

  static async attack(actor, itemId, {
    action = "single", dv = null, increments = 1, grip = "oneHanded", twoWeapon = null,
    offHandAttack = false, nonlethal = false, parts = [], rollMode = null
  } = {}) {
    const weapon = actor.items.get(itemId);
    if (weapon?.type !== "weapon") return null;

    const profile = this.profile(actor, weapon);
    const ammo = weapon.system.ammo;

    /* How many rolls, and at what step penalty each. */
    let steps;
    if (action === "burst") steps = Array.from({ length: BURST_ATTACKS }, () => BURST_PENALTY);
    else if (action === "full") steps = profile.iteratives.map(b => b - profile.iteratives[0]);
    else steps = [0];

    const shots = action === "burst" ? BURST_SHOTS : steps.length;
    // A burst fired with one or two rounds left misses outright (book p. 170); anything else
    // simply cannot be fired without the ammunition.
    const dryBurst = action === "burst" && ammo.usesAmmo && ammo.current < BURST_SHOTS;
    if (ammo.usesAmmo && ammo.current < shots && !dryBurst) {
      ui.notifications.warn(game.i18n.format("B5.Warning.notEnoughAmmo",
        { weapon: weapon.name, needed: shots, left: ammo.current }));
      return null;
    }

    const situational = partsTotal(parts);
    const range = rangePenalty(weapon, increments);
    if (range) parts = [...parts, { key: "range", value: range, labelKey: "B5.Modifier.range" }];

    let twoWeaponPenalty = 0;
    if (twoWeapon) {
      const entry = TWO_WEAPON_PENALTIES[twoWeapon];
      twoWeaponPenalty = offHandAttack ? entry.offHand : entry.primary;
      parts = [...parts, {
        key: "twoWeapon", value: twoWeaponPenalty, labelKey: "B5.Modifier.twoWeapon"
      }];
    }

    const bonus = profile.lineTotal + situational + range + twoWeaponPenalty;

    /* Damage: dice, the Strength the grip carries, and the flat feat bonuses. */
    const strMod = actor.system.abilities?.str?.mod ?? 0;
    const damageParts = [];
    if (addsStrengthToDamage(weapon)) {
      const fromStr = strengthDamage(strMod, offHandAttack ? "offHand" : grip, profile.light);
      if (fromStr) damageParts.push({ key: "strength", value: fromStr, labelKey: "B5.Field.strMod" });
    }
    if (profile.specialisation) {
      damageParts.push({
        key: "specialisation", value: WEAPON_SPECIALISATION_DAMAGE,
        labelKey: "B5.Modifier.weaponSpecialisation"
      });
    }
    if (actor.system.conditions?.sickened) {
      damageParts.push({ key: "sickened", value: -2, labelKey: "B5.Condition.sickened" });
    }
    const damageBonus = damageParts.reduce((sum, part) => sum + part.value, 0);

    /* Roll each attack, confirming any threat straight away. */
    const attacks = [];
    for (const [index, step] of steps.entries()) {
      const total = bonus + step;
      const roll = await new Roll("1d20 + @bonus", { bonus: total }).evaluate();
      const natural = roll.dice[0]?.total ?? 0;

      const threatened = natural >= profile.threat;
      // Only a natural 20 hits regardless; an expanded threat range still has to beat the DV.
      const hit = dryBurst ? false
        : (dv === null ? null : (natural !== 1 && (natural === 20 || roll.total >= dv)));

      let confirmation = null;
      let crit = false;
      if (threatened && natural !== 1 && hit !== false) {
        confirmation = await new Roll("1d20 + @bonus", { bonus: total }).evaluate();
        crit = dv === null ? null : confirmation.total >= dv;
      }

      const record = { index, step, roll, natural, hit, threatened, confirmation, crit, damage: null };

      // Damage is rolled for anything that hit, and for an undecided roll when no DV was given.
      if (hit !== false) {
        const multiplier = crit ? profile.multiplier : 1;
        record.damage = await new Roll(damageFormula(weapon, { bonus: damageBonus, multiplier }))
          .evaluate();
        record.multiplier = multiplier;
      }
      attacks.push(record);
    }

    if (ammo.usesAmmo) {
      await weapon.update({ "system.ammo.current": Math.max(0, ammo.current - shots) });
    }

    const report = {
      actor, weapon, profile, attacks, parts, damageParts, nonlethal,
      dv, action, shots, dryBurst, ap: weapon.system.ap
    };
    await this.#postCard(report, rollMode);
    return report;
  }

  /**
   * Apply every hit's damage to the targeted tokens, through the system's pipeline:
   * `damage − max(0, DR − AP)`, and DR may take a hit to nothing at all.
   */
  static async applyDamage(message) {
    const data = message.flags?.babylon5?.weapon;
    if (!data) return null;

    const targets = [...game.user.targets].map(token => token.actor).filter(a => a?.isOwner);
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noDamageTargets"));
      return null;
    }

    const lines = [];
    for (const target of targets) {
      const result = await target.applyDamage(data.damage, {
        ap: data.ap, nonlethal: data.nonlethal
      });
      lines.push(`<li>${target.name} — ${game.i18n.format("B5.Weapon.applied", {
        applied: result.applied, damage: data.damage, dr: result.dr
      })}</li>`);
    }

    await ChatMessage.create({
      speaker: message.speaker,
      content: `<div class="b5-order-card b5-weapon-card">
        <div class="b5-order-head"><span class="b5-order-name">${data.weapon}</span>
          <span class="b5-order-type">${game.i18n.localize("B5.Weapon.damageApplied")}</span></div>
        <ul class="b5-weapon-applied">${lines.join("")}</ul></div>`
    });
    return lines.length;
  }

  /* -------------------------------------------- */
  /*  Chat                                        */
  /* -------------------------------------------- */

  static async #postCard(report, rollMode) {
    const { weapon, profile, attacks } = report;
    const landed = attacks.filter(a => a.hit !== false);
    const damage = landed.reduce((sum, a) => sum + (a.damage?.total ?? 0), 0);

    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/weapon.hbs", {
        name: weapon.name,
        line: game.i18n.localize(`B5.Attack.${profile.line}`),
        action: game.i18n.localize(`B5.Weapon.${report.action}Label`),
        dv: report.dv,
        undecided: report.dv === null,
        parts: report.parts.map(p => ({
          label: game.i18n.localize(p.labelKey ?? `B5.Modifier.${p.key}`), value: p.value
        })),
        damageParts: report.damageParts.map(p => ({
          label: game.i18n.localize(p.labelKey), value: p.value
        })),
        attacks: attacks.map(a => ({
          total: a.roll.total,
          natural: a.natural,
          step: a.step,
          hit: a.hit,
          miss: a.hit === false,
          threatened: a.threatened,
          crit: a.crit === true,
          unconfirmed: a.threatened && a.crit === false,
          confirmation: a.confirmation?.total ?? null,
          damage: a.damage?.total ?? null,
          damageFormula: a.damage?.formula ?? null,
          multiplier: a.multiplier > 1 ? a.multiplier : null
        })),
        damage,
        anyDamage: damage > 0,
        dryBurst: report.dryBurst,
        nonlethal: report.nonlethal,
        ap: report.ap,
        ammo: weapon.system.ammo.usesAmmo
          ? { current: weapon.system.ammo.current, capacity: weapon.system.ammo.capacity }
          : null
      });

    const data = {
      speaker: ChatMessage.getSpeaker({ actor: report.actor }),
      content,
      rolls: attacks.flatMap(a => [a.roll, a.confirmation, a.damage].filter(Boolean)),
      sound: CONFIG.sounds.dice,
      flags: {
        babylon5: {
          weapon: {
            weapon: weapon.name, damage, ap: report.ap, nonlethal: report.nonlethal
          }
        }
      }
    };
    ChatMessage.applyRollMode(data, rollMode ?? game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }
}
