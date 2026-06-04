# Secret Hitler

5-10 player social deduction. Liberals try to enact 5 liberal policies (or assassinate Hitler); fascists try to enact 6 fascist policies (or get Hitler elected chancellor after 3 fascist policies). Each round nominates a president-chancellor pair, votes them in, and enacts a policy from a deck the president and chancellor each privately filter.

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

Veto unlocks at 5 enacted fascist policies. Election tracker maxes at 3 (force top-deck enact, no power, term limits reset). Term limits: last-elected chancellor always; last-elected president unless ≤5 alive.

## Hidden info

Two layers of redaction:
1. **Roles** — fascists know each other and Hitler. At 5-6 players Hitler also sees the fascists (small-table rule). At 7+ Hitler is blind. Encoded in `yourPartyKnowledge`.
2. **Policy hand** — only the president sees their 3-card draw; only the chancellor sees the 2 cards passed to them. `yourLegislativeHand` is the redaction slot.

Executive-power results are also private to the actor:
- `yourPendingInvestigationResult` flashes the investigated player's party (Hitler reads as Fascist) to the investigating president once.
- `yourInvestigations` keeps the persistent list for the investigator.
- `yourPeek` shows the next 3 policies only to the peeking president; the deck order is not consumed.

The host never sends another peer's view — that's the chokepoint per the engine contract.

## State machine

`setup → nomination → electionVote → electionReveal → legislativePresident → legislativeChancellor → (vetoRequested?) → policyReveal → (execInvestigate/execSpecialElection/execPeek/execExecute → respective reveal/ack)? → nomination`

A failed election at tracker=3 force-enacts the top card via `topDeckReveal`, clears term limits, and rotates.

## Reshuffles

Deck reshuffles when fewer than 3 cards remain (or 1 for top-deck force enact). The shuffle is seeded by `seed ^ 0xc1ea_ca11 + reshuffleCount * 0x9e3779b1` so replays are deterministic. The deck is never broadcast — peers only see `policyDeckSize` / `policyDiscardSize`.

## AI

Heuristic AI in `ai.ts`. Liberals enact liberals + try to vote down suspect governments; fascists discard liberal policies and vote up fascist chancellors. Hitler stays quiet at small tables.
