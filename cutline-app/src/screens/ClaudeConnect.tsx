import {useCallback, useEffect, useState} from 'react';
import {CheckCircle, DownloadSimple, SignIn, SpinnerGap, XCircle} from '@phosphor-icons/react';
import {api, type ClaudeStatus} from '../lib/api';
import {Dialog, useToast} from '../lib/util';

type Phase = 'idle' | 'installing' | 'signing-in';

// Connect to the user's Claude account: install Claude Code if it is missing, then sign in through the browser.
export const ClaudeConnect = ({onChange}: {onChange: () => void}) => {
  const toast = useToast();
  const [st, setSt] = useState<ClaudeStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [confirmInstall, setConfirmInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api().claude.status().then(setSt).catch(() => setSt({installed: false, signedIn: false, path: null, version: null, detail: '', authMethod: '', apiBilling: false, envKeyIgnored: false})), []);
  useEffect(() => {
    refresh();
    return api().claude.onEvent((e) => {
      if (e.type === 'install-log' || e.type === 'login-log') setLog((l) => [...l.slice(-30), e.line || '']);
      if (e.type === 'login-url' && e.url) setUrl(e.url);
      if (e.type === 'login-code-needed') setNeedsCode(true);
    });
  }, [refresh]);

  const install = async () => {
    setConfirmInstall(false);
    setError(null);
    setLog([]);
    setPhase('installing');
    try {
      const r = await api().claude.install();
      if (!r.ok) setError(r.error || 'The install did not finish.');
      else toast('Claude Code is installed.');
    } catch (e: any) {
      setError(e.message);
    }
    setPhase('idle');
    refresh();
  };

  const signIn = async () => {
    setError(null);
    setLog([]);
    setUrl(null);
    setNeedsCode(false);
    setCode('');
    setPhase('signing-in');
    try {
      const r = await api().claude.login();
      if (r.ok) {
        toast('Connected to your Claude account.');
        onChange();
      } else setError(r.error || 'Sign-in was not completed.');
    } catch (e: any) {
      setError(e.message);
    }
    setPhase('idle');
    refresh();
  };

  const cancel = async () => {
    await api().claude.cancel();
  };
  const signOut = async () => {
    setSt(await api().claude.signOut());
    toast('Signed out of Claude.');
  };

  if (!st) return <span className="muted">Checking Claude Code</span>;

  return (
    <div className="stack" style={{gap: 'var(--sp-3)'}}>
      <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>
        Planning and editing run through Claude Code, signed in with your own Claude account, so they use your plan and there is no key to manage.
      </p>

      {st.envKeyIgnored ? <p className="help">An Anthropic API key is set on this computer. OmniMotion ignores it, so nothing here is billed as API usage.</p> : null}
      {st.signedIn && st.apiBilling ? (
        <div className="notice bad" role="alert">
          <XCircle size={18} aria-hidden style={{flex: 'none'}} />
          <div>
            <div>Claude Code is signed in for API billing ({st.authMethod}), not your Claude subscription, so requests use API credits.</div>
            <div className="help" style={{marginTop: 4}}>Sign out, then sign in again and choose your Claude account.</div>
          </div>
        </div>
      ) : null}
      <div className="row wrap" style={{gap: 'var(--sp-3)'}}>
        {st.signedIn ? (
          <>
            <span className="chip ok">
              <CheckCircle size={14} weight="fill" aria-hidden /> Connected
            </span>
            {st.detail ? <span className="muted">{st.detail}</span> : null}
            <button className="btn ghost sm" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : st.installed ? (
          <>
            <span className="chip">
              <XCircle size={14} aria-hidden /> Not signed in
            </span>
            {phase === 'signing-in' ? (
              <button className="btn secondary" onClick={cancel}>
                Cancel
              </button>
            ) : (
              <button className="btn primary" onClick={signIn}>
                <SignIn size={18} aria-hidden /> Sign in with Claude
              </button>
            )}
          </>
        ) : (
          <>
            <span className="chip bad">
              <XCircle size={14} aria-hidden /> Claude Code is not installed
            </span>
            <button className="btn primary" disabled={phase === 'installing'} onClick={() => setConfirmInstall(true)}>
              {phase === 'installing' ? <SpinnerGap size={18} className="spin" aria-hidden /> : <DownloadSimple size={18} aria-hidden />} Install Claude Code
            </button>
          </>
        )}
      </div>

      {phase === 'signing-in' ? (
        <div className="notice" role="status">
          <SpinnerGap size={18} className="spin" aria-hidden style={{flex: 'none'}} />
          <div className="stack" style={{gap: 'var(--sp-2)', flex: 1}}>
            <div>
              <b>Finish signing in in your browser.</b> A sign-in page opened in your default browser. Log in with your Claude account and approve access, then come back here.
            </div>
            {url ? (
              <div>
                <button className="btn secondary sm" onClick={() => api().shell.external(url)}>
                  Open the sign-in page again
                </button>
              </div>
            ) : null}
            {needsCode ? (
              <div className="row" style={{gap: 'var(--sp-2)'}}>
                <input className="input sm" placeholder="Paste the code the browser shows" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Sign-in code" />
                <button className="btn primary sm" disabled={!code.trim()} onClick={() => api().claude.code(code)}>
                  Send code
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === 'installing' ? (
        <div className="notice" role="status">
          <SpinnerGap size={18} className="spin" aria-hidden style={{flex: 'none'}} />
          <div style={{flex: 1}}>
            <b>Installing Claude Code.</b> This downloads Anthropic's installer and can take a minute.
            {log.length ? <div className="log" style={{marginTop: 8, maxHeight: 110}}>{log.slice(-6).join('\n')}</div> : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="notice bad" role="alert">
          <XCircle size={18} aria-hidden style={{flex: 'none'}} />
          <span>{error}</span>
        </div>
      ) : null}

      {confirmInstall ? (
        <Dialog
          title="Install Claude Code"
          onClose={() => setConfirmInstall(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirmInstall(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={install}>
                Install
              </button>
            </>
          }
        >
          <p>
            This runs Anthropic's official installer for Claude Code (<span className="mono">irm https://claude.ai/install.ps1 | iex</span> in PowerShell). It installs for your user account only, needs no administrator rights, and puts the program in your user folder.
          </p>
          <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>After it finishes, choose Sign in with Claude to connect your account in the browser.</p>
        </Dialog>
      ) : null}
    </div>
  );
};
