// Connecting to the user's Claude account through Claude Code: find it, install it (official installer), sign in through the browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {shell} from 'electron';

const win = process.platform === 'win32';

const candidates = () => {
  const home = os.homedir();
  const out = [path.join(home, '.local', 'bin', win ? 'claude.exe' : 'claude')];
  if (win) {
    if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, 'npm', 'claude.cmd'));
    if (process.env.LOCALAPPDATA) out.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'claude.exe'));
  } else out.push('/usr/local/bin/claude', path.join(home, '.claude', 'local', 'claude'));
  return out;
};

// npm installs three files side by side (claude, claude.cmd, claude.ps1) and `where` lists the bare script first, which Windows cannot start. Only a real
// program (.exe) or a batch launcher (.cmd / .bat) can be run; a bare name is accepted only when a launcher sits next to it.
export const pickWindowsLauncher = (paths) => {
  const rank = (p) => (/\.exe$/i.test(p) ? 0 : /\.(cmd|bat)$/i.test(p) ? 1 : 9);
  const ok = [...paths].filter((p) => rank(p) < 9).sort((a, b) => rank(a) - rank(b));
  if (ok.length) return ok[0];
  for (const p of paths) {
    for (const ext of ['.exe', '.cmd']) if (fs.existsSync(p + ext)) return p + ext;
  }
  return null;
};

// the claude executable: on the PATH, or in the places the installers use (a new install is not on the PATH of running apps)
export const claudeBin = () => {
  if (process.env.OMNIMOTION_CLAUDE_BIN && fs.existsSync(process.env.OMNIMOTION_CLAUDE_BIN)) return process.env.OMNIMOTION_CLAUDE_BIN;
  try {
    const r = spawnSync(win ? 'where' : 'which', ['claude'], {encoding: 'utf8', windowsHide: true});
    if (r.status === 0) {
      const found = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter((p) => p && fs.existsSync(p));
      const pick = win ? pickWindowsLauncher(found) : found[0];
      if (pick) return pick;
    }
  } catch {}
  const known = candidates().filter((p) => fs.existsSync(p));
  return (win ? pickWindowsLauncher(known) : known[0]) || null;
};

const q = (p) => `"${p}"`;

// Claude Code bills API credits whenever an API key or a cloud-provider switch is in the environment. OmniMotion always runs it on the signed-in subscription,
// so those variables are removed for every Claude Code process it starts.
// Claude Code bills API credits whenever an API key is in the environment, and it can borrow another session's connection (for example when OmniMotion is started
// from inside the Claude desktop app's terminal). OmniMotion always runs it on its own stored sign-in, the user's Claude subscription, so every ANTHROPIC_* and
// CLAUDE_CODE_* variable, and any cloud-provider switch, is removed for the Claude Code processes it starts.
const STRIP = [/^ANTHROPIC_/, /^CLAUDE_CODE_/, /^CLAUDE_AGENT_SDK_/, /^CLAUDECODE$/, /^CLAUDE_PID$/, /^CLAUDE_PREVIEW_/, /^AWS_BEARER_TOKEN_BEDROCK$/];
export const claudeEnv = () => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!STRIP.some((re) => re.test(k))) env[k] = v;
  return env;
};
export const envHasApiKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const runClaudeSync = (bin, args, timeout = 20000) => spawnSync(win ? q(bin) : bin, args, {encoding: 'utf8', shell: win, windowsHide: true, timeout, env: claudeEnv()});

export const claudeStatus = () => {
  const bin = claudeBin();
  if (!bin) return {installed: false, signedIn: false, path: null, version: null, detail: '', authMethod: '', apiBilling: false, envKeyIgnored: envHasApiKey()};
  const v = runClaudeSync(bin, ['--version'], 15000);
  const s = runClaudeSync(bin, ['auth', 'status'], 20000);
  let signedIn = s.status === 0;
  let detail = '';
  let authMethod = '';
  try {
    const j = JSON.parse(s.stdout);
    if (typeof j.loggedIn === 'boolean') signedIn = j.loggedIn;
    authMethod = String(j.authMethod || '');
    detail = [j.email, j.subscriptionType || j.plan, j.orgName].filter(Boolean).join(' · ');
  } catch {
    detail = (s.stdout || '').trim().split(/\r?\n/)[0] || '';
  }
  // 'console' / api-key sign-ins are billed as API usage; the claude.ai sign-in uses the subscription (Pro, Max)
  const apiBilling = /api|console/i.test(authMethod);
  return {installed: true, signedIn, path: bin, version: (v.stdout || '').trim().slice(0, 40), detail, authMethod, apiBilling, envKeyIgnored: envHasApiKey()};
};

// ---------------------------------------------------------------- install (Anthropic's official installer, per user, no administrator rights)
export const installClaude = (emit) =>
  new Promise((resolve) => {
    const cmd = 'irm https://claude.ai/install.ps1 | iex';
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {windowsHide: true});
    const onData = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((line) => emit({type: 'install-log', line}));
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => resolve({ok: false, error: e.message}));
    child.on('close', (code) => resolve(code === 0 && claudeBin() ? {ok: true} : {ok: false, error: code === 0 ? 'The installer finished but Claude Code was not found afterwards.' : `The installer stopped with code ${code}.`}));
  });

// ---------------------------------------------------------------- sign in: `claude auth login` opens the default browser itself
let loginChild = null;
const URL_RE = /https?:\/\/[^\s"']+/;

export const startLogin = (emit) =>
  new Promise((resolve) => {
    const bin = claudeBin();
    if (!bin) return resolve({ok: false, error: 'Claude Code is not installed yet.'});
    if (loginChild) {
      try {
        loginChild.kill();
      } catch {}
    }
    const child = spawn(win ? q(bin) : bin, ['auth', 'login', '--claudeai'], {shell: win, windowsHide: true, env: claudeEnv()});
    loginChild = child;
    let opened = false;
    const onData = (d) => {
      for (const line of d.toString().split(/\r?\n/).filter(Boolean)) {
        const m = line.match(URL_RE);
        if (m && /claude|anthropic/i.test(m[0])) emit({type: 'login-url', url: m[0]});
        emit({type: 'login-log', line});
        if (/paste|code/i.test(line)) emit({type: 'login-code-needed'});
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    // if the tool printed a sign-in address but no browser opened within a few seconds, the app opens it (once)
    const t = setTimeout(() => {
      if (!opened && lastUrl) {
        opened = true;
        shell.openExternal(lastUrl);
      }
    }, 6000);
    let lastUrl = null;
    child.stdout.on('data', (d) => {
      const m = d.toString().match(URL_RE);
      if (m && /claude|anthropic/i.test(m[0])) lastUrl = m[0];
    });
    child.on('error', (e) => resolve({ok: false, error: e.message}));
    child.on('close', () => {
      clearTimeout(t);
      loginChild = null;
      const s = claudeStatus();
      resolve(s.signedIn ? {ok: true, status: s} : {ok: false, error: 'Sign-in was not completed. Try again, and finish the steps in the browser window.'});
    });
  });

export const sendLoginCode = (text) => {
  if (loginChild && loginChild.stdin.writable) loginChild.stdin.write(String(text).trim() + '\n');
  return true;
};
export const cancelLogin = () => {
  if (loginChild) {
    try {
      loginChild.kill();
    } catch {}
    loginChild = null;
  }
  return true;
};

export const signOut = () => {
  const bin = claudeBin();
  if (bin) runClaudeSync(bin, ['auth', 'logout'], 20000);
  return claudeStatus();
};
