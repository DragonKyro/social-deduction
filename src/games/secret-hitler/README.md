# Secret Hitler

5-10 player social deduction. Liberals try to enact 5 liberal policies (or assassinate Hitler); fascists try to enact 6 fascist policies (or get Hitler elected chancellor after 3 fascist policies). Each round nominates a president-chancellor pair, votes them in, and enacts a policy from a deck the president and chancellor each privately filter.

## Scope

**Base game** ships first. Track lengths + executive powers depend on player count:

| Players | Liberals | Fascists (incl. Hitler) | Fascist powers |
|---|---|---|---|
| 5 | 3 | 2 | -, -, peek, exec, exec |
| 6 | 4 | 2 | -, -, peek, exec, exec |
| 7 | 4 | 3 | -, invest, special, exec, exec |
| 8 | 5 | 3 | -, invest, special, exec, exec |
| 9 | 5 | 4 | invest, invest, special, exec, exec |
| 10 | 6 | 4 | invest, invest, special, exec, exec |

**Variants** (Phase 3+):
- Rebalanced 6p (community house-rule)

## Hidden info

Two layers of hidden info make this game stricter than ONUW:
1. **Roles** — fascists know each other and know Hitler (except in 5-6p Hitler doesn't know fascists). Encoded in `yourPartyKnowledge`.
2. **Policy hand** — only the president sees their 3-card draw, only the chancellor sees the 2 cards passed to them. `yourLegislativeHand` is the redaction slot; everyone else only sees deck/discard sizes.

The host enforces deck integrity (no peer ever holds the deck order). When the deck reshuffles, the new order is determined by seeded RNG so a future replay can reconstruct it.
