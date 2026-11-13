// Dev loop: Vite dev server + Electron pointed at it.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = spawn('npx', ['vite', '--port', '5273', '--strictPort'], {cwd: root, stdio: 'inherit', shell: true});
const wait = async () => {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://localhost:5273/');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Vite did not start');
};
await wait();
const electron = spawn('npx', ['electron', '.'], {cwd: root, stdio: 'inherit', shell: true, env: {...process.env, OMNIMOTION_DEV_URL: 'http://localhost:5273/'}});
electron.on('close', () => {
  vite.kill();
  process.exit(0);
});
