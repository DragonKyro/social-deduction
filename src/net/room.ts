import { joinRoom, type Room } from 'trystero/torrent';
import type {
  AnyActionEnvelope,
  AnyPublicEnvelope,
  ChatMessage,
  HelloMessage,
  LobbyState,
  SeatRequestMessage,
  SnapshotMessage,
  SnapshotRequestMessage,
  StartMessage,
} from './types';

const APP_ID = 'social-deduction-v1';

export interface RoomBindings {
  room: Room;
  sendHello: (msg: HelloMessage, target?: string) => void;
  recvHello: (cb: (msg: HelloMessage, peerId: string) => void) => void;
  sendLobby: (state: LobbyState, target?: string) => void;
  recvLobby: (cb: (state: LobbyState, peerId: string) => void) => void;
  sendSeatRequest: (msg: SeatRequestMessage) => void;
  recvSeatRequest: (cb: (msg: SeatRequestMessage, peerId: string) => void) => void;
  sendStart: (msg: StartMessage, target: string) => void;
  recvStart: (cb: (msg: StartMessage, peerId: string) => void) => void;
  sendAction: (envelope: AnyActionEnvelope) => void;
  recvAction: (cb: (envelope: AnyActionEnvelope, peerId: string) => void) => void;
  sendView: (envelope: AnyPublicEnvelope, target: string) => void;
  recvView: (cb: (envelope: AnyPublicEnvelope, peerId: string) => void) => void;
  sendSnapshotRequest: (msg: SnapshotRequestMessage, target?: string) => void;
  recvSnapshotRequest: (cb: (msg: SnapshotRequestMessage, peerId: string) => void) => void;
  sendSnapshot: (msg: SnapshotMessage, target: string) => void;
  recvSnapshot: (cb: (msg: SnapshotMessage, peerId: string) => void) => void;
  sendChat: (msg: ChatMessage) => void;
  recvChat: (cb: (msg: ChatMessage, peerId: string) => void) => void;
  onPeerJoin: (cb: (peerId: string) => void) => void;
  onPeerLeave: (cb: (peerId: string) => void) => void;
  leave: () => void;
}

// Create or join a Trystero room using room-code as password for E2E
// encryption (peers without the code can't decrypt traffic even on the
// same BT tracker). Same identity escape hatch (`?fresh`) lives in
// `identity.ts`.
//
// NOTE: unlike Catan's full-replication model, this app uses TWO different
// channels for game traffic:
//   - `action` — peer → host. Peer's intent envelope.
//   - `view`   — host → peer (individually addressed). Per-seat redacted view.
// Peers NEVER send `view`. Host validates every action before applying.
export function bindRoom(roomCode: string): RoomBindings {
  const room = joinRoom({ appId: APP_ID, password: roomCode }, roomCode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyData = any;
  const [sendHello, recvHello] = room.makeAction<AnyData>('hello');
  const [sendLobby, recvLobby] = room.makeAction<AnyData>('lobby');
  const [sendSeatRequest, recvSeatRequest] = room.makeAction<AnyData>('seatReq');
  const [sendStart, recvStart] = room.makeAction<AnyData>('start');
  const [sendAction, recvAction] = room.makeAction<AnyData>('action');
  const [sendView, recvView] = room.makeAction<AnyData>('view');
  const [sendSnapshotRequest, recvSnapshotRequest] = room.makeAction<AnyData>('snapReq');
  const [sendSnapshot, recvSnapshot] = room.makeAction<AnyData>('snap');
  const [sendChat, recvChat] = room.makeAction<AnyData>('chat');

  return {
    room,
    sendHello: (m, t) => void sendHello(m as never, t),
    recvHello: (cb) => recvHello((data, peerId) => cb(data as HelloMessage, peerId)),
    sendLobby: (s, t) => void sendLobby(s as never, t),
    recvLobby: (cb) => recvLobby((data, peerId) => cb(data as LobbyState, peerId)),
    sendSeatRequest: (m) => void sendSeatRequest(m as never),
    recvSeatRequest: (cb) =>
      recvSeatRequest((data, peerId) => cb(data as SeatRequestMessage, peerId)),
    sendStart: (m, t) => void sendStart(m as never, t),
    recvStart: (cb) => recvStart((data, peerId) => cb(data as StartMessage, peerId)),
    sendAction: (e) => void sendAction(e as never),
    recvAction: (cb) =>
      recvAction((data, peerId) => cb(data as AnyActionEnvelope, peerId)),
    sendView: (e, t) => void sendView(e as never, t),
    recvView: (cb) => recvView((data, peerId) => cb(data as AnyPublicEnvelope, peerId)),
    sendSnapshotRequest: (m, t) => void sendSnapshotRequest(m as never, t),
    recvSnapshotRequest: (cb) =>
      recvSnapshotRequest((data, peerId) => cb(data as SnapshotRequestMessage, peerId)),
    sendSnapshot: (m, t) => void sendSnapshot(m as never, t),
    recvSnapshot: (cb) => recvSnapshot((data, peerId) => cb(data as SnapshotMessage, peerId)),
    sendChat: (m) => void sendChat(m as never),
    recvChat: (cb) => recvChat((data, peerId) => cb(data as ChatMessage, peerId)),
    onPeerJoin: (cb) => room.onPeerJoin(cb),
    onPeerLeave: (cb) => room.onPeerLeave(cb),
    leave: () => room.leave(),
  };
}
