import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {CheckCircle, WarningCircle, X} from '@phosphor-icons/react';

// ---------------------------------------------------------------- formatting
export const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
export const fmtDur = (ms?: number) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};
export const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
export const isRtl = (s: string) => /[֐-ࣿ]/.test(s);

// ---------------------------------------------------------------- hash router
export const useHash = () => {
  const [hash, setHash] = useState(location.hash || '#/projects');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/projects');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
};
export const go = (h: string) => {
  location.hash = h;
};

// ---------------------------------------------------------------- toasts
interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'bad';
}
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export const ToastHost = ({children}: {children: ReactNode}) => {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, kind: 'ok' | 'bad' = 'ok') => {
    const id = ++n.current;
    setItems((x) => [...x, {id, text, kind}]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'bad' ? 8000 : 4000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'bad' ? <WarningCircle size={18} color="var(--danger)" aria-hidden /> : <CheckCircle size={18} color="var(--ok)" aria-hidden />}
            <span style={{flex: 1}}>{t.text}</span>
            <button className="btn ghost icon sm" aria-label="Dismiss" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}>
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

// ---------------------------------------------------------------- dialog
export const Dialog = ({title, onClose, children, footer, width}: {title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number}) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={width ? {width: Math.min(width, window.innerWidth - 48)} : undefined}>
        <header>
          <h2>{title}</h2>
          <button className="btn ghost icon" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
};

export const useAsync = <T,>(fn: () => Promise<T>, deps: unknown[]) => {
  const [state, setState] = useState<{data?: T; error?: string; loading: boolean}>({loading: true});
  const run = useCallback(() => {
    setState((s) => ({...s, loading: true}));
    fn().then((data) => setState({data, loading: false})).catch((e) => setState({error: String(e.message || e), loading: false}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return {...state, reload: run};
};
