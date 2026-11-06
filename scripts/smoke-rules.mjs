// Live check of the deployed security rules: run `node scripts/smoke-rules.mjs`
// after `npm run deploy:rules`. Signs in two anonymous "devices" (host and
// guest) plus an outsider, creates a throwaway room under /social-deduction,
// and asserts the hidden-information guarantees hold on the real server:
//
//   - a guest can read its own view but NOT another player's view,
//   - a guest can't read the host's saved state or the inbox,
//   - a guest can't write the lobby or views, or post to the inbox as someone else,
//   - nobody can read the whole room in one go.
//
// The room is deleted at the end (also on failure). Exit code 1 on any failure.

import { deleteApp, initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, goOffline, push, ref, remove, serverTimestamp, set, update } from 'firebase/database';

const CONFIG = {
  apiKey: 'AIzaSyAmAirzwcz926PyKh-bfUUIn7OSkcve6tI',
  authDomain: 'github-games-e7c7d.firebaseapp.com',
  databaseURL: 'https://github-games-e7c7d-default-rtdb.firebaseio.com',
  projectId: 'github-games-e7c7d',
  appId: '1:879254296864:web:81f2d4d06e58c5478f1f45',
};
const ROOT = 'social-deduction';

async function device(name) {
  const app = initializeApp(CONFIG, name);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const { user } = await signInAnonymously(auth);
  return { app, db: getDatabase(app), uid: user.uid };
}

let failures = 0;
async function expectOk(what, p) {
  try {
    await p;
    console.log(`  ok    ${what}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL  ${what}: expected success, got ${e.code ?? e.message}`);
  }
}
async function expectDenied(what, p) {
  try {
    await p;
    failures++;
    console.log(`  FAIL  ${what}: expected permission denied, but it succeeded`);
  } catch (e) {
    if (/permission.denied/i.test(`${e.code} ${e.message}`)) console.log(`  ok    ${what} (denied)`);
    else {
      failures++;
      console.log(`  FAIL  ${what}: unexpected error ${e.code ?? e.message}`);
    }
  }
}

const code = `Z${Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'Q')}`.slice(0, 5);
const host = await device('host');
const guest = await device('guest');
const other = await device('other');
const base = `${ROOT}/rooms/${code}`;
console.log(`room ${code}: host ${host.uid.slice(0, 6)}…, guest ${guest.uid.slice(0, 6)}…, other ${other.uid.slice(0, 6)}…`);

try {
  console.log('setup');
  await expectOk(
    'host creates the room',
    update(ref(host.db, ROOT), {
      [`rooms/${code}`]: {
        meta: { hostUid: host.uid, createdAt: serverTimestamp(), build: 'smoke', v: 1 },
        lobby: JSON.stringify({ gameId: 'skull', seats: [], gameOptions: {}, inGame: true, match: 1 }),
      },
    }),
  );
  await expectDenied(
    'someone else overwrites the room',
    set(ref(guest.db, base), { meta: { hostUid: guest.uid, createdAt: 0, build: 'x', v: 1 }, lobby: '{}' }),
  );
  await expectOk(
    'host writes per-device views + saved state atomically',
    update(ref(host.db, base), {
      [`views/${guest.uid}`]: JSON.stringify({ match: 1, env: { yourSecret: 'GUEST-SECRET' } }),
      [`views/${other.uid}`]: JSON.stringify({ match: 1, env: { yourSecret: 'OTHER-SECRET' } }),
      host: JSON.stringify({ state: 'HOST-PRIVATE' }),
    }),
  );

  console.log('reads');
  await expectOk('guest reads meta', get(ref(guest.db, `${base}/meta`)));
  await expectOk('guest reads lobby', get(ref(guest.db, `${base}/lobby`)));
  const own = await get(ref(guest.db, `${base}/views/${guest.uid}`));
  if (!String(own.val()).includes('GUEST-SECRET')) {
    failures++;
    console.log('  FAIL  guest reads its own view: wrong content');
  } else console.log('  ok    guest reads its own view');
  await expectDenied("guest reads another player's view", get(ref(guest.db, `${base}/views/${other.uid}`)));
  await expectDenied('guest lists all views', get(ref(guest.db, `${base}/views`)));
  await expectDenied('guest reads the whole room', get(ref(guest.db, base)));
  await expectDenied("guest reads the host's saved state", get(ref(guest.db, `${base}/host`)));
  await expectDenied('guest reads the inbox', get(ref(guest.db, `${base}/inbox`)));
  await expectOk("host reads its saved state", get(ref(host.db, `${base}/host`)));

  console.log('writes');
  await expectDenied('guest writes the lobby', set(ref(guest.db, `${base}/lobby`), '{}'));
  await expectDenied('guest writes a view', set(ref(guest.db, `${base}/views/${guest.uid}`), '{"x":1}'));
  await expectDenied('guest rewrites meta.hostUid', set(ref(guest.db, `${base}/meta/hostUid`), guest.uid));
  await expectOk('guest posts to the inbox as itself', push(ref(guest.db, `${base}/inbox`), { uid: guest.uid, p: '{"kind":"seat","desiredSeat":1}' }));
  await expectDenied('guest posts to the inbox as someone else', push(ref(guest.db, `${base}/inbox`), { uid: other.uid, p: '{}' }));
  await expectOk('host reads + consumes the inbox', get(ref(host.db, `${base}/inbox`)).then((s) => {
    const jobs = [];
    s.forEach((c) => {
      jobs.push(remove(c.ref));
    });
    return Promise.all(jobs);
  }));
  await expectOk('guest chats as itself', push(ref(guest.db, `${base}/chat`), { uid: guest.uid, name: 'g', text: 'hi', at: serverTimestamp() }));
  await expectDenied('guest chats as someone else', push(ref(guest.db, `${base}/chat`), { uid: other.uid, name: 'o', text: 'hi', at: serverTimestamp() }));
  await expectDenied('guest deletes the room', remove(ref(guest.db, base)));
} finally {
  await remove(ref(host.db, base)).catch((e) => console.log('cleanup failed:', e.message));
  for (const d of [host, guest, other]) {
    goOffline(d.db);
    await deleteApp(d.app);
  }
}

console.log(failures === 0 ? '\nAll rules checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
