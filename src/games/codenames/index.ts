export { codenamesModule } from './module';
export type { CodenamesOptions, CodenamesSeatConfig } from './module';
export type { CodenamesAction } from './actions';
export type {
  CodenamesPrivateState,
  CodenamesPublicState,
  CodenamesPublicCard,
  CodenamesPublicSeatState,
  CodenamesCard,
  CodenamesSeatState,
  CodenamesClue,
  CodenamesClueRecord,
  CodenamesGuessRecord,
  CodenamesPhase,
  CardKind,
  TeamColor,
} from './state';
export { buildBoard, pickStartingTeam, GRID_SIZE } from './setup';
// Word packs are shared with Cross Clues. Re-exported here so existing
// imports under `@/games/codenames` keep working.
export {
  WORD_PACKS,
  WORD_PACK_LIST,
  buildPoolFromPacks,
  CLASSIC_WORDS,
} from '@/words';
export type { WordPackId, WordPack } from '@/words';
