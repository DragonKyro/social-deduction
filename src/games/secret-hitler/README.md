# Secret Hitler

5-10 player social deduction. Liberals try to enact 5 liberal policies (or assassinate Hitler); fascists try to enact 6 fascist policies (or get Hitler elected chancellor after 3 fascist policies). Each round nominates a president-chancellor pair, votes them in, and enacts a policy from a deck the president and chancellor each privately filter.

## Files

| File | What |
|---|---|
| `state.ts` | Private state, public view, log entries |
| `actions.ts` | Action union (every action carries `bySeat`) |
| `module.ts` | `GameModule`: setup + reducer (`applyAction`) |
| `view.ts` | `viewFor` — the redaction chokepoint |
| `rules.ts` | Eligibility / term limits, shared by reducer, AI and UI |
| `setup.ts`, `tracks.ts` | Deal, deck, reshuffle, knowledge table, board tables |
| `ai.ts` | Heuristic AI (decides from `viewFor` only) |
| `testkit.ts` | Test-only self-play driver + hidden-info permutation |
| `ui/` | `GameView` (the dossier), `SecretHitlerSetup`, `art.tsx` (inline SVG) |

## Scope

Base game (5–10 players). Track lengths + executive powers depend on player count:

| Players | Liberals | Fascists (incl. Hitler) | Fascist powers |
|---|---|---|---|
| 5 | 3 | 2 | -, -, peek, exec, exec |
| 6 | 4 | 2 | -, -, peek, exec, exec |
| 7 | 4 | 3 | -, invest, special, exec, exec |
| 8 | 5 | 3 | -, invest, special, exec, exec |
| 9 | 5 | 4 | invest, invest, special, exec, exec |
| 10 | 6 | 4 | invest, invest, special, exec, exec |

Rules notes (all covered by tests):

- **Term limits** attach to the last *elected* government — set when an election passes, so a government that later vetoes is still term-limited. The last chancellor is always ineligible; the last president too unless ≤5 players are alive. Chaos clears them.
- **Election tracker**: a failed election or an accepted veto advances it. At 3 the top policy is enacted ("chaos"): powers ignored, term limits forgotten, tracker reset.
- **Veto** unlocks at 5 fascist policies. The chancellor may propose it once per session; if the president refuses, the chancellor must enact.
- **Reshuffle** happens eagerly at the end of every legislative session / chaos enact when fewer than 3 policies remain, so a chaos top-deck never draws from a 1–2 card stub and the public deck count matches the table.
- **Special election**: any other living player (even a term-limited one); afterwards rotation resumes to the left of the president who called it.
- **Investigate** reveals party only (Hitler reads Fascist); a player can't be investigated twice; whom was investigated is public.
- **`rebalanced6p`** (variant popularised by secrethitler.io): at 6 players, start with one Fascist policy on the board, taken from the deck. Ignored at other sizes. Toggle on the setup screen.

## Hidden info

`viewFor(state, seat)` in `view.ts` copies every public field explicitly (no spreads of private objects). `seat = null` is the spectator view — anyone can open it, so it carries no role or card until game over.

1. **Roles** — fascists know each other and Hitler. At 5-6 players Hitler also sees the fascist. At 7+ Hitler is blind. Encoded in `yourPartyKnowledge`. Roles go public (`revealedRole`) only at game over; an executed non-Hitler's role stays secret.
2. **Policy hand** — only the president sees the 3-card draw (`legislativePresident`); only the chancellor sees the 2 passed cards (`legislativeChancellor` / `vetoRequested`). `yourPassedPolicies` reminds the president which 2 they passed (they saw them a moment ago) while the chancellor decides.
3. **Votes** — while the vote is open, every `voteCast` is null; `hasVoted` says who has voted, not how. All ballots appear together at `electionReveal`, and the `electionResult` log entry keeps them.
4. **Executive results** are private to the acting president: `yourPendingInvestigationResult` (once), `yourInvestigations` (persistent), `yourPeek` (deck order unchanged).
5. **Deck / discard / seed** are never in a view — only `policyDeckSize` / `policyDiscardSize`. The seed drives the deal and every reshuffle, so it must never leave the host.

`redaction.test.ts` checks this over every state reached in AI self-play at 5–10 players: no private keys, no seed, `"hitler"` only for seats that know him, and **non-interference** — re-randomising everything a seat may not know (other roles, card order, hands, sealed ballots) leaves that seat's view byte-identical and the AI's choice unchanged.

## State machine

`setup → nomination → electionVote → electionReveal → legislativePresident → legislativeChancellor → (vetoRequested?) → policyReveal → (execInvestigate/execSpecialElection/execPeek/execExecute → respective reveal/ack)? → nomination`

A failed election at tracker=3 force-enacts the top card via `topDeckReveal`, clears term limits, and rotates.

`electionReveal`, `policyReveal` and `topDeckReveal` are shared screens: any seat may dismiss them (`bySeat` must still be a real seat). The AI leaves them to a human unless every seat is AI, so people get to read the result.

## AI

Heuristic AI in `ai.ts`. It builds `viewFor(state, seat)` and decides from that alone (its only other input is the seed, used as a private coin). Liberals track a suspicion score from the public record (who enacted fascist policies, who voted for those governments, their own investigations) and fear untested chancellors once Hitler can win by election. Fascists back team governments, push Hitler into the chancellorship at 3+ fascist policies, discard liberals when the cover story holds, and never shoot a teammate. Hitler plays a cautious liberal. Decisions mix in randomness so they aren't trivially readable.

## UI

1930s dossier: walnut desk, printed liberal/fascist boards whose slots fill with a drop-in animation, sliding brass election-tracker marker, draw/discard piles, index-card seat plaques with president/chancellor placards and Ja!/Nein! ballots that flip together on reveal, manila role folder that swings open, policy cards dealt and flipped, "Executed" / "Veto" / "Chaos" rubber-stamp toasts, typewritten minutes.

Pass-and-play (2+ humans on one device) puts every private screen behind a hand-over cover keyed to (phase, seat, log length) and switches seats only via `useSeatSwitching()` (disabled online, never to AI seats). Your role and investigation results live in a dossier you open on demand; the always-visible roster shows public facts only.
