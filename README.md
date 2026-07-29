# Babylon 5 2nd Edition — unofficial Foundry VTT system

A game system for [Foundry Virtual Tabletop](https://foundryvtt.com/) implementing the
**Babylon 5 Roleplaying Game, 2nd Edition** (Mongoose Publishing, 2006) — a d20 System
derivative. Sheets, compendia and rolls are available in **English and Polish**.

> **Status: playable, 0.2.0.** Every subsystem the rulebook names is implemented and has been
> exercised against the book's own worked examples — see [What works](#what-works). What is thin
> is table mileage, not coverage.

## Requirements

Foundry VTT **v13 or newer**. The system uses ApplicationV2 sheets and `TypeDataModel`
schemas throughout, with no v12 compatibility layer.

## Installation

In Foundry's **Game Systems** tab, choose *Install System*, paste the manifest URL and install:

```
https://github.com/ryczypior/babylon5-for-foundry-vtt/releases/latest/download/system.json
```

Or install by hand — the repository root *is* the system directory, and the compiled stylesheet
is committed, so there is no build step:

```bash
cd ~/.local/share/FoundryVTT/Data/systems      # or your Foundry data directory
git clone https://github.com/ryczypior/babylon5-for-foundry-vtt.git babylon5
```

The directory **must** be named `babylon5`. The system installs with **no compendium content** —
see [Compendium content](#compendium-content).

## What works

| Area | |
|---|---|
| **Actors** | `character`, `npc` and `craft` (spacecraft, aircraft and surface vehicles share one stat block) |
| **Items** | 13 types: class, race, skill, feat, influence, telepathic ability, weapon, armour, ammunition, gear, weapon accessory, craft weapon, craft feature |
| **Compendia** | 14 packs from 7 bilingual sources, **not distributed** — see [Compendium content](#compendium-content) |
| **Character** | racial modifiers, class skills, feat effects and prerequisites, the skill-point budget and rank caps, and both prestige classes |
| **Personal combat** | weapon attacks off the right attack line, iteratives, bursts, criticals with their printed threat ranges, damage through the `damage − max(0, DR − AP)` pipeline |
| **Telepathy** | P-Rating and reach, mental effort in nonlethal damage, the Telepathy check with its whole modifier stack, the Will save DC with a resistance button, maintained abilities and the traits |
| **Influence** | checks on 2d6, per-faction resource tables, burning worked out to the point, the black market and the trade bonus, aiding another, and pressure chains across factions |
| **Space combat** | crew stations, the 47 orders, weapon fire (Total Offence → interception → shielding → Armour), the 2d6 damage cascade with impairment checks, and *Fire Interceptors!* feeding the barrage |
| **Rolls** | everything above, plus a shift-click modifier prompt that pre-applies the conditions a character is already carrying |

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
- **Influence checks roll 2d6**, not d20, against a per-faction score that never refreshes. The
  only way to spend it is to *burn* it: permanently give up points to rescue a failed check.
- **Telepathy has no fatigue track.** Reaching above your P-Rating costs nonlethal damage on the
  ordinary hit-point track.
- **Craft are measured on the superscale size table** (a Huge spacecraft is −4, not −2), and
  space combat runs on orders and structural spaces rather than an attack sequence and hit points.
- Class tables run to **10th level**; beyond that characters multiclass or take a prestige class.

## Compendium content

**No compendium content ships with the system.** Classes, races, feats, equipment, telepathic
abilities, Influences and craft are all read from compendium packs, and the code that builds and
loads them is here — the packs themselves are not part of this repository, and neither is the
rules digest they were built from.

The system manifest therefore declares **no packs at all**, rather than declaring packs it does
not ship and leaving you with a row of empty compendia. Content is loaded as a separate module,
which you can build yourself:

1. put documents in `packs/_source/*.json` in the shape the build script expects;
2. `npm run pack` — builds one English and one Polish pack per source;
3. `npm run content` — writes a local `babylon5-content` module into your Foundry data directory
   that declares those packs and links them, then enable it in the world's module settings.

Everything else — sheets, derived values, rolls, prerequisites, the order system — works normally
with no content installed. Items and actors can be created by hand on any sheet.

## What is deliberately left to the table

Some things the engine could compute but should not, because the book leaves them open or
because guessing would be wrong more often than right:

- **Situational bonuses stay in the text.** Only unconditional modifiers are applied
  automatically — the Abbai's +8 Athletics *when swimming* and the Narn's +1 to hit *Centauri*
  are described, not silently added.
- **Advisory, never blocking:** a feat whose prerequisites do not hold is warned about and kept;
  so is an out-of-scope Influence pressure, a weapon fired across two arcs, and a character who
  is not proficient with what he is holding.
- **A failed Telepathy check is not a failed ability** — the book is explicit that it often
  still works — so the card reports the check and stops.
- Space combat leaves what a weapons lock is worth, how a ram plays out, and how an escort's
  percentage chance resolves to the GM. Full rapid fire is a targeting problem, not a roll.

## Development

```bash
npm install
npm run build     # compile SCSS → styles/babylon5.css (commit the result)
npm run watch     # SCSS watcher
npm run pack      # rebuild the compendium packs from packs/_source/*.json
npm run content   # write the local babylon5-content module that declares those packs
npm run link      # symlink this repo into your Foundry data directory
```

`npm run link` reads the path from `foundryconfig.json` (`{ "path": "…/FoundryVTT/Data" }`);
copy `foundryconfig-example.json` and edit it.

JavaScript and templates need no build — reload Foundry to pick them up. **Shut Foundry down
before `npm run pack`**: it holds the LevelDB packs open.

### Layout

```
module/          entry point, config, data models, documents, sheets
module/system/   rules tables and pure functions, one file per subsystem
module/tests/    the resolution engines that roll them ("tests" in the RPG sense)
templates/       Handlebars templates for actors, items and chat cards
styles/          SCSS source and the compiled stylesheet
lang/            English and Polish translations (~965 keys each)
docs/design/     data-model and layout decisions
packs/           compendium sources and built packs — local only, not published
docs/rules/      the rulebook distilled into implementation notes — local only
```

Compendium sources carry both languages side by side (`name`/`namePl`,
`description`/`descriptionPl`), and `npm run pack` emits one English and one Polish pack from
each — Foundry has no built-in translation for pack contents. Those sources are not part of
this repository; see [Compendium content](#compendium-content). `npm run content` then makes the
built packs loadable, by writing a module that declares them — the system manifest does not.

Two things will bite you if you build your own packs:

- **`_id` must be exactly 16 alphanumeric characters.** Foundry drops a document whose id is
  anything else, silently — the pack still opens and reports the right count.
- **An Actor pack needs both halves of the embedded-document format.** The parent record lists
  its items as an array of **ids**, *and* each item is written again under its own key,
  `!actors.items!<actorId>.<itemId>`. Do only one and every craft arrives with no weapons.

## Contributing

Issues and pull requests are welcome. Rules questions are best raised as issues — the
detailed rules digest is kept out of this repository for the reasons given above, so please
cite the corebook page rather than quoting it.

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
