# Data model & sheet layout — agreed design

**Status: decided 2026-07-27.** Scheme B layout, hybrid skills, character + craft in v1 (see §6).

Target: Foundry VTT **v13+**, ApplicationV2 sheets, `TypeDataModel` schemas (no `template.json`).
Naming: system id `babylon5`, CSS namespace `.b5`, class prefix `B5*`.

---

## 1. Actor types

| Type | Purpose | Notes |
|---|---|---|
| `character` | Player character | Full sheet: abilities → skills → feats → influence → telepathy → combat → gear |
| `npc` | Named NPC / opponent | Same schema as `character`, sheet trimmed to a stat-block + notes; keeps full skill/feat support so NPCs can be built normally |
| `craft` | Spacecraft, aircraft or surface vehicle | One type with a `craftType` enum — all three share the *same* stat block (Size/Type, DV, Armour, Handling, Sensors, Stealth, Stress, Features, Crew, structural spaces, weapons per arc); surface vehicles differ only in `Stress: –` → Swerve table and a different order list |

Deliberately **not** separate types: aircraft and surface vehicles (they are the same stat block); stations (a station is a very large `craft`).

---

## 2. Item types

| Type | Role | Key fields |
|---|---|---|
| `class` | One entry per class the character has levels in | `classKey`, `levels`, `babTrack`/`saveTracks`/`defenceTrack` (good/average/poor), `initialHp`, `additionalHp`, `skillPoints`, `classSkills[]`, `initialInfluence`, `additionalInfluence`, `features[]`, `choices{}` (e.g. Officer branch, Worker variant) |
| `race` | Exactly one per actor | ability modifiers, size, speed, favoured class, `traits[]`, granted feats/class skills, languages, `canBeTelepath` |
| `skill` | **Only subtyped skills** — Knowledge (x), Operations (x), Profession (x), Technical (x) | `skillKey`, `subtype`, `ranks`, `isClassSkill`, `misc` |
| `feat` | All 91 feats | `category` (general/telepathy/racial), `race`, structured `prerequisites{abilities,skills,bab,feats,level,pRating,other}`, `repeatable{allowed,stacks}`, `requiresChoice`+`choice{type,value}`, `usage{activation,perDay}` |
| `influence` | One per faction score | `faction`, `base`, `burned`, `misc`, `usesThisWeek`, `pressures[]`, `notes` |
| `telepathicAbility` | The 16 activated abilities + variations | `discipline`, `power`, `action`, `range`, `duration`, `concentration`, `saveType`, `variations[]` |
| `weapon` | Personal weapons | `damage`, `critical`, `rangeIncrement`, `damageType`, `ammoCapacity`, `rateOfFire`, `ap`, `features[]`, `size`, `weight`, `cost`, `legality` |
| `armour` | Outfits & armour | `dr`, `speedReduction`, `acp`, `weight`, `cost`, `legality`, `worn` |
| `ammunition` | Clips, power caps, grenades-as-ammo | `ammoId`, `quantity`, `capacity`, `legality` |
| `gear` | Everything else | `subtype` (communication/computer/medical/tool/survival/security/accessory/implant), `skillBonuses[]`, `weight`, `cost` |
| `weaponAccessory` | Scope, silencer, tripod | `mountsOn[]`, `effect` |
| `craftWeapon` | Ship/vehicle weapon mounted in an arc | `arc`, `range`, `offence`, `qualities[]`, `weaponSpaces` |
| `craftFeature` | Named craft feature (Adaptive Armour, Interceptors…) | `effect`, `absorbsDamage` |

**Why skills are a hybrid** (fixed fields for 19 plain skills + Items for the 4 subtyped ones): the plain skills are a closed, known list that every character has — putting them in the DataModel gives them defaults, validation and cheap templating. Knowledge/Operations/Profession/Technical are open-ended (a character may hold six different Knowledges), which is exactly what embedded Items are for. This is decision **D1** below — the alternative is "everything is an Item", as in EDRPG.

---

## 3. Character DataModel sketch

```js
system = {
  // ── identity ────────────────────────────────────────────────
  details: {
    player: "", race: "", minbariCaste: "",       // religious | warrior | worker
    homeworld: "", affiliation: "", age: "", gender: "",
    description: "", biography: "", notes: ""
  },

  // ── advancement ─────────────────────────────────────────────
  progression: {
    xp: { value: 0, next: 1000 },
    level: 1,                                     // derived: Σ class levels
    featsGranted: 1, featsSpent: 0,               // feats at levels 1,3,6,9,12,15,18
    abilityIncreasesGranted: 0,                   // at 4,8,12,16,20
    skillPoints: { total: 0, spent: 0 },
    multiclassBalanced: true, xpPenalty: 0        // −20% when class levels differ by >1
  },

  // ── abilities ───────────────────────────────────────────────
  abilities: {
    str: { base:10, racial:0, levelIncrease:0, misc:0, damage:0, drain:0,
           value: 10, mod: 0,                     // derived: floor((value−10)/2)
           temp: { value: null, mod: null } },    // the sheet's Temp Score / Temp Modifier columns
    dex: {…}, con: {…}, int: {…}, wis: {…}, cha: {…}
  },

  // ── derived combat block ────────────────────────────────────
  attributes: {
    size: "medium", sizeMod: 0,
    speed: { base: 30, armourReduction: 0, value: 30 },
    hp:   { value: 8, max: 8, temp: 0, nonlethal: 0 },
    massiveDamageThreshold: 0,                    // = Con score
    bab: { value: 0, iteratives: [0] },
    dv:  { classBonus:0, dexBonus:0, sizeMod:0, dodge:0, misc:0,
           total:10, flatFooted:10 },             // NO armour bonus — armour is DR
    dr:  { natural: 0, armour: 0, total: 0 },
    acp: 0,
    initiative: { dexMod: 0, misc: 0, total: 0 }, // initiative IS a Dex check
    conditions: {}                                // flat flags: prone, stunned, dazed, …
  },

  saves: {
    fort: { classBonus:0, abilityMod:0, misc:0, total:0 },
    ref:  {…}, will: {…}
  },

  // four attack lines + feint, exactly as on the printed sheet
  attacks: {
    closeCombat:    { bab:0, abilityMod:0, misc:0, total:0 },  // Str
    personalRanged: { bab:0, abilityMod:0, misc:0, total:0 },  // Dex
    spaceGunnery:   { bab:0, abilityMod:0, misc:0, total:0 },  // Int
    spaceSoloCraft: { bab:0, abilityMod:0, misc:0, total:0 },  // Dex
    feint:          { bab:0, abilityMod:0, misc:0, total:0 },  // Dex
    resistFeint:    { bab:0, abilityMod:0, misc:0, total:0 }   // Wis
  },

  ordersPerTurn: { personal: null, surfaceVehicle: 1, space: 1, soloCraft: 1 },

  // ── skills (19 plain; the 4 subtyped ones are Items) ────────
  skills: {
    acrobatics: { ranks:0, isClassSkill:false, misc:0, keyAbility:"dex",
                  trainedOnly:false, acp:true, total:0 },
    appraise: {…}, athletics: {…}, bluff: {…}, computerUse: {…},
    concentration: {…}, diplomacy: {…}, drive: {…}, intimidate: {…},
    intrigue: {…}, investigate: {…}, linguistics: {…}, medical: {…},
    notice: {…}, pilot: {…}, senseMotive: {…}, stealth: {…},
    subterfuge: {…}, telepathy: {…}
  },
  languages: { fluent: [], known: [] },           // Fluency: +2 Knowledge (that culture)

  // ── B5-specific subsystems ──────────────────────────────────
  influence: {                                    // scores themselves are Items
    diplomacyBonus: 0, intimidateBonus: 0          // derived: highest? Σ? → see open question O3
  },
  telepathy: {
    pRating:   { base:0, bonus:0, value:0 },      // fixed for life
    isTelepath: false, canBeTelepath: true,       // Narn: false
    disciplineFocus: [], abilityFocus: [],
    mindShield: { active:false, willBonus:0, checkPenalty:0 },
    saveDC: 0,                                    // 5 + P + telepath level + Cha mod
    maintaining: []
  },

  // ── possessions ─────────────────────────────────────────────
  wealth: { credits: 0, lifestyle: "", debt: 0 },
  encumbrance: { load: 0, max: 0, penalty: 0 },

  // ── crew station on a craft ─────────────────────────────────
  shipboard: { craft: null, role: "", spacecraftProficiency: false }
}
```

**Derivation order in `prepareDerivedData()`:** ability values → mods → class tracks (BAB / saves / Defence) → size & speed → HP max → skill totals (ranks + ability + misc + synergy + ACP) → DV → DR → attack lines → save totals → telepathy save DC → encumbrance.

---

## 4. Sheet layout — two candidate schemes

### Scheme A — "faithful to the printed sheet" (4 tabs, mirrors book pp. 354–357)

```
┌─ header: name · player · race · class(es)/level · XP ───────────────┐
│ HP  ██████░░  8/12   nonlethal 3   DV 15 (FF 13)   DR 4   Init +3   │
├─ Main ─┬─ Skills ─┬─ Feats & Influence ─┬─ Gear ─┬─ Telepathy ─┬────┤
│ MAIN:  abilities grid (Score/Mod/Temp/Temp Mod) │ saving throws     │
│        defence values (DV, DV flat-footed)      │ attack bonuses ×4 │
│        feinting · initiative · orders per turn                      │
│        racial features · class features · speed                     │
└─────────────────────────────────────────────────────────────────────┘
```
Tabs: **Main** · **Skills** · **Feats & Influence** · **Gear** · **Telepathy** (hidden when P-Rating 0) · **Bio**.
Pro: zero cognitive translation for a player holding the book. Con: the Main tab is dense; Influence and Feats sharing a tab is a printed-page compromise, not a UX one.

### Scheme B — "play-oriented" (6 tabs, grouped by what you do at the table)

```
┌─ header: portrait · name · race/class/level · XP bar ───────────────┐
│ HP 8/12 (NL 3) │ DV 15 / FF 13 │ DR 4 │ Init +3 │ Speed 30 │ Orders │
├─ Summary ─┬─ Combat ─┬─ Skills ─┬─ Feats ─┬─ Influence ─┬─ Gear ────┤
│ Summary : abilities, saves, racial + class features, advancement    │
│ Combat  : 4 attack lines, feint, weapons w/ roll buttons, DR &      │
│           armour, conditions toggles, orders-per-turn               │
│ Skills  : 19 fixed rows + subtyped skill rows, roll buttons,        │
│           class-skill checkbox, synergy indicator                   │
│ Feats   : granted/spent counter, prerequisite validation badges     │
│ Influence: per-faction rows with 2d6 roll button, burn control,     │
│           "attempts this week" counter, pressure chain notes        │
│ Gear    : weapons/armour/ammo/gear, credits, encumbrance meter      │
└─────────────────────────────────────────────────────────────────────┘
```
Telepathy appears as a **7th tab only when the character has a P-Rating** (P-Rating, mind shield toggle, abilities with cost preview and mental-effort damage).
Pro: each tab answers one table question; Influence gets the room its subsystem needs. Con: departs from the printed layout.

**DECIDED: Scheme B**, with the Summary tab arranged in the printed sheet's visual order so the book is still a usable reference.

---

## 5. Automation candidates (ranked)

1. Skill check `1d20 + ranks + ability + misc + synergy − ACP` with a situational-modifier dialog.
2. Attack roll → crit confirm → damage → `− max(0, DR − AP)` → hp / nonlethal → massive-damage Fort save.
3. Influence check `score + 2d6` with the repeat-attempt penalty tracked automatically, plus a *burn* button.
4. Telepathic ability: Will save DC computed, mental-effort `Nd4` nonlethal auto-applied when Power > P-Rating.
5. Saves, initiative (Dex check), feint / resist feint.
6. Derived-value recomputation on class/race/feat/armour change.
7. Craft: Sensors-vs-Stealth initiative, order resolution with per-order DC, `Total Offence` barrage, 2d6 damage location.

---

## 6. Decisions taken (D) and open questions (O)

- **D1 — skills: hybrid.** 19 plain skills are fixed fields in the DataModel; Knowledge (x) / Operations (x) / Profession (x) / Technical (x) are embedded Items. ✅ decided
- **D2 — classes and race are Items**, dragged from a compendium; the three shared progression tracks live in a config object (`B5.progressionTracks`), the class Item only names which track it uses. ✅ decided
- **D3 — sheet layout: Scheme B** (6 tabs + conditional Telepathy). ✅ decided
- **D4 — scope of v1: character + npc + craft.** All three Actor types and the full item roster from the start, so the data model is designed as a whole. Automation lands in the order given in §5; craft order resolution is the last slice. ✅ decided
- **O1 —** `Appraise` key ability conflicts between the class tables (Int) and the skill header (Wis); the printed sheet says Int. Proposal: Int, configurable.
- **O2 —** the book has no cross-scale damage conversion (personal ↔ craft). Leave to the GM.
- **O3 —** Diplomacy/Intimidate get `Influence ÷ 5` — the book does not say whether that is the highest single score or a relevant one. Proposal: highest applicable, chosen in the roll dialog.
- **O4 —** several source inconsistencies were logged in `docs/rules/02-classes.md` and `04-feats.md` (Agent HP 6 vs 8, level mismatches for four class features, two Worker credit misprints). They need a house-rule call before the compendium is built.
