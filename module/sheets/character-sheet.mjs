import B5ActorSheet from "./actor-sheet.mjs";
import { B5 } from "../config.mjs";
import { checkFeatPrerequisites } from "../system/prerequisites.mjs";
import B5TelepathyTests from "../tests/telepathy-tests.mjs";
import B5WeaponTests from "../tests/weapon-tests.mjs";
import B5InfluenceTests from "../tests/influence-tests.mjs";
import B5MarketTests from "../tests/market-tests.mjs";
import { DISCIPLINES } from "../system/telepathy.mjs";

const PATH = "systems/babylon5/templates/actor/character";

/**
 * Character sheet — layout Scheme B (see docs/design/01-data-model-proposal.md):
 * Summary · Combat · Skills · Feats · Influence · Gear, plus Telepathy shown only when the
 * character actually has a P-Rating.
 */
export default class B5CharacterSheet extends B5ActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 900, height: 840 },
    actions: {
      useAbility: B5CharacterSheet.#onUseAbility,
      cancelAbility: B5CharacterSheet.#onCancelAbility,
      rollTrait: B5CharacterSheet.#onRollTrait,
      clearMentalEffort: B5CharacterSheet.#onClearMentalEffort,
      attackWithWeapon: B5CharacterSheet.#onAttackWithWeapon,
      influenceCheck: B5CharacterSheet.#onInfluenceCheck,
      burnInfluence: B5CharacterSheet.#onBurnInfluence,
      newScenario: B5CharacterSheet.#onNewScenario,
      pressureFaction: B5CharacterSheet.#onPressureFaction,
      aidInfluence: B5CharacterSheet.#onAidInfluence,
      sourceOnMarket: B5CharacterSheet.#onSourceOnMarket
    }
  };

  static PARTS = {
    header:    { template: `${PATH}/header.hbs` },
    nav:       { template: `${PATH}/nav.hbs` },
    summary:   { template: `${PATH}/tab-summary.hbs`,   scrollable: [""] },
    combat:    { template: `${PATH}/tab-combat.hbs`,    scrollable: [""] },
    skills:    { template: `${PATH}/tab-skills.hbs`,    scrollable: [""] },
    feats:     { template: `${PATH}/tab-feats.hbs`,     scrollable: [""] },
    influence: { template: `${PATH}/tab-influence.hbs`, scrollable: [""] },
    gear:      { template: `${PATH}/tab-gear.hbs`,      scrollable: [""] },
    telepathy: { template: `${PATH}/tab-telepathy.hbs`, scrollable: [""] },
    biography: { template: `${PATH}/tab-biography.hbs`, scrollable: [""] }
  };

  static TAB_DEFINITIONS = [
    { id: "summary",   icon: "fa-solid fa-id-card" },
    { id: "combat",    icon: "fa-solid fa-crosshairs" },
    { id: "skills",    icon: "fa-solid fa-list-check" },
    { id: "feats",     icon: "fa-solid fa-star" },
    { id: "influence", icon: "fa-solid fa-handshake" },
    { id: "gear",      icon: "fa-solid fa-box-open" },
    { id: "telepathy", icon: "fa-solid fa-brain", requiresTelepathy: true },
    { id: "biography", icon: "fa-solid fa-book" }
  ];

  /** Telepathy is hidden entirely for characters without a P-Rating. */
  get showsTelepathy() {
    const tel = this.actor.system.telepathy;
    return tel.isTelepath || tel.pRating.value > 0;
  }

  /** @override — drop the telepathy part when it is not relevant. */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (!this.showsTelepathy) delete parts.telepathy;
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.tabs = this.constructor.TAB_DEFINITIONS
      .filter(t => !t.requiresTelepathy || this.showsTelepathy)
      .map(t => ({
        ...t,
        label: game.i18n.localize(`B5.Tab.${t.id}`),
        active: t.id === this.activeTab
      }));

    // Skills: the 19 fixed ones plus the subtyped skill Items, as one sorted list.
    context.skillRows = [
      ...Object.entries(system.skills).map(([key, skill]) => ({
        id: key,
        isItem: false,
        label: game.i18n.localize(`B5.Skill.${key}`),
        ability: skill.keyAbility,
        untrained: B5.skills[key].untrained,
        acp: B5.skills[key].acp,
        ...skill
      })),
      ...this.actor.itemTypes.skill.map(item => ({
        id: item.id,
        isItem: true,
        label: item.system.label ?? item.name,
        ability: item.system.keyAbility,
        untrained: false,
        acp: false,
        ranks: item.system.ranks,
        isClassSkill: item.system.isClassSkill,
        classSkill: item.system.classSkill,
        autoClassSkill: item.system.autoClassSkill,
        maxRanks: item.system.maxRanks,
        overMaxRanks: item.system.overMaxRanks,
        misc: item.system.misc,
        synergy: item.system.synergy,
        bonus: item.system.bonus ?? 0,
        total: item.system.total
      }))
    ].sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    context.maxRanksClass = B5.maxRanks(system.progression.level, true);
    context.maxRanksCross = B5.maxRanks(system.progression.level, false);
    context.budgetOverspent = system.progression.skillPoints.available < 0;

    context.classSummary = this.actor.itemTypes.class
      .map(c => `${c.name} ${c.system.levels}`).join(" / ");

    // Feats carry their prerequisite verdict so the sheet can flag the ones that do not hold.
    context.featRows = this.actor.itemTypes.feat.map(item => {
      const check = checkFeatPrerequisites(this.actor, item);
      return {
        item,
        met: check.met,
        unmet: check.unmet,
        notes: check.notes,
        unmetLabel: check.unmet.map(r => `${r.label}${r.detail ? ` (${r.detail})` : ""}`).join(", "),
        noteLabel: check.notes.map(r => r.label).join("; "),
        summary: [item.system.prerequisites?.other, ...check.results
          .filter(r => r.met !== null).map(r => r.label)].filter(Boolean).join(", ")
      };
    });
    context.unmetFeatCount = context.featRows.filter(r => !r.met).length;

    context.weapons = this.actor.itemTypes.weapon;
    context.armours = this.actor.itemTypes.armour;
    context.gear = [...this.actor.itemTypes.gear, ...this.actor.itemTypes.ammunition,
                    ...this.actor.itemTypes.weaponAccessory];

    if (this.showsTelepathy) this.#prepareTelepathyContext(context);

    return context;
  }

  /** Abilities grouped by Discipline, plus the tray of the ones being maintained. */
  #prepareTelepathyContext(context) {
    const abilities = this.actor.itemTypes.telepathicAbility;

    context.disciplines = DISCIPLINES
      .map(key => ({
        key,
        label: game.i18n.localize(`B5.Discipline.${key}`),
        focused: this.actor.system.telepathy.disciplineFocus.includes(key),
        abilities: abilities.filter(a => a.system.discipline === key)
      }))
      .filter(group => group.abilities.length);

    // Anything with a Discipline the config no longer knows would otherwise vanish silently.
    const orphans = abilities.filter(a => !DISCIPLINES.includes(a.system.discipline));
    if (orphans.length) {
      context.disciplines.push({
        key: "other", label: game.i18n.localize("B5.Discipline.other"), abilities: orphans
      });
    }

    context.maintaining = this.actor.system.telepathy.maintaining
      .map(id => this.actor.items.get(id))
      .filter(Boolean);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onUseAbility(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5TelepathyTests.promptAbility(this.actor, id);
  }

  static async #onCancelAbility(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5TelepathyTests.cancelAbility(this.actor, id);
  }

  static async #onRollTrait(event, target) {
    await B5TelepathyTests.rollTrait(this.actor, target.dataset.trait, {
      strongEmotions: event.shiftKey
    });
  }

  static async #onClearMentalEffort() {
    await B5TelepathyTests.clearMentalEffort(this.actor);
  }

  static async #onAttackWithWeapon(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5WeaponTests.promptAttack(this.actor, id);
  }

  /**
   * @override — the Influence check knows about DCs and about burning, so the sheet uses it
   * instead of the generic roll. `actor.rollInfluence` stays the plain path for macros.
   */
  static async #onInfluenceCheck(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5InfluenceTests.promptCheck(this.actor, id);
  }

  static async #onBurnInfluence(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5InfluenceTests.promptBurn(this.actor, id);
  }

  static async #onNewScenario() {
    await B5InfluenceTests.newScenario(this.actor);
  }

  static async #onPressureFaction(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5InfluenceTests.promptPressure(this.actor, id);
  }

  static async #onAidInfluence(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5InfluenceTests.aid(this.actor, id);
  }

  /** Source a restricted or illegal item through a fence (equipment chapter §1.4). */
  static async #onSourceOnMarket(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await B5MarketTests.promptSourcing(this.actor, id);
  }
}
