// Packs FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi, MIT) into one file OmniMotion loads in its own process, the way
// FreeLLMAPI's desktop app does (desktop/src/server-host.ts). Its database uses the SQLite built into Node (node:sqlite, in Electron 39's
// Node 22) instead of the native better-sqlite3 module, so nothing has to be compiled for OmniMotion's Electron version. FreeLLMAPI's own
// files are not changed: the driver choice is switched while bundling.
//   1. git clone https://github.com/tashfeenahmed/freellmapi.git ../vendor/freellmapi   (next to cutline-app)
//   2. cd ../vendor/freellmapi && npm install --ignore-scripts
//   3. node scripts/bundle-freellm.mjs            -> resources/freellmapi/server.mjs (+ LICENSE, NOTICE)
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const src = path.resolve(process.env.FREELLMAPI_SRC || path.join(app, '..', 'vendor', 'freellmapi'));
const out = path.join(app, 'resources', 'freellmapi');
const entry = path.join(src, 'desktop', 'src', 'server-host.ts');
if (!fs.existsSync(entry)) throw new Error(`FreeLLMAPI sources not found at ${src} (see the steps at the top of this file).`);

let commit = '';
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
} catch {
  // not a git checkout
}

// the database driver: node:sqlite everywhere (upstream picks it only on Android)
const useNodeSqlite = {
  name: 'omnimotion-node-sqlite',
  setup(b) {
    b.onLoad({filter: /[\\/]server[\\/]src[\\/]db[\\/]index\.ts$/}, (args) => {
      const code = fs.readFileSync(args.path, 'utf8');
      const target = "return platform === 'android' ? nodeSqliteFactory : betterSqliteFactory;";
      if (!code.includes(target)) throw new Error('FreeLLMAPI changed its database driver selection: update scripts/bundle-freellm.mjs.');
      return {contents: code.replace(target, 'void platform; return nodeSqliteFactory; // OmniMotion: node:sqlite, no native module'), loader: 'ts'};
    });
  },
};

fs.mkdirSync(out, {recursive: true});
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: path.join(out, 'server.mjs'),
  external: ['better-sqlite3', 'sharp'],
  plugins: [useNodeSqlite],
  define: {'process.env.FREELLMAPI_COMMIT_SHA': JSON.stringify(commit), 'process.env.FREELLMAPI_INSTALL_METHOD': JSON.stringify('omnimotion')},
  banner: {js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"},
  legalComments: 'none',
  logLevel: 'warning',
});
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(out, 'LICENSE'));
fs.writeFileSync(
  path.join(out, 'NOTICE.md'),
  `# FreeLLMAPI (third-party, MIT)\n\nserver.mjs is FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi${commit ? `, commit ${commit.slice(0, 7)}` : ''}) by Tashfeen Ahmed, bundled unchanged except that its database uses Node's built-in SQLite (see scripts/bundle-freellm.mjs). MIT License: see LICENSE in this folder.\n\nFreeLLMAPI says it is for personal experimentation; each provider's own terms apply to the keys you add.\n`,
);
console.log(`FreeLLMAPI bundled: ${path.join(out, 'server.mjs')} (${(fs.statSync(path.join(out, 'server.mjs')).size / 1e6).toFixed(1)} MB)${commit ? `, commit ${commit.slice(0, 7)}` : ''}`);
