// Public surface of the net layer. The Firebase transport itself
// (`firebaseRoom.ts`) is imported lazily by networkStore so the SDK only
// downloads when someone goes online.
export { getDisplayName, setDisplayName, freshTabMode, generateRoomCode, normalizeRoomCode } from './identity';
export { roomFromUrl, setRoomInUrl, inviteLink } from './roomLink';
export { ServerUnreachableError } from './transport';
export type {
  RoomTransport,
  HostConnection,
  GuestConnection,
  HostEvents,
  GuestEvents,
} from './transport';
export type {
  LobbyState,
  ChatMessage,
  ConnectionState,
  LocalRole,
  Presence,
  RoomMeta,
  InboxMessage,
  ViewRecord,
  SavedHostState,
  AnyPublicEnvelope,
} from './types';
