const {contextBridge, ipcRenderer, webUtils} = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke(name, ...args).then((r) => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
});

contextBridge.exposeInMainWorld('omnimotion', {
  settings: {get: call('settings:get'), save: call('settings:save'), secret: call('settings:secret')},
  engine: {info: call('engine:info')},
  window: {overlay: call('window:overlay')},
  ai: {
    test: call('ai:test'),
    cancel: call('ai:cancel'),
    onEvent: (cb) => {
      const fn = (_e, ev) => cb(ev);
      ipcRenderer.on('ai:event', fn);
      return () => ipcRenderer.removeListener('ai:event', fn);
    },
  },
  claude: {
    status: call('claude:status'),
    install: call('claude:install'),
    login: call('claude:login'),
    code: call('claude:code'),
    cancel: call('claude:cancel'),
    signOut: call('claude:signout'),
    onEvent: (cb) => {
      const fn = (_e, ev) => cb(ev);
      ipcRenderer.on('claude:event', fn);
      return () => ipcRenderer.removeListener('claude:event', fn);
    },
  },
  projects: {list: call('projects:list'), get: call('projects:get'), create: call('projects:create'), save: call('projects:save'), remove: call('projects:remove')},
  media: {pick: call('media:pick'), attach: call('media:attach'), detach: call('media:detach'), poster: call('media:poster'), url: call('media:url'), dir: call('media:dir'), kind: call('media:kind'), pathOf: (file) => webUtils.getPathForFile(file)},
  run: {
    start: call('run:start'),
    cancel: call('run:cancel'),
    active: call('run:active'),
    onEvent: (cb) => {
      const fn = (_e, ev) => cb(ev);
      ipcRenderer.on('run:event', fn);
      return () => ipcRenderer.removeListener('run:event', fn);
    },
  },
  job: {read: call('job:read')},
  hook: {read: call('hook:read'), analyze: call('hook:analyze')},
  plan: {save: call('plan:save'), ai: call('plan:ai'), edit: call('plan:edit'), history: call('plan:history'), restore: call('plan:restore')},
  looks: {list: call('looks:list'), meta: call('looks:meta'), save: call('looks:save'), remove: call('looks:remove'), sample: call('looks:sample'), ai: call('looks:ai')},
  library: {list: call('library:list'), add: call('library:add'), remove: call('library:remove')},
  analyze: {list: call('analyze:list'), get: call('analyze:get'), remove: call('analyze:remove'), ytdlp: call('analyze:ytdlp'), install: call('analyze:install'), start: call('analyze:start')},
  dev: {seed: call('dev:seed'), aiDemo: call('dev:ai-demo')},
  shell: {external: call('shell:external'), reveal: call('shell:reveal'), open: call('shell:open'), folder: call('dialog:folder')},
});
