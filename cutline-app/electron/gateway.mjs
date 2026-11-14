// The built-in free LLM gateway: FreeLLMAPI (MIT, bundled by scripts/bundle-freellm.mjs into resources/freellmapi/server.mjs) runs inside
// OmniMotion's own process, on 127.0.0.1 only, started the first time free models are needed and stopped when the app quits.
// Its database lives in OmniMotion's data folder; the key that encrypts the provider keys it stores is kept in OmniMotion's secure storage.
// Nothing is installed or changed on the computer: users only paste the free keys they get from each provider.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {app} from 'electron';
import {getSecret, setSecret} from './store.mjs';
import {appDir} from './paths.mjs';

// the providers we suggest, best first for this app's work (official key pages from FreeLLMAPI's own dashboard)
export const SUGGESTED = [
  {platform: 'google', name: 'Google AI Studio (Gemini)', url: 'https://aistudio.google.com/apikey', good: 'Sees pictures (hooks, frames, references) and reads long context. Free Flash quotas are small per day.', note: 'Free-tier prompts may be used by Google to improve its products.'},
  {platform: 'groq', name: 'Groq', url: 'https://console.groq.com/keys', good: 'Very fast and the most generous daily free requests: scripts, plans and edits.', note: 'Small tokens-per-minute limit: long jobs wait for it.'},
  {platform: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/keys', good: 'Many free models in one key, including coding models with very long context.', note: 'About 50 free requests a day (more after a small top-up).'},
  {platform: 'mistral', name: 'Mistral', url: 'https://console.mistral.ai/api-keys/', good: 'Free experiment tier with Codestral and Devstral (code).', note: 'Allowance shown only in your account.'},
  {platform: 'zhipu', name: 'Z.ai (GLM)', url: 'https://z.ai/manage-apikey/apikey-list', good: 'Free Flash models, including one that sees pictures.', note: ''},
  {platform: 'nvidia', name: 'NVIDIA NIM', url: 'https://build.nvidia.com/settings/api-keys', good: 'Free access to several large open models.', note: ''},
  {platform: 'cerebras', name: 'Cerebras', url: 'https://cloud.cerebras.ai', good: 'Very fast large models.', note: 'Now reported as a trial that asks for a card.'},
];

const serverFile = () => {
  const packed = app.isPackaged ? path.join(process.resourcesPath, 'freellmapi', 'server.mjs') : null;
  return packed && fs.existsSync(packed) ? packed : path.join(appDir, 'resources', 'freellmapi', 'server.mjs');
};
export const gatewayAvailable = () => fs.existsSync(serverFile());

let state = null; // {mod, server, port, key}
let starting = null;

// the key that encrypts provider keys at rest: made once per computer, kept in secure storage
const encryptionKey = () => {
  let k = getSecret('freellm-enc');
  if (!k || !/^[0-9a-f]{64}$/i.test(k)) {
    k = crypto.randomBytes(32).toString('hex');
    setSecret('freellm-enc', k);
  }
  return k;
};

export const startGateway = async () => {
  if (state) return state;
  if (starting) return starting;
  starting = (async () => {
    if (!gatewayAvailable()) throw new Error('The built-in free model gateway is missing from this build of OmniMotion.');
    const dir = path.join(app.getPath('userData'), 'freellmapi');
    const client = path.join(dir, 'client');
    fs.mkdirSync(client, {recursive: true});
    // the server reads these from the environment; set before it loads (this process only)
    process.env.FREEAPI_ENV_PATH = path.join(dir, 'none.env');
    process.env.ENCRYPTION_KEY = encryptionKey();
    if (process.env.NODE_ENV === 'development') delete process.env.NODE_ENV; // its dev mode skips database setup
    const mod = await import(pathToFileURL(serverFile()).href);
    const {server, port} = await mod.startServer({dbPath: path.join(dir, 'freellmapi.db'), clientDist: client, host: '127.0.0.1', preferredPort: 31470});
    state = {mod, server, port, key: mod.getUnifiedApiKey()};
    return state;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
};

export const stopGateway = () => {
  if (!state) return;
  try {
    state.server.close();
    state.server.closeAllConnections?.();
  } catch {
    // already closed
  }
  state = null;
};

export const gatewayBackend = async () => {
  const s = await startGateway();
  return {base: `http://127.0.0.1:${s.port}`, key: s.key};
};

// the gateway's own admin API, as the machine user (its desktop app does the same)
const admin = async (method, url, body) => {
  const s = await startGateway();
  const token = s.mod.ensureSessionToken();
  const r = await fetch(`http://127.0.0.1:${s.port}${url}`, {method, headers: {authorization: `Bearer ${token}`, ...(body ? {'content-type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Gateway error ${r.status}`);
  return j;
};

// what the Free models page shows: the suggested providers, with the keys added to each (masked)
export const gatewayStatus = async () => {
  const s = await startGateway();
  const keys = await admin('GET', '/api/keys');
  const list = Array.isArray(keys) ? keys : keys.keys || [];
  const models = await fetch(`http://127.0.0.1:${s.port}/v1/models`, {headers: {authorization: `Bearer ${s.key}`}})
    .then((r) => r.json())
    .catch(() => ({}));
  const usable = new Set(list.filter((k) => k.enabled && k.status !== 'invalid').map((k) => k.platform));
  return {
    running: true,
    port: s.port,
    providers: SUGGESTED.map((p) => ({...p, keys: list.filter((k) => k.platform === p.platform).map((k) => ({id: k.id, masked: k.maskedKey, status: k.status, enabled: k.enabled}))})),
    otherKeys: list.filter((k) => !SUGGESTED.some((p) => p.platform === k.platform)).map((k) => ({id: k.id, platform: k.platform, masked: k.maskedKey, status: k.status})),
    usablePlatforms: [...usable],
    models: Array.isArray(models.data) ? models.data.length : 0,
  };
};

export const addGatewayKey = async (platform, key) => {
  if (!SUGGESTED.some((p) => p.platform === platform)) throw new Error('Unknown provider.');
  const k = String(key || '').trim();
  if (k.length < 8) throw new Error('Paste the whole key.');
  return admin('POST', '/api/keys', {platform, key: k});
};
export const removeGatewayKey = async (id) => admin('DELETE', `/api/keys/${Number(id)}`);
