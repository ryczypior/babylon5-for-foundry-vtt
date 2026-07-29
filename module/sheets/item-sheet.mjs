import { B5 } from "../config.mjs";
import B5InfluenceTests from "../tests/influence-tests.mjs";
import { influenceDice, outlookKey, resourceList, resourceOutlook } from "../system/influence.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * One item sheet class for every item type. The shared header is always rendered; the body
 * template is picked from the item type, so adding a type means adding one template.
 */
export default class B5ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["babylon5", "b5-sheet", "sheet", "item"],
    position: { width: 560, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: B5ItemSheet.#onEditImage,
      drawResource: B5ItemSheet.#onDrawResource
    }
  };

  static PARTS = {
    header: { template: "systems/babylon5/templates/item/header.hbs" },
    body:   { template: "systems/babylon5/templates/item/body.hbs", scrollable: [""] }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const enrich = foundry.applications.ux.TextEditor.implementation;

    Object.assign(context, {
      item: this.item,
      system: this.item.system,
      source: this.item.toObject().system,
      config: B5,
      isEditable: this.isEditable,
      bodyTemplate: `systems/babylon5/templates/item/types/${this.item.type}.hbs`
    });

    context.enriched = {
      description: await enrich.enrichHTML(this.item.system.description ?? "", {
        relativeTo: this.item, secrets: this.item.isOwner
      })
    };

    if (this.item.type === "influence") this.#prepareResources(context);

    return context;
  }

  /**
   * The faction's resource table (book §A.16), plus — on an owned entry — what each row would
   * still take. The outlook needs the owner's dice and repeat penalty, so it cannot be derived on
   * the Item: `Heart of Izil'zha` and the softened repeat penalty are both the actor's business.
   */
  #prepareResources(context) {
    const item = this.item;
    const actor = item.actor;
    context.isOwned = !!actor;

    const dice = actor ? influenceDice(actor, item, B5.INFLUENCE_DICE) : B5.INFLUENCE_DICE;
    context.resourceRows = resourceList(item).map(row => {
      if (!actor) return { ...row, outlook: null, labelKey: null };
      const outlook = resourceOutlook(row.dc, {
        score: item.system.value, penalty: item.system.repeatPenalty, dice
      });
      return { ...row, outlook, labelKey: outlookKey(outlook) };
    });
  }

  /** Draw on one row of the faction's resource table — the Influence check with its DC filled in. */
  static async #onDrawResource(event, target) {
    const actor = this.item.actor;
    if (!actor?.isOwner) return;
    await B5InfluenceTests.drawResource(actor, this.item.id, Number(target.dataset.index));
  }

  static async #onEditImage(event, target) {
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.item.img,
      callback: path => this.item.update({ img: path })
    });
    picker.browse();
  }
}
