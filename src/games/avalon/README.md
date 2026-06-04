# The Resistance: Avalon

5-10 player team-based social deduction. Good (Loyal Servants of Arthur) and evil (Minions of Mordred) compete across 5 quests. Each quest's leader proposes a team; the whole table votes to approve or reject. If approved, team members privately play a success or fail card. Three successful quests = good wins (then the Assassin gets one shot at identifying Merlin). Three failed quests OR 5 rejected proposals in a row = evil wins.

## Scope

**Base box** ships first (Phase 4):
- Required: Merlin, Assassin
- Optional: Percival, Morgana, Mordred, Oberon
- Recommended toggle: Two Lancelots (with the Lancelot loyalty-swap card deck)

## Hidden info

Avalon's redaction is the cleanest of the four — knowledge is dealt once at setup and never changes:
- Merlin sees evils (except Mordred)
- Loyal Servants see no one
- Minions of Mordred see each other (except Oberon)
- Percival sees Merlin AND Morgana (indistinguishable)

All this lives in `roleKnowledge[seatIndex]` and is dropped into `yourRoleKnowledge` by `viewFor`. Other seats' knowledge never appears in their view.

**Quest cards**: when a team member plays success/fail, the host stores it in `seat.questCard`. Only the playing seat's view exposes their own card; the resolution publicly shows only the count of fails on that quest, never who played which card.
