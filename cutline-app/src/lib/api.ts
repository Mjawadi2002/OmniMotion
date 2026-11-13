export type Mode = 'talking' | 'vlog' | 'motion';
export type MotionLine = {line: string; purpose: string; visual: string};
export type MotionSettings = {
  aspect: '9:16' | '16:9';
  lengthS: number;
  idea?: string;
  style?: string;
  language?: string;
  reference?: string;
  notes?: string;
  understanding?: string;
  title?: string;
  scriptLanguage?: string;
  script?: MotionLine[];
  captions?: {style: string; colors?: Partial<Record<'text' | 'accent' | 'box', string>>};
  voiceId?: string;
  voiceName?: string;
  voiceModel?: string;
  voiceSpeed?: number;
  voiceStability?: number;
  voice?: {audio: string; wordsFile: string; words: number; durationMs: number; chars: number; at: number; voiceId: string; voiceName: string} | null;
};
export type Voice = {id: string; name: string; category: string; gender: string; age: string; accent: string; description: string; useCase: string; previewUrl: string};
export type Style = 'tech' | 'light';
export type Role = 'footage' | 'clip' | 'broll' | 'voiceover' | 'music' | 'image' | 'logo' | 'screenshot' | 'transcript' | 'reference';

export interface MediaItem {
  id: string;
  name: string;
  original: string;
  role: Role;
  kind: 'video' | 'audio' | 'image' | 'text' | 'other';
  path: string;
  size: number;
  durationMs?: number;
  width?: number;
  height?: number;
}

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  motion?: MotionSettings;
  style: Style;
  popout: boolean;
  look?: string;
  dir: string;
  createdAt: number;
  updatedAt: number;
  media: MediaItem[];
  outputs: {file: string; at: number; label: string; lufs?: number; peak?: number}[];
  settings: {cutSilence: boolean; music: 'on' | 'off'; musicLevel?: 'auto' | 'subtle' | 'balanced' | 'prominent'; musicVolume?: number; sfx?: 'auto' | 'off' | 'minimal' | 'normal' | 'rich'; planBrief?: string; agentActive?: boolean; agentReference?: string; agentNotes?: string; captionStyle?: string; captionColors?: Partial<Record<'text' | 'accent' | 'box' | 'boxText', string>>; platform?: 'all' | 'tiktok' | 'reels' | 'shorts' | 'off'; language: string; stt?: 'elevenlabs' | 'whisper'};
  status: {prepared?: boolean; planned?: boolean; built?: boolean};
}

export interface Settings {
  enginePath: string;
  workspaceRoot: string;
  theme: 'system' | 'dark' | 'light';
  transcription: 'elevenlabs' | 'whisper';
  aiProvider: 'claude-code' | 'api' | 'off';
  aiModel: string;
  defaults: {style: Style; mode: Mode};
  hasKeys: {elevenlabs: boolean; anthropic: boolean};
  canEncrypt: boolean;
}

export interface EngineInfo {
  root: string;
  ok: boolean;
  bundled: boolean;
  node: boolean;
  ffmpeg: boolean;
  python: boolean;
  claudeCli: boolean;
  cutoutModel: boolean;
  whisperModel: boolean;
  elevenlabsKey: boolean;
}

export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  conf?: number;
  srcIdx?: number;
}

export interface ClipInfo {
  id: string;
  name: string;
  durationMs: number;
  width: number;
  height: number;
  portrait: boolean;
  hasAudio: boolean;
  sheet: string;
  sheetUrl: string | null;
  sampleTimesMs: number[];
  sheetCols: number;
}

export interface Job {
  jobDir: string;
  publicDir: string;
  hasHook?: boolean;
  prepared: boolean;
  stale: boolean;
  words: Word[] | null;
  cuts: {cuts: [number, number][]; segments: unknown[]} | null;
  clips: ClipInfo[] | null;
  plan: any | null;
  autoPlan: any | null;
  resolved: any | null;
  assets: {id: string; file?: string; type: string; license?: string; source?: string; error?: string}[] | null;
}

export interface RunEvent {
  runId: string;
  projectId: string;
  type: 'log' | 'stage' | 'progress' | 'loudness' | 'done';
  line?: string;
  stage?: string;
  label?: string;
  pct?: number;
  frames?: number;
  lufs?: number;
  peak?: number;
  code?: number;
  step?: string;
  out?: string;
  tail?: string[];
}

export interface AiEvent {
  runId: string;
  job: 'plan' | 'edit' | 'look' | 'hook' | 'analyze' | 'agent' | 'script';
  at: number;
  type: 'start' | 'step' | 'log' | 'writing' | 'usage' | 'end';
  title?: string;
  steps?: {id: string; label: string}[];
  id?: string;
  status?: 'active' | 'done' | 'skipped' | 'warn';
  detail?: string;
  level?: 'info' | 'tool' | 'think' | 'write' | 'warn';
  text?: string;
  chars?: number;
  tail?: string;
  tokens?: number | null;
  windows?: {fiveHour?: {utilization: number; resetsAt: number}; sevenDay?: {utilization: number; resetsAt: number}};
  ok?: boolean;
  cancelled?: boolean;
  error?: string;
  seconds?: number;
  unused?: string[];
  motion?: number;
  motionNeeded?: number;
  summary?: string;
}

export interface AnalysisMeta {
  platform: string;
  title?: string | null;
  uploader?: string | null;
  followers?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  engagement?: number;
  uploadDate?: string | null;
  description?: string | null;
  tags?: string[];
  webpage?: string | null;
  durationSec?: number;
  width?: number;
  height?: number;
}
export interface AnalysisSummary {
  id: string;
  status: 'working' | 'done' | 'failed';
  error?: string;
  createdAt: number;
  source: {url?: string; file?: string};
  meta: AnalysisMeta;
  hookScore: number | null;
  thumbUrl: string | null;
}
export interface AnalysisReport {
  summary: string;
  hook: {score: number; type: string; firstWords: string; translation: string; visual: string; whyItWorks: string; techniques: string[]; template: string};
  structure: {fromSec: number; toSec: number; beat: string; what: string}[];
  theme: {mood: string; colors: {hex: string; role: string; feel: string}[]; typography: string; grade: string};
  tone: {delivery: string; energy: string; pace: string; emotion: string; howToCopy: string};
  editing: Record<'rhythm' | 'transitions' | 'animations' | 'motionGraphics' | 'captions' | 'sound', string>;
  audience: string;
  cta: string;
  whyItPerforms: string[];
  steal: string[];
  avoid: string[];
  scriptTemplate: string;
  styleSheet: Record<'captions' | 'layout' | 'pacing' | 'colors' | 'sound' | 'motion', string>;
}
export interface VoiceTone {
  voicedSeconds: number;
  medianPitchHz: number;
  pitchRangeSemitones: number;
  pitchVariationSemitones: number;
  loudnessVariationDb: number;
  wordsPerMinute: number | null;
  pauseSharePercent: number | null;
  longPauses: number;
  wordsInFirst3s: number;
  first3sLouderByDb: number | null;
  audioEvents: {text: string; atSec: number}[];
  labels: {pitch: string; energy: string; pace: string};
}
export interface Analysis extends Omit<AnalysisSummary, 'hookScore' | 'thumbUrl'> {
  video?: string;
  videoUrl: string | null;
  thumbUrl: string | null;
  hookUrl: string | null;
  overviewUrl: string | null;
  facts?: any;
  blueprint?: any;
  style?: any;
  palette?: {hex: string; share: number}[];
  transcript?: {language: string | null; text: string | null; words: number; note: string | null};
  voice?: VoiceTone | null;
  report?: AnalysisReport;
}

export interface HookResult {
  score: number;
  verdict: string;
  firstWords: string;
  criteria: {name: string; score: number; note: string}[];
  works: string[];
  hurts: string[];
  fixes: {title: string; why: string; kind: string; addsWords: boolean; instruction: string}[];
  rewrites: {line: string; why: string}[];
  at: number;
  outdated: boolean;
  sheet?: string | null;
}

export interface ClaudeStatus {
  installed: boolean;
  signedIn: boolean;
  path: string | null;
  version: string | null;
  detail: string;
  authMethod: string;
  apiBilling: boolean;
  envKeyIgnored: boolean;
}

export interface PlanChange {
  n: number;
  at: number;
  instruction: string;
  summary: string;
  tokens?: number | null;
  undone: boolean;
}

export interface LookGrade {
  tint: string;
  tintAlpha: number;
  contrast: number;
  saturate: number;
  brightness: number;
  vignette: number;
}

export interface Look {
  id: string;
  label: string;
  family: 'tech' | 'light';
  builtin: boolean;
  roles: Record<string, string>;
  fonts: Record<string, string>;
  grade?: LookGrade;
  sfx?: {kit?: 'tech' | 'soft' | 'punchy' | 'minimal'; density?: 'minimal' | 'normal' | 'rich'; gainDb?: number};
  blueprint?: any;
  style?: any;
  facts?: any;
  summary?: string;
  notes?: string;
}

export interface LookMeta {
  catalog: {family: string; kind: string; weights: string}[];
  base: {tech: Record<string, string>; light: Record<string, string>};
  baseFonts: Record<string, string>;
  baseGrade: {tech: LookGrade; light: LookGrade};
  groups: {tech: {title: string; roles: [string, string][]}[]; light: {title: string; roles: [string, string][]}[]};
}

export interface Reference {
  id: string;
  name: string;
  path: string;
  builtin: boolean;
  durationMs?: number;
  width?: number;
  height?: number;
  sheetUrl?: string;
  palette?: {hex: string; share: number}[];
  error?: string;
}

export type AgentBeat = {id: string; track: string; label: string; startMs: number; endMs: number};

interface Bridge {
  settings: {get(): Promise<Settings>; save(p: Partial<Settings> & {defaults?: Partial<Settings['defaults']>}): Promise<Settings>; secret(name: 'elevenlabs' | 'anthropic', value: string): Promise<Settings>};
  engine: {info(): Promise<EngineInfo>};
  window: {overlay(o: {color: string; symbolColor: string}): Promise<boolean>};
  ai: {test(provider: 'claude-code' | 'api'): Promise<{ok: boolean; message: string}>; cancel(): Promise<boolean>; onEvent(cb: (e: AiEvent) => void): () => void};
  claude: {
    status(): Promise<ClaudeStatus>;
    install(): Promise<{ok: boolean; error?: string}>;
    login(): Promise<{ok: boolean; error?: string; status?: ClaudeStatus}>;
    code(text: string): Promise<boolean>;
    cancel(): Promise<boolean>;
    signOut(): Promise<ClaudeStatus>;
    onEvent(cb: (e: {type: string; line?: string; url?: string}) => void): () => void;
  };
  projects: {list(): Promise<Project[]>; get(id: string): Promise<Project>; create(d: {name: string; mode: Mode; style: Style; popout: boolean; look?: string; motion?: {aspect: '9:16' | '16:9'; lengthS: number}}): Promise<Project>; save(p: Project): Promise<Project>; remove(id: string): Promise<void>};
  media: {pick(kinds?: string[]): Promise<string[]>; attach(id: string, items: {path: string; role: Role}[]): Promise<{project: Project; added: MediaItem[]}>; detach(id: string, mediaId: string): Promise<Project>; poster(file: string): Promise<string | null>; url(file: string): Promise<string>; dir(dir: string): Promise<string>; kind(file: string): Promise<string>; pathOf(f: File): string};
  run: {start(id: string, step: 'prepare' | 'auto' | 'plan' | 'render', opts?: Record<string, unknown>): Promise<{runId: string; out?: string}>; cancel(runId: string): Promise<boolean>; active(): Promise<{runId: string; projectId: string; step: string; stage: string | null}[]>; onEvent(cb: (e: RunEvent) => void): () => void};
  job: {read(id: string): Promise<Job>};
  hook: {read(id: string): Promise<HookResult | null>; analyze(id: string): Promise<HookResult>};
  motion: {
    script(id: string): Promise<Project>;
    voices(): Promise<{voices: Voice[]; subscription: {tier: string; used: number | null; limit: number | null; resetsAt: number | null; error?: string}; models: {id: string; label: string}[]}>;
    voice(id: string): Promise<Project>;
    build(id: string, opts?: {notes?: string}): Promise<{clean: boolean; interrupted?: string | null; view: any}>;
  };
  agent: {
    build(id: string, opts: {reference: string; notes?: string}): Promise<{clean: boolean; interrupted?: string | null; view: any}>;
    continue(id: string): Promise<{clean: boolean; interrupted?: string | null; view: any}>;
    check(id: string): Promise<{rounds: number; clean: boolean; interrupted: string | null; canContinue: boolean; previewMissing: boolean} | null>;
    last(id: string): Promise<{out: string; url: string} | null>;
    state(id: string): Promise<any>;
    edit(id: string, instruction: string): Promise<{n: number; summary: string; view: any}>;
    undo(id: string): Promise<{n: number; view: any}>;
    render(id: string, opts?: {concurrency?: number}): Promise<{out: string; url: string; view: any}>;
    use(id: string, on: boolean): Promise<Project>;
    beats(id: string): Promise<{beats: AgentBeat[]; words: {t: string; s: number; e: number}[]; videoMs: number; width: number; height: number} | null>;
    saveBeats(id: string, beats: AgentBeat[], label: string): Promise<{n: number | null; view: any}>;
    enableTimeline(id: string): Promise<{n: number; summary: string; view: any}>;
  };
  plan: {save(id: string, plan: unknown, assetsPlan?: unknown): Promise<boolean>; ai(id: string, brief?: string): Promise<any>; edit(id: string, instruction: string): Promise<{n: number; summary: string}>; history(id: string): Promise<PlanChange[]>; restore(id: string, n: number): Promise<boolean>};
  looks: {list(): Promise<Look[]>; meta(): Promise<LookMeta>; save(l: Partial<Look>): Promise<Look>; remove(id: string): Promise<void>; sample(): Promise<string>; ai(r: {referencePath?: string; description?: string; name?: string}): Promise<Omit<Look, 'id' | 'builtin'>>};
  library: {list(): Promise<Reference[]>; add(file: string): Promise<unknown>; remove(id: string): Promise<void>};
  analyze: {list(): Promise<AnalysisSummary[]>; get(id: string): Promise<Analysis>; remove(id: string): Promise<void>; ytdlp(): Promise<{ok: boolean; version?: string; how?: string}>; install(): Promise<{ok: boolean; version?: string}>; start(r: {url?: string; file?: string; cookies?: string}): Promise<{id: string}>};
  shell: {external(u: string): Promise<boolean>; reveal(p: string): Promise<void>; open(p: string): Promise<string>; folder(): Promise<string | null>};
}

declare global {
  interface Window {
    omnimotion: Bridge;
  }
}

export const api = (): Bridge => window.omnimotion;
