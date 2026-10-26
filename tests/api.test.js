// Runs the whole API against a real PostgreSQL database that is started just for the tests.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default;
const { createPool } = require('../src/db/pool');
const { applySchema } = require('../src/db/setup');
const { createApp } = require('../src/app');

let pg, pool, server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typeflow-pg-'));
  fs.chmodSync(dir, 0o777); // the test database may run as another user
  pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'test', password: 'test', port: 54329, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('typeflow_test');
  pool = createPool('postgresql://test:test@localhost:54329/typeflow_test', false);
  await applySchema(pool);
  await applySchema(pool); // running twice must be safe
  const app = createApp(pool, { jwtSecret: 'a-test-secret-that-is-long-enough-123', corsOrigins: ['http://site.test'], authLimit: 1000 });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await pg.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (method, url, body, token) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const register = (n, extra = {}) =>
  call('POST', '/auth/register', { email: `${n}@mail.test`, password: 'password123', displayName: n, ...extra });

test('health check works', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
});

test('register: good input gives a token, never the password', async () => {
  const r = await register('alice');
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.displayName, 'alice');
  assert.equal(JSON.stringify(r.body).includes('password'), false);
  const row = (await pool.query("SELECT password_hash FROM users WHERE email='alice@mail.test'")).rows[0];
  assert.notEqual(row.password_hash, 'password123');
  assert.ok(row.password_hash.startsWith('$2'));
});

test('register: bad input and duplicates are refused', async () => {
  assert.equal((await register('bob', { email: 'not-an-email' })).status, 400);
  assert.equal((await register('bob', { password: 'short' })).status, 400);
  assert.equal((await register('b', {})).status, 400);
  assert.equal((await register('alice')).status, 409);
});

test('email is not case sensitive', async () => {
  const r = await call('POST', '/auth/login', { email: 'ALICE@mail.test', password: 'password123' });
  assert.equal(r.status, 200);
});

test('login: wrong password and unknown email give the same message', async () => {
  const a = await call('POST', '/auth/login', { email: 'alice@mail.test', password: 'wrongpass1' });
  const b = await call('POST', '/auth/login', { email: 'nobody@mail.test', password: 'password123' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
});

test('protected routes need a good token', async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/progress', null, 'bad.token.here')).status, 401);
  assert.equal((await call('PUT', '/progress', { data: {} })).status, 401);
  assert.equal((await call('POST', '/scores', { wpm: 50, accuracy: 95, durationSeconds: 60 })).status, 401);
});

test('progress: save, read back, and replace', async () => {
  const { body } = await call('POST', '/auth/login', { email: 'alice@mail.test', password: 'password123' });
  const t = body.token;
  assert.deepEqual((await call('GET', '/progress', null, t)).body.data, {});
  const data = { profile: { name: 'Alice' }, goalCompletions: 3, results: [{ id: '1', wpm: 40 }], hacker: 'ignored' };
  const put = await call('PUT', '/progress', { data }, t);
  assert.equal(put.status, 200);
  assert.equal(put.body.saved, 3);
  const got = (await call('GET', '/progress', null, t)).body.data;
  assert.equal(got.goalCompletions, 3);
  assert.equal(got.results[0].wpm, 40);
  assert.equal(got.hacker, undefined);
  await call('PUT', '/progress', { data: { goalCompletions: 9 } }, t);
  assert.equal((await call('GET', '/progress', null, t)).body.data.goalCompletions, 9);
  assert.equal((await call('PUT', '/progress', { data: [1] }, t)).status, 400);
});

test('progress is private: users cannot see each other', async () => {
  const c = (await register('carol')).body.token;
  const d = (await register('dave')).body.token;
  await call('PUT', '/progress', { data: { profile: { name: 'secret-carol' } } }, c);
  const seen = (await call('GET', '/progress', null, d)).body.data;
  assert.equal(JSON.stringify(seen).includes('secret-carol'), false);
});

test('scores are checked', async () => {
  const t = (await register('erin')).body.token;
  assert.equal((await call('POST', '/scores', { wpm: 999, accuracy: 95, durationSeconds: 60 }, t)).status, 400);
  assert.equal((await call('POST', '/scores', { wpm: 50, accuracy: 120, durationSeconds: 60 }, t)).status, 400);
  assert.equal((await call('POST', '/scores', { wpm: 50, accuracy: 95, durationSeconds: 2 }, t)).status, 400);
  assert.equal((await call('POST', '/scores', { wpm: 'abc', accuracy: 95, durationSeconds: 60 }, t)).status, 400);
  assert.equal((await call('POST', '/scores', { wpm: 50, accuracy: 95, durationSeconds: 60 }, t)).status, 201);
});

test('leaderboard: best score per user, accuracy 90+ only, sorted', async () => {
  const f = (await register('frank')).body.token;
  const g = (await register('grace')).body.token;
  const h = (await register('henry')).body.token;
  await call('POST', '/scores', { wpm: 60, accuracy: 96, durationSeconds: 60 }, f);
  await call('POST', '/scores', { wpm: 70, accuracy: 97, durationSeconds: 60 }, f);
  await call('POST', '/scores', { wpm: 65, accuracy: 92, durationSeconds: 60 }, g);
  await call('POST', '/scores', { wpm: 120, accuracy: 70, durationSeconds: 60 }, h); // too many mistakes
  const r = await call('GET', '/leaderboard?limit=5');
  assert.equal(r.status, 200);
  const names = r.body.entries.map((e) => e.displayName);
  assert.equal(names.includes('henry'), false);
  assert.equal(names.filter((n) => n === 'frank').length, 1);
  assert.equal(r.body.entries.find((e) => e.displayName === 'frank').wpm, 70);
  const speeds = r.body.entries.map((e) => e.wpm);
  assert.deepEqual(speeds, [...speeds].sort((a, b) => b - a));
  assert.equal(r.body.entries[0].rank, 1);
  assert.equal(JSON.stringify(r.body).includes('@mail.test'), false); // no emails shown
});

test('delete account removes the user and all their data', async () => {
  const t = (await register('zed')).body.token;
  await call('PUT', '/progress', { data: { goalCompletions: 1 } }, t);
  await call('POST', '/scores', { wpm: 50, accuracy: 95, durationSeconds: 60 }, t);
  assert.equal((await call('DELETE', '/me', null, t)).status, 200);
  const left = await pool.query("SELECT (SELECT count(*) FROM users WHERE email='zed@mail.test') u, (SELECT count(*) FROM user_data WHERE key='goalCompletions' AND value='1'::jsonb) d");
  assert.equal(Number(left.rows[0].u), 0);
  assert.equal((await call('GET', '/me', null, t)).status, 401);
});

test('SQL injection text is treated as plain text', async () => {
  const r = await call('POST', '/auth/login', { email: "' OR 1=1 --", password: "x' OR '1'='1" });
  assert.equal(r.status, 401);
  assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count > 0, true);
});

test('big or broken bodies are refused', async () => {
  const t = (await register('ivy')).body.token;
  const big = { data: { results: 'x'.repeat(1100 * 1024) } };
  assert.equal((await call('PUT', '/progress', big, t)).status, 413);
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  assert.equal(res.status, 400);
});

test('CORS: only the listed website is allowed', async () => {
  const ok = await fetch(base + '/health', { headers: { Origin: 'http://site.test' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://site.test');
  const bad = await fetch(base + '/health', { headers: { Origin: 'http://evil.test' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('unknown address gives 404', async () => {
  assert.equal((await call('GET', '/nothing-here')).status, 404);
});
