import { B5 } from "../config.mjs";
import { checkFeatPrerequisites } from "../system/prerequisites.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Shared base for every actor sheet.
 *
 * Tabs are wired by hand in `_onRender` (toggling `.active`, no re-render) rather than through
 * the core tab helper — it keeps tab switching instant and insulates the sheet from changes to
 * the v13 tab API.
 */
export default class B5ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["babylon5", "b5-sheet", "sheet", "actor"],
    position: { width: 880, height: 820 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollSkill: B5ActorSheet.#onRollSkill,
      rollSave: B5ActorSheet.#onRollSave,
      rollAttack: B5ActorSheet.#onRollAttack,
      rollInitiative: B5ActorSheet.#onRollInitiative,
      rollInfluence: B5ActorSheet.#onRollInfluence,
      burnInfluence: B5ActorSheet.#onBurnInfluence,
      createItem: B5ActorSheet.#onCreateItem,
      editItem: B5ActorSheet.#onEditItem,
      deleteItem: B5ActorSheet.#onDeleteItem,
      toggleItem: B5ActorSheet.#onToggleItem,
      editImage: B5ActorSheet.#onEditImage
    }
  };

  /** The tab shown when the sheet opens; overridden per sheet type. */
  static INITIAL_TAB = "summary";

  #activeTab = null;

  get activeTab() {
    return this.#activeTab ??= this.constructor.INITIAL_TAB;
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const enrich = foundry.applications.ux.TextEditor.implementation;

    Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      source: this.actor.toObject().system,
      config: B5,
      isEditable: this.isEditable,
      activeTab: this.activeTab,
      itemsByType: this.actor.itemTypes
    });

    context.enriched = {
      biography: await enrich.enrichHTML(this.actor.system.details?.biography ?? "", {
        relativeTo: this.actor, secrets: this.actor.isOwner
      }),
      notes: await enrich.enrichHTML(this.actor.system.details?.notes ?? "", {
        relativeTo: this.actor, secrets: this.actor.isOwner
      })
    };

    return context;
  }

  /** @override — mark which part is the active tab so the template can render it visible. */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.partId = partId;
    context.isActiveTab = partId === this.activeTab;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const nav of this.element.querySelectorAll("[data-tab-target]")) {
      nav.addEventListener("click", this.#onClickTab.bind(this));
    }
    this.#applyActiveTab();
  }

  #onClickTab(event) {
    event.preventDefault();
    const target = event.currentTarget.dataset.tabTarget;
    if (!target || target === this.#activeTab) return;
    this.#activeTab = target;
    this.#applyActiveTab();
  }

  #applyActiveTab() {
    const active = this.activeTab;
    for (const nav of this.element.querySelectorAll("[data-tab-target]")) {
      nav.classList.toggle("active", nav.dataset.tabTarget === active);
    }
    for (const panel of this.element.querySelectorAll(".b5-tab-panel")) {
      panel.classList.toggle("active", panel.dataset.tab === active);
    }
  }

  /**
   * @override — warn when a dropped feat does not qualify, but never refuse it: a GM may hand
   * out a feat deliberately, and the sheet keeps flagging it afterwards.
   */
  async _onDropItem(event, item) {
    const created = await super._onDropItem(event, item);
    const dropped = Array.isArray(created) ? created[0] : created;
    if (dropped?.type === "feat") {
      const check = checkFeatPrerequisites(this.actor, dropped);
      if (!check.met) {
        ui.notifications.warn(game.i18n.format("B5.Warning.featPrerequisites", {
          feat: dropped.name,
          list: check.unmet.map(r => r.label).join(", ")
        }));
      }
    }
    return created;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onRollSkill(event, target) {
    await this.actor.rollSkill(target.dataset.skill, { prompt: event.shiftKey });
  }

  static async #onRollSave(event, target) {
    await this.actor.rollSave(target.dataset.save, { prompt: event.shiftKey });
  }

  static async #onRollAttack(event, target) {
    await this.actor.rollAttack(target.dataset.attack, { prompt: event.shiftKey });
  }

  static async #onRollInitiative(event) {
    await this.actor.rollInitiativeCheck({ prompt: event.shiftKey });
  }

  static async #onRollInfluence(event, target) {
    await this.actor.rollInfluence(target.closest("[data-item-id]")?.dataset.itemId,
      { prompt: event.shiftKey });
  }

  /** Burning Influence permanently lowers the score to add +2 per point to a failed check. */
  static async #onBurnInfluence(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    await item.update({ "system.burned": item.system.burned + 1 });
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const name = game.i18n.format("B5.Item.New", {
      type: game.i18n.localize(`TYPES.Item.${type}`)
    });
    await this.actor.createEmbeddedDocuments("Item", [{ type, name }]);
  }

  static async #onEditItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("B5.Item.DeleteTitle") },
      content: `<p>${game.i18n.format("B5.Item.DeleteConfirm", { name: item.name })}</p>`
    });
    if (confirmed) await item.delete();
  }

  /** Toggle a boolean on an item — worn armour, equipped weapon, first-level class. */
  static async #onToggleItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const field = target.dataset.field;
    if (!item || !field) return;
    await item.update({ [`system.${field}`]: !foundry.utils.getProperty(item.system, field) });
  }

  static async #onEditImage(event, target) {
    const current = foundry.utils.getProperty(this.actor, target.dataset.edit ?? "img");
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: path => this.actor.update({ [target.dataset.edit ?? "img"]: path })
    });
    picker.browse();
  }

}
