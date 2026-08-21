# Working on The Land from a phone

For when the laptop is off and the connection is thin. Everything below is
driven from GitHub, because GitHub is the only thing both agents can reach and
the only thing that survives you losing signal mid-task.

## The one rule that makes this work

**The prompt lives in the repo, not in your message.** Typing a full brief on a
phone is miserable, so the agents are told to read `AUTO_LOOP.md` and
`HANDOFF.md` themselves. Your message only has to say *which turn* and *what
kind of work*. Everything you send should fit in one thumb-typed line.

## What remote turns can and cannot do

A cloud runner has no GPU, no display, and no browser — so **nobody can watch
the world remotely.** `scripts/loop/turn.sh` will not work; there are no
screenshots and no visual gate.

That is not a small limitation, it decides what the work should be:

**Good remote work** — simulation logic and balance, world character and form
tuning by measurement, the habitability and "is anything happening" guardrails,
narration and chronicle text, docs, dead code, refactors, test harnesses,
anything a `npm run build` can prove.

**Bad remote work** — palette, light, composition, anything whose success is
"does it look right." Those need your eye at full resolution. An agent that
tunes colour blind will confidently make it worse, and you will not find out
until you get home.

The verification bar remotely is: **`npm run build` passes** (it typechecks with
`noUnusedLocals`, so it catches real breakage) plus whatever can be measured
numerically. Anything visual gets deferred to a note in `HANDOFF.md`.

## Driving Claude

Comment on any issue or PR in the repo, from the GitHub mobile app or the
browser:

> @claude take the next turn per AUTO_LOOP.md. Remote turn: no screenshots, so
> pick sim/logic work, verify with npm run build, and open a PR.

That runs `.github/workflows/claude.yml` on GitHub's runners. It reads the repo,
works, and opens a pull request. Needs the Claude GitHub App installed and an
`ANTHROPIC_API_KEY` repo secret — see the comments in that workflow.

Alternative with no setup at all: **claude.ai/code** in the phone browser,
pointed at this repo. Same agent, started from a chat instead of a comment.

## Driving Codex

In the ChatGPT app, open Codex, point it at `suckatlife/the-land`, and give it
the same one-liner. It works in its own cloud container and opens a PR.

On GitHub, `@codex review` on a pull request gets you a review rather than new
work — which is the useful half of the pairing: **let Codex review what Claude
built, and vice versa.** Neither agent can start the other, so you are the baton
either way; reviewing is the cheapest possible baton pass.

## The loop, adapted

1. Comment `@claude` on the tracking issue with the turn id and a one-line aim.
2. It opens a PR. Skim the description on your phone.
3. Comment `@codex review` on that PR.
4. Read the review. If it is fine, merge from the phone. If not, comment
   `@claude` on the same PR with the fix.
5. Next turn goes to whichever agent did not do the last one — `HANDOFF.md`
   records whose turn it was, so you never have to remember.

Each agent must append to `HANDOFF.md` in its PR. That file is the state of the
project; if you read nothing else when you get back, read the entries added
while you were away.

## Guardrails while you are away

- **Never merge to `main` from the phone unless you mean to deploy.** `main`
  auto-deploys to the live site. Work on branches and PRs; leave merging to
  `main` for when you are home and can look at it.
- The anchor tags `known-good-2026-08-18` and `live-2026-08-18` are the way
  back if a run goes badly: `git reset --hard known-good-2026-08-18`.
- Ask for **one change per turn**. A phone is a bad place to review a
  400-line diff, and a bad diff merged remotely is expensive to undo.
- If an agent says it verified something visual, disbelieve it. It could not.
