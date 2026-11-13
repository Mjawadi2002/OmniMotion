import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const app = __dirname;
const engineRoot = path.resolve(app, '..', 'video-studio');
const skill = path.join(engineRoot, '.claude', 'skills', 'edit-style');

// the engine's Remotion composition is reused as is for the live preview; its webpack-only font loader is swapped for ours
const swapFonts = () => ({
  name: 'swap-engine-fonts',
  enforce: 'pre' as const,
  resolveId(id: string, importer?: string) {
    if (!importer || !importer.split('\\').join('/').includes('/edit-style/remotion/')) return null;
    if (/(^|\/)fonts(\.ts)?$/.test(id)) return path.join(app, 'src', 'engine', 'fonts.ts');
    return null;
  },
});

export default defineConfig({
  root: app,
  base: './',
  plugins: [swapFonts(), react()],
  resolve: {
    alias: {
      '@engine': skill,
      react: path.join(app, 'node_modules', 'react'),
      'react-dom': path.join(app, 'node_modules', 'react-dom'),
      remotion: path.join(app, 'node_modules', 'remotion'),
    },
    dedupe: ['react', 'react-dom', 'remotion'],
  },
  server: {port: 5273, strictPort: true, fs: {allow: [app, engineRoot]}, proxy: {'/__media': 'http://127.0.0.1:47283'}},
  build: {outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000},
});
