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

A cloud runner has no GPU, no display and no browser, so **no agent can watch
the world.** `scripts/loop/turn.sh` will not run remotely; there are no
screenshots and no visual gate on the agent's side.

**But you can watch it.** Vercel builds a preview for every branch and posts the
URL as a "Vercel" status on the commit — confirmed working on this repo. So the
loop is: the agent builds and proves what a build can prove, and *you* open the
preview on your phone and judge the rest. That makes visual work possible
remotely; it just moves the eye from the agent to you.

Two honest limits on that: a phone screen is not your monitor, so fine palette
and light judgements should still wait; and an agent that *claims* it verified
something visual is confabulating — it could not.

**Good remote work** — simulation logic and balance, world character and form
tuning by measurement, guardrails, narration text, docs, dead code, refactors,
anything `npm run build` can prove, plus bold visual changes obvious enough to
read on a phone.

**Poor remote work** — subtle palette, light and composition tuning. Those are
the ones you will want at full resolution.

The verification bar remotely is: **`npm run build` passes**, the Vercel preview
builds green, and anything measurable is measured. Everything else is a note in
`HANDOFF.md` for when you are back.

## The shape of a remote sprint

Keep it to **one builder pass and one repair pass.** More than that and you are
reviewing a large diff on a phone, which is where mistakes get merged.

1. Claude builds on a `claude/*` branch and opens a **draft** PR.
2. Codex reviews it — read-only, no edits on the first pass.
3. If Codex finds something blocking, Claude gets **one** follow-up, scoped to
   those findings only. No scope growth.
4. You open the Vercel preview from the PR, and merge only if you like it.

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

- `main` is **branch-protected** as of 2026-08-21: pull request required, the
  Vercel check must pass, no force pushes, no deletions, and it is enforced on
  admins — so neither you nor an agent can push straight to production by
  accident. Merging a PR still deploys, so merge deliberately. If you ever need
  the protection off, it is a toggle in the repo settings from your phone.
- Agents work on `claude/*`, `codex/*` or `agent/*` branches. Never `main`.
- The anchor tags `known-good-2026-08-18` and `live-2026-08-18` are the way
  back if a run goes badly: `git reset --hard known-good-2026-08-18`.
- Ask for **one change per turn**. A phone is a bad place to review a
  400-line diff, and a bad diff merged remotely is expensive to undo.
- If an agent says it verified something visual, disbelieve it. It could not —
  open the preview yourself.
- **Cost:** the `@claude` GitHub Action bills against an `ANTHROPIC_API_KEY`,
  separately from your Claude subscription. Running Claude from **claude.ai/code**
  or the Claude app uses the subscription instead. If you would rather not meter
  API spend from a campsite, prefer the app and keep the Action as a fallback.
- Write your sprint briefs in your phone's Notes app while offline, then paste
  one when you next get signal. Composing a brief on a bar of signal is the
  worst part of this.
