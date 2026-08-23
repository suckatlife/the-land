# Turn B — the shipping plan

**Status:** draft, for review. Answers issue #20. Commits to nothing.
**Scope:** what this project is for, now that it is already public.

---

## 0. The check the brief demanded first

`ANALYTICS.md:28` warned that Vercel restricts custom events to Pro and
Enterprise, which would have made every `trackEvent` from #3 a silent no-op and
the Privacy page a description of things that never happen.

**Checked, via the Vercel API with the CLI's own credentials:**

| | |
| --- | --- |
| plan | **`pro`** |
| Web Analytics on the project | **enabled** (`webAnalytics.id` present) |
| Speed Insights | enabled, `hasData: false` |

**So measurement works.** Custom events are supported, the analytics shipped in
#3 is functioning, and the Privacy page is accurate as written. The open
question from that handoff is closed.

What I could not read is the **data** — the analytics overview endpoint is not
public, so current traffic is unknown to me and visible to Lawrence in the
dashboard. Two numbers would change several answers below, and it is worth
looking before deciding anything: how many people have arrived, and whether any
of them reached the 10-minute engagement event.

---

## 1. What does "launching" mean when it is already public?

It is already live, on its own domain, installable, shareable, with legal pages
and working analytics. There has been no launch blocker in the codebase for some
time — this week alone went into clocks, an ending sequence, a copy pass and a
mobile layout, none of which was gating anything.

That is the argument for treating launch as a **moment** rather than a state:
not because the site needs it, but because *"shipped"* has quietly come to mean
*"one more fix"*, and it will keep meaning that indefinitely. A date is the only
thing that has ever stopped that.

**Recommendation: pick a date, tell a small number of people, and stop counting
fixes as progress toward launch.** The work after that date is maintenance and
features, not preparation.

The honest counter-argument, which is Lawrence's to weigh: if the point is that
the thing exists and a few people find it, then it has already succeeded and a
launch moment is theatre. That is a legitimate answer and the plan below still
works — it just ends at §4.

---

## 2. Is there money in this?

**Recommendation: free, with the existing quiet support link, and no paid tier
for now.** The reasoning, option by option, so it is written down once.

**Ads — no, and this is the one that should never be reopened casually.**
Four reasons, only the first of which is aesthetic:

1. `docs/archive/BRIEF.md:109` banned them, and while that constraint has
   already been partly overtaken by analytics, this part of it should not be.
2. **They are structurally opposed to the product.** An advertisement is a thing
   designed to take attention. This thing's entire proposition is giving
   attention back. That is not a tension to manage; it is a contradiction.
3. **The economics do not arrive.** Ad revenue needs scale this will not have.
   The trade is a compromised product for money that never shows up.
4. It would require abandoning the privacy position — cookie-free, DNT and GPC
   honoured, no seeds or URLs transmitted — which is currently a real and rare
   differentiator, and one the Privacy page has already promised.

**A paid tier — not yet, because there is nothing to put behind it.** The
product's value is that it asks nothing of you. Every candidate feature is
weak: more archive slots (the archive holds 10 and nobody has filled it), custom
world naming (a novelty), higher-resolution export (a screenshot already works).
A paid tier would mean *building something worse to have something to sell*. If
one day a genuinely separable thing exists — a long-form export, a physical
print of a world, an installation build — revisit then.

**Donations / a tip jar — yes, and it mostly already exists.** `/support`
already says *"The Land is currently free and does not sell anything."* Adding
one unobtrusive line — a link, not a banner, not in the world — costs nothing
and contradicts nothing. It will not pay for hosting and should not be expected
to. Its real function is as a signal: someone caring enough to send $3 is worth
more as information than as money.

**Sponsorship — possible, premature.** A single quiet credit would not damage
anything, but it needs an audience first. Park it.

**On the MIT licence and forking:** the source is MIT, so anyone may host their
own copy. This is not worth mitigating. Nobody forks a project with no audience,
and if it acquires one, the assets are the domain, the name, and the fact that
this one is maintained — none of which a fork takes. Changing the licence would
cost more in goodwill than it protects.

---

## 3. What survives the calm test?

`CLAUDE.md`: *"If a change makes the world louder, busier or more saturated, it
is probably the wrong change."*

| proposal | verdict |
| --- | --- |
| a support link on About and Support | **fine** — already there, outside the world |
| a one-line credit in the footer | fine |
| anything in the world itself | **no** |
| a modal, nag, interstitial or countdown | **no** |
| accounts | **no** — and it would break the privacy position too |
| an email capture | **no** for now; if ever, on `/about`, never over the world |

The rule this yields: **nothing that interrupts, and nothing inside the frame.**
The world is the product; every commercial surface belongs on the pages around
it, where a visitor has already chosen to read.

---

## 4. The soft-launch sequence

Three stages, in order, because each is for a different thing and doing them out
of order wastes the first audience.

**Stage 1 — a handful of people you know, privately.** For *usability*, not
traffic. What you want is someone opening it on their own phone, on their own
network, and telling you what confused them. This week's mobile work came from
measuring viewports; it is not a substitute for watching a person hold it. Fix
what they find before anything wider.

**Stage 2 — one community that already values this kind of work.** For
*credibility and the right first audience*. Generative art, ambient software,
screensaver and demoscene adjacent spaces — people who will forgive a rough
edge and tell you something true about the aesthetic. One place, not five.

**Stage 3 — broader social, once stages 1 and 2 have not produced a surprise.**
For *traffic*. This is where the social card and the share button earn their
keep.

I do not know Lawrence's networks, so this is a shape rather than a list. The
part that matters is the ordering and the reason for it.

**One thing to prepare regardless:** a single sentence describing what this is,
that does not use the words *simulation*, *procedural* or *generative*. The
About page's *"A world that carries on without you"* is already that sentence.

---

## 5. Success, and stopping

Analytics works, so this can be a number rather than a feeling.

**The primary metric should not be visits.** It should be
**`engagement_reached` at 10 minutes as a share of visits.** That is the
product's own thesis under test: a world lasts 10–17 minutes, and the claim is
that it is worth watching one end. If people arrive and leave in 30 seconds,
this is a screenshot, not a screensaver, and the response is a product change
rather than a marketing one.

Secondary, in order: returning visits (does anyone come back), shares (does
anyone pass it on), installs (does anyone want it resident).

**A stopping condition, because otherwise this never ends.** Proposed: if after
stage 3 the 10-minute rate is meaningfully non-zero and a few hundred people
have seen it, **that is success and the project is finished as a launch.** It
becomes a thing that exists, gets occasional work when there is an idea worth
building, and is not measured again. Naming that in advance is the difference
between a small good thing and an indefinite obligation.

---

## 6. What this plan does not do

Implement anything. Add a payment provider, a pricing page, an account system,
or an ad. Post anything anywhere. Change the Support page's promise, which
remains accurate.

---

## 7. Open questions for Lawrence

1. **Moment or state?** §1 recommends picking a date. The alternative — that it
   already exists and that is enough — is legitimate and shortens this plan.
2. **Is the tip jar worth having at all**, given it will not pay for hosting?
   The argument for it is informational, not financial.
3. **What are the actual numbers?** Traffic is in your dashboard and invisible
   to me. If a hundred people have already found it, §4 changes.
4. **Does the 10-minute metric match your intent?** It is a demanding bar. A
   defensible alternative is that a 90-second glance is a complete experience
   and the metric should be returning visits instead.
5. **Is there a version of this that is finished?** §5 proposes one. If the
   honest answer is that you will keep working on it regardless, the stopping
   condition is fiction and should be cut rather than written.
