// Every AI edit keeps the plan it replaced, so any change can be undone.
import fs from 'node:fs';
import path from 'node:path';
import {enginePaths} from './paths.mjs';
import {getSettings} from './store.mjs';

const jobDir = (project) => enginePaths(getSettings().enginePath).jobDir(project.id);
const dir = (project) => path.join(jobDir(project), 'plan-history');
const planFile = (project) => path.join(jobDir(project), 'edit_plan.json');

export const listHistory = (project) => {
  const d = dir(project);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      return {n: Number(f.replace('.json', '')), at: j.at, instruction: j.instruction, summary: j.summary, tokens: j.tokens, undone: !!j.undone};
    })
    .sort((a, b) => a.n - b.n);
};

export const pushHistory = (project, entry) => {
  const d = dir(project);
  fs.mkdirSync(d, {recursive: true});
  const last = listHistory(project).pop();
  const n = (last ? last.n : 0) + 1;
  fs.writeFileSync(path.join(d, `${n}.json`), JSON.stringify({...entry, at: Date.now()}, null, 1));
  return n;
};

// restore the plan as it was before change n (that change and every later one are marked undone)
export const restoreHistory = (project, n) => {
  const d = dir(project);
  const j = JSON.parse(fs.readFileSync(path.join(d, `${n}.json`), 'utf8'));
  fs.mkdirSync(path.dirname(planFile(project)), {recursive: true});
  fs.writeFileSync(planFile(project), JSON.stringify(j.before, null, 2));
  for (const h of listHistory(project)) {
    if (h.n >= n) {
      const f = path.join(d, `${h.n}.json`);
      const x = JSON.parse(fs.readFileSync(f, 'utf8'));
      x.undone = true;
      fs.writeFileSync(f, JSON.stringify(x, null, 1));
    }
  }
  return j.before;
};
