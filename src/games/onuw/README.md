# One Night Ultimate Werewolf

Single-night social deduction. Each player gets a hidden role from a pool of `playerCount + 3` cards (the extra 3 sit face-down in the center). Roles wake in a fixed order at night and perform private actions; players then discuss during the day and lynch one player by vote.

## Scope

**Base game** ships first (Phase 1):
- Werewolf, Minion, Mason ×2, Seer, Robber, Troublemaker, Tanner, Drunk, Insomniac, Hunter, Villager ×3

**Daybreak expansion** (Phase 2):
- Doppelganger, Witch, Apprentice Seer, Paranormal Investigator, Village Idiot, Revealer, Curator, Alpha Wolf, Mystic Wolf, Dream Wolf

Each role is a self-contained file under `roles/`. The night-order list lives in `nightOrder.ts` and merges base + active-expansion role IDs.

## Hidden info

- Dealt roles are never broadcast — they live in `OnuwPrivateState.seats[i].dealtRole`/`finalRole` and only enter `OnuwPublicState.yourRole` when the view is redacted for that exact seat.
- Night observations (`yourObservation`) are the same: a Seer who peeks Seat 2 sees Seat 2's role in their own private view; nobody else's view contains that observation.
- During day phase, the only public info is "who voted yet" — not what each person voted (votes resolve simultaneously at the end of the timer).

## Why ONUW first

Smallest action surface of the four games and the most constrained timeline (one night). Good shakedown for the redaction model before tackling Coup's larger action space or Avalon's nested mission structure.
