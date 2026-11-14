// The free LLM gateway (FreeLLMAPI, https://github.com/tashfeenahmed/freellmapi): a local router the user runs, with their own free-tier keys,
// that speaks the Anthropic Messages format. OmniMotion can send Claude Code's work to it instead of Claude, for this app only: the gateway
// address and key are given to the processes the app starts and never written to the user's environment or Claude settings.
// Modes: 'claude' (Claude only), 'free' (the gateway only), 'fallback' (Claude, then the gateway when the Claude plan limit is reached).
import {getSecret, getSettings} from './store.mjs';
import {gatewayBackend, gatewayStatus} from './gateway.mjs';

export const LLM_MODES = ['claude', 'free', 'fallback'];
export const llmMode = () => {
  const m = getSettings().llmMode;
  return LLM_MODES.includes(m) ? m : 'claude';
};

const cleanBase = (u) => String(u || 'http://127.0.0.1:3001').trim().replace(/\/+$/, '').replace(/\/v1$/, '');

// the built-in gateway (default: inside OmniMotion) or the user's own FreeLLMAPI
export const freeSource = () => (getSettings().freeSource === 'external' ? 'external' : 'builtin');

// the gateway to use (the built-in one is started on first use), or null when the user's own gateway is not set up
export const freeBackend = async () => {
  const s = getSettings();
  const model = String(s.freeModel || 'auto:smart').trim() || 'auto:smart';
  if (freeSource() === 'builtin') {
    const g = await gatewayBackend();
    return {base: g.base, key: g.key, model};
  }
  const key = getSecret('freellm');
  if (!key) return null;
  return {base: cleanBase(s.freeBase), key, model};
};

// what Claude Code needs to talk to the gateway instead of Anthropic (added to the child process environment only)
export const freeEnv = (b) => ({
  ANTHROPIC_BASE_URL: b.base,
  ANTHROPIC_AUTH_TOKEN: b.key,
  ANTHROPIC_MODEL: b.model,
  ANTHROPIC_SMALL_FAST_MODEL: b.model,
  ANTHROPIC_DEFAULT_SONNET_MODEL: b.model,
  ANTHROPIC_DEFAULT_OPUS_MODEL: b.model,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: b.model,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
});

// a Claude plan limit (the moment "Claude, then free" switches over); other errors are not handed to the gateway
export const isLimitError = (msg) => /plan limit|usage limit|session limit|weekly limit|rate.?limit|limit (is )?reached|hit your .{0,20}limit|out of (extra )?usage|quota/i.test(String(msg || ''));

// the gateway answers, and how many models it offers (Settings, Test)
export const testFree = async (override = {}) => {
  if (freeSource() === 'builtin' && !override.key) {
    try {
      const st = await gatewayStatus();
      return st.usablePlatforms.length
        ? {ok: true, message: `The built-in gateway is running with keys for ${st.usablePlatforms.length} provider${st.usablePlatforms.length === 1 ? '' : 's'}.`}
        : {ok: false, message: 'The built-in gateway is running, but no provider key is added yet: add one below.'};
    } catch (e) {
      return {ok: false, message: `The built-in gateway did not start: ${e.message}`};
    }
  }
  const b = {...((await freeBackend()) || {}), ...override};
  if (!b.key) return {ok: false, message: 'Add your FreeLLMAPI key first (it starts with freellmapi-).'};
  const base = cleanBase(b.base);
  try {
    const r = await fetch(`${base}/v1/models`, {headers: {authorization: `Bearer ${b.key}`}, signal: AbortSignal.timeout(8000)});
    if (r.status === 401 || r.status === 403) return {ok: false, message: 'The gateway refused the key. Copy the unified key from the FreeLLMAPI dashboard (Keys page).'};
    if (!r.ok) return {ok: false, message: `The gateway answered with an error (${r.status}).`};
    const j = await r.json().catch(() => ({}));
    const n = Array.isArray(j.data) ? j.data.length : 0;
    return {ok: true, message: `Connected to ${base}: ${n} model${n === 1 ? '' : 's'} available.`};
  } catch (e) {
    return {ok: false, message: `No gateway at ${base}. Start FreeLLMAPI (its desktop app, or npm run dev in its folder), then test again.`};
  }
};

// one request in the Anthropic Messages format (used when OmniMotion talks to a model directly, without Claude Code)
export const viaFree = async (content, maxTokens = 12000) => {
  const b = await freeBackend();
  if (!b) throw new Error('The free LLM gateway is not set up. Add it in Settings (AI).');
  const res = await fetch(`${b.base}/v1/messages`, {method: 'POST', headers: {authorization: `Bearer ${b.key}`, 'x-api-key': b.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}, body: JSON.stringify({model: b.model, max_tokens: maxTokens, messages: [{role: 'user', content}]})});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Free LLM gateway error ${res.status}`);
  return (body.content || []).map((c) => c.text || '').join('');
};
