// @ts-nocheck
// One component per shot. Times come from cues (words in the transcript), colors from palette roles, copy from story.texts.
import React from 'react';
import {Blob, Ell, Ln, Rct, Txt, clamp01, easeBack, easeInOut, easeOut, lerp, rnd, win} from './ink';
import {Clock, ClipPile, FileIcon, Mug, Note, Pen, Sami, Scissors, Sprite, TrackBar, Waveform, Window, useStory} from './art';

const HUGE = {x: -3000, y: -3000, w: 7000, h: 7000};

// ------------------------------------------------------------------------------------------------ 1. the room at 2 AM
export const RoomScene = ({tMs}) => {
  const {C, roles, family, sizes, texts, emo} = useStory();
  const e = emo(tMs);
  const sinceFootage = tMs - C('footage');
  const thud = sinceFootage > 0 && sinceFootage < 500 ? 1 - sinceFootage / 500 : 0;
  const stampP = easeBack(win(tMs, C('deadline') - 60, C('deadline') + 260));
  const sinceDeadline = tMs - C('deadline');
  const alarm = sinceDeadline > 0 ? 1 : 0;
  const shake = alarm * Math.max(0, 1 - sinceDeadline / 1800);
  const tick = Math.floor(tMs / 1000);
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.backgroundAlt} stroke="none" amp={0} />
      <Rct x={-3000} y={790} w={7000} h={2500} r={0} fill={roles.shape} stroke="none" amp={0} />
      <Ln x1={-3000} y1={790} x2={4000} y2={790} sw={10} amp={1.5} />
      {/* window with a moon */}
      <Rct x={520} y={90} w={170} h={200} r={14} fill={roles.background} seed={1} />
      <Ell cx={600} cy={170} rx={36} ry={36} fill={roles.accent} seed={2} />
      <Ln x1={605} y1={90} x2={605} y2={290} sw={7} />
      <Ln x1={520} y1={190} x2={690} y2={190} sw={7} />
      {/* wall clock */}
      <Clock cx={190} cy={210} r={125} hour={2} minute={0} tick={tick} shake={shake} alarm={alarm && sinceDeadline < 900 ? 1 : 0} seed={10} />
      {/* calendar with the stamp */}
      <g transform="translate(850 250) rotate(4)">
        <Rct x={-95} y={-125} w={190} h={250} r={12} fill={roles.text} seed={20} />
        <Rct x={-95} y={-125} w={190} h={56} r={12} fill={roles.accent2} seed={21} />
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((q) => <Ell key={`${r}${q}`} cx={-60 + q * 40} cy={-30 + r * 36} rx={6} ry={6} fill={roles.background} stroke="none" amp={0.6} seed={30 + r * 4 + q} />))}
        <g transform={`translate(0 30) rotate(-12) scale(${lerp(2.6, 1, stampP)})`} opacity={stampP}>
          <Rct x={-105} y={-34} w={210} h={68} r={10} fill="none" stroke={roles.negative} sw={9} seed={40} />
          <Txt x={0} y={14} size={sizes.stamp} fill={roles.negative} family={family} seed={41}>{texts.deadline}</Txt>
        </g>
      </g>
      {/* desk and monitor */}
      <Rct x={560} y={600} w={430} h={56} r={10} fill={roles.surfaceAlt} seed={50} />
      <Ln x1={600} y1={656} x2={600} y2={800} sw={9} />
      <Ln x1={950} y1={656} x2={950} y2={800} sw={9} />
      <Rct x={650} y={400} w={250} h={170} r={14} fill={roles.background} seed={51} />
      <Rct x={664} y={414} w={222} h={142} r={8} fill={roles.shape} stroke="none" seed={52} amp={0.6} />
      <Ln x1={775} y1={570} x2={775} y2={600} sw={9} />
      {[0, 1, 2].map((i) => <Ln key={i} x1={684} y1={440 + i * 36} x2={684 + 90 + ((i * 53) % 90)} y2={440 + i * 36} sw={8} stroke={roles.accent3} seed={60 + i} amp={0.8} />)}
      {/* Sami, buried behind the pile */}
      <Sami x={400} y={455} s={1} emo={e} rot={Math.sin(tMs / 700) * 1.2 + (e.sweat ? Math.sin(tMs / 60) * 1.2 : 0)} />
      <ClipPile x0={90} y0={836} w={680} rows={6} cols={8} t={sinceFootage} thud={thud * 3} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 2. the messy timeline
export const PainScene = ({tMs}) => {
  const {C, roles, family, sizes, texts, emo} = useStory();
  const e = emo(tMs);
  const glow = Math.sin(clamp01(win(tMs, C('silence') - 50, C('silence') + 1400)) * Math.PI) * 1 * (tMs < C('add') ? 1 : 0.35);
  const sinceFix = Math.max(0, tMs - C('fix'));
  const jitter = clamp01(sinceFix / 700) * 12;
  const gaps = [{a: 11, b: 20, close: 0}, {a: 33, b: 42, close: 0}, {a: 51, b: 59, close: 0}];
  const caps = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const st = C('captions') + i * 110;
    const p = easeBack(win(tMs, st, st + 220));
    if (p <= 0.01) return null;
    const w = 110 + ((i * 47) % 70);
    const x = 130 + i * 118 + rnd(i * 2.1) * 26;
    const y = 345 + (i % 2) * 6 + rnd(i * 3.3) * 8;
    return (
      <g key={i} transform={`translate(${rnd(i + 7) * jitter} 0) rotate(${rnd(i * 4.4) * 5} ${x} ${y})`} opacity={p}>
        <Rct x={x} y={y} w={w * p} h={46} r={9} fill={roles.accent} seed={80 + i} sw={6} />
        <Ln x1={x + 14} y1={y + 23} x2={x + w * 0.7} y2={y + 23} sw={5} seed={90 + i} amp={1} />
      </g>
    );
  });
  const files = Array.from({length: 10}, (_, i) => {
    const st = C('music1') + i * 150;
    const f = win(tMs, st, st + 700);
    if (f <= 0) return null;
    const x = 140 + ((i * 97) % 760);
    const yTarget = 560 + ((i * 41) % 90);
    const y = lerp(-140, yTarget, easeOut(f));
    return <FileIcon key={i} x={x} y={y} s={0.55} rot={rnd(i * 7) * 25 + f * 90 * (1 - f)} role={['accent3', 'accent', 'accent2'][i % 3]} seed={i * 3} />;
  });
  const minute = sinceFix > 0 ? (sinceFix / 1000) * 130 : 0;
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.background} stroke="none" amp={0} />
      <g transform={`translate(${rnd(tMs / 40) * (e.sweat ? 2.5 : 0)} 0)`}>
        <Rct x={70} y={170} w={940} h={620} r={26} fill={roles.surface} stroke={roles.accent2} seed={100} sw={10} />
        <Rct x={76} y={176} w={928} h={54} r={20} fill={roles.surfaceAlt} stroke="none" seed={101} amp={0.5} />
        {texts.trackLabels.map((lab, i) => (
          <Txt key={lab} x={150} y={[300, 395, 520, 650][i]} size={sizes.label * 0.62} fill={roles.textMuted} family={family} weight={700} seed={i}>{lab}</Txt>
        ))}
        {[0, 1, 2, 3, 4].map((i) => <TrackBar key={i} x={210 + i * 160 + rnd(i) * 10} y={265} w={150} h={62} role={['accent2', 'accent', 'accent3', 'accent2', 'accent'][i]} seed={110 + i} jitter={jitter} />)}
        {caps}
        <Waveform x={220} y={520} w={760} h={120} bars={64} gaps={gaps} t={tMs} glow={glow} seed={3} />
        <Rct x={210} y={600} w={780} h={62} r={12} fill={roles.surfaceAlt} stroke={roles.accent3} sw={5} seed={150} amp={1} />
        {files}
      </g>
      {/* insets: Sami reacting and the racing clock */}
      <Sami x={140} y={92} s={0.34} emo={e} body={false} />
      <Clock cx={940} cy={86} r={56} hour={2} minute={minute} tick={Math.floor(tMs / 120)} alarm={sinceFix > 200 ? 1 : 0} shake={clamp01(sinceFix / 500)} seed={170} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 3. the terminal and the cursor that wakes up
export const TerminalScene = ({tMs}) => {
  const {C, roles, family, mono, sizes, texts, emo} = useStory();
  const e = emo(tMs);
  const open = easeBack(win(tMs, C('so') + 80, C('opens') + 380));
  const cmd = texts.command;
  const typed = Math.max(0, Math.min(cmd.length, Math.floor((tMs - C('edit1')) / 72)));
  const enterAt = C('something') - 260;
  const entered = tMs >= enterAt;
  const charW = sizes.terminal * 0.6;
  const line1Y = 360;
  const x0 = 160;
  const blink = Math.floor(tMs / 480) % 2 === 0;
  const caretX = entered ? x0 + sizes.terminal * 0.9 : x0 + sizes.terminal * 0.9 + typed * charW;
  const caretY = entered ? line1Y + 90 : line1Y;
  const wake = easeOut(win(tMs, C('something') - 80, C('wakes') + 520));
  const grow = easeInOut(win(tMs, C('wakes') - 260, C('wakes') + 900));
  const sx = lerp(caretX + 6, 560, grow);
  const sy = lerp(caretY - 6, 470, grow);
  const ss = lerp(0.27, 1.45, grow);
  const lookAtSami = clamp01((tMs - C('up')) / 300);
  const visibleTyped = cmd.slice(0, typed);
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.background} stroke="none" amp={0} />
      <g transform={`translate(540 460) scale(${Math.max(0.01, open)}) translate(-540 -460)`}>
        <Window x={100} y={190} w={880} h={560} title={texts.terminalTitle} fill={roles.surface} seed={200} />
        <Txt x={x0} y={line1Y + sizes.terminal * 0.35} size={sizes.terminal} fill={roles.accent3} family={mono} anchor="start" seed={1}>{texts.prompt}</Txt>
        <Txt x={x0 + sizes.terminal * 0.9} y={line1Y + sizes.terminal * 0.35} size={sizes.terminal} fill={roles.text} family={mono} anchor="start" seed={2}>{visibleTyped}</Txt>
        {entered ? <Txt x={x0} y={line1Y + 90 + sizes.terminal * 0.35} size={sizes.terminal} fill={roles.accent3} family={mono} anchor="start" seed={3}>{texts.prompt}</Txt> : null}
        {wake < 0.04 ? (
          <Rct x={caretX} y={caretY - sizes.terminal * 0.55} w={sizes.terminal * 0.55} h={sizes.terminal * 1.15} r={3} fill={roles.accent3} opacity={blink ? 1 : 0.15} stroke="none" amp={0} />
        ) : null}
      </g>
      {wake >= 0.04 ? <Sprite x={sx} y={sy} s={ss} wake={wake} t={tMs} look={[lerp(0, -0.9, lookAtSami), lerp(0, -0.5, lookAtSami)]} wave={grow > 0.9 ? 1 : 0} /> : null}
      <Sami x={170} y={112} s={0.52} emo={e} body={false} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 4. the sprite snips every silence
export const SnipScene = ({tMs}) => {
  const {C, roles, emo} = useStory();
  const snips = [0, 330, 660].map((o) => C('trims') + o);
  const closes = snips.map((st) => easeOut(win(tMs, st + 50, st + 300)));
  const gaps = [{a: 11, b: 20, close: closes[0]}, {a: 33, b: 42, close: closes[1]}, {a: 51, b: 59, close: closes[2]}];
  const centers = [(15.5 / 64) * 760 + 220, (37.5 / 64) * 760 + 220, (55 / 64) * 760 + 220];
  const idx = tMs < snips[1] - 100 ? 0 : tMs < snips[2] - 100 ? 1 : 2;
  const prev = idx === 0 ? 0 : idx - 1;
  const hop = easeInOut(win(tMs, snips[idx] - 260, snips[idx] - 60));
  const spx = idx === 0 ? centers[0] : lerp(centers[prev], centers[idx], hop);
  const since = tMs - snips[idx];
  const open = since < -80 ? 1 : since < 40 ? 1 - win(tMs, snips[idx] - 80, snips[idx] + 40) : win(tMs, snips[idx] + 40, snips[idx] + 220);
  const bob = Math.sin(clamp01(hop) * Math.PI) * 36;
  const strips = snips.map((st, k) => {
    const f = win(tMs, st + 40, st + 700);
    if (f <= 0 || f >= 1) return null;
    return <Rct key={k} x={centers[k] - 30} y={440 + f * f * 260} w={60} h={90} r={6} fill={roles.negative} opacity={1 - f} sw={6} seed={700 + k} amp={1} transform={`rotate(${f * 120 * (k % 2 ? -1 : 1)} ${centers[k]} ${470 + f * 200})`} />;
  });
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.backgroundAlt} stroke="none" amp={0} />
      <Rct x={70} y={340} w={940} h={300} r={26} fill={roles.surface} stroke={roles.accent2} seed={720} sw={10} />
      <Waveform x={150} y={490} w={800} h={150} bars={64} gaps={gaps} t={tMs} glow={0.0} seed={3} />
      <Rct x={140} y={420} w={820} h={140} r={14} fill="none" stroke={roles.accent3} sw={5} opacity={0.5} seed={721} amp={1} />
      {strips}
      <Sprite x={spx} y={228 - bob} s={1.2} wake={1} t={tMs} look={[0, 0.8]} bounce={1} hold={<Scissors x={-4} y={8} s={0.5} open={open} rot={-20} />} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 5. word by word captions
export const WriteScene = ({tMs}) => {
  const {C, roles, family, words} = useStory();
  const list = words.filter((w) => w.startMs >= C('writes') - 40 && w.startMs <= C('word2') + 40);
  const perLine = Math.ceil(list.length / 2);
  const lineChars = Math.max(...[0, 1].map((ln) => list.slice(ln * perLine, (ln + 1) * perLine).reduce((a, w) => a + w.text.replace(/[^\p{L}\p{N}']/gu, '').length, 0)));
  const size = Math.min(104, (800 - perLine * 44) / (lineChars * 0.56));
  const lineY = [470, 610];
  const widths = list.map((w) => w.text.replace(/[^\p{L}\p{N}']/gu, '').length * size * 0.56 + 44);
  const place = list.map((w, i) => {
    const line = Math.floor(i / perLine);
    const inLine = list.slice(line * perLine, (line + 1) * perLine);
    const lw = inLine.reduce((a, _, k) => a + widths[line * perLine + k], 0);
    let x = 540 - lw / 2;
    for (let k = line * perLine; k < i; k++) x += widths[k];
    return {x: x + widths[i] / 2, y: lineY[line], w: widths[i]};
  });
  let current = -1;
  list.forEach((w, i) => {
    if (tMs >= w.startMs - 40) current = i;
  });
  const cur = current >= 0 ? place[current] : {x: 200, y: 330};
  const sx = lerp(260, cur.x, easeOut(win(tMs, C('writes') - 200, C('writes') + 200)));
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.background} stroke="none" amp={0} />
      <Rct x={90} y={340} w={900} h={380} r={28} fill={roles.surface} stroke={roles.accent2} seed={800} sw={10} />
      {list.map((w, i) => {
        const p = easeBack(win(tMs, w.startMs - 50, w.startMs + 260));
        const active = i === current;
        const hl = active ? 1 : Math.max(0, 1 - (tMs - (list[i + 1] ? list[i + 1].startMs : w.endMs)) / 300);
        const label = w.text.replace(/[,.]/g, '');
        return (
          <g key={i} opacity={clamp01(p * 1.6)} transform={`translate(${place[i].x} ${place[i].y}) scale(${0.6 + 0.4 * p}) translate(${-place[i].x} ${-place[i].y})`}>
            {hl > 0.01 ? <Rct x={place[i].x - place[i].w / 2 + 6} y={place[i].y - size * 0.82} w={(place[i].w - 12) * easeOut(win(tMs, w.startMs - 40, w.startMs + 220))} h={size * 1.02} r={14} fill={roles.accent} opacity={0.9 * (active ? 1 : hl)} stroke="none" seed={810 + i} amp={1.2} /> : null}
            <Txt x={place[i].x} y={place[i].y} size={size} fill={active ? roles.textOnAccent : roles.text} family={family} seed={820 + i}>{label}</Txt>
          </g>
        );
      })}
      <Sprite x={sx} y={235 + Math.sin(tMs / 160) * 6} s={1.05} wake={1} t={tMs} look={[0, 0.9]} bounce={2} hold={<g transform="translate(-6 8)"><Pen s={0.8} rot={20} /></g>} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 6. graphics, sound, music, tidy tracks
export const FxScene = ({tMs}) => {
  const {C, roles, family, sizes} = useStory();
  const arrive = (i, base) => easeBack(win(tMs, base + i * 140, base + i * 140 + 460));
  const pa = [0, 1, 2, 3].map((i) => arrive(i, C('motion') - 60));
  const wave = Math.max(0, tMs - C('sound'));
  const speakerP = easeBack(win(tMs, C('sound') - 60, C('sound') + 300));
  const noteP = easeBack(win(tMs, C('soft') - 60, C('soft') + 320));
  const snap = easeOut(win(tMs, C('music2') + 120, C('music2') + 520));
  const track = (i) => {
    const mess = (1 - snap) * (rnd(i * 5.7) * 70);
    const lenA = [300, 240, 360, 200][i];
    return <TrackBar key={i} x={140 + mess} y={680 + i * 62} w={lenA + (1 - snap) * rnd(i + 2) * 80} h={46} role={['accent2', 'accent', 'accent3', 'accent2'][i]} seed={900 + i} jitter={(1 - snap) * 6} />;
  };
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.backgroundAlt} stroke="none" amp={0} />
      {/* motion graphics fly in around the sprite */}
      <g transform={`translate(${lerp(-300, 0, pa[0])} 0)`} opacity={clamp01(pa[0] * 2)}>
        <Ell cx={190} cy={250} rx={84} ry={84} n={16} fill="none" sw={20} stroke={roles.accent3} seed={910} />
        <Blob pts={[[190, 166], [262, 200], [276, 262], [236, 318]]} closed={false} sw={22} stroke={roles.accent} seed={911} />
      </g>
      <g transform={`translate(${lerp(300, 0, pa[1])} 0)`} opacity={clamp01(pa[1] * 2)}>
        <Blob pts={[[790, 300], [840, 220], [920, 230], [950, 290]]} closed={false} sw={16} stroke={roles.accent} seed={920} />
        <Blob pts={[[918, 262], [952, 292], [914, 316]]} closed={false} sw={16} stroke={roles.accent} seed={921} />
      </g>
      <g transform={`translate(0 ${lerp(-300, 0, pa[2])})`} opacity={clamp01(pa[2] * 2)}>
        <Blob pts={[[200, 480], [226, 420], [252, 480], [190, 444], [262, 444]]} fill={roles.accent} seed={930} sw={7} />
      </g>
      <g transform={`translate(0 ${lerp(300, 0, pa[3])})`} opacity={clamp01(pa[3] * 2)}>
        {[0, 1, 2, 3].map((i) => <Rct key={i} x={800 + i * 34} y={500 - [40, 80, 60, 110][i]} w={26} h={[40, 80, 60, 110][i]} r={5} fill={[roles.accent2, roles.accent3, roles.accent, roles.accent3][i]} seed={940 + i} sw={6} amp={0.8} />)}
      </g>
      {/* sound effects: speaker with ringing arcs */}
      <g transform={`translate(260 590) scale(${speakerP})`}>
        <Blob pts={[[-40, -22], [-12, -22], [24, -50], [24, 50], [-12, 22], [-40, 22]]} fill={roles.accent} seed={950} />
        {[0, 1, 2].map((i) => {
          const ph = ((wave / 500 + i / 3) % 1);
          return <Blob key={i} pts={[[40 + i * 20, -26 - i * 10], [58 + i * 20, 0], [40 + i * 20, 26 + i * 10]]} closed={false} sw={8} stroke={roles.text} opacity={tMs > C('sound') ? 1 - ph : 0.3} seed={955 + i} amp={0.6} />;
        })}
      </g>
      {/* soft music */}
      <g transform={`translate(0 ${Math.sin(tMs / 400) * 6})`}>
        <Note x={820} y={600} s={1.3 * noteP} role="accent3" seed={960} />
        <Note x={890} y={640} s={0.8 * noteP} role="accent" rot={10} seed={961} />
      </g>
      {[0, 1, 2, 3].map(track)}
      <Sprite x={540} y={320} s={1.25} wake={1} t={tMs} look={[0, 0.3]} wave={1} bounce={3} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 7. payoff
export const PayoffScene = ({tMs}) => {
  const {C, roles, family, sizes, emo} = useStory();
  const e = emo(tMs);
  const playP = win(tMs, C('video2'), C('claude'));
  const phoneIn = easeBack(win(tMs, C('minutes') + 250, C('minutes') + 700));
  const asleep = tMs >= C('bring') - 400;
  const zs = [0, 1, 2].map((i) => {
    const ph = ((tMs / 1500 + i / 3) % 1);
    return asleep ? <Txt key={i} x={740 + ph * 70 + i * 14} y={300 - ph * 120} size={50 - i * 8} fill={roles.accent3} family={family} opacity={1 - ph} seed={i}>z</Txt> : null;
  });
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.surfaceAlt} stroke="none" amp={0} />
      <Ell cx={540} cy={430} rx={420} ry={420} n={18} fill={roles.accent} opacity={0.18} stroke="none" amp={4} />
      <Rct x={-3000} y={800} w={7000} h={2500} r={0} fill={roles.shape} stroke="none" amp={0} />
      <Ln x1={-3000} y1={800} x2={4000} y2={800} sw={10} amp={1.5} />
      <Clock cx={170} cy={175} r={105} hour={2} minute={14} tick={Math.floor(tMs / 1000)} seed={1000} />
      {/* phone with the finished video */}
      <g transform={`translate(330 ${lerp(900, 0, phoneIn)})`}>
        <Rct x={-125} y={290} w={250} h={440} r={34} fill={roles.background} seed={1010} sw={10} />
        <Rct x={-108} y={316} w={216} h={388} r={20} fill={roles.shape} stroke="none" seed={1011} amp={0.6} />
        {playP <= 0.01 ? <Blob pts={[[-20, 470], [-20, 540], [40, 505]]} fill={roles.text} sw={6} seed={1012} /> : (
          <g>
            <Rct x={-90} y={346} w={180} h={150} r={10} fill={roles.accent2} stroke="none" seed={1013} amp={0.6} />
            <Sprite x={0} y={420} s={0.42} wake={1} t={tMs} wave={1} bounce={4} />
            <Rct x={-82} y={520} w={164} h={34} r={12} fill={roles.captionBg} stroke="none" seed={1014} amp={0.5} />
            {[0, 1, 2].map((i) => <Rct key={i} x={-70 + i * 52} y={528} w={Math.min(44, Math.max(0, (playP * 3 - i) * 44))} h={18} r={5} fill={i === Math.floor(playP * 3) ? roles.accent : roles.text} stroke="none" seed={1015 + i} amp={0.3} />)}
            <Rct x={-82} y={640} w={164} h={14} r={7} fill={roles.surface} stroke="none" seed={1020} amp={0.3} />
            <Rct x={-82} y={640} w={164 * playP} h={14} r={7} fill={roles.accent3} stroke="none" seed={1021} amp={0.3} />
          </g>
        )}
      </g>
      {/* Sami in the chair, mug in hand */}
      <Rct x={560} y={520} w={300} h={300} r={30} fill={roles.accent2} opacity={0.55} seed={1030} sw={9} />
      <Sami x={720} y={450} s={0.95} emo={e} rot={-6} hands={<Mug x={110} y={190} s={0.85} t={tMs} />} />
      {zs}
      <Sprite x={930} y={700} s={0.55} wake={1} t={tMs} wave={1} bounce={5} flip={-1} />
    </g>
  );
};

// ------------------------------------------------------------------------------------------------ 8. end card
export const EndScene = ({tMs}) => {
  const {C, roles, family, sizes, texts} = useStory();
  const typeOn = (txt, start, end) => txt.slice(0, Math.floor(txt.length * clamp01((tMs - start) / Math.max(1, end - start))));
  const words1 = texts.endLine1.split(' ');
  const half = Math.ceil(words1.length / 2);
  const l1 = words1.slice(0, half).join(' ');
  const l2 = words1.slice(half).join(' ');
  const t1 = typeOn(texts.endLine1, C('claude') - 100, C('edit2') + 1400);
  const a = t1.slice(0, l1.length);
  const b = t1.slice(l1.length + 1);
  const t2 = typeOn(texts.endLine2, C('bring') - 80, C('story') + 700);
  const hand = texts.handle ? typeOn(texts.handle, C('cutting') - 100, C('cutting') + 600) : '';
  const sleepZ = [0, 1, 2].map((i) => {
    const ph = ((tMs / 1500 + i / 3) % 1);
    return <Txt key={i} x={250 + ph * 50 + i * 12} y={770 - ph * 90} size={42 - i * 7} fill={roles.accent3} family={family} opacity={1 - ph} seed={i}>z</Txt>;
  });
  return (
    <g>
      <Rct {...HUGE} r={0} fill={roles.background} stroke="none" amp={0} />
      <Ell cx={540} cy={470} rx={430} ry={430} n={18} fill={roles.accent2} opacity={0.28} stroke="none" amp={4} />
      <Ell cx={760} cy={300} rx={260} ry={260} n={16} fill={roles.accent3} opacity={0.16} stroke="none" amp={4} />
      <Txt x={540} y={400} size={sizes.endTitle} fill={roles.text} family={family} seed={1}>{a}</Txt>
      <Txt x={540} y={505} size={sizes.endTitle} fill={roles.text} family={family} seed={2}>{b}</Txt>
      <Ln x1={250} y1={548} x2={830} y2={548} sw={10} stroke={roles.accent} opacity={clamp01((tMs - C('edit2')) / 600)} seed={3} amp={2} />
      <Txt x={540} y={680} size={sizes.endSub} fill={roles.accent} family={family} seed={4}>{t2}</Txt>
      {hand ? <Txt x={540} y={770} size={sizes.handle} fill={roles.textMuted} family={family} weight={600} seed={5}>{hand}</Txt> : null}
      <Sprite x={860} y={760} s={0.7} wake={1} t={tMs} wave={1} bounce={6} flip={-1} />
      <Sami x={190} y={730} s={0.42} emo={{lid: 1, browAngle: -0.1, browRaise: 8, mouthCurve: 0.35, mouthOpen: 0, sweat: 0, bags: 0, gaze: [0, 0]}} rot={-6} />
      {sleepZ}
    </g>
  );
};

export const SCENES = {room: RoomScene, pain: PainScene, terminal: TerminalScene, snip: SnipScene, write: WriteScene, fx: FxScene, payoff: PayoffScene, end: EndScene};
