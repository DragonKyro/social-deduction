# One Night Ultimate Werewolf

Single-night social deduction. Each player gets a hidden role from a pool of `playerCount + 3` cards (the extra 3 sit face-down in the center). Roles wake in a fixed order at night and perform private actions; players then discuss during the day and kill one player by vote.

## Scope

- **Base game**: Werewolf ×2, Minion, Mason ×2, Seer, Robber, Troublemaker, Tanner, Drunk, Insomniac, Hunter, Villager ×3
- **Daybreak**: Doppelganger, Witch, Apprentice Seer, Paranormal Investigator, Village Idiot, Revealer, Curator, Alpha Wolf, Mystic Wolf, Dream Wolf
- **Bonus roles** (consolidated packs): Aura Seer, Cursed, Prince, Apprentice Tanner, Beholder, Thing, Squire, Body Snatcher, Empath, Nostradamus, Family Man, Windy Wendy, Defender-er, The Sponge, Ricochet Rhino, Innocent Bystander

## Files

- `state.ts` — private host state + public view types. `actions.ts` — action union.
- `roles.ts` — static role metadata (team, wake order, Doppelganger mode, mandatory flag, descriptions), werewolf-card sets, recommended pools.
- `setup.ts` — pool validation, deal, night schedule. `night.ts` — every night-action helper. `resolve.ts` — votes + win conditions.
- `view.ts` — `viewFor`, the redaction chokepoint (also used by the AI). `module.ts` — `applyAction` validation + dispatch. `ai.ts` — the AI.
- `ui/` — `GameView` (screens), `RoleArt` (cards / back / medallions), `Sky` (animated backdrop), `OnuwSetup`.

## Cards: printed vs effective

Each position holds a card with a **printed** face (`finalCard` / `card`) and an **effective** role (`finalRole` / `role`). They differ only after a transformation — the Doppelganger card becomes the copied role, a Paranormal Investigator who saw a werewolf becomes a werewolf — and the transformation travels with the card. Looking at a card shows the printed face; teams and win conditions use the effective role.

## Night

- The schedule is built from the **whole role pool**, not the dealt seats, so its shape never depends on which roles are in the center. Steps for center-only roles have no seats and resolve silently.
- All awake werewolves (Werewolf, Alpha, Mystic) share one wake step; Dream Wolf sleeps but is seen. A wolf who sees no other werewolf is a lone wolf and may look at one center card.
- **Doppelganger** (official timing): copies of Seer / Robber / Troublemaker / Drunk / Witch / PI / … act immediately; copies of Werewolf / Minion / Mason (and Squire, Beholder, Empath) wake with that role; copies of Insomniac / Revealer / Curator / Aura Seer wake again right after the original.
- Mandatory actions (a pass is rejected): Doppelganger, Drunk, The Thing, Alpha Wolf (unless there is no non-werewolf to convert). The Witch, once she has looked at a center card, must hand it out.

## Voting and winning

Official rules: most votes die, ties all die, nobody dies if no one has more than one vote; Hunter takes their vote target. Village wins if a werewolf dies (or no player is a werewolf and nobody dies); werewolf team wins if a werewolf is in play and none dies, unless a Tanner died; with no werewolf in play the werewolf team (e.g. Minion) wins if someone else dies. Tanner wins if killed (and the village can win alongside). Minion / Squire / Rhino are werewolf **team** but not werewolves. Results are per seat (`winners`) plus `winningTeams`.

## Hidden info

- A seat's view holds only its dealt card, its own observations, its own vote, and — only while it is that seat's turn — `yourNightStep` (the role it is acting as). Its current card (`yourFinalRole`) appears only after the vote.
- Nothing about the night schedule is public: no step index, no "who is awake", no step count. The spectator view is identical for the whole night.
- Votes stay secret until resolution; only "has voted" is public.
- Public from daybreak: cards the Revealer left face-up. After the vote: everything.
- The RNG seed is host-only.
- Pass-and-play UI: the shared screen always renders the spectator view; a player's private screen opens behind a curtain and the device goes round the table every night step-cycle regardless of who is awake.

## House variants / simplifications

- Squire sees which positions hold a werewolf card (incl. center); Aura Seer counts the other players who woke; Empath counts werewolf cards among neighbors; Cursed counts as a werewolf when killed.
- Curator, Defender-er, Nostradamus and The Sponge are narrated / honor-system only (artifacts are flavor). The Sponge scores as village.
- Alpha Wolf's displaced card goes to a separate "alpha center" slot shown at the end.
- `allowNoLynch: false` (not exposed in the setup UI) kills a tie of single votes.
