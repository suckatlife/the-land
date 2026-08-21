# The Land — multi-agent workflow

Claude builds. Codex reviews adversarially. Lawrence merges. Nothing reaches the
public site without a human looking at it.

This file is the contract. Both agents should read it before starting work;
`AGENTS.md` and `CLAUDE.md` point here.

---

## The three roles

| Role | Who | Can | Cannot |
| --- | --- | --- | --- |
| **Builder** | Claude Code (cloud, from the Claude app) | Branch, commit, push, open a PR | Merge, touch `main`, deploy |
| **Reviewer** | Codex (ChatGPT app, or `@codex review` on the PR) | Read the diff, run checks, report findings | Merge, deploy; edit anything on the first pass |
| **Gate** | Lawrence | Merge, deploy, overrule either agent | — |

## Why the review is adversarial

Not politeness — the reviewer's job is to find the thing the builder is **wrong
about**. This project has a specific track record that justifies it:

- A sim-clock fix moved history onto wall-clock time but left the sky, weather
  and every story surface on the old clock. Caught a turn later, by measurement.
- The follow-up fix corrected the frame-rate half of that split and missed the
  identical bug on the speed control, **three lines away**.
- An agent asserted no visual verification was possible from a phone. Wrong:
  Vercel builds a preview per branch.
- An agent introduced a regression that tinted every settled tile brown, and
  described it in a commit message as a feature.
- An agent replaced two terrain functions with "one continuous function", which
  silently deleted every landmass outside the play area for island worlds, and
  reported it as an improvement with a passing measurement to back it up.

Every one of those passed its own build gate and its author's own review. The
common failure is not bad code — it is **an agent believing its own summary**.
So the reviewer's first question is always: *does the diff do what the
description claims, and is the evidence real?*

## The loop

1. **Brief.** Lawrence opens Claude → Code, picks the repo, states one task.
   Prompts live in the repo, so the brief can be one line:
   > Next turn per REMOTE.md. Sim/balance work. Branch `claude/<topic>`, draft PR.
2. **Build.** Claude works on a `claude/*` branch, one change, and opens a
   **draft** PR. Vercel builds a preview automatically.
3. **Review.** Lawrence taps **Ready for review** on the PR. That is the baton:
   draft means "Claude is still working", ready means "Codex, your turn".
   With **Automatic reviews** enabled, undrafting is all it takes — Codex
   reviews without being asked. Otherwise comment `@codex review`.
   Either way Codex reads the whole diff, does **not** edit, and reports:
   blocking defects / non-blocking concerns / ready or not.
4. **Repair — once.** If there are blocking findings, Claude gets exactly one
   follow-up, scoped to those findings. No scope growth. If it needs a second
   repair pass, close it and re-brief; something was wrong with the task.
5. **Gate.** Lawrence opens the Vercel preview from the PR on his phone, looks
   at the actual world, and merges only if he likes it. Merging deploys.

## What each side owes the other

**Builder (Claude)**
- One change. If you find three things, do one and write the others into
  `HANDOFF.md` under "spotted, not done".
- `npm run build` must pass (it typechecks with `noUnusedLocals`).
- The PR description states what you changed, what you verified **and how**, and
  what you could not verify. Say plainly when something needs an eye.
- Never claim a visual result. You have no display. The preview is for Lawrence.
- Append a `HANDOFF.md` entry in the same PR.

**Reviewer (Codex)**
- Read the whole diff, not the description. The description is the claim under
  test.
- Check the project's invariants (`CLAUDE.md`): no Pixi in `sim.ts`; snapshot
  before mutate; the `fadedDeadCivs` repaint; era fixed at civ birth.
- **Check determinism.** The sim draws from a seeded stream. Any `Math.random()`
  in `src/sim.ts` silently breaks shared world links and reproducible worlds.
  This has already happened once, in cherry-picked code.
- Check that measurements prove what they are said to prove. A single-line
  terrain probe was once used to claim land existed beyond the map; measuring
  the whole visible area showed the opposite.
- Flag scope creep, and flag any claim an agent could not have made.
- First pass is read-only. Report; do not fix.

**Gate (Lawrence)**
- Open the preview before merging. It is the only real visual check.
- Merge deliberately: `main` deploys to the live site in about ten seconds.
- If an agent says it verified something visual, disbelieve it.

## The guardrails, and what they actually stop

- **`main` is branch-protected**: PR required, the Vercel check must pass, no
  force pushes, no deletions, enforced on admins. Neither agent — nor Lawrence
  by accident — can push straight to production.
- **Agents use `claude/*`, `codex/*` or `agent/*` branches.** Never `main`.
- **Draft PRs** while the builder is still working. Undrafting is the handoff.
- **One builder pass, one repair pass.** A phone is a bad place to review a
  400-line diff.
- **Anchor tags** are the way back: `known-good-2026-08-18` (pre-loop state),
  `live-2026-08-18` (what was live then). `git reset --hard <tag>` on a branch,
  or revert the merge commit from the GitHub UI.

## What cannot be done remotely

No cloud runner has a GPU, a display, or a browser. `scripts/loop/turn.sh` does
not run remotely; there are no agent-side screenshots.

**But Lawrence can see it**: Vercel builds a preview per branch and posts the URL
as a check on the PR. So the eye moves from the agent to the human rather than
disappearing.

- **Good remote work** — sim logic and balance, world character and form tuning
  by measurement, guardrails, narration text, docs, refactors, anything a build
  or a number can prove, and bold visual changes obvious on a phone screen.
- **Poor remote work** — subtle palette, light and composition. A phone is not a
  monitor. Leave those for a real screen.

## Running the agents

**Claude** — the Claude app → Code (claude.ai/code), repo `suckatlife/the-land`.
Runs on Anthropic infrastructure, survives losing signal, bills against the
subscription. Needs Pro/Max and GitHub connected to the Claude account.

**Codex** — the ChatGPT app → Codex, same repo, for full review sessions; or
`@codex review` on a PR for a review posted inline.

There is **no automatic handoff between the two agents.** Neither can start the
other; a human is always the baton. What can be automated is Codex's side.

**Set this up from a desktop browser before leaving** — it lives on a web page,
not in the ChatGPT mobile app:

1. Connect Codex cloud to `suckatlife/the-land` (ChatGPT → Codex → connect the
   repository). Needs GitHub push or admin permission on the repo.
2. Go to **chatgpt.com/codex/settings/code-review**.
3. Turn on **Code review** for the repository.
4. Turn on **Automatic reviews**.

Then marking a PR ready for review is enough to summon it. Codex reads the
`## Code Review Rules` section of `AGENTS.md`, so the criteria in this file
apply without restating them per PR.

If auto-review does not fire on undrafting — the docs do not say whether it
treats a draft becoming ready as "opening a PR for review" — fall back to the
`@codex review` comment. Worth testing once before relying on it.

Optional: `.github/workflows/claude.yml` lets `@claude` in a GitHub comment run
a session on a runner. It needs the Claude GitHub App plus an
`ANTHROPIC_API_KEY` secret, which bills **separately** from the subscription.
Prefer the app.
