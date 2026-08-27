**Checkpoint reached — the builder should stop here.**

The round budget for this PR is used up. This is the protocol working rather than
failing: neither a builder nor an exhaustive reviewer stops on its own, so the
budget is the thing that ends the loop.

Nothing is blocked. This PR can be merged whenever you like — what is paused is
further *unattended* pushes.

To authorise more rounds, comment `@claude continue` **plus a task**. A woken
runner has no memory of the session that stopped, so a bare marker gets an
acknowledgement and no work. `@claude continue 4` grants four rounds.
