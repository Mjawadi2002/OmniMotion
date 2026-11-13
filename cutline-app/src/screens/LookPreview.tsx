import {useEffect, useMemo, useState} from 'react';
import {Player} from '@remotion/player';
import {DirectorMain} from '@engine/remotion/director/DirectorMain';
import {loadFonts} from '../engine/fonts';
import {api, type Look} from '../lib/api';
import {SAMPLE_FPS, SAMPLE_H, SAMPLE_MS, SAMPLE_W, buildSamplePlan} from '../lib/samplePlan';

let sampleBase: Promise<string> | null = null;
const getBase = () => (sampleBase ||= api().looks.sample());
// where the face is in the sample (measured next to it), so the head card frames it as in the real edit
let sampleFace: Promise<any> | null = null;
const getFace = (base: string) =>
  (sampleFace ||= fetch(`${base}/face.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.face) || null)
    .catch(() => null));

// Real preview of a look: the same composition the render uses, over a short sample edit.
// `still` shows one frame (for cards); otherwise it plays with controls.
const LookPreview = ({look, still, frame = 50}: {look: Pick<Look, 'family' | 'roles' | 'fonts' | 'grade'>; still?: boolean; frame?: number}) => {
  const [base, setBase] = useState<string | null>(null);
  const [face, setFace] = useState<any>(undefined);
  useEffect(() => {
    loadFonts();
    getBase()
      .then(async (b) => {
        setFace(await getFace(b));
        setBase(b);
      })
      .catch(() => setBase(null));
  }, []);
  const key = JSON.stringify([look.family, look.roles, look.fonts, look.grade]);
  const plan = useMemo(() => buildSamplePlan(look, face), [key, face]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!base) return <div className="look-prev-wait">Preparing preview</div>;
  (window as any).remotion_staticBase = base;
  return (
    <Player
      component={DirectorMain as any}
      inputProps={plan}
      durationInFrames={Math.round((SAMPLE_MS * SAMPLE_FPS) / 1000)}
      compositionWidth={SAMPLE_W}
      compositionHeight={SAMPLE_H}
      fps={SAMPLE_FPS}
      controls={!still}
      loop
      autoPlay={false}
      initialFrame={frame}
      clickToPlay={!still}
      acknowledgeRemotionLicense
      style={{width: '100%', height: '100%'}}
    />
  );
};

export default LookPreview;
