import type { GameId, GameModule } from './types';
import { onuwModule } from '@/games/onuw';
import { secretHitlerModule } from '@/games/secret-hitler';
import { avalonModule } from '@/games/avalon';
import { coupModule } from '@/games/coup';

// Central registry of every game module the app knows how to play. The
// HomeMenu reads `GAMES` to render the picker; the host's `bindGame`
// looks up the module by id when starting a new match.
//
// Adding a new game = add a folder under `src/games/<id>/`, implement
// `GameModule`, and append it here. No conditionals elsewhere.
//
// `unknown, unknown, unknown` parameterization is intentional — the engine
// layer is agnostic to per-game state shapes. Each module is consumed
// through its own typed entry point inside its directory.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<GameId, GameModule<any, any, any>> = {
  onuw: onuwModule,
  'secret-hitler': secretHitlerModule,
  avalon: avalonModule,
  coup: coupModule,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGame(id: GameId): GameModule<any, any, any> {
  const mod = GAMES[id];
  if (!mod) throw new Error(`Unknown game id: ${id}`);
  return mod;
}
