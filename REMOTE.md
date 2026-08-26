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
2. **Build.** Claude works on a `claude/*` branch, one change, and opens the
   **draft** PR *early* — from the first commit, before the work is finished —
   then lands the completed change on it. **The PR has to exist before the push
   you want reviewed:** the trigger is a push to an *open* PR, so a push that
   merely creates the branch has nothing to trigger on, and opening a draft was
   not observed to trigger a review either. Vercel builds a preview
   automatically.
3. **Review — ask for it, every time.** Codex's *on every push* setting works,
   but not reliably: on 2026-08-21 it reviewed during one 86-minute window out
   of three hours, and **PR #9 merged having never been reviewed** because
   nobody noticed the silence. So the builder **comments `@codex review` on the
   PR on every push that lands a *finished* change — the first complete push and
   each repair push, but **not** the draft-opening push, which step 2 makes
   deliberately incomplete — and then
   **confirms the review actually arrived for that commit.** Asking is not the
   same as being reviewed.

   **Codex answers in two different places, and this has already caused one
   false alarm.** When it has findings it posts a *review* with inline comments.
   When it has none it posts an ordinary *issue comment* — "Codex Review: Didn't
   find any major issues" — and no review object at all. So checking
   `/pulls/<n>/reviews` alone reports every clean review as no review. Check
   both:

   ```
   PR=<n>
   # Ask GitHub for the head — NOT git rev-parse HEAD. A local checkout can be
   # stale, or on another branch entirely (see "one agent per working copy"),
   # and an older commit that was reviewed would then read as success.
   HEAD=$(gh api repos/suckatlife/the-land/pulls/$PR --jq .head.sha)
   # findings
   gh api --paginate repos/suckatlife/the-land/pulls/$PR/reviews \
     --jq ".[] | select(.user.login==\"chatgpt-codex-connector[bot]\")
                 | select(.commit_id==\"$HEAD\") | .submitted_at"
   # no findings
   gh api --paginate repos/suckatlife/the-land/issues/$PR/comments \
     --jq ".[] | select(.user.login==\"chatgpt-codex-connector[bot]\")
                 | select(.body | contains(\"${HEAD:0:10}\")) | .created_at"
   ```

   `--paginate` on both: a talkative PR runs past the first page, and a missing
   later comment reads as "not reviewed" and triggers a needless escalation.

   Either one, matching the current head, means reviewed. Two things that look
   like answers but are not: a review or comment against an *earlier* commit,
   and the bot's "To use Codex here, create an environment for this repo"
   message, which is a setup error.

   Do not count `@codex review` comments by grepping for that string — Codex's
   own replies quote it in their footer, so its answers get counted as your
   unanswered questions. Filter on `.user.login` instead.

   If nothing has appeared after ~5 minutes, comment again. If a second request
   also goes unanswered, **say so in the PR and to Lawrence** — an unreviewed PR
   is a thing to escalate, never a thing to report as done.
   Codex reads the whole diff, does **not** edit on the first pass, and reports:
   blocking defects / non-blocking concerns / ready or not.
4. **Repair, then a checkpoint.** After **two review rounds** Claude stops and
   asks rather than pushing again (`AGENTS.md` states it in full). It runs
   `scripts/loop/rounds.sh <pr>` before any push; the script exits non-zero at
   the checkpoint. A PR may have as many rounds as it needs — but Lawrence is
   the one who says so, by commenting **`/continue`** (or `/continue 4`) to
   grant more. **`@claude continue`** does both jobs in one comment: `@claude`
   wakes the workflow, `/continue` authorises the rounds. Plain `/continue`
   grants rounds but wakes nothing. Nothing about this loop ends on its own: PR #36 ran five pushes
   and six reviews in forty-five minutes before anyone intervened.

   **This step is also deliberately manual.** If there are
   blocking findings, Lawrence sends Claude one follow-up, scoped to those
   findings. No scope growth. If it needs a second repair pass, close it and
   re-brief; something was wrong with the task.

   Claude does **not** watch the PR by default: Codex posts to GitHub, and
   nothing tells Claude. Claude's **auto-fix** feature would close that gap — it
   subscribes to PR activity and pushes a fix when a check fails or a reviewer
   comments — but it requires the Claude GitHub App, and chaining it to Codex's
   review-on-every-push creates a loop with no human in it:

   > Codex reviews -> Claude fixes -> pushes -> Codex re-reviews -> Claude fixes

   Nothing bounds that, it violates the one-repair-pass rule, and it spends rate
   limits on both accounts unattended. Keeping the human in this one step is the
   only thing that stops it. If a particular PR really should run unattended,
   turn auto-fix on for that PR **and** set Codex's trigger to *On PR open* for
   the duration, so the cycle cannot close.
5. **Gate.** Lawrence opens the Vercel preview from the PR on his phone, looks
   at the actual world, and merges only if he likes it. Merging deploys, closes
   the PR, and ends reviews on it — the trigger is a push to an open PR, so a
   merged branch is finished. New work is a new PR.

**Notifications:** Codex posts a standard GitHub review, and Claude opens PRs
under Lawrence's account, so he is the author and subscribed. GitHub Mobile
push notifications are what actually close the loop — check they are on.

## What each side owes the other

**Builder (Claude)**
- One change. If you find three things, do one and write the others into
  `HANDOFF.md` under "spotted, not done".
- `npm run build` must pass (it typechecks with `noUnusedLocals`).
- The PR description states what you changed, what you verified **and how**, and
  what you could not verify. Say plainly when something needs an eye.
- Never claim a visual result. You have no display. The preview is for Lawrence.
- Append a `HANDOFF.md` entry in the same PR.
- **Comment `@codex review` on every push that lands finished work — not the
  draft-opening push — then confirm a review arrived for that commit.** Do not
  wait on the automatic trigger, and do not treat "I asked" as evidence:
  requests get ignored. State plainly in the PR when a review could not be
  obtained; never let that pass silently. An unreviewed PR has merged once
  already.

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
- **Check there is a Codex review against the commit being merged.** PR #9
  merged unreviewed because nobody looked. The review list is on the PR page;
  a review of an earlier commit is not a review of this one.
- Open the preview before merging. It is the only real visual check.
- Merge deliberately: `main` deploys to the live site in about ten seconds.
- If an agent says it verified something visual, disbelieve it.

## The guardrails, and what they actually stop

- **`main` is branch-protected**: PR required, the Vercel check must pass, no
  force pushes, no deletions, enforced on admins. Neither agent — nor Lawrence
  by accident — can push straight to production.
- **Agents use `claude/*`, `codex/*` or `agent/*` branches.** Never `main`.
- **Draft PRs** while the builder is still working — a signal to the human, not
  to Codex, which (on *On every push*) reviews pushes regardless of draft
  state. So: open the draft PR first, then land the finished change on it in
  **one** push. Not "build, then push once at the end" — that push would have
  no open PR to trigger on. Then comment `@codex review` — always, not only
  when the automatic trigger has visibly failed.
- **One builder pass, one repair pass.** A phone is a bad place to review a
  400-line diff.
- **One agent per working copy.** Two sessions sharing a checkout produced the
  worst confusion this repo has seen. On 2026-08-21 one session committed while
  the other had switched the branch underneath it, so the commit landed on the
  *other* session's branch; the first session then read its own commit in a
  diff, concluded the other PR "already contained" the fix, and reported that
  twice before the branch refs were checked. Nothing was lost, but the status
  reports were wrong both times. If two agents must run at once give each its
  own clone or `git worktree`, and never assume the branch you checked out is
  still the branch you are on — re-read `git rev-parse --abbrev-ref HEAD`
  before you commit.
- **Confirm a push actually landed.** `git push` exiting 0 is not proof your
  commit reached the PR: it may have pushed a different branch. Check
  `git rev-parse origin/<branch>` afterwards. And check the PR's `merged_at`
  before reporting anything as landed — on a merged PR `updated_at` equals the
  merge time and reads exactly like a fresh update, which is how a fix once got
  pushed to a PR that had closed 18 minutes earlier.
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
3. Confirm the repository is Codex-enabled, and turn on **Auto review**.
4. Set **Review trigger** to **On every push**.
5. Consider **Exhaustive code review** on — the volume here is one PR per turn,
   and depth is the entire reason Codex is in this loop.

The trigger options are *On PR open*, *On every push*, and *Smart detect
(experimental)*. There is no "when marked ready for review" option in that
dropdown — but Codex's own review banner lists "Mark a draft as ready" among
the events that trigger it, so under *On PR open* undrafting almost certainly
counts as opening. That gives two honest configurations:

- ***On every push*** (chosen): covers the first review and the re-review
  after a repair push with no human action at either. Cost: a draft gets
  reviewed too, so the builder should push **once, when the change is whole**,
  not in pieces — each push spends review quota.
- ***On PR open***: draft → ready becomes the baton, and nothing is reviewed
  while Claude is still working. Cost: the re-review after a repair push needs
  a manual `@codex review`.

Avoid *Smart detect* while unattended — experimental behaviour is a poor bet
when nobody is watching.

**Rate limits are silent.** With *Enable credits use* off, reviews simply stop
once limits are hit. Treat "Codex said nothing" as *check whether it is
rate-limited*, not as *it found nothing*. Codex reads the
`## Code Review Rules` section of `AGENTS.md`, so the criteria in this file
apply without restating them per PR.

`@codex review` is the **primary** trigger, not a fallback — see the loop above.
The automatic setting is a bonus when it works, and the whole day's evidence is
that it works *sometimes*:

Recounted from the API on 2026-08-21, after an earlier count in this file got
it wrong: **11 explicit `@codex review` requests, 10 of them answered.** The one
failure was the very first, at 13:32, before the connector was working; a repeat
43 minutes later was answered in three. Six further reviews arrived from the
automatic trigger, all between 14:18 and 15:44 — outside that window it produced
nothing, and **PR #9 lived and merged without a single review** because nobody
asked and nobody checked.

So explicit requests are close to reliable and the automatic trigger is not.
An earlier version of this section claimed silence was clustering on one PR and
blamed its large `src/main.ts` diff. That was an artefact of the two counting
bugs described above, not a real effect. There is no evidence any PR is harder
for Codex to review than another.

Why it goes quiet is **not** established. An unconnected repository and a silent
rate limit look identical from GitHub — nothing is posted either way. If reviews
stop, check the connection **and** the quota at
chatgpt.com/codex/settings/code-review; changing the trigger cannot help if the
cause is quota. But do not spend the trip diagnosing it: just comment.

`.github/workflows/claude.yml` lets `@claude` in a GitHub comment run a session
on a runner. It needs the Claude GitHub App plus a `CLAUDE_CODE_OAUTH_TOKEN`
secret — generate it with `claude setup-token`. That token authenticates with
the **Pro/Max subscription**, so runs do not hit API billing.
(`ANTHROPIC_API_KEY` also works and is billed separately.)

This is what lets `@claude continue` resume a checkpointed PR from a phone with
no app to open.
