import {useEffect, useState} from 'react';
import {FileText, FilmStrip, Image as ImageIcon, MusicNotes, Microphone, Trash, UploadSimple, VideoCamera, Stamp, Stack} from '@phosphor-icons/react';
import {api, type MediaItem, type Project, type Role} from '../lib/api';
import {fmtDur, fmtSize, go, useToast} from '../lib/util';

interface ZoneDef {
  role: Role;
  title: string;
  desc: string;
  kinds: string[];
  icon: typeof FilmStrip;
  required?: boolean;
  cap?: 'images' | 'videos';
}

const LIMITS = {images: 10, videos: 5};
const IMG_ROLES: Role[] = ['image', 'logo', 'screenshot'];

const ZONES: Record<'talking' | 'vlog', ZoneDef[]> = {
  talking: [
    {role: 'footage', title: 'Raw footage', desc: 'The clip of you speaking. One clip per project.', kinds: ['video'], icon: VideoCamera, required: true},
    {role: 'broll', title: 'Extra video', desc: 'Up to 5 clips to cut to or show in windows.', kinds: ['video'], icon: FilmStrip, cap: 'videos'},
    {role: 'image', title: 'Images', desc: 'Up to 10 screenshots or photos that belong in the story.', kinds: ['image'], icon: ImageIcon, cap: 'images'},
    {role: 'logo', title: 'Logos', desc: 'Brand marks, named after what you say. Counts toward the 10 images.', kinds: ['image'], icon: Stamp, cap: 'images'},
    {role: 'voiceover', title: 'Voice-over', desc: 'Replace the speech with a recording; your footage plays muted under it.', kinds: ['audio'], icon: Microphone},
    {role: 'music', title: 'Music', desc: 'Your own bed. Otherwise a royalty-free one is used.', kinds: ['audio'], icon: MusicNotes},
    {role: 'transcript', title: 'Transcript', desc: 'Your own text or subtitles, aligned to the speech.', kinds: ['text'], icon: FileText},
    {role: 'reference', title: 'References', desc: 'Videos whose style you like. Kept with the project and shared with Claude when it plans.', kinds: ['video'], icon: Stack},
  ],
  vlog: [
    {role: 'voiceover', title: 'Narration', desc: 'The recording of your voice. It sets the timeline.', kinds: ['audio'], icon: Microphone, required: true},
    {role: 'clip', title: 'Clips', desc: 'Your daily footage. Add as many as you like.', kinds: ['video'], icon: VideoCamera, required: true},
    {role: 'music', title: 'Music', desc: 'Your own bed. Otherwise a royalty-free one is used.', kinds: ['audio'], icon: MusicNotes},
    {role: 'image', title: 'Images', desc: 'Up to 10 photos or screens to show over the clips.', kinds: ['image'], icon: ImageIcon, cap: 'images'},
    {role: 'transcript', title: 'Transcript', desc: 'Your own text or subtitles, aligned to the narration.', kinds: ['text'], icon: FileText},
    {role: 'reference', title: 'References', desc: 'Videos whose style you like. Kept with the project and shared with Claude when it plans.', kinds: ['video'], icon: Stack},
  ],
};

const ROLE_LABEL: Partial<Record<Role, string>> = {footage: 'Footage', clip: 'Clip', broll: 'Extra video', voiceover: 'Voice-over', music: 'Music', image: 'Image', logo: 'Logo', screenshot: 'Screenshot', transcript: 'Transcript', reference: 'Reference'};

const Zone = ({def, count, used, onFiles}: {def: ZoneDef; count: number; used: number; onFiles: (paths: string[]) => void}) => {
  const [over, setOver] = useState(false);
  const Icon = def.icon;
  const limit = def.cap ? LIMITS[def.cap] : null;
  const full = limit !== null && used >= limit;
  const accept = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (full) return;
    const paths = Array.from(e.dataTransfer.files).map((f) => api().media.pathOf(f)).filter(Boolean);
    if (paths.length) onFiles(paths);
  };
  return (
    <button
      className={`zone ${over ? 'over' : ''}`}
      disabled={full}
      onClick={async () => {
        const p = await api().media.pick(def.kinds);
        if (p.length) onFiles(p);
      }}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={accept}
      aria-label={`Add ${def.title}`}
    >
      <span className="t">
        <Icon size={20} aria-hidden /> {def.title}
      </span>
      <span className="d">{def.desc}</span>
      <span className="req row">
        {limit !== null ? <span className={`chip ${full ? 'accent' : used ? 'ok' : ''}`}>{used} of {limit}{full ? ' (full)' : ''}</span> : def.required ? <span className={`chip ${count ? 'ok' : 'accent'}`}>{count ? `${count} added` : 'Required'}</span> : count ? <span className="chip ok">{count} added</span> : null}
        <span className="faint row" style={{gap: 4, fontSize: 'var(--fs-xs)'}}>
          <UploadSimple size={14} aria-hidden /> {full ? 'Remove one to add more' : 'Drop files or click'}
        </span>
      </span>
    </button>
  );
};

const Row = ({m, onRemove}: {m: MediaItem; onRemove: () => void}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (m.kind === 'video' || m.kind === 'image') api().media.poster(m.path).then(setSrc).catch(() => {});
  }, [m.path, m.kind]);
  const Icon = m.kind === 'audio' ? MusicNotes : m.kind === 'text' ? FileText : m.kind === 'image' ? ImageIcon : FilmStrip;
  return (
    <div className="media-row">
      <div className="ph">{src ? <img src={src} alt="" /> : <Icon size={20} aria-hidden />}</div>
      <div className="nm">
        <div title={m.name}>{m.name}</div>
        <div className="faint" style={{fontSize: 'var(--fs-xs)'}}>
          {[fmtDur(m.durationMs), m.width && m.height ? `${m.width}x${m.height}` : '', fmtSize(m.size)].filter(Boolean).join('  ·  ')}
        </div>
      </div>
      <span className="chip">{ROLE_LABEL[m.role] || m.role}</span>
      <button className="btn ghost icon sm" aria-label={`Remove ${m.name}`} onClick={onRemove}>
        <Trash size={16} aria-hidden />
      </button>
    </div>
  );
};

export const MediaTab = ({project, persist}: {project: Project; persist: (p: Project) => Promise<void>}) => {
  const toast = useToast();
  const zones = ZONES[project.mode === "vlog" ? "vlog" : "talking"];
  const usedOf = (cap?: 'images' | 'videos') => (cap === 'images' ? project.media.filter((m) => IMG_ROLES.includes(m.role)).length : cap === 'videos' ? project.media.filter((m) => m.role === 'broll').length : 0);
  const add = async (role: Role, paths: string[], cap?: 'images' | 'videos') => {
    try {
      let list = paths;
      if (cap) {
        const room = LIMITS[cap] - usedOf(cap);
        if (paths.length > room) toast(`Only ${Math.max(0, room)} more ${cap === 'images' ? 'image' : 'video'}${room === 1 ? '' : 's'} fit (limit ${LIMITS[cap]}). The first ${Math.max(0, room)} were added.`, 'bad');
        list = paths.slice(0, Math.max(0, room));
        if (!list.length) return;
      }
      const r = await api().media.attach(project.id, list.map((path) => ({path, role})));
      await persist(r.project);
      toast(`${r.added.length} file${r.added.length > 1 ? 's' : ''} added. Your originals were copied, not changed.`);
    } catch (e: any) {
      toast(e.message, 'bad');
    }
  };
  const remove = async (m: MediaItem) => persist(await api().media.detach(project.id, m.id));
  const missing = zones.filter((z) => z.required && !project.media.some((m) => m.role === z.role || (z.role === 'footage' && m.role === 'footage')));
  const multipleFootage = project.mode === 'talking' && project.media.filter((m) => m.role === 'footage').length > 1;
  return (
    <div className="stack" style={{gap: 'var(--sp-6)'}}>
      <section className="stack">
        <div>
          <h2>Add your material</h2>
          <p className="muted">{project.mode === 'vlog' ? 'Drop the narration and your clips. Files are copied into the project folder; your originals are never changed.' : 'Drop the raw clip and anything the video should use. Files are copied into the project folder; your originals are never changed.'}</p>
        </div>
        <div className="zones">
          {zones.map((z) => (
            <Zone key={z.role} def={z} count={project.media.filter((m) => m.role === z.role).length} used={usedOf(z.cap)} onFiles={(p) => add(z.role, p, z.cap)} />
          ))}
        </div>
        {multipleFootage ? <div className="notice">Only the first footage clip is edited. Move the others to Extra video if you want to cut to them.</div> : null}
      </section>

      <section className="stack">
        <div className="row between">
          <h2>Attached ({project.media.length})</h2>
          {missing.length ? <span className="chip accent">Still needed: {missing.map((m) => m.title).join(', ')}</span> : <button className="btn primary" onClick={() => go(`#/project/${project.id}/story`)}>Continue to Story</button>}
        </div>
        {project.media.length ? (
          <div className="card media-list">
            {project.media.map((m) => (
              <Row key={m.id} m={m} onRemove={() => remove(m)} />
            ))}
          </div>
        ) : (
          <div className="card empty muted">Nothing attached yet.</div>
        )}
      </section>

      <section className="card pad row between">
        <div className="row">
          <Stack size={22} aria-hidden />
          <div>
            <h3>Style references</h3>
            <p className="muted" style={{fontSize: 'var(--fs-sm)'}}>The Tech and Light looks are built from three reference videos. Browse them, and the colours measured from them, in the Library.</p>
          </div>
        </div>
        <a className="btn secondary" href="#/library">
          Open Library
        </a>
      </section>
    </div>
  );
};
