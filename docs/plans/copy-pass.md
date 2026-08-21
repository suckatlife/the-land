# Plan — a copy pass, and what "de-AI" should and shouldn't mean

**Status:** proposal, for review. No copy has been changed.
**Scope:** every word a visitor reads — the doorway, About, Privacy, Terms,
Support, the ending cards, and the in-world narration.

---

## 1. What I actually measured

I audited the project's copy against the evidenced tells rather than guessing.
Two scripts, both committed: `scripts/copy-audit.py` over the five HTML pages,
`scripts/copy-audit-src.py` over user-facing string literals in `src/`.

**The lexical tells are simply not here.** Across all five pages:

| | style-words | puffery | "not X, but Y" | trailing `-ing` significance |
| --- | --- | --- | --- | --- |
| about / privacy / terms / support / index | **0** | **0** | **0** | 1 |

Zero hits against **114 style words** — the high-value subset of the 407 that
Kobak et al. (*Science Advances*, 2025) classify as style rather than content.
The full 407 are at
https://github.com/berenslab/llm-excess-vocab and could be wired in; the 114 are
the ones with the largest measured frequency shifts, and the result was zero, so
widening the list would not change the conclusion. (Stated precisely because an
earlier draft of this document claimed the audit ran against all 407. It did
not.) No *delve*, *tapestry*, *testament*, *underscores*,
*seamless*, *robust*, *realm*. No "boasts a", no "stands as", no "is a
testament to". That is unusual and worth stating plainly: **the copy does not
have an AI vocabulary problem.**

**The tells that are here are rhythmic.** Sentence length is the measurement
with the cleanest evidence behind it — human prose scatters, LLM prose clusters
at 10–30 tokens ("register leveling", PMC11422446).

| surface | lines | mean | **SD** | in the 8–25w band |
| --- | --- | --- | --- | --- |
| all five pages | 65 | 14.4 | 6.3 | **83%** |
| `terms/index.html` | 18 | 14.2 | **4.9** | — |
| **`endings.ts` descriptions** | **7** | **15.0** | **1.2** | **100%** |
| narration reached via `pushNarration()` | 17 | 8.6 | **3.2** | — |
| all sentence-shaped literals in `main.ts` | 218 | 9.1 | **2.7** | — |

Two things stand out.

**The seven ending descriptions have a standard deviation of 1.2 words.** Every
one lands between 13 and 17 words:

| | drowned | long_winter | ash | rewilded | world_empire | exodus | garden |
| --- | --- | --- | --- | --- | --- | --- | --- |
| words | 16 | 15 | 13 | 15 | 15 | 17 | 14 |
| sentences | 2 | **1** | 2 | 2 | **1** | 2 | 2 |

They are *not* all two sentences — `long_winter` and `world_empire` are single
sentences. That correction sharpens the finding rather than weakening it: those
two reach the same 15-word length by a different construction, so the
uniformity lives in **length**, not in sentence count. This is the most uniform
prose in the project and it sits on the most important screen — the card a
viewer reads when a world they watched for fifteen minutes ends.

**The in-world prose is the healthiest text here.** Both populations agree in
shape: short, scattered, concrete, with 73 of 218 literals under eight words and
almost nothing above 25. They are reported separately and honestly because
neither is cleanly "the narration" — the 17 are those I can prove reach
`pushNarration()`, and the 218 are every sentence-shaped literal in the file,
which also sweeps in HUD and archive strings. An earlier draft of this document
reported a single figure of "127 narration lines, SD 2.8"; that number was a
filtered mix of the two and was mislabelled. The conclusion survives the
correction — both subsets scatter roughly twice as widely as the ending cards —
but the claim needed to match the measurement.

---

## 2. The seven lines I wrote today, audited

`ENDING_OMENS` went in this afternoon (#14). It fails its own test:

> The tide comes further inland than the oldest maps allow.
> The frost does not lift at noon any more.
> There is a taste of iron on the wind, **and** the birds have gone.
> The roads are quieter each year, **and** the grass is patient.
> One banner is answered everywhere, **and** no one remembers the others.
> The cities have begun to look upward, **and** to build for leaving.
> Nothing is being built that was not asked for.

Seven lines, mean 10.6 words, SD ~1.8 — and **four of the seven are the same
two-clause "…, and …" shape.** That is parallelism saturation: the device is
fine, using it four times in seven lines is a machine. Gorrie's formulation is
the one to hold onto — *"what the LLM lacks is not technical ability, but
taste"* — and it applies to me.

---

## 3. What NOT to do, which matters more than what to do

The research on this is unambiguous and mostly points at restraint:

- **Leave the em dashes alone.** The em-dash tell is a fine-tuning artifact of
  particular model families at particular moments, already fading — OpenAI
  announced a fix in Nov 2025, Gemini's rate is human-indistinguishable, Llama's
  is zero. Em dashes are continuous in English prose since the 1800s. The
  spaced-vs-unspaced claim is **folklore with no measurement behind it**; it
  tracks Chicago vs AP house style.
- **Leave curly quotes and the Oxford comma alone.** Both track house style, not
  authorship. The Oxford comma claim has no corpus evidence at all.
- **Do not thin the adjectives.** Humans measurably use *more* adjectives (7.58%
  vs 6.69–6.86%) and score ~1.7× on lexical diversity. "Cut the adjectives"
  pushes prose *toward* the AI profile.
- **Do not flatten the voice.** Detectors flag simple vocabulary, predictable
  structure and low idiomaticity — which are also the properties of deliberately
  spare prose, and of second-language writing (61% false-positive rate on
  non-native English, Liang et al.). **This project's voice is spare by design.**
  Every heuristic here will over-fire on it.

The failure mode of this whole genre is subtractive editing. The documented
result is writers dropping em dashes, avoiding "moreover", and British writers
second-guessing "whilst". We should not join them.

**So: no word-blacklist, no find-and-replace. The proposal below is almost
entirely about rhythm and specificity.**

---

## 4. Proposed changes, by surface

### 4a. The doorway — highest value, first thing anyone reads

Current:

> **a world in motion**
> Kaldrass · seed 8f2a1c
> # The Land
> Watch civilizations settle, spread, trade, fight, and sometimes disappear.
> Each world runs for 10–17 minutes and can end in a different way. Leave it on
> a second screen, or hover over the map to see what's happening.
> `[ start watching ]`

Three problems, in order of severity:

1. **"settle, spread, trade, fight, and sometimes disappear"** — a five-verb
   enumeration, the inflated cousin of the rule of three. It lists categories
   instead of showing one thing.
2. **"can end in a different way"** is the vaguest sentence on the screen, and
   it is describing the feature this project just spent a day building.
3. **"a world in motion"** could be above anything.

Three options, because this is a taste call:

**Option A — concrete, keeps the shape.**
> **ten minutes, or a few thousand years**
> Kaldrass · seed 8f2a1c
> # The Land
> Civilizations settle, spread, and fall. None of them are you.
> A world lasts 10–17 minutes and dies in its own way — under ice, under water,
> or of nothing but time. Leave it on a second screen. Hover to see what a place
> is called.
> `[ start watching ]`

**Option B — shortest, most restraint.**
> Kaldrass · seed 8f2a1c
> # The Land
> A world that carries on without you.
> Ten to seventeen minutes is a whole history here. Then it ends, and another
> one starts.
> `[ start watching ]`

*(the first line is lifted from the About page, where it is already the best
sentence in the project)*

**Option C — leaves the informational job intact, fixes only the rhythm.**
> **a world in motion**
> Kaldrass · seed 8f2a1c
> # The Land
> Civilizations settle, spread, and disappear.
> Each world runs 10–17 minutes. It can end under ice, under water, or simply by
> running out of people. Leave it on a second screen, or hover over the map to
> see what's happening.
> `[ start watching ]`

I'd argue for **B**. It is the only one that trusts the thing on screen to do
the explaining, and the doorway is in front of a *moving world* — the copy is
competing with it.

### 4b. The ending cards — the SD 1.2 problem

The seven descriptions all land in a five-word band. The fix is not to rewrite
them into a new uniform shape; it is to **let their lengths diverge** so they do
not read as a set. Note that varying *sentence count* alone will not do it —
`long_winter` and `world_empire` already differ there and still land at 15
words.

Illustrative, on two of them:

> **The Green Silence** — *the land outlived its makers*
> ~~Roots opened the roads. Forest and grass crossed the old borders without
> learning their names.~~
> **Roots opened the roads. Nothing came to fix them.**

> **The Garden World** — *an age learned how to remain*
> ~~Cities grew quieter instead of larger. The old wilderness returned, this
> time by invitation.~~
> **Cities stopped growing. That turned out to be the hard part.**

The second of each pair is shorter, blunter, and has a point of view. Applied
across all seven, the target is an SD nearer 4 than 1.2 — some one-sentence,
some three.

### 4c. The omen lines — break the shape, not the words

Four of seven share "…, and …". Rewriting three of them to different shapes:

> There is a taste of iron on the wind. The birds left a week ago.
> The roads are quieter every year. The grass is patient.
> One banner is answered everywhere now. No one remembers the others.

Same words, mostly. Splitting the comma-and into two sentences breaks the
parallelism *and* drops the mean sentence length, which helps the SD.

### 4d. About — one change

The page is good. "A world that carries on without you" is the best sentence in
the project. One line is doing the AI thing:

> ~~The Land is a living deep-time diorama for a second screen, an idle display,
> or a few minutes of close observation.~~

That is a tricolon of near-synonyms — three ways of saying "you can look at this
for varying lengths of time" — and "living deep-time diorama" stacks three
modifiers on one noun. Proposed:

> **The Land is a deep-time diorama. Leave it running, or watch it closely; it
> does not behave differently either way.**

### 4e. Privacy and Terms — leave almost entirely alone

Terms has the flattest rhythm in the project (SD 4.9), and **that is correct.**
Legal copy should be uniform and boring; varying the sentence rhythm of a
privacy policy to look less like an AI wrote it would be a genuinely bad trade
against clarity. The Privacy page is specific, honest, and unusually readable
for what it is.

**One exception**, in Privacy:

> ~~The Land does not use accounts, advertising trackers, or cookies. It uses
> limited, anonymous analytics to understand whether the experience is useful.~~

"whether the experience is useful" is corporate-neutral in the way the research
calls out — vagueness where a specific reason belongs. Proposed:

> **The Land has no accounts, no ad trackers, and no cookies. It counts visits
> and a handful of button presses, so I can tell whether anyone is actually
> watching.**

First person, one concrete admission. This is also the only place on the site
where a person is visibly present.

---

## 5. What I am deliberately not proposing

- No changes to the in-world narration. It already has the best measured rhythm
  in the project — SD 3.2 on the lines provably reaching `pushNarration()`, 2.7
  across all 218 sentence-shaped literals, against 1.2 for the ending cards.
  Touching it is the highest-risk, lowest-value edit available.
- No word blacklist and no automated find-and-replace anywhere.
- No punctuation changes at all.
- No changes to Terms.

---

## 6. Sources

- Kobak, González-Márquez, Horvát & Lause, *"Delving into LLM-assisted writing
  in biomedical publications through excess vocabulary"*, **Science Advances**
  11(27), 2025 — https://www.science.org/doi/10.1126/sciadv.adt3813 · word list:
  https://github.com/berenslab/llm-excess-vocab
- *"Contrasting Linguistic Patterns in Human and LLM-Generated News Text"* —
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11422446/ (sentence-length clustering,
  lexical diversity, adjective and emotion rates)
- Wikipedia, *Signs of AI writing* —
  https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing (era-stratified
  marker list; puffery and manufactured-significance taxonomies)
- Oremus, *"The Most Famous AI Writing Tic Is Also the Most Mysterious"*, **The
  Atlantic**, 2026 —
  https://www.theatlantic.com/technology/2026/07/ai-chatbot-writing-tic-negative-parallelism/687892/
  (negative parallelism ~3× human rate; note this figure has a single origin)
- Gorrie, *"Why ChatGPT writes like that"* —
  https://www.deadlanguagesociety.com/p/rhetorical-analysis-ai (parallelism,
  antithesis, tricolon; "not technical ability, but taste")
- Liang et al., *GPT detectors are biased against non-native English writers* —
  https://arxiv.org/pdf/2304.02819 (61% false-positive rate)
- Yakura et al., *LLM influence on human spoken communication* —
  https://arxiv.org/abs/2409.01754 (lexical seepage into unscripted speech)
- OpenAI withdrawing its own detector (26% recall, 9% false positive) —
  https://techcrunch.com/2023/07/25/openai-scuttles-ai-written-text-detector-over-low-rate-of-accuracy/

---

## 7. Open questions for review

1. Doorway: A, B, or C? I argue for B, but B removes the "hover over the map"
   hint entirely — is that discoverability worth losing?
2. Is "None of them are you" / "That turned out to be the hard part" the right
   register for this project, or is a dry joke wrong against the painterly
   brief?
3. The Privacy rewrite introduces **first person** ("so I can tell whether
   anyone is actually watching"). The rest of the site is impersonal. Is one
   first-person sentence a welcome signature or an inconsistency?
4. Ending cards: is deliberately varying their length worth the loss of the
   set's visual consistency? They appear in the same slot every time.
5. Should the SD measurement become a check that runs, or is a one-off audit
   enough? A script that fails when a surface drops below ~SD 3 is cheap, but it
   is also exactly the kind of metric that gets gamed.
