// Launch the built app in capture mode and save screenshots: node scripts/shot.mjs steps.json
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
const child = spawn('npx', ['electron', '.'], {cwd: root, stdio: 'inherit', shell: true, env: {...process.env, OMNIMOTION_SHOTS: steps}});
child.on('close', (c) => process.exit(c ?? 0));
