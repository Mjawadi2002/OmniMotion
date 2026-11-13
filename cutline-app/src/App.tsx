import {useEffect, useState} from 'react';
import {FilmStrip, GearSix, MagnifyingGlass, PaintBrush, SidebarSimple, Stack} from '@phosphor-icons/react';
import {api, type EngineInfo, type Settings} from './lib/api';
import {ToastHost, useHash} from './lib/util';
import logo from './assets/logo.png';
import {Projects} from './screens/Projects';
import {Workspace} from './screens/Workspace';
import {Library} from './screens/Library';
import {Looks} from './screens/Looks';
import {Analyze} from './screens/Analyze';
import {SettingsScreen} from './screens/SettingsScreen';

export const App = () => {
  const hash = useHash();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);

  const refresh = () => {
    api().settings.get().then(setSettings).catch(() => {});
    api().engine.info().then(setEngine).catch(() => {});
  };
  useEffect(refresh, []);
  useEffect(() => {
    if (!settings) return;
    const t = settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
    document.documentElement.dataset.theme = t;
    // the native window buttons follow the theme
    const cs = getComputedStyle(document.documentElement);
    api().window.overlay({color: cs.getPropertyValue('--surface-1').trim(), symbolColor: cs.getPropertyValue('--text').trim()}).catch(() => {});
  }, [settings]);

  // the sidebar can fold down to its icons; the choice is remembered (Ctrl+B toggles it)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('om.rail') === 'collapsed';
    } catch {
      return false;
    }
  });
  const toggleRail = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('om.rail', c ? 'open' : 'collapsed');
      } catch {
        // private storage unavailable: the choice lasts this session
      }
      return !c;
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        toggleRail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [, area, id, tab] = hash.split('/');
  const route = area === 'project' ? 'projects' : area || 'projects';

  return (
    <ToastHost>
      <div className="shell" data-rail={collapsed ? 'collapsed' : 'open'}>
        <header className="topbar">
          <button className="rail-toggle" onClick={toggleRail} aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-expanded={!collapsed} aria-controls="rail" title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}>
            <SidebarSimple size={18} aria-hidden />
          </button>
          <img src={logo} width={22} height={22} alt="" />
          <span className="topbar-name">OmniMotion</span>
        </header>
        <aside className="rail" id="rail">
          <nav className="nav" aria-label="Main">
            {(
              [
                ['projects', 'Projects', FilmStrip],
                ['analyze', 'Analyze', MagnifyingGlass],
                ['looks', 'Looks', PaintBrush],
                ['library', 'Library', Stack],
                ['settings', 'Settings', GearSix],
              ] as const
            ).map(([key, label, Icon]) => (
              <a key={key} href={`#/${key}`} aria-current={route === key ? 'page' : undefined} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}>
                <Icon size={20} aria-hidden weight={route === key ? 'fill' : 'regular'} />
                <span className="nav-label">{label}</span>
              </a>
            ))}
          </nav>
          <div className="grow" />
          {(() => {
            const text = engine ? (engine.ok && engine.ffmpeg && engine.node ? 'Engine ready' : engine.ok ? 'Engine needs attention' : 'Engine not found: open Settings') : 'Checking engine';
            return (
              <a className="status-line" href="#/settings" title={collapsed ? text : engine?.ok ? engine.root : 'Open Settings to fix this'} aria-label={collapsed ? text : undefined} style={{textDecoration: 'none', color: 'inherit'}}>
                <span className={`dot ${engine ? (engine.ok && engine.ffmpeg && engine.node ? 'ok' : 'bad') : ''}`} />
                <span className="nav-label">{text}</span>
              </a>
            );
          })()}
        </aside>
        <main className="main" id="main">
          {area === 'project' && id ? <Workspace key={id} id={id} tab={tab || 'media'} engine={engine} settings={settings} /> : null}
          {route === 'projects' && area !== 'project' ? <Projects settings={settings} /> : null}
          {route === 'analyze' ? <Analyze id={id} /> : null}
          {route === 'looks' ? <Looks /> : null}
          {route === 'library' ? <Library /> : null}
          {route === 'settings' ? <SettingsScreen settings={settings} engine={engine} onChange={refresh} /> : null}
        </main>
      </div>
    </ToastHost>
  );
};
