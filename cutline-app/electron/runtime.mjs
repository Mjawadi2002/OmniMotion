// What the engine runs on. In the installed app everything it needs ships inside it: Node (the app's own runtime), ffmpeg and ffprobe, and the engine itself.
// In development the engine uses whatever is installed on the computer.
import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';

export const packaged = () => app.isPackaged;
export const toolsDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'tools') : '');
export const hasBundledTools = () => !!toolsDir() && fs.existsSync(path.join(toolsDir(), 'ffmpeg.exe'));

// the app itself calls ffmpeg and ffprobe by name (thumbnails, durations): in the installed app those names resolve to the bundled copies
export const useBundledTools = () => {
  if (!hasBundledTools()) return;
  const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  process.env[key] = [toolsDir(), process.env[key] || ''].filter(Boolean).join(path.delimiter);
};

// `node` and `npx` for the engine's scripts, which call them by name: small launchers that run the app itself as Node
const writeShims = () => {
  const dir = path.join(app.getPath('userData'), 'runtime');
  fs.mkdirSync(dir, {recursive: true});
  const exe = process.execPath;
  fs.writeFileSync(path.join(dir, 'node.cmd'), `@echo off\r\n"${exe}" %*\r\n`);
  fs.writeFileSync(path.join(dir, 'npx.cmd'), `@echo off\r\n"${exe}" "%~dp0npx-shim.cjs" %*\r\n`);
  fs.writeFileSync(
    path.join(dir, 'npx-shim.cjs'),
    `// npx replacement: the engine only ever runs "npx remotion ..."
const {spawn} = require('node:child_process');
const path = require('node:path');
const [, , cmd, ...rest] = process.argv;
if (cmd !== 'remotion') {
  console.error('npx is not available here (only "npx remotion" is).');
  process.exit(1);
}
const root = process.env.OMNIMOTION_ENGINE_ROOT || process.cwd();
const cli = path.join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const child = spawn(process.execPath, [cli, ...rest], {stdio: 'inherit', env: process.env, cwd: process.cwd()});
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
`,
  );
  return dir;
};

// the program that runs an engine script, and the environment it runs in
export const engineCommand = () => (app.isPackaged ? process.execPath : 'node');
export const engineEnv = ({root, jobsBase}) => {
  const env = {...process.env};
  if (jobsBase) env.OMNIMOTION_JOBS_DIR = jobsBase;
  if (!app.isPackaged) return env;
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[key] = [writeShims(), toolsDir(), env[key] || ''].filter(Boolean).join(path.delimiter);
  env.ELECTRON_RUN_AS_NODE = '1';
  env.OMNIMOTION_ENGINE_ROOT = root;
  return env;
};
