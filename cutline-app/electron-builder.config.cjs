// How the installer is built. The editing engine (video-studio) and ffmpeg are packed inside it so the app works on any Windows computer without setup.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const engine = path.resolve(__dirname, '..', 'video-studio');

// a complete ffmpeg + ffprobe (the one inside Remotion lacks filters the engine uses). OMNIMOTION_FFMPEG_DIR overrides the search.
const findFfmpegDir = () => {
  const tryDir = (d) => d && fs.existsSync(path.join(d, 'ffmpeg.exe')) && fs.existsSync(path.join(d, 'ffprobe.exe')) && d;
  if (process.env.OMNIMOTION_FFMPEG_DIR) return tryDir(process.env.OMNIMOTION_FFMPEG_DIR);
  const r = spawnSync('where', ['ffmpeg'], {encoding: 'utf8', shell: true});
  const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first ? tryDir(path.dirname(first)) : false;
};
const ffmpegDir = findFfmpegDir();
if (!fs.existsSync(path.join(engine, '.claude', 'skills', 'edit-style', 'scripts', 'director.mjs'))) throw new Error(`The engine was not found at ${engine}`);
if (!ffmpegDir) throw new Error('ffmpeg.exe and ffprobe.exe were not found. Install ffmpeg, or set OMNIMOTION_FFMPEG_DIR to the folder that has them.');
console.log('bundling engine:', engine, '\nbundling ffmpeg:', ffmpegDir);

module.exports = {
  appId: 'app.omnimotion.studio',
  productName: 'OmniMotion',
  copyright: 'OmniMotion',
  files: ['dist/**', 'electron/**', 'resources/**', 'package.json'],
  directories: {output: 'release'},
  afterPack: path.join(__dirname, 'scripts', 'after-pack.cjs'),
  electronLanguages: ['en-US', 'fr', 'ar'],
  extraResources: [
    {
      from: engine,
      to: 'engine',
      filter: [
        '**/*',
        // never ship private files, working files or caches
        '!.env',
        '!.env.*',
        '!.git/**',
        '!.gitignore',
        '!.edit-jobs/**',
        '!_analysis/**',
        '!out/**',
        '!public/**',
        '!paper/**',
        '!**/agent/stills/**',
        '!**/.cache/**',
        // optional features that need extra software (local Whisper, the pop-out cut-out model) are not included
        '!whisper.cpp/**',
        '!models/**',
        // development tools
        '!node_modules/typescript/**',
        '!node_modules/eslint/**',
        '!node_modules/eslint-*/**',
        '!node_modules/@eslint/**',
        '!node_modules/@eslint-community/**',
        '!node_modules/prettier/**',
        '!node_modules/@types/**',
        '!node_modules/@remotion/eslint-*/**',
      ],
    },
    {from: ffmpegDir, to: 'tools', filter: ['ffmpeg.exe', 'ffprobe.exe']},
  ],
  win: {target: [{target: 'nsis', arch: ['x64']}], icon: 'resources/icon.ico'},
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'OmniMotion',
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    uninstallDisplayName: 'OmniMotion',
    deleteAppDataOnUninstall: false,
  },
  artifactName: 'OmniMotion-Setup-${version}.exe',
};
