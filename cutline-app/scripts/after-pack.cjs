// electron-builder never copies a node_modules folder into extra resources, so the engine's packages are added here, minus caches and development tools.
const fs = require('node:fs');
const path = require('node:path');

const SKIP_TOP = [/^typescript$/, /^eslint$/, /^eslint-/, /^@eslint$/, /^@eslint-community$/, /^prettier$/, /^@types$/, /^\.cache$/];
const SKIP_REMOTION = [/^eslint-/];

exports.default = async (context) => {
  const src = path.resolve(__dirname, '..', '..', 'video-studio', 'node_modules');
  const dest = path.join(context.appOutDir, 'resources', 'engine', 'node_modules');
  if (!fs.existsSync(src)) throw new Error(`The engine's packages were not found at ${src}`);
  let files = 0;
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = path.relative(src, from);
      if (!rel) return true;
      const parts = rel.split(path.sep);
      if (parts.includes('.cache')) return false;
      if (parts.length === 1 && SKIP_TOP.some((re) => re.test(parts[0]))) return false;
      if (parts[0] === '@remotion' && parts.length === 2 && SKIP_REMOTION.some((re) => re.test(parts[1]))) return false;
      files++;
      return true;
    },
  });
  console.log(`  • engine packages added (${files} entries)`);
};
