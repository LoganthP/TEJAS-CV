import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, context = {}) {
  const source = fs.readFileSync(new URL(`../src/api/${file}.ts`, import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_API_URL', 'globalThis.configuredApiUrl');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, ...context };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports;
}

function clientHarness(fetch) {
  const values = new Map([['tejas_auth_token', 'current-session']]);
  const events = [];
  const context = {
    Headers, FormData, AbortController, performance, setTimeout, clearTimeout, fetch,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    window: { location: { origin: 'https://tejas.example', pathname: '/assets' }, dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  return { client: load('client', context), values, events, context };
}

test('resource 401 requests a session check without deleting the token or redirecting', async () => {
  const h = clientHarness(async () => new Response('{"detail":"login required"}', { status: 401, headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(h.client.request('/api/assets'), error => error.status === 401);
  assert.equal(h.values.get('tejas_auth_token'), 'current-session');
  assert.equal(h.context.window.location.href, undefined);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].detail.token, 'current-session');
});

test('a 401 for an older request does not invalidate a newly logged-in session', async () => {
  let reply;
  const h = clientHarness(() => new Promise(resolve => { reply = resolve; }));
  const request = h.client.request('/api/assets');
  h.values.set('tejas_auth_token', 'new-session');
  reply(new Response('unauthorized', { status: 401 }));
  await assert.rejects(request, error => error.status === 401);
  assert.equal(h.values.get('tejas_auth_token'), 'new-session');
  assert.equal(h.events.length, 0);
});

test('an HTML success response is rejected instead of entering application state', async () => {
  const h = clientHarness(async () => new Response('<html>Frontend fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(h.client.request('/api/assets'), error => error.status === 502);
});

test('plain-text errors are readable and network failures are not retried', async () => {
  const h = clientHarness(async () => new Response('Backend unavailable', { status: 503 }));
  await assert.rejects(h.client.request('/api/assets'), error => error.status === 503 && error.message === 'Backend unavailable');
  let calls = 0;
  const offline = clientHarness(async () => { calls++; throw new Error('offline'); });
  await assert.rejects(offline.client.request('/api/jobs', { method: 'POST' }), error => error.status === 0);
  assert.equal(calls, 1);
  assert.equal(offline.values.get('tejas_auth_token'), 'current-session');
});

function sessionHarness(getMe) {
  let token = 'old-session';
  let cleared = 0;
  const api = load('session', { require: name => name === './client' ? {
    getAuthToken: () => token,
    clearAuthToken: () => { token = null; cleared++; },
  } : { getMe } });
  return { ...api, changeToken: value => { token = value; }, token: () => token, cleared: () => cleared };
}

test('a backend outage preserves the session token', async () => {
  const error = Object.assign(new Error('Unavailable'), { status: 503 });
  const h = sessionHarness(async () => { throw error; });
  await assert.rejects(h.loadSession(), error);
  assert.equal(h.token(), 'old-session');
  assert.equal(h.cleared(), 0);
});

test('confirmed expiry clears the current session', async () => {
  const h = sessionHarness(async () => { throw Object.assign(new Error('expired'), { status: 401 }); });
  assert.equal(await h.loadSession(), null);
  assert.equal(h.cleared(), 1);
});

for (const oldResponse of ['success', 'unauthorized']) {
  test(`a stale ${oldResponse} session check reloads the newer user`, async () => {
    let finish, calls = 0;
    const newer = { id: 'new-user' };
    const h = sessionHarness(() => {
      calls++;
      if (calls > 1) return Promise.resolve(newer);
      return new Promise((resolve, reject) => { finish = () => oldResponse === 'success'
        ? resolve({ id: 'old-user' }) : reject(Object.assign(new Error('expired'), { status: 401 })); });
    });
    const check = h.loadSession();
    h.changeToken('new-session');
    finish();
    assert.equal(await check, newer);
    assert.equal(h.token(), 'new-session');
    assert.equal(h.cleared(), 0);
  });
}

test('dataset XHR uploads include bearer authentication and reject HTML', async () => {
  let xhr;
  class FakeXHR {
    headers = {};
    constructor() { xhr = this; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send() {}
  }
  const { client } = clientHarness(async () => {});
  const endpoints = load('endpoints', { XMLHttpRequest: FakeXHR, require: () => client });
  const upload = endpoints.uploadDatasetXHR(new FormData());
  assert.equal(xhr.headers.Authorization, 'Bearer current-session');
  assert.equal(xhr.url, '/api/assets/datasets');
  xhr.status = 200;
  xhr.responseText = '<html>wrong route</html>';
  xhr.onload();
  await assert.rejects(upload, error => error.status === 502);
});
