import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, Check, FolderOpen} from '@phosphor-icons/react';
import {api, type EngineInfo, type Job, type Project, type RunEvent, type Settings} from '../lib/api';
import {useRun} from '../lib/run';
import {go, useToast} from '../lib/util';
import {MediaTab} from './MediaTab';
import {StoryTab} from './StoryTab';
import {PlanTab} from './PlanTab';
import {RenderTab} from './RenderTab';
import {AgentEdit, AgentRender} from './AgentBuild';
import {EditTab} from './EditTab';
import {HookTab} from './HookTab';
import {MotionBrief, MotionBuild, MotionScript, MotionVoice} from './MotionMode';

const TABS = [
  {id: 'media', label: 'Media'},
  {id: 'story', label: 'Story'},
  {id: 'plan', label: 'Plan'},
  {id: 'hook', label: 'Hook'},
  {id: 'edit', label: 'Edit'},
  {id: 'render', label: 'Render'},
] as const;
const MOTION_TABS = [
  {id: 'brief', label: 'Brief'},
  {id: 'script', label: 'Script'},
  {id: 'voice', label: 'Voice'},
  {id: 'build', label: 'Build'},
  {id: 'edit', label: 'Edit'},
  {id: 'render', label: 'Render'},
] as const;

export const Workspace = ({id, tab, engine, settings}: {id: string; tab: string; engine: EngineInfo | null; settings: Settings | null}) => {
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  const reloadJob = useCallback(() => api().job.read(id).then(setJob).catch(() => setJob(null)), [id]);
  useEffect(() => {
    api().projects.get(id).then(setProject).catch((e) => toast(e.message, 'bad'));
    reloadJob();
  }, [id, reloadJob, toast]);

  const persist = useCallback(async (p: Project) => {
    setProject(p);
    await api().projects.save(p);
  }, []);

  const onDone = useCallback(
    async (ev: RunEvent) => {
      await reloadJob();
      const p = projectRef.current;
      if (!p) return;
      if (ev.code !== 0) {
        toast('The run did not finish. Open the log on the current tab for details.', 'bad');
        return;
      }
      const next = {...p, status: {...p.status}};
      if (ev.step === 'prepare') next.status.prepared = true;
      if (ev.step === 'auto' || ev.step === 'plan') next.status.planned = true;
      if (ev.step === 'render' && ev.out) next.outputs = [{file: ev.out, at: Date.now(), label: `${p.mode === 'vlog' ? 'Vlog' : p.style === 'light' ? 'Light' : 'Tech'}`}, ...p.outputs];
      await persist(next);
      toast(ev.step === 'render' ? 'Render finished.' : ev.step === 'prepare' ? 'Transcript and cuts are ready.' : 'Plan resolved.');
    },
    [persist, reloadJob, toast],
  );
  const run = useRun(id, onDone);

  if (!project) return <div className="page muted">Loading project</div>;
  const motion = project.mode === 'motion';
  const tabs: readonly {id: string; label: string}[] = motion ? MOTION_TABS : TABS;
  const m = project.motion;
  const doneOf: Record<string, boolean> = motion
    ? {brief: String(m?.idea || '').trim().length > 10, script: !!m?.script?.length, voice: !!m?.voice, build: !!project.settings?.agentActive && !!m?.voice && project.status?.built === true, edit: false, render: project.outputs.length > 0}
    : {media: project.media.length > 0, story: !!project.status?.prepared || !!job?.prepared, plan: !!project.status?.planned, hook: !!job?.hasHook, edit: !!job?.plan && !!job?.resolved && (project.status?.planned ?? false), render: project.outputs.length > 0};

  return (
    <div>
      <div className="ws-head">
        <div className="row between">
          <a className="btn ghost sm" href="#/projects">
            <ArrowLeft size={16} aria-hidden /> Projects
          </a>
          <span className="row">
            <span className="chip">{project.mode === 'vlog' ? 'Vlog' : motion ? `Motion graphics ${m?.aspect || '9:16'}` : 'Talking head'}</span>
            {project.mode === 'talking' ? <span className="chip">{project.style === 'light' ? 'Light look' : 'Tech look'}</span> : null}
            <button className="btn ghost sm" onClick={() => api().shell.open(project.dir)}>
              <FolderOpen size={16} aria-hidden /> Project folder
            </button>
          </span>
        </div>
        <input className="title-input" aria-label="Project name" value={project.name} onChange={(e) => setProject({...project, name: e.target.value})} onBlur={() => persist(project)} />
        <div className="tabs" role="tablist" aria-label="Project steps">
          {tabs.map((t, i) => (
            <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} data-done={doneOf[t.id]} onClick={() => go(`#/project/${id}/${t.id}`)}>
              <span className="n">{doneOf[t.id] ? <Check size={12} weight="bold" aria-hidden /> : i + 1}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ws-body" role="tabpanel">
        {motion ? (
          <>
            {tab === 'brief' || tab === 'media' ? <MotionBrief project={project} persist={persist} /> : null}
            {tab === 'script' ? <MotionScript project={project} persist={persist} /> : null}
            {tab === 'voice' ? <MotionVoice project={project} persist={persist} /> : null}
            {tab === 'build' ? <MotionBuild project={project} persist={persist} settings={settings} /> : null}
            {tab === 'edit' ? <AgentEdit project={project} persist={persist} buildTab="build" /> : null}
            {tab === 'render' ? <AgentRender project={project} buildTab="build" /> : null}
          </>
        ) : (
          <>
        {tab === 'media' ? <MediaTab project={project} persist={persist} /> : null}
        {tab === 'story' ? <StoryTab project={project} persist={persist} job={job} run={run} engine={engine} settings={settings} /> : null}
        {tab === 'plan' ? <PlanTab project={project} job={job} run={run} reloadJob={reloadJob} settings={settings} persist={persist} /> : null}
        {tab === 'hook' ? <HookTab project={project} job={job} run={run} reloadJob={reloadJob} settings={settings} /> : null}
        {tab === 'edit' ? (project.settings?.agentActive ? <AgentEdit project={project} persist={persist} /> : <EditTab project={project} job={job} run={run} reloadJob={reloadJob} settings={settings} persist={persist} />) : null}
        {tab === 'render' ? (project.settings?.agentActive ? <AgentRender project={project} /> : <RenderTab project={project} job={job} run={run} engine={engine} persist={persist} />) : null}
          </>
        )}
      </div>
    </div>
  );
};
