import { B5 } from "../config.mjs";

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
      editImage: B5ItemSheet.#onEditImage
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

    return context;
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
