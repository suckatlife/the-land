# Plan — named lives

**Status:** proposal, for review. Nothing here is built.
**Scope:** occasionally, the world names one person and follows them. No new
interaction, no new render layer.

---

## 1. Why this, and why now

WorldBox's most-loved feature is not its god powers — it is that you can find
one unit and discover it has a name, a history and a body count. That part
transfers completely to something you only watch.

**The Land names civilisations and cities. It has never named a person.**
Verified: `names.ts` generates from era syllable pools, and every call site is a
civ (`sim.ts:912`), a city (`:939`), or a colony (`:1190`). The June
"people doing things" brainstorm shipped roads, boats, wonders, visible conflict,
births-as-arcs and ghost echoes — **all activity, no identity.** A viewer can
watch a whole world without ever being told about anybody.

Two civilisations are also currently distinguishable only by colour, so the map
gives identity no other way.

## 2. Does a person contradict the thesis?

`CLAUDE.md`: *"The land is the protagonist; civilizations are weather."* A named
person looks like a step toward the foreground, and this is the objection to
answer before anything else.

**The argument that it sharpens rather than dilutes:** a civilisation lasts
minutes; a person lasts seconds. Putting one life against deep time makes the
scale *worse* in exactly the way the project wants — the same reason ruins work.
The failure mode is not having a person, it is having a **protagonist**: someone
who recurs, who the world is about, whose fortunes the viewer starts tracking.

**So the rule this plan proposes: a life appears, resolves, and is never
mentioned again.** No recurring characters. No one the viewer can follow. The
person is a lens on the era, not a thread through it.

## 3. Where does a life live?

The load-bearing decision, because it determines whether two people opening the
same seed see the same person.

**Option A — in the sim (`sim.ts` / `names.ts`), seeded.** People are part of
world history. The same seed produces the same lives, so a shared link shows
your friend the same person, and an archived world can name someone in its
epitaph.
*Cost:* the sim gains a concept it does not have. It stays Pixi-free — this is
text and integers — but it is real new surface.

**Option B — in the renderer (`main.ts`), unseeded.** No sim change, cheaper.
*Cost:* two viewings of one seed show different people, which breaks the
determinism Turn 08 established and the share button depends on. A world would
be reproducible in every respect except the only part that is about a person.

**Recommend A.** The seed reproducing the same life is the thing that makes a
shared world worth sharing, and it is what would let a life appear on an ending
card or in a shareable artifact later.

## 4. The shape of a life

Three options, increasing in cost and in payoff.

**A. One line, at death.** A person is generated, aged and killed in a single
narration line: *"Aelric of Duncaer died at seventy, having never seen the sea."*
*For:* trivial, no state, no budget risk. *Against:* no arc — it is a fortune
cookie with a name.

**B. Three beats — born, marked, died.** A life is created, surfaces once in the
middle when something happens near it, and resolves at death. Roughly:

> *Aelric is born at Duncaer, in the year the ice reaches the valley.*
> *Aelric's road reaches the coast. It will outlast the town that built it.*
> *Aelric dies at seventy, having never seen the sea.*

*For:* an actual arc, and the middle beat can attach to something the viewer
**just watched happen** — which is what makes it land rather than decorate.
*Against:* three narration slots per life, and the middle beat needs an event to
hang on.

**C. A full thread.** Many beats, family, succession.
*Against:* this is a protagonist, which §2 rules out.

**Recommend B**, with the middle beat **optional** — if nothing happens near
that person, they simply live and die in two lines. A life that was uneventful
is truer to the register than one that manufactures a moment.

## 5. Whose life?

Not random citizens — a random person in a random place has nothing to attach
to. Draw from lives the world already made interesting:

| anchor | the line writes itself |
| --- | --- |
| born the year a civ is founded | the first generation |
| lived where a wonder was built | *"…who saw the tower raised, and did not live to see it fall"* |
| in a city when a catastrophe hits | survival or not, decided by an event that already fired |
| the last of a dying civ | the strongest of all, and the sim already knows when a civ dies |
| born the year the ice came | ice extent is already tracked |

Each of these is an event the sim already emits. **A life should be attached to
an existing event, not generated alongside one.**

## 6. Frequency, and the budget it competes for

This is the biggest practical risk, and the numbers are tight:

| | |
| --- | --- |
| `LOG_MAX` | 16 lines |
| `LOG_LIFETIME_MS` | 9,500 |
| `NARRATION_GAP_MS.low` | 6,000 |
| a world | 10–17 minutes |

Every person line competes with wars, catastrophes, wonders, migrations and the
chronicle for the same log. **Proposed: one life per ~3 minutes of world time,
so 3–5 lives per world, 6–12 lines total.** Low priority, so anything real
outranks a person — which is also thematically correct.

**And a hard rule: never during act 4.** The ending sequence's silence took
eleven systems to enforce; a person must not be the twelfth thing that breaks it.

## 7. Names

Person names need their own pools. The existing suffixes are settlement-shaped —
`-mark`, `-hold`, `-burg`, `-shire`, `-works`, `-opolis` — and would read as
places. The parts pools are reusable; the suffixes are not.

**Proposed form: `<given> of <place>`** — *Aelric of Duncaer*. The place comes
free from the city the person was born in, it ties the person to somewhere on
the map, and it degrades well: when the city becomes a ruin, the name is already
a memorial.

## 8. What a life is, concretely

```ts
interface Life {
  name: string;
  bornTick: number;
  civId: number;
  row: number; col: number;   // for narration anchoring
  markedBy: SimEvent['kind'] | null;   // the middle beat, if one happened
}
```

Five fields and a tick counter. Anchoring matters: `pushNarration` already
accepts an `anchor`, so a person's line can point at the place they lived.

## 9. Verification

1. **Determinism** — same seed twice produces the same names, the same birth
   ticks and the same deaths. This is the Turn 08 test with a new column.
2. **Budget** — across a full world, count person lines and assert 6–12, and
   assert none is `high` priority.
3. **Silence** — no person line between the act-4 boundary and the turnover.
4. **No recurrence** — assert no name appears in two separate lives.

What cannot be verified: whether any of it is *moving*, which is the only thing
that matters and needs a person reading it on the preview.

## 10. Phasing

- **Phase 1** — the name generator, and one line at death (§4 option A). Ships
  the vocabulary and proves the register before any state exists.
- **Phase 2** — the three-beat life with the optional middle beat, anchored to
  existing events (§5).
- **Phase 3** — a life on the ending card, which is where this meets the
  artifact idea in `docs/plans/shipping.md`.

## 11. What this does not do

No recurring characters. No family trees or dynasties — that is a protagonist by
another name. No portraits, no UI, no interaction, nothing inside the frame but
an anchored line of text. No changes to how civilisations behave: a person is an
observer of the sim, never an input to it.

## 12. Open questions

1. §2 claims a person sharpens the deep-time thesis rather than diluting it. Is
   that right, or is it a rationalisation for putting a character in a project
   that is deliberately about their absence?
2. Is one life per three minutes too many? The instinct that it is a rare,
   surprising thing argues for one or two a world.
3. `<given> of <place>` ties people to cities. Should a person ever be named
   after the land instead — *of the Long Valley* — for the pre-urban eras?
4. Should a life be able to end a world's narration? *"The last person in the
   world was …"* is either the best line the project could produce or far too
   much.
5. Phase 1 ships death-only lines. Is a name with no arc worth shipping alone,
   or does that teach the viewer to ignore them before phase 2 arrives?
