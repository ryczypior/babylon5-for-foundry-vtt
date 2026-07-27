# Babylon 5 2nd Edition — unofficial Foundry VTT system

A game system for [Foundry Virtual Tabletop](https://foundryvtt.com/) implementing the
**Babylon 5 Roleplaying Game, 2nd Edition** (Mongoose Publishing, 2006) — a d20 System
derivative. Sheets, compendia and rolls are available in **English and Polish**.

> **Status: early development.** Character, NPC and craft sheets work and are in use, but the
> system is not feature-complete — see [What works](#what-works) and [What is missing](#what-is-missing).

## Requirements

Foundry VTT **v13 or newer**. The system uses ApplicationV2 sheets and `TypeDataModel`
schemas throughout, with no v12 compatibility layer.

## Installation

Until a release manifest is published, install by hand:

```bash
cd ~/.local/share/FoundryVTT/Data/systems      # or your Foundry data directory
git clone https://github.com/ryczypior/babylon5-for-foundry-vtt.git babylon5
```

The directory **must** be named `babylon5`. The compiled stylesheet is committed, so no build
step is needed to play.

## What works

| Area | |
|---|---|
| **Actors** | `character`, `npc` and `craft` (spacecraft, aircraft and surface vehicles share one stat block) |
| **Items** | 13 types: class, race, skill, feat, influence, telepathic ability, weapon, armour, ammunition, gear, weapon accessory, craft weapon, craft feature |
| **Compendia** | 14 classes, 10 races, 91 feats, 91 pieces of equipment — each in an English and a Polish pack |
| **Automation** | racial modifiers, class skills, feat effects and prerequisites, the skill-point budget and rank caps, crew stations, and the 47 space-combat orders |
| **Rolls** | skills, saving throws, the four attack lines, initiative, Influence (2d6) and orders, all posted to chat |

The character sheet follows the printed layout's logic — Summary, Combat, Skills, Feats,
Influence, Gear, Biography — with a Telepathy tab that appears only for characters who have a
P-Rating.

### Things this edition does differently from stock d20

Worth knowing before you file a bug:

- There is **no Armour Class**. `DV = 10 + class Defence bonus + Dex mod + size mod`, and the
  class bonus applies even when flat-footed.
- **Armour grants Damage Reduction only** — never a bonus to Defence Value.
- There are **no hit dice**: HP are flat per-class values, and the Constitution modifier is
  added exactly once, at 1st level.
- **Influence checks roll 2d6**, not d20, against a per-faction score that never refreshes.
- Class tables run to **10th level**; beyond that characters multiclass.

## What is missing

Craft weapon fire (Total Offence, structural-space damage), telepathy resolution, the
situational-modifier dialog on rolls, and compendia for telepathic abilities and craft.

## Development

```bash
npm install
npm run build     # compile SCSS → styles/babylon5.css (commit the result)
npm run watch     # SCSS watcher
npm run pack      # rebuild the compendium packs from packs/_source/*.json
npm run link      # symlink this repo into your Foundry data directory
```

`npm run link` reads the path from `foundryconfig.json` (`{ "path": "…/FoundryVTT/Data" }`);
copy `foundryconfig-example.json` and edit it.

JavaScript and templates need no build — reload Foundry to pick them up. **Shut Foundry down
before `npm run pack`**: it holds the LevelDB packs open.

### Layout

```
module/          entry point, config, data models, documents, sheets
templates/       Handlebars templates for actors, items and chat cards
styles/          SCSS source and the compiled stylesheet
lang/            English and Polish translations (~640 keys each)
packs/_source/   editable compendium sources, bilingual
packs/<name>/    built LevelDB packs
docs/rules/      the rulebook distilled into implementation notes
docs/design/     data-model and layout decisions
```

Compendium sources carry both languages side by side (`name`/`namePl`,
`description`/`descriptionPl`), and `npm run pack` emits one English and one Polish pack from
each — Foundry has no built-in translation for pack contents.

## Contributing

Issues and pull requests are welcome. Rules questions are usually already answered in
`docs/rules/`, which cites the corebook page for each mechanic.

## Licence and legal

This is an **unofficial, non-commercial fan project**, not affiliated with or endorsed by
Warner Bros. Entertainment Inc. or Mongoose Publishing.

*Babylon 5* and all related characters, races, ships and settings are trademarks of and
© Warner Bros. Entertainment Inc. The *Babylon 5 Roleplaying Game, 2nd Edition* is
© 2006 Mongoose Publishing. Its rules mechanics are Open Game Content under the Open Game
Licence v1.0a, but the setting material — including alien species names, ship classes,
organisations and other setting elements — is designated **Product Identity** and is *not*
Open Game Content.

The system code is offered for use with a legally obtained copy of the rulebook. If you
represent a rights holder and want something removed, please open an issue.
