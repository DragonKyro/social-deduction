# One Night Ultimate Werewolf

Single-night social deduction. Each player gets a hidden role from a pool of `playerCount + 3` cards (the extra 3 sit face-down in the center). Roles wake in a fixed order at night and perform private actions; players then discuss during the day and lynch one player by vote.

## Scope

**Base game** ships first (Phase 1):
- Werewolf ×2, Minion, Mason ×2, Seer, Robber, Troublemaker, Tanner, Drunk, Insomniac, Hunter, Villager ×3

**Daybreak expansion** (Phase 2):
- Doppelganger, Witch, Apprentice Seer, Paranormal Investigator, Village Idiot, Revealer, Curator, Alpha Wolf, Mystic Wolf, Dream Wolf

**Bonus Roles pack** (Phase 2b) — consolidated Bonus Packs 1-4:
- Aura Seer, Cursed, Prince, Apprentice Tanner, Beholder, Thing, Squire, Body Snatcher, Empath, Nostradamus, Family Man, Windy Wendy, Defender-er, The Sponge, Ricochet Rhino, Innocent Bystander (16 roles)
- 6 artifact tokens: Bow of the Hunter, Cloak of the Prince, Sword of the Bodyguard, Mist of the Vampire, Dagger of the Traitor, Alien Artifact
- 2 extra player number tokens (#11, #12) so games can scale to 12 seats with the right role count

The Bonus Roles pack is purely additive — every role plugs into the same night-order engine; no new phase, no new action class beyond what base + Daybreak introduced. Artifacts are a generic seat-bound token system; only some roles care about them (Prince needs the Cloak; Hunter is more interesting with the Bow), but artifact ownership is independent of role and the engine surfaces it in `OnuwPublicSeatState.artifacts`.

### Role file layout

Each role is a self-contained file under `roles/` exporting:
- `wakeOrder: number` — the canonical night-step index
- `nightAction: (state, seat) => state` — apply this role's night step
- (optional) `requiresArtifact: OnuwArtifactId` — Prince's Cloak gating, etc.
- (optional) `dayEffect(state, seat) => state` — Family Man's neighbor-werewolf payoff, etc.
- (optional) `voteEffect(state, seat) => state` — Cursed's "becomes werewolf if voted", Ricochet Rhino's vote bounce

The night-order list lives in `nightOrder.ts` and unions the active packs' role IDs. There are NO `if (rolePool.includes('windyWendy'))` branches in the engine — every role registers via its own file.

## Hidden info

- **Roles** are never broadcast — they live in `OnuwPrivateState.seats[i].dealtRole`/`finalRole` and only enter `OnuwPublicState.yourRole` when the view is redacted for that exact seat.
- **Night observations** (`yourObservation`) are the same: a Seer who peeks Seat 2 sees Seat 2's role in their own private view; nobody else's view contains that observation.
- **Artifact ownership is PUBLIC** — matches the Bezier intent; the artifact is a flavor token, the role that needs it (e.g. Prince) stays hidden. So an opponent sees "Seat 3 has the Cloak" without learning Seat 3's role.
- During day phase, the only public info beyond artifacts is "who voted yet" — not what each person voted (votes resolve simultaneously at the end of the timer).

## Why ONUW first

Smallest action surface of the four games and the most constrained timeline (one night). Good shakedown for the redaction model before tackling Coup's much larger action space or Avalon's nested mission structure.

## Bonus Roles caveats

A few Bonus Roles roles assume mechanics from sister games in the One Night series (Vampire, Alien, Super Villains) — e.g. Body Snatcher's "takes their team" only matters when teams beyond village/werewolves/tanner exist. We honor the rule for werewolf-team swaps and treat other team conversions as no-ops with a logged note. The full sister-game roster is not on the roadmap.
