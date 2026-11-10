# Avalon

5-10 player team-based social deduction. Good (Loyal Servants of Arthur) and evil (Minions of Mordred) compete across 5 quests. Each quest's leader proposes a team; the whole table votes to approve or reject. If approved, team members privately play a success or fail card. Three successful quests = good wins (then the Assassin gets one shot at identifying Merlin). Three failed quests OR 5 rejected proposals in a row = evil wins.

## Scope

**Base box** ships first (Phase 4):
- Required: Merlin, Assassin
- Optional special roles: Percival, Morgana, Mordred, Oberon

**Optional modules** (Phase 4b) — independent, freely stackable. **Not implemented**: the state/action shapes below are scaffolding only. `createInitialState` ignores the module toggles, the setup screen doesn't offer them, `buildRolePool` refuses the Lancelot roles, the module phases are never entered, and the module actions throw. Nothing half-wired is reachable.

### Lady of the Lake
After quests 2, 3, and 4, the current LotL token holder picks one seat. The engine **privately reveals that seat's alignment** (`good` / `evil`) — never the actual role — to ONLY the investigator (`yourLadyOfTheLakeReveals`). The investigator then **publicly declares** what they saw — and can lie (declaring `good` when they saw `evil` is a legal social-deduction move; the engine doesn't validate honesty, just records the truth and the claim). The token then passes to the chosen seat. Token can't return to a prior holder (`pastHolders` enforcement) so each table-pass produces fresh information.

**Two Lancelots interaction**: if the loyalty-swap card sequence has flipped a Lancelot before LotL fires, the alignment reflects the CURRENT loyalty, not the original deal. That's the point — Lady is information from "now", not from setup.

### Excalibur
At setup, Excalibur is enabled (or not) for the whole match. Each quest, AFTER the team is approved but BEFORE quest cards are played, the **quest leader assigns the sword to a team member other than themselves**. During quest resolution, the sword holder may **flip one teammate's card** (success → fail, or fail → success), or decline. Both the flip itself and the target are public; the original card value is NEVER public. Phases gain two new states: `excaliburAssign` (between team-vote-pass and quest-execution) and `excaliburUse` (between quest cards being submitted and resolution).

**Why public flip + private original?** Because a good Excalibur holder flipping evil's fail to success is the whole point of the module — it lets good "neuter" an unproven team member — but if the original value leaked, the table would know exactly who the evil was and the module would solve the game. So we publish the flip, hide the original, and let the table reason about who'd have a reason to flip whom.

### Two Lancelots
Scaffolded only (see above). Adds `lancelotGood` + `lancelotEvil`; both see each other (uniquely among special roles). The loyalty-swap deck (5 cards, 2 swap + 3 noSwap, shuffled with seeded RNG) is dealt one per quest from quest 2 onwards. On a `swap` card, both Lancelots' alignments flip — including for the redaction model, so a Lancelot's `yourAlignment` changes mid-game. Public counter (`lancelotSwapsApplied`) lets observers know when a swap fires; which Lancelot got swapped is the deduction problem.

## Hidden info

Avalon's redaction is the cleanest of the four games — knowledge is dealt once at setup and (with two exceptions below) never changes:
- Merlin sees evils (except Mordred)
- Loyal Servants see no one
- Minions of Mordred see each other (except Oberon)
- Percival sees Merlin AND Morgana (indistinguishable)

All this lives in `roleKnowledge[seatIndex]` and is dropped into `yourRoleKnowledge` by `viewFor`. Knowledge rows are in seat order (never role order), and Percival's two entries share one label.

### The redaction chokepoint (`view.ts`)

`viewFor` lives in `view.ts` so the AI consumes exactly the view a human in that seat gets. Everything outside the `your*` slots is identical for every seat and for spectators (`view.test.ts` asserts this at every step of full games). Public: phase, names, leader, proposed team, `hasVoted` / `hasPlayedQuestCard` (who has put a token or card down, never which), quest results as fail **counts**, the completed vote log (`proposalHistory`, recorded when the last vote lands, which is when votes become public), and `rolesInPlay` (the announced character list, canonical role order). Private to the viewer: `yourRole`, `yourAlignment`, `yourRoleKnowledge`, `yourVote` (while the table is still voting), `yourQuestCard`. Never copied into any view: `seed` (the deal is a function of it), per-seat `role` / `alignment` / `questCard`.

### AI

`ai.ts` decides from `viewFor(state, seat)` only (the seed is used purely as randomness). It enumerates every evil set consistent with what the seat knows, hard-filtered by quest fail counts and soft-weighted by the public vote log. Evil coordinates without a channel (only the lowest-seat known evil fails a 1-fail quest). It never sends the seatless `ackTeamVoteReveal` / `ackQuestResolution`: those are host "Continue" controls, so humans get to watch the reveals.

### UI

`ui/turns.ts` derives "who acts next on this device" from the public view only, so the same UI works online (own seat only), solo vs AI, hot-seat (an opaque pass-the-device cover before any secret is shown, re-locked after each action) and spectating. Seat switching goes through `useSeatSwitching()`.

**Module exceptions to the "setup, immutable" rule:**
- **Lady of the Lake** dynamically adds `yourLadyOfTheLakeReveals` to the investigator's view each round it's used.
- **Two Lancelots** mutates `seat.alignment` mid-game on swap cards.
- **Excalibur** introduces a new private slot: each quest team member's `yourQuestCard` is what they SUBMITTED, but the final value after a potential Excalibur flip is public-as-resolved.

**Quest cards**: when a team member plays success/fail, the host stores it in `seat.questCard`. Only the playing seat's view exposes their own card; resolution publicly shows only the count of fails on that quest, never who played which card. The UI's reveal order (`questRevealOrder`) is built from the counts alone, so it can't be mapped back to seats. Excalibur preserves this — only the swordholder's TARGET (a seat) is public, never the per-card value.
