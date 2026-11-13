// Claude studies a reference video (the measurements and the prepared frames from refanalyze.mjs) and writes its STYLE BLUEPRINT:
// every component, motion graphic, animation, transition and effect it sees, what each one maps to in OmniMotion, and what cannot be reproduced.
// The blueprint is kept with the look made from the reference and with the project, and it drives planning (Claude) and the engine (pacing, transitions,
// caption style, sound).
import fs from 'node:fs';
import {analyzeReference} from './refanalyze.mjs';
import {claudeRun, extractJson, viaApi} from './ai.mjs';
import {cacheDir, getSettings} from './store.mjs';

export const ENGINE = {
  kinds: {
    slam: 'one or a few big words slammed over the speaker',
    sting: 'a bold full-width word band, caution-tape style',
    stats: 'count-up numbers with labels',
    pills: 'a stack of rounded chips listing items',
    chip: 'a small brand + price tag',
    flow: 'steps connected by arrows',
    split: 'before / after or A versus B side by side',
    chart: 'an animated bar or line chart',
    quote2: 'a quote card',
    place: 'a map pin with a place name',
    ring: 'a circular score or rating',
    cta: 'an end call to action (comment keyword)',
    image: 'a picture window (screenshot, photo, logo)',
    video: 'a video window (b-roll)',
    browser: 'a browser / app window mock-up',
  },
  motionScenes: {
    clock: '2D: time passing', timeline: '2D: milestones on a line', growth: '2D: rising bars with a trend arrow', rocket: '2D: a launching rocket', target: '2D: an arrow hitting a target', bulb: '2D: a lighting bulb (idea)', bubbles: '2D: chat bubbles', network: '2D: connected nodes', layers: '3D: stacked isometric layers', cube: '3D: a rotating cube with words on its faces', orbit: '3D: satellites orbiting a sphere', coin: '3D: a spinning coin',
  },
  transitions: ['whip', 'flash', 'glitch', 'punch', 'zoomthrough', 'slide'],
  sfxKits: ['tech', 'soft', 'punchy', 'minimal'],
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
const list = (v) => (Array.isArray(v) ? v : []);

// turn Claude's blueprint into settings the engine can apply
export const styleFromBlueprint = (bp, facts) => {
  const transitions = list(bp.transitions)
    .filter((t) => ENGINE.transitions.includes(t.engine || t.type) && (+t.share || 0) >= 0.05)
    .sort((a, b) => (+b.share || 0) - (+a.share || 0))
    .map((t) => t.engine || t.type);
  const kinds = [...new Set(list(bp.components).map((c) => c.engine).filter((k) => ENGINE.kinds[k]))];
  const scenes = [...new Set([...list(bp.components), ...list(bp.motionGraphics)].map((c) => String(c.engine || '').replace(/^motion:/, '')).filter((s) => ENGINE.motionScenes[s]))];
  const p = bp.pacing || {};
  return {
    transitions,
    kinds,
    scenes,
    pacing: {graphicHoldMs: Math.round(clamp((+p.avgGraphicSeconds || facts.averageGraphicSec || 2.2) * 1000, 1200, 5000))},
    graphicsPerMinute: clamp(p.graphicsPerMinute ?? facts.graphicsPerMinute, 0, 24),
    motionPerMinute: clamp(p.motionGraphicsPerMinute ?? 0, 0, 12),
    captions: bp.captions ? {karaoke: bp.captions.karaoke !== false, scale: clamp(bp.captions.scale || 1, 0.85, 1.35)} : undefined,
    sfx: bp.sound && ENGINE.sfxKits.includes(bp.sound.sfxKit) ? {kit: bp.sound.sfxKit, density: ['minimal', 'normal', 'rich'].includes(bp.sound.sfxDensity) ? bp.sound.sfxDensity : 'normal'} : undefined,
  };
};

const buildStudyPrompt = (a) => {
  const pics = Object.entries(a.images)
    .filter(([, p]) => p)
    .map(([k, p]) => `- ${k}: look at the image file ${p} (${a.imageNotes[k] || ''})`)
    .join('\n');
  return `You are a senior motion designer and video editor. Study this reference video and write its STYLE BLUEPRINT, so an editor can recreate the same style on new footage with the OmniMotion engine.

MEASUREMENTS (computed from every frame and from the audio). Cuts, transition times, the music tempo and the beat timing are reliable. "graphics" are moments where only part of the frame changed: most are graphics appearing, but some can be the speaker moving or captions changing, so judge them against the pictures before you count.
${JSON.stringify(a.facts, null, 1)}

PICTURES OF THE VIDEO (open and study every one)
${pics}

WHAT TO FIND (be concrete: shapes, colours, positions, sizes, how things move)
- Every COMPONENT that appears over or around the footage: captions, titles, big words, numbers and counters, lists, cards, windows, icons, emojis, stickers, logos, progress bars, arrows, frames, shapes, lower thirds, 2D or 3D motion graphics, illustrations, b-roll.
- How each one ANIMATES: how it enters and leaves (pop, scale, slide, mask reveal, typewriter, bounce, blur, rotate in 3D), its speed and easing feel, what moves while it is on screen.
- Every TRANSITION type between shots and how often each is used; camera EFFECTS (zoom punch-ins, slow pushes, shake, blur, glitch, flashes, light leaks, grain, glow, vignette, colour grade).
- The CAPTION style: position, words per chunk, karaoke highlight or not, emphasis colours, font feel.
- The LAYOUT: how the speaker / footage and the graphics share the screen; where graphics sit.
- The PACING: cuts per minute, graphics per minute, how long a graphic stays, the rhythm against the speech and the music.
- The SOUND feel (from the music tempo and the beat timing measured above, and from how busy the edit is).

MAP EVERYTHING TO OMNIMOTION
Graphic kinds: ${JSON.stringify(ENGINE.kinds)}
Motion graphic scenes (kind "motion", animated 2D/3D, drawn in the look's colours): ${JSON.stringify(ENGINE.motionScenes)}
Transitions: ${ENGINE.transitions.join(', ')} (plus a plain cut). Sound kits: ${ENGINE.sfxKits.join(', ')}.
The user ALWAYS wants motion graphics in the final edit. If this reference has none, do not tell the editor to avoid them: say in editRecipe which motion scenes fit this style best and how to keep them in its rhythm (short, as fast as its other graphics, in its colours).
For each thing you find, put the closest engine equivalent in "engine" ("kind" name, "motion:<scene>", "caption", "transition:<name>", or "none" when nothing comes close).

OUTPUT: only one JSON object, no code fences:
{"summary": "three sentences describing the style",
 "components": [{"name": "...", "looks": "what it looks like", "animation": "how it enters, moves and leaves", "when": "what in the speech or the music triggers it", "where": "top | middle | bottom | full | around the speaker", "perMinute": n, "engine": "..."}],
 "motionGraphics": [{"what": "...", "dimension": "2D | 3D", "animation": "...", "engine": "motion:<scene> or a kind or none"}],
 "transitions": [{"type": "what you see", "engine": "${ENGINE.transitions.join(' | ')} | cut", "share": 0.0, "notes": "..."}],
 "effects": [{"name": "...", "notes": "...", "engine": "zoom punch-in | grade | grain | glow | vignette | none"}],
 "animationFeel": {"easing": "snappy | smooth | bouncy", "speed": "fast | medium | slow", "notes": "..."},
 "captions": {"position": "top | middle | bottom", "wordsPerChunk": n, "karaoke": true, "emphasis": "...", "scale": 1.0},
 "layout": "...",
 "pacing": {"cutsPerMinute": n, "graphicsPerMinute": n, "motionGraphicsPerMinute": n, "avgGraphicSeconds": n, "notes": "..."},
 "sound": {"sfxKit": "${ENGINE.sfxKits.join(' | ')}", "sfxDensity": "minimal | normal | rich", "music": "..."},
 "editRecipe": ["short imperative instructions to recreate this style with OmniMotion, most important first"],
 "cannotReproduce": ["what this reference does that OmniMotion cannot do yet"]}`;
};

// the whole study: measure, then Claude reads the frames. Cached next to the measurements.
export const studyReference = async (file, run = null) => {
  run?.step('measure', 'active');
  const a = await analyzeReference(file, (t) => run?.log(t));
  const f = a.facts;
  run?.step('measure', 'done', `${f.cutsPerMinute} cuts/min, ${f.graphicsPerMinute} graphics/min`);
  const bpFile = `${a.base}-blueprint.json`;
  if (fs.existsSync(bpFile)) {
    run?.step('study', 'done', 'studied before');
    return {...JSON.parse(fs.readFileSync(bpFile, 'utf8')), facts: f};
  }
  run?.step('study', 'active');
  const provider = getSettings().aiProvider || 'claude-code';
  if (provider === 'off') throw new Error('AI is switched off in Settings. Choose Claude account or an API key there to study references.');
  const prompt = buildStudyPrompt(a);
  const images = Object.values(a.images).filter(Boolean);
  run?.log(`Claude is studying ${images.length} sheets of frames`);
  const text = provider === 'api' ? await viaApi(prompt, images) : await claudeRun(prompt, cacheDir(), 900000, [cacheDir()], run);
  const bp = extractJson(text);
  const style = styleFromBlueprint(bp, f);
  const out = {blueprint: bp, style};
  fs.writeFileSync(bpFile, JSON.stringify(out, null, 1));
  run?.log(`Found ${list(bp.components).length} components, ${list(bp.motionGraphics).length} motion graphics, ${list(bp.transitions).length} transition types, ${list(bp.effects).length} effects`);
  run?.step('study', 'done', `${list(bp.components).length} components`);
  return {...out, facts: f};
};

// a compact version for the planning prompt
export const blueprintForPrompt = (s) => {
  if (!s || !s.blueprint) return '';
  const bp = s.blueprint;
  return JSON.stringify(
    {
      summary: bp.summary,
      editRecipe: bp.editRecipe,
      components: list(bp.components).map((c) => ({name: c.name, animation: c.animation, when: c.when, where: c.where, perMinute: c.perMinute, engine: c.engine})),
      motionGraphics: bp.motionGraphics,
      transitions: bp.transitions,
      effects: bp.effects,
      captions: bp.captions,
      pacing: bp.pacing,
      engineSettings: s.style,
    },
    null,
    1,
  );
};
