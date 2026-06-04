// ============================================================================
// Cross-game engine types
//
// Every game (One Night Werewolf, Secret Hitler, Avalon, Coup) implements
// the same engine contract. The host holds the full `PrivateState` (which
// contains hidden roles, drawn cards, night actions, etc.) and produces a
// per-seat `PublicView` for each peer. Peers only ever see their own
// `PublicView` — they never receive other players' hidden information.
// ============================================================================

export type GameId = 'onuw' | 'secret-hitler' | 'avalon' | 'coup';

export type PlayerId = string; // stable UUID, persistent in localStorage

export type SeatIndex = number;

export interface Seat {
  index: SeatIndex;
  uuid: PlayerId | null; // null = open / AI seat
  name: string;
  isAI: boolean;
}

// Identifier for the host-authoritative tick of state. Peers reject stale
// snapshots with `tick < currentTick`. Incremented on every applied action.
export type StateTick = number;

// ============================================================================
// Engine contract — implemented per game in `src/games/<id>/`
// ============================================================================

// `Private` is the host-only god state. `Public` is the redacted per-seat view
// the host sends to each peer. `Action` is the union of all moves a seat
// (human or AI) can dispatch. The engine never assumes anything about their
// shape beyond what's declared here, so games can model their state however
// they like (timers, decks, role assignments) as long as redaction is correct.
export interface GameModule<Private, Public, Action> {
  readonly id: GameId;
  readonly displayName: string;

  readonly minPlayers: number;
  readonly maxPlayers: number;

  // Build initial host state from the lobby config (roles selected, seed,
  // seat list). Pure — no DOM / no network / no React.
  createInitialState(config: GameConfig): Private;

  // Apply an action to the host state. Returns the next state. Throws if the
  // action is illegal (the host validates before broadcasting the new view).
  applyAction(state: Private, action: Action, byUuid: PlayerId): Private;

  // Redact the host state into the view a specific seat is allowed to see.
  // CRITICAL: this is the single chokepoint that prevents hidden-info leaks.
  // The host must call this with `seat = null` for spectators.
  viewFor(state: Private, seat: SeatIndex | null): Public;

  // Returns true when the game has ended. Used by the host to transition
  // out of in-game mode.
  isFinished(state: Private): boolean;

  // Per-game default vote / role config served to the lobby UI.
  defaultConfig(playerCount: number): GameConfig;

  // Step the AI for a given seat. Returns the next action or null if the AI
  // has nothing to do (e.g. it isn't this seat's turn / vote / night step).
  // AIs run on the host only — peers receive results via the public view.
  aiChooseAction?(state: Private, seat: SeatIndex): Action | null;
}

// ============================================================================
// Lobby + config
// ============================================================================

// Shared lobby/setup config. Each game extends `roles` (or whichever
// per-game knob it cares about) inside `gameOptions`.
export interface GameConfig {
  gameId: GameId;
  seats: Seat[];
  seed: number;
  // Game-specific knobs: ONUW role pool, Secret Hitler rule variants, Avalon
  // role selections, Coup expansions, etc. Each module owns the shape.
  gameOptions: Record<string, unknown>;
}

// ============================================================================
// Public-view envelope shared by all games
//
// Wraps the per-game `Public` payload with metadata every UI/peer needs.
// ============================================================================

export interface PublicEnvelope<Public> {
  gameId: GameId;
  tick: StateTick;
  view: Public;
  // The seat this view was redacted FOR. Peers use this to drop snapshots
  // that aren't addressed to them (host should never send other seats'
  // views to a peer, but defense in depth).
  seat: SeatIndex | null;
}

// ============================================================================
// Action envelope (peer → host)
// ============================================================================

export interface ActionEnvelope<Action> {
  action: Action;
  byUuid: PlayerId;
  // Echoes the seat the sender believes they hold. Host verifies this
  // matches its lobby record before applying — prevents seat-spoofing.
  bySeat: SeatIndex;
}
