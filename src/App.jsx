import React, { useState, useEffect, useRef, useContext } from 'react';
import{ATTRS,SKILLS, ALWAYS_AVAILABLE, NATIONALITIES, CHILDHOODS, MILITARY_RANKS, CAREER_GROUPS, CAREERS, AT_WAR_SPECIALTIES, AT_WAR_COLUMN} from './constants';

// Roll any "D6", "D3", "2D6" patterns inside a string and substitute the result.
function rollDiceInText(text) {
  return text.replace(/(\d*)D(\d+)/g, (_, count, sides) => {
    const num = parseInt(count) || 1;
    const s = parseInt(sides);
    let total = 0;
    for (let i = 0; i < num; i++) total += rollDie(s);
    return String(total);
  });
}

// ============================================================================
// HELPERS
// ============================================================================

const dieLetter = (v) => ({ 6: 'D', 8: 'C', 10: 'B', 12: 'A' }[v] || '—');
const advance = (v) => v < 6 ? 6 : v < 8 ? 8 : v < 10 ? 10 : 12;
const decrease = (v) => v > 6 ? v - 2 : 6;
const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;
const cap = (n, max = 12) => Math.min(n, max);

// T2K skill check: roll attribute die + skill die, succeed on any 6+
function skillCheck(attrDie, skillDie) {
  const r1 = rollDie(attrDie);
  const r2 = skillDie ? rollDie(skillDie) : 0;
  return { rolls: skillDie ? [r1, r2] : [r1], success: Math.max(r1, r2) >= 6 };
}

// Hit/Stress capacity per T2K 4E: (die1 + die2) / 4 rounded up
function capacity(d1, d2) {
  return Math.ceil((d1 + d2) / 4);
}

function unitMoraleFromRoll(twoD6) {
  if (twoD6 <= 4) return 6;       // D
  if (twoD6 <= 7) return 8;       // C
  if (twoD6 <= 10) return 10;     // B
  return 12;                       // A
}

// ============================================================================
// AUDIO — synthesized field-manual SFX
// ============================================================================

let audioCtx = null;
function getAudioCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { audioCtx = new Ctx(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Typewriter-key tap: short, slightly metallic, decays fast.
function playClick() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Pitched transient
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(2400, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.025);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);

  // High-passed noise burst for tactility
  const bufLen = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.05;
  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
}

// Stamp-thud: low impact + paper compress, for advancing to next step.
function playNext() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Low thud (impact)
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(140, now);
  thud.frequency.exponentialRampToValueAtTime(50, now + 0.15);
  thudGain.gain.setValueAtTime(0, now);
  thudGain.gain.linearRampToValueAtTime(0.32, now + 0.005);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  thud.connect(thudGain).connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.2);

  // Click (stamp meeting paper)
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'square';
  click.frequency.setValueAtTime(1500, now);
  click.frequency.exponentialRampToValueAtTime(800, now + 0.03);
  clickGain.gain.setValueAtTime(0, now);
  clickGain.gain.linearRampToValueAtTime(0.1, now + 0.002);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  click.connect(clickGain).connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.06);

  // Low-passed noise (paper compress)
  const bufLen = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.16;
  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
}

const SoundContext = React.createContext({ muted: false, toggleMute: () => {} });
const useSound = () => useContext(SoundContext);

// ============================================================================
// FONTS + VISUAL PRIMITIVES (preserved from prior build)
// ============================================================================

function useFonts() {
  useEffect(() => {
    const l = document.createElement('link');
    l.href = 'https://fonts.googleapis.com/css2?family=Stardos+Stencil:wght@400;700&family=Special+Elite&family=Oswald:wght@300;400;500;600;700&display=swap';
    l.rel = 'stylesheet';
    document.head.appendChild(l);
    return () => l.remove();
  }, []);
}

const fontDisplay = { fontFamily: '"Stardos Stencil", system-ui, serif' };
const fontBody    = { fontFamily: '"Special Elite", "Courier New", monospace' };
const fontUI      = { fontFamily: '"Oswald", "Arial Narrow", sans-serif' };

function PaperBg({ children }) {
  return (
    <div className="min-h-screen w-full" style={{
      background: `
        radial-gradient(ellipse at 30% 20%, rgba(139,126,88,0.25) 0%, transparent 60%),
        radial-gradient(ellipse at 80% 70%, rgba(74,93,35,0.18) 0%, transparent 55%),
        repeating-linear-gradient(0deg, rgba(60,40,20,0.025) 0px, rgba(60,40,20,0.025) 1px, transparent 1px, transparent 3px),
        linear-gradient(180deg, #ebe3d2 0%, #ddd0b3 100%)
      `,
      color: '#1a1a1a',
    }}>
      <div className="pointer-events-none fixed inset-0 z-0 opacity-30 mix-blend-multiply" style={{
        backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'180\' height=\'180\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'1.4\' numOctaves=\'2\'/><feColorMatrix values=\'0 0 0 0 0.25 0 0 0 0 0.2 0 0 0 0 0.13 0 0 0 0.25 0\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\'/></svg>")',
      }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function Stamp({ children, color = '#8B2E2E', rotation = -8, className = '' }) {
  return (
    <div className={`inline-block px-3 py-1 border-4 select-none ${className}`} style={{
      ...fontDisplay,
      color, borderColor: color,
      transform: `rotate(${rotation}deg)`,
      opacity: 0.82, letterSpacing: '0.15em', fontSize: '0.9rem',
      boxShadow: `inset 0 0 0 1px ${color}33`,
    }}>{children}</div>
  );
}

function SectionLabel({ children, className = '' }) {
  return <div className={`uppercase tracking-[0.3em] text-xs ${className}`} style={{ ...fontUI, color: '#4a5d23', fontWeight: 600 }}>{children}</div>;
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: 'repeating-linear-gradient(90deg, #2d3a17 0 6px, transparent 6px 12px)' }} />
      {label && <span className="uppercase text-[10px] tracking-[0.4em]" style={{ ...fontUI, color: '#2d3a17' }}>{label}</span>}
      <div className="flex-1 h-px" style={{ background: 'repeating-linear-gradient(90deg, #2d3a17 0 6px, transparent 6px 12px)' }} />
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, className = '', sound = 'click' }) {
  const { muted } = useSound();
  const base = 'px-5 py-2 uppercase tracking-[0.2em] text-sm border-2 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = variant === 'primary'
    ? { background: '#2d3a17', color: '#ebe3d2', borderColor: '#2d3a17' }
    : variant === 'danger'
      ? { background: 'transparent', color: '#8B2E2E', borderColor: '#8B2E2E' }
      : { background: 'transparent', color: '#2d3a17', borderColor: '#2d3a17' };
  const handleClick = (e) => {
    if (!disabled && !muted) {
      if (sound === 'next') playNext();
      else if (sound === 'click') playClick();
    }
    onClick?.(e);
  };
  return (
    <button onClick={handleClick} disabled={disabled}
      className={`${base} ${className} hover:translate-y-[-1px] active:translate-y-[1px]`}
      style={{ ...fontUI, fontWeight: 600, ...styles }}>{children}</button>
  );
}

function Card({ children, selected, onClick, className = '', disabled }) {
  const { muted } = useSound();
  const handleClick = disabled || !onClick ? undefined : (e) => {
    if (!muted) playClick();
    onClick(e);
  };
  return (
    <div onClick={handleClick}
      className={`relative p-5 border-2 transition-all ${onClick && !disabled ? 'cursor-pointer hover:translate-y-[-2px]' : ''} ${disabled ? 'opacity-50' : ''} ${className}`}
      style={{
        background: selected ? '#2d3a17' : 'rgba(255,250,235,0.55)',
        color: selected ? '#ebe3d2' : '#1a1a1a',
        borderColor: selected ? '#2d3a17' : '#8b7e58',
        boxShadow: selected ? '4px 4px 0 #1a1a1a' : '2px 2px 0 rgba(45,58,23,0.2)',
      }}>{children}</div>
  );
}

function Die({ sides = 6, value, rolling, size = 'md', highlight }) {
  const sizeMap = { sm: 'w-9 h-9 text-sm', md: 'w-12 h-12 text-lg', lg: 'w-16 h-16 text-2xl' };
  return (
    <div className={`${sizeMap[size]} flex items-center justify-center border-2 relative`} style={{
      ...fontDisplay,
      background: highlight ? '#4a5d23' : rolling ? '#4a5d23' : '#2d3a17',
      color: '#ebe3d2', borderColor: '#1a1a1a',
      boxShadow: '2px 2px 0 #1a1a1a',
    }}>
      <div className="absolute top-0 left-0 text-[8px] px-1 opacity-70" style={fontUI}>d{sides}</div>
      <span>{rolling ? '?' : (value ?? '?')}</span>
    </div>
  );
}

// ============================================================================
// LIVE PREVIEW
// ============================================================================

function LivePreview({ character }) {
  const skillEntries = Object.entries(character.skills).filter(([, v]) => v > 0);
  return (
    <div className="border-2 p-5" style={{ borderColor: '#2d3a17', background: 'rgba(235,227,210,0.7)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <div style={{ ...fontDisplay, fontSize: '1.05rem', letterSpacing: '0.1em', color: '#2d3a17' }}>DOSSIER · WORKING</div>
        <div className="text-[10px] uppercase tracking-widest" style={{ ...fontUI, color: '#8B2E2E' }}>UNFINALIZED</div>
      </div>
      <div style={fontBody} className="text-sm">
        <div><span className="opacity-60">NAME </span>{character.name || '—'}</div>
        <div><span className="opacity-60">NAT  </span>{character.nationality || '—'}</div>
        <div><span className="opacity-60">AGE  </span>{character.age || '—'} {character.terms.length > 0 && <span className="opacity-50">· {character.terms.length} term{character.terms.length > 1 ? 's' : ''}</span>}</div>
        {character.rankLabel && <div><span className="opacity-60">RANK </span>{character.rankLabel}</div>}
      </div>

      <Divider label="ATTRIBUTES" />
      <div className="grid grid-cols-4 gap-1">
        {Object.entries(ATTRS).map(([id, a]) => (
          <div key={id} className="text-center border p-1" style={{ borderColor: '#8b7e58' }}>
            <div className="text-[9px] uppercase tracking-widest" style={{ ...fontUI, color: '#4a5d23' }}>{a.short}</div>
            <div style={{ ...fontDisplay, fontSize: '1.2rem' }}>{dieLetter(character.attributes[id]) || '·'}</div>
          </div>
        ))}
      </div>
      <div className="text-center mt-2 text-xs" style={fontUI}>
        CUF: <span style={fontDisplay}>{dieLetter(character.cuf)}</span>
      </div>

      {skillEntries.length > 0 && (<>
        <Divider label="SKILLS" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" style={fontBody}>
          {skillEntries.map(([id, v]) => (
            <div key={id} className="flex justify-between">
              <span>{SKILLS[id].name}</span>
              <span style={fontDisplay}>{dieLetter(v)}</span>
            </div>
          ))}
        </div>
      </>)}

      {character.specialties.length > 0 && (<>
        <Divider label="SPECIALTIES" />
        <div className="text-xs" style={fontBody}>
          {character.specialties.map((s, i) => <div key={i}>· {s}</div>)}
        </div>
      </>)}
    </div>
  );
}

// ============================================================================
// STEP 1: WELCOME / IDENTITY
// ============================================================================

function WelcomeStep({ character, setCharacter, next }) {
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-8">
        <div style={{ ...fontUI, color: '#8B2E2E', letterSpacing: '0.4em', fontSize: '0.7rem' }} className="uppercase mb-3">
          Restricted · For Personnel Use Only
        </div>
        <h1 style={{ ...fontDisplay, fontSize: 'clamp(2.5rem, 7vw, 5rem)', letterSpacing: '0.05em', lineHeight: 1 }}>
          TWILIGHT<span style={{ color: '#8B2E2E' }}> : 2000</span>
        </h1>
        <div style={fontDisplay} className="text-2xl tracking-[0.4em] mt-2 text-stone-700">CHARACTER DOSSIER</div>
        <div className="mt-6 flex justify-center"><Stamp rotation={-3}>FIELD MANUAL · LIFE PATH</Stamp></div>
      </div>

      <div style={fontBody} className="text-base leading-relaxed space-y-4 mb-8">
        <p>The world burned in <span style={fontDisplay}>1997</span>. Three years on, the radio chatter is mostly Polish and silence. You will build a soldier — or a shopkeeper, smuggler, surgeon — by walking their life from age 18 to the moment the war found them.</p>
        <p>Each step asks you to choose, and to roll. Some rolls go your way. Most don't. That is the game.</p>
      </div>

      <Divider label="IDENTIFICATION" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div>
          <label style={fontUI} className="block uppercase text-xs tracking-[0.3em] mb-1">Full Name</label>
          <input type="text" value={character.name}
            onChange={(e) => setCharacter({ ...character, name: e.target.value })}
            placeholder="LAST, FIRST M."
            className="w-full px-3 py-2 border-2 bg-transparent outline-none"
            style={{ ...fontBody, borderColor: '#2d3a17', color: '#1a1a1a' }} />
        </div>
        <div>
          <label style={fontUI} className="block uppercase text-xs tracking-[0.3em] mb-1">Nationality</label>
          <select value={character.nationality}
            onChange={(e) => setCharacter({ ...character, nationality: e.target.value })}
            className="w-full px-3 py-2 border-2 bg-transparent outline-none"
            style={{ ...fontBody, borderColor: '#2d3a17', color: '#1a1a1a' }}>
            <option value="">— select —</option>
            {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="text-sm opacity-80 mb-6 border-l-4 pl-4" style={{ borderColor: '#8B2E2E', ...fontBody }}>
        You begin at <strong>18 years old</strong> with all attributes at <strong>C</strong> and CUF at <strong>D</strong>. The dice and your choices will do the rest.
      </div>

      <div className="flex justify-end">
        <Btn sound="next" onClick={next} disabled={!character.name.trim() || !character.nationality}>Begin Life Path →</Btn>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 2: ATTRIBUTES
// ============================================================================

function AttributesStep({ character, setCharacter, next, back }) {
  const [increases, setIncreases] = useState(null); // total available increases
  const [rolls, setRolls] = useState([null, null]);
  const [rolling, setRolling] = useState(false);
  const [tookPenalty, setTookPenalty] = useState(false);
  const [attrs, setAttrs] = useState({ str: 8, agl: 8, int: 8, emp: 8 });
  const [penalizedAttr, setPenalizedAttr] = useState(null);

  const rollIncreases = () => {
    setRolling(true);
    setTimeout(() => {
      const a = rollDie(3);
      const b = rollDie(3);
      setRolls([a, b]);
      setIncreases(a + b);
      setRolling(false);
    }, 700);
  };

  const totalSpent = Object.entries(attrs).reduce((sum, [k, v]) => {
    const baseline = k === penalizedAttr ? 6 : 8;
    return sum + (v - baseline) / 2;
  }, 0);
  const available = (increases || 0) + (tookPenalty ? 1 : 0);
  const remaining = available - totalSpent;

  const inc = (k) => {
    if (remaining > 0 && attrs[k] < 12) setAttrs({ ...attrs, [k]: advance(attrs[k]) });
  };
  const dec = (k) => {
    const minVal = k === penalizedAttr ? 6 : 8;
    if (attrs[k] > minVal) setAttrs({ ...attrs, [k]: decrease(attrs[k]) });
  };

  const togglePenalty = (k) => {
    if (tookPenalty && penalizedAttr === k) {
      setTookPenalty(false);
      setPenalizedAttr(null);
      setAttrs({ ...attrs, [k]: 8 });
    } else if (!tookPenalty && attrs[k] === 8) {
      setTookPenalty(true);
      setPenalizedAttr(k);
      setAttrs({ ...attrs, [k]: 6 });
    }
  };

  const finish = () => {
    setCharacter({ ...character, attributes: attrs });
    next();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Step 02 of 08</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>ATTRIBUTES</h2>
        <p style={fontBody} className="opacity-80 max-w-xl mx-auto mt-2">
          You begin with <strong>C</strong> in everything. Roll <strong>2D3</strong> for increases. You may drop one attribute to <strong>D</strong> for one extra increase. Maximum is <strong>A</strong>.
        </p>
      </div>

      <div className="border-2 p-6 mb-6 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
        {increases === null ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3">
              <Die sides={3} value={null} rolling={rolling} size="lg" />
              <Die sides={3} value={null} rolling={rolling} size="lg" />
            </div>
            <Btn onClick={rollIncreases} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll 2D3'}</Btn>
          </div>
        ) : (
          <div>
            <div className="flex gap-3 justify-center mb-3">
              <Die sides={3} value={rolls[0]} size="lg" highlight />
              <Die sides={3} value={rolls[1]} size="lg" highlight />
            </div>
            <div style={fontDisplay} className="text-xl">
              {increases} INCREASE{increases > 1 ? 'S' : ''} {tookPenalty && <span style={{ color: '#8B2E2E' }}>+1 (penalty)</span>}
            </div>
          </div>
        )}
      </div>

      {increases !== null && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(ATTRS).map(([id, a]) => (
              <div key={id} className="border-2 p-3 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
                <div style={fontUI} className="uppercase text-xs tracking-widest opacity-70 mb-1">{a.short}</div>
                <div style={{ ...fontDisplay, fontSize: '2.5rem', lineHeight: 1 }}>{dieLetter(attrs[id])}</div>
                <div style={fontUI} className="text-xs opacity-60">d{attrs[id]}</div>
                <div className="flex gap-1 justify-center mt-2">
                  <button onClick={() => dec(id)} className="w-7 h-7 border" style={{ ...fontDisplay, borderColor: '#2d3a17' }}>−</button>
                  <button onClick={() => inc(id)} className="w-7 h-7 border" style={{ ...fontDisplay, borderColor: '#2d3a17' }}>+</button>
                </div>
                <button onClick={() => togglePenalty(id)}
                  disabled={(tookPenalty && penalizedAttr !== id) || (!tookPenalty && (attrs[id] !== 8 || increases === null))}
                  className="mt-2 text-[10px] uppercase tracking-widest border px-2 py-0.5 disabled:opacity-30"
                  style={{
                    ...fontUI,
                    borderColor: penalizedAttr === id ? '#8B2E2E' : '#8b7e58',
                    color: penalizedAttr === id ? '#8B2E2E' : '#4a5d23',
                    background: penalizedAttr === id ? 'rgba(139,46,46,0.1)' : 'transparent',
                  }}>
                  {penalizedAttr === id ? 'Penalty ✓' : 'Take Penalty'}
                </button>
              </div>
            ))}
          </div>

          <div className="text-center mb-6" style={fontUI}>
            <span className="text-lg">Increases remaining: <span style={{ ...fontDisplay, color: remaining === 0 ? '#4a5d23' : '#8B2E2E' }}>{remaining}</span></span>
          </div>

          <div style={fontBody} className="text-xs opacity-70 max-w-xl mx-auto text-center mb-6">
            Tip: Combat needs STR C+. Officer/Intel/Medical/Combat Support/College need INT C+. Spec Ops needs STR C+ and AGL C+. Hustler/Government need EMP C+. Plan your career here.
          </div>

          <div className="flex justify-between">
            <Btn variant="secondary" onClick={back}>← Back</Btn>
            <Btn sound="next" onClick={finish} disabled={remaining !== 0}>Continue →</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// STEP 3: CHILDHOOD
// ============================================================================

function ChildhoodStep({ character, setCharacter, next, back }) {
  const [stage, setStage] = useState('roll'); // roll → skill → specialty
  const [rollVal, setRollVal] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [chosenSkill, setChosenSkill] = useState(null);
  const [specRoll, setSpecRoll] = useState(null);
  const [chosenSpecialty, setChosenSpecialty] = useState(null);

  const rollChildhood = () => {
    setRolling(true);
    setTimeout(() => {
      const r = rollDie(6);
      setRollVal(r);
      setChosen(CHILDHOODS.find(c => c.id === r));
      setRolling(false);
    }, 600);
  };

  const chooseChildhood = (c) => {
    setChosen(c);
    setRollVal(c.id);
  };

  const rollSpecialty = () => {
    setRolling(true);
    setTimeout(() => {
      const r = rollDie(6);
      setSpecRoll(r);
      setChosenSpecialty(chosen.specialties[r - 1]);
      setRolling(false);
    }, 600);
  };

  const finalize = () => {
    setCharacter({
      ...character,
      childhood: { name: chosen.name, skill: chosenSkill, specialty: chosenSpecialty },
      skills: { ...character.skills, [chosenSkill]: 6 },
      specialties: [...character.specialties, chosenSpecialty],
      events: [...character.events, {
        phase: 'CHILDHOOD', tag: 'ORIGIN', title: chosen.name, text: chosen.blurb,
      }],
    });
    next();
  };

  if (stage === 'roll') {
    return (
      <div className="max-w-5xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Step 03 of 08</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>CHILDHOOD</h2>
          <p style={fontBody} className="opacity-80 mt-2">Roll a D6 to discover where you came from. Or pick — referee's call.</p>
        </div>

        <div className="border-2 p-6 mb-6 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
          {rollVal === null ? (
            <div className="flex flex-col items-center gap-4">
              <Die sides={6} value={null} rolling={rolling} size="lg" />
              <Btn onClick={rollChildhood} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll D6'}</Btn>
            </div>
          ) : (
            <div>
              <Die sides={6} value={rollVal} size="lg" highlight />
              <div className="mt-3" style={fontUI}>D6: {rollVal}</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {CHILDHOODS.map(c => (
            <Card key={c.id} selected={chosen?.id === c.id} onClick={() => chooseChildhood(c)}>
              <div className="flex justify-between items-baseline mb-1">
                <div style={{ ...fontDisplay, fontSize: '1.1rem', letterSpacing: '0.05em' }}>{c.name.toUpperCase()}</div>
                <div style={fontUI} className="text-xs opacity-60">[{c.id}]</div>
              </div>
              <div style={fontBody} className="text-xs opacity-90">{c.blurb}</div>
            </Card>
          ))}
        </div>

        <div className="flex justify-between">
          <Btn variant="secondary" onClick={back}>← Back</Btn>
          <Btn sound="next" onClick={() => setStage('skill')} disabled={!chosen}>Pick Skill →</Btn>
        </div>
      </div>
    );
  }

  if (stage === 'skill') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Childhood · {chosen.name}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>FIRST SKILL</h2>
          <p style={fontBody} className="opacity-80 mt-2">Choose one skill at level <strong>D</strong>.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-6">
          {chosen.skills.map(s => (
            <Card key={s} selected={chosenSkill === s} onClick={() => setChosenSkill(s)}>
              <div className="flex justify-between items-baseline">
                <div style={{ ...fontDisplay, fontSize: '1.1rem' }}>{SKILLS[s].name.toUpperCase()}</div>
                <div className="text-xs uppercase opacity-60" style={fontUI}>{ATTRS[SKILLS[s].attr].short}</div>
              </div>
              <div className="text-sm mt-1" style={fontBody}>Starts at D</div>
            </Card>
          ))}
        </div>
        <div className="flex justify-between">
          <Btn variant="secondary" onClick={() => setStage('roll')}>← Back</Btn>
          <Btn sound="next" onClick={() => setStage('specialty')} disabled={!chosenSkill}>Roll Specialty →</Btn>
        </div>
      </div>
    );
  }

  // specialty
  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Childhood · {chosen.name}</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>SPECIALTY</h2>
        <p style={fontBody} className="opacity-80 mt-2">Roll D6 against the specialty table.</p>
      </div>

      <div className="border-2 p-6 mb-4 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
        {specRoll === null ? (
          <div className="flex flex-col items-center gap-4">
            <Die sides={6} value={null} rolling={rolling} size="lg" />
            <Btn onClick={rollSpecialty} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll D6'}</Btn>
          </div>
        ) : (
          <div>
            <Die sides={6} value={specRoll} size="lg" highlight />
            <div style={fontDisplay} className="text-xl mt-3">{chosenSpecialty.toUpperCase()}</div>
          </div>
        )}
      </div>

      {specRoll !== null && (
        <div className="mb-6">
          <div className="text-center text-xs mb-2 opacity-70" style={fontUI}>
            OR CHOOSE INSTEAD (REFEREE PERMISSION)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {chosen.specialties.map((sp, i) => (
              <Card key={sp} selected={chosenSpecialty === sp} onClick={() => setChosenSpecialty(sp)}>
                <div className="flex justify-between items-baseline">
                  <div style={{ ...fontDisplay, fontSize: '0.9rem' }}>{sp.toUpperCase()}</div>
                  <div style={fontUI} className="text-[10px] opacity-50">[{i + 1}]</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Btn variant="secondary" onClick={() => setStage('skill')}>← Back</Btn>
        <Btn sound="next" onClick={finalize} disabled={!chosenSpecialty}>Begin Career Term 1 →</Btn>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 4: CAREER TERMS
// ============================================================================

function CareerStep({ character, setCharacter, next, back }) {
  const [stage, setStage] = useState('pick'); // pick → skills → promotion → aging → war
  const [career, setCareer] = useState(null);
  const [increaseMode, setIncreaseMode] = useState(null); // 'two' | 'one'
  const [increasedSkills, setIncreasedSkills] = useState({}); // {skillId: stepsApplied}
  const [promSkill, setPromSkill] = useState(null);
  const [promResult, setPromResult] = useState(null);
  const [promRolls, setPromRolls] = useState(null);
  const [promSpecialtyRoll, setPromSpecialtyRoll] = useState(null);
  const [promSpecialty, setPromSpecialty] = useState(null);
  const [ageGain, setAgeGain] = useState(null);
  const [ageRoll, setAgeRoll] = useState(null);
  const [agePenaltyAttr, setAgePenaltyAttr] = useState(null);
  const [warRoll, setWarRoll] = useState(null);
  const [warBreaks, setWarBreaks] = useState(null);
  const [rolling, setRolling] = useState(false);

  const termNum = character.terms.length + 1;
  const isFirstMilitaryTerm = career?.military && !character.terms.some(t => t.military);
  const careerAvailable = (c) => {
    // Attribute requirements
    if (!Object.entries(c.req).every(([k, v]) => character.attributes[k] >= v)) return false;
    if(c.reqMax && !Object.entries(c.reqMax).every(([k,v])=>character.attributes[k]<=v))return false;{

    }
    // Term requirements (prior career experience)
    if (c.termReq) {
      // Inclusion: must have at least `count` matching terms
      if (c.termReq.careers || c.termReq.group) {
        let matches;
        if (c.termReq.group) {
          matches = character.terms.filter(t => {
            const career = CAREERS.find(c2 => c2.id === t.careerId);
            return career?.group === c.termReq.group;
          }).length;
        } else {
          matches = character.terms.filter(t => c.termReq.careers.includes(t.careerId)).length;
        }
        if (matches < c.termReq.count) return false;
      }
      // Exclusion: must have zero terms in listed careers
      if (c.termReq.exclude) {
        if (character.terms.some(t => c.termReq.exclude.includes(t.careerId))) return false;
      }
    }
    return true;
  };

  const startTerm = (c) => {
    setCareer(c);
    setIncreaseMode(null);
    setIncreasedSkills({});
    setPromSkill(null);
    setPromResult(null);
    setPromRolls(null);
    setPromSpecialty(null);
    setPromSpecialtyRoll(null);
    setAgeGain(null);
    setAgeRoll(null);
    setAgePenaltyAttr(null);
    setWarRoll(null);
    setWarBreaks(null);
    setStage('skills');
  };

  const availableSkills = career
    ? [...new Set([...career.skills, ...ALWAYS_AVAILABLE])]
    : [];

  const skillCurrent = (s) => character.skills[s] || 0;
  const skillAfter = (s) => {
    const steps = increasedSkills[s] || 0;
    let v = skillCurrent(s);
    for (let i = 0; i < steps; i++) v = v ? advance(v) : 6;
    return v;
  };
  // How many of [1, 2] additional steps would actually advance this skill?
  const maxStepsForSkill = (s) => {
    let v = skillCurrent(s);
    let steps = 0;
    while (steps < 2) {
      const next = v ? advance(v) : 6;
      if (next === v) break;
      v = next;
      steps++;
    }
    return steps;
  };

  const totalStepsUsed = Object.values(increasedSkills).reduce((a, b) => a + b, 0);
  const skillsTouchedCount = Object.values(increasedSkills).filter(v => v > 0).length;
  const stepsAllowed = increaseMode === 'two' ? 2 : 2; // 2 total in either mode
  const stepsRemaining = stepsAllowed - totalStepsUsed;

  // Validation: in 'two' mode, must be exactly 2 different skills @ 1 step each
  // In 'one' mode, must be exactly 1 skill @ 2 steps
  const skillSelectionValid = increaseMode === 'two'
    ? skillsTouchedCount === 2 && totalStepsUsed === 2 && Object.values(increasedSkills).every(v => v <= 1)
    : skillsTouchedCount === 1 && totalStepsUsed === 2;

  const firstMilitaryRangedRequired = isFirstMilitaryTerm && !(increasedSkills.rangedCombat > 0);

  const bumpSkill = (s) => {
    const cur = skillAfter(s);
    if (cur >= 12) return; // can't go past A
    const used = increasedSkills[s] || 0;
    if (increaseMode === 'two') {
      // toggle on/off, max 1 step per skill, total 2 skills
      if (used) {
        const next = { ...increasedSkills };
        delete next[s];
        setIncreasedSkills(next);
      } else if (skillsTouchedCount < 2) {
        setIncreasedSkills({ ...increasedSkills, [s]: 1 });
      }
    } else {
      // 'one' mode: cycle 0 → 1 → 2 → 0 for that single skill
      const maxSteps = maxStepsForSkill(s);
      if (!used && maxSteps < 2) return; // can't fit +2 steps on this skill
      if (skillsTouchedCount === 0 || (used && skillsTouchedCount === 1)) {
        const newSteps = used === 2 ? 0 : used + 1;
        if (newSteps > maxSteps) return;
        if (newSteps === 0) {
          const next = { ...increasedSkills };
          delete next[s];
          setIncreasedSkills(next);
        } else {
          setIncreasedSkills({ [s]: newSteps });
        }
      }
    }
  };

  const rollPromotion = () => {
    setRolling(true);
    setTimeout(() => {
      const skill = promSkill;
      const attrDie = character.attributes[SKILLS[skill].attr];
      const skillDie = skillAfter(skill);
      const result = skillCheck(attrDie, skillDie);
      setPromRolls({ attrDie, skillDie, ...result });
      setPromResult(result.success);
      setRolling(false);
    }, 700);
  };

  const rollPromSpecialty = () => {
    setRolling(true);
    setTimeout(() => {
      const r = rollDie(6);
      setPromSpecialtyRoll(r);
      const sp = career.specialties[r - 1];
      // if duplicate, leave selection to user
      if (!character.specialties.includes(sp)) {
        setPromSpecialty(sp);
      }
      setRolling(false);
    }, 600);
  };

  const rollAging = () => {
    setRolling(true);
    setTimeout(() => {
      const yrs = rollDie(6);
      setAgeGain(yrs);
      const r = rollDie(8);
      setAgeRoll(r);
      setRolling(false);
    }, 700);
  };

  const ageDecreaseTriggered = ageRoll !== null && ageRoll < termNum;

  const rollWar = () => {
    setRolling(true);
    setTimeout(() => {
      const r = rollDie(8);
      setWarRoll(r);
      setWarBreaks(r < termNum);
      setRolling(false);
    }, 700);
  };

  const finalizeTerm = () => {
    // Apply skills
    const newSkills = { ...character.skills };
    Object.entries(increasedSkills).forEach(([s, steps]) => {
      let v = newSkills[s] || 0;
      for (let i = 0; i < steps; i++) v = v ? advance(v) : 6;
      newSkills[s] = v;
    });

    // Apply attribute decrease if any
    const newAttrs = { ...character.attributes };
    if (ageDecreaseTriggered && agePenaltyAttr) {
      newAttrs[agePenaltyAttr] = decrease(newAttrs[agePenaltyAttr]);
    }

    // Promotion: rank + CUF for military/intel
    let newCuf = character.cuf;
    let newRankLabel = character.rankLabel;
    let newRankIndex = character.rankIndex;
    let newRankTrack = character.rankTrack;
    if (promResult && career.military) {
      newCuf = cap(advance(newCuf));
      // determine new rank
      const track = career.rankTrack;
      const sameTrack = newRankTrack === track;
      const idx = sameTrack ? Math.min(newRankIndex + 1, MILITARY_RANKS[track].length - 1) : 1;
      newRankIndex = idx;
      newRankTrack = track;
      newRankLabel = MILITARY_RANKS[track][idx];
    } else if (career.military && !character.rankLabel) {
      // entered military for first time without promotion: still note starting rank
      newRankTrack = career.rankTrack;
      newRankIndex = 0;
      newRankLabel = MILITARY_RANKS[career.rankTrack][0];
    }

    const newSpecialties = [...character.specialties];
    if (promResult && promSpecialty) newSpecialties.push(promSpecialty);

    const newEvents = [...character.events];
    newEvents.push({
      phase: `TERM ${termNum}`, tag: career.military ? 'SERVED' : 'WORKED',
      title: career.name,
      text: `${ageGain} years passed. ${promResult ? 'Promoted.' : 'No advancement.'}${ageDecreaseTriggered && agePenaltyAttr ? ` Age took its toll on ${ATTRS[agePenaltyAttr].short}.` : ''}`,
    });
    if (promResult && promSpecialty) {
      newEvents.push({ phase: `TERM ${termNum}`, tag: 'SPECIALTY', title: promSpecialty, text: `Recognized expertise in ${promSpecialty.toLowerCase()}.` });
    }

    const newCharacter = {
      ...character,
      attributes: newAttrs,
      skills: newSkills,
      specialties: newSpecialties,
      cuf: newCuf,
      rankLabel: newRankLabel,
      rankIndex: newRankIndex,
      rankTrack: newRankTrack,
      age: character.age + (ageGain || 0),
      terms: [...character.terms, {
        careerId: career.id,
        career: career.name, military: career.military,
        promoted: promResult, specialty: promResult ? promSpecialty : null,
        ageGained: ageGain,
      }],
      events: newEvents,
      warBrokeOut: warBreaks,
    };

    setCharacter(newCharacter);

    if (warBreaks) {
      next(); // go to At War step
    } else {
      // start next term
      setCareer(null);
      setStage('pick');
    }
  };

  // ----------------------------------------------------------------------
  // STAGE: pick career
  // ----------------------------------------------------------------------
  if (stage === 'pick') {
    return (
      <div className="max-w-5xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Step 04 of 08 · Career Term {termNum}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>CAREER</h2>
          <p style={fontBody} className="opacity-80 max-w-xl mx-auto mt-2">
            Pick a career for this term. Each term is D6 years. Military and intelligence careers grant rank and CUF on promotion.
          </p>
          {character.terms.length > 0 && (
            <div className="mt-3 inline-block">
              <Stamp rotation={2}>{character.terms.length} TERM{character.terms.length > 1 ? 'S' : ''} SERVED · AGE {character.age}</Stamp>
            </div>
          )}
        </div>

        {CAREER_GROUPS.map(group => {
          const inGroup = CAREERS
            .filter(c => c.group === group.id)
            .sort((a, b) => Number(careerAvailable(b)) - Number(careerAvailable(a)));
          if (inGroup.length === 0) return null;
          return (
            <div key={group.id} className="mb-7">
              <Divider label={group.name.toUpperCase()} />
              <div className="text-xs opacity-70 text-center mb-3 italic" style={fontBody}>{group.blurb}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inGroup.map(c => {
                  const ok = careerAvailable(c);
                  return (
                    <Card key={c.id} disabled={!ok} onClick={() => ok && startTerm(c)}>
                      <div className="flex items-baseline justify-between mb-1">
                        <div style={{ ...fontDisplay, fontSize: '1rem', letterSpacing: '0.06em' }}>{c.name.toUpperCase()}</div>
                        {!ok && (
                          <div className="text-[10px] uppercase tracking-widest" style={{ ...fontUI, color: '#8B2E2E' }}>
                            LOCKED
                          </div>
                        )}
                      </div>
                      <div style={fontBody} className="text-xs opacity-90 mb-2">{c.blurb}</div>
                      <div className="text-[10px] uppercase tracking-widest opacity-70" style={fontUI}>
                        Req: {c.reqLabel}{c.termReq ? ` · ${c.termReq.label}` : ''}
                      </div>
                      <div className="text-[10px] uppercase tracking-widest opacity-70 mt-1" style={fontUI}>
                        {c.skills.map(s => SKILLS[s].name).join(' · ')}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex justify-between">
          <Btn variant="secondary" onClick={back}>← Back</Btn>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STAGE: skills
  // ----------------------------------------------------------------------
  if (stage === 'skills') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Term {termNum} · {career.name}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>TRAINING</h2>
          <p style={fontBody} className="opacity-80 mt-2">Choose how to spend two skill increases.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card selected={increaseMode === 'two'} onClick={() => { setIncreaseMode('two'); setIncreasedSkills({}); }}>
            <div style={{ ...fontDisplay, fontSize: '1rem' }}>TWO SKILLS · +1 EACH</div>
          </Card>
          <Card selected={increaseMode === 'one'} onClick={() => { setIncreaseMode('one'); setIncreasedSkills({}); }}>
            <div style={{ ...fontDisplay, fontSize: '1rem' }}>ONE SKILL · +2 STEPS</div>
          </Card>
        </div>

        {increaseMode && (
          <>
            {isFirstMilitaryTerm && (
              <div className="border-l-4 px-4 py-2 mb-4 text-sm" style={{ borderColor: '#8B2E2E', ...fontBody, background: 'rgba(139,46,46,0.05)' }}>
                <strong>First military term:</strong> one of your increases must be <strong>Ranged Combat</strong>.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {[...availableSkills]
                .sort((a, b) => {
                  const aDis = (increasedSkills[a] || 0) === 0 && (increaseMode === 'two' ? skillCurrent(a) >= 12 : maxStepsForSkill(a) < 2);
                  const bDis = (increasedSkills[b] || 0) === 0 && (increaseMode === 'two' ? skillCurrent(b) >= 12 : maxStepsForSkill(b) < 2);
                  return Number(aDis) - Number(bDis);
                })
                .map(s => {
                  const cur = skillCurrent(s);
                  const after = skillAfter(s);
                  const used = increasedSkills[s] || 0;
                  const cantPick = used === 0 && (increaseMode === 'two' ? cur >= 12 : maxStepsForSkill(s) < 2);
                  const alwaysAvail = ALWAYS_AVAILABLE.includes(s);
                  return (
                    <Card key={s} selected={used > 0} onClick={() => !cantPick && bumpSkill(s)} disabled={cantPick}>
                      <div className="flex justify-between items-baseline">
                        <div style={{ ...fontDisplay, fontSize: '0.95rem' }}>{SKILLS[s].name.toUpperCase()}</div>
                        <div className="text-[10px] uppercase opacity-60" style={fontUI}>
                          {ATTRS[SKILLS[s].attr].short}{alwaysAvail && ' · ALWAYS'}
                        </div>
                      </div>
                      <div style={fontBody} className="text-sm">
                        {dieLetter(cur) || '—'}{used > 0 && ` → ${dieLetter(after)}`}
                        {used > 1 && <span className="text-xs ml-2 opacity-70">(+2)</span>}
                        {cantPick && cur >= 12 && <span className="text-xs ml-2 opacity-70">(maxed)</span>}
                        {cantPick && cur < 12 && increaseMode === 'one' && <span className="text-xs ml-2 opacity-70">(can't +2)</span>}
                      </div>
                    </Card>
                  );
                })}
            </div>

            <div className="text-center text-sm mb-4" style={fontUI}>
              {totalStepsUsed} / 2 steps · {skillsTouchedCount} skill{skillsTouchedCount !== 1 ? 's' : ''} touched
            </div>

            <div className="flex justify-between">
              <Btn variant="secondary" onClick={() => { setCareer(null); setStage('pick'); }}>← Pick Career</Btn>
              <Btn sound="next" onClick={() => setStage('promotion')} disabled={!skillSelectionValid || firstMilitaryRangedRequired}>
                Promotion Roll →
              </Btn>
            </div>
          </>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STAGE: promotion
  // ----------------------------------------------------------------------
  if (stage === 'promotion') {
    const increasedList = Object.keys(increasedSkills).filter(s => increasedSkills[s] > 0);
    return (
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Term {termNum} · {career.name}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>PROMOTION</h2>
          <p style={fontBody} className="opacity-80 mt-2">
            Choose one of the skills you increased. Make an unmodified skill check — any 6+ succeeds. No pushing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {increasedList.map(s => {
            const after = skillAfter(s);
            const attrDie = character.attributes[SKILLS[s].attr];
            return (
              <Card key={s} selected={promSkill === s} onClick={() => promRolls === null && setPromSkill(s)}>
                <div style={{ ...fontDisplay, fontSize: '1rem' }}>{SKILLS[s].name.toUpperCase()}</div>
                <div className="text-xs mt-1" style={fontBody}>
                  Roll: {dieLetter(attrDie)} (d{attrDie}) + {dieLetter(after)} (d{after})
                </div>
              </Card>
            );
          })}
        </div>

        {promSkill && (
          <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
            {promRolls === null ? (
              <div className="flex flex-col items-center gap-4">
                <div className="flex gap-3">
                  <Die sides={character.attributes[SKILLS[promSkill].attr]} value={null} rolling={rolling} size="lg" />
                  <Die sides={skillAfter(promSkill)} value={null} rolling={rolling} size="lg" />
                </div>
                <Btn onClick={rollPromotion} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll Skill Check'}</Btn>
              </div>
            ) : (
              <div>
                <div className="flex gap-3 justify-center">
                  <Die sides={promRolls.attrDie} value={promRolls.rolls[0]} size="lg" highlight={promRolls.rolls[0] >= 6} />
                  <Die sides={promRolls.skillDie} value={promRolls.rolls[1]} size="lg" highlight={promRolls.rolls[1] >= 6} />
                </div>
                <div className="my-3 inline-block">
                  <Stamp rotation={promResult ? -3 : 5} color={promResult ? '#4a5d23' : '#8B2E2E'}>
                    {promResult ? 'PROMOTED' : 'NO ADVANCEMENT'}
                  </Stamp>
                </div>
                <p style={fontBody} className="mt-2 max-w-md mx-auto text-sm">
                  {promResult
                    ? career.military
                      ? `Advanced in rank. CUF improves. Roll D6 for the specialty you earned.`
                      : `Advanced. Roll D6 for the specialty you earned.`
                    : 'Six more years in the same slot. Some climb, some hold the line.'}
                </p>
              </div>
            )}
          </div>
        )}

        {promRolls !== null && promResult && (
          <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
            <SectionLabel>Specialty</SectionLabel>
            {promSpecialtyRoll === null ? (
              <div className="flex flex-col items-center gap-4 mt-3">
                <Die sides={6} value={null} rolling={rolling} size="lg" />
                <Btn onClick={rollPromSpecialty} disabled={rolling}>Roll D6</Btn>
              </div>
            ) : (
              <div className="mt-3">
                <Die sides={6} value={promSpecialtyRoll} size="lg" highlight />
                <div className="mt-2" style={fontUI}>
                  Rolled: <span style={fontDisplay}>{career.specialties[promSpecialtyRoll - 1].toUpperCase()}</span>
                </div>
                {character.specialties.includes(career.specialties[promSpecialtyRoll - 1]) && (
                  <div className="text-xs mt-2 opacity-80" style={fontBody}>
                    You already have this — choose any specialty instead:
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1 mt-3">
                  {career.specialties.map((sp, i) => {
                    const dup = character.specialties.includes(sp);
                    return (
                      <button key={sp} onClick={() => !dup && setPromSpecialty(sp)} disabled={dup}
                        className="px-2 py-1 border text-xs uppercase tracking-widest disabled:opacity-30"
                        style={{
                          ...fontUI,
                          borderColor: promSpecialty === sp ? '#2d3a17' : '#8b7e58',
                          background: promSpecialty === sp ? '#2d3a17' : 'transparent',
                          color: promSpecialty === sp ? '#ebe3d2' : '#1a1a1a',
                        }}>
                        {sp}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {promRolls !== null && (promResult ? promSpecialty : true) && (
          <div className="flex justify-end">
            <Btn sound="next" onClick={() => setStage('aging')}>Aging Check →</Btn>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STAGE: aging
  // ----------------------------------------------------------------------
  if (stage === 'aging') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Term {termNum} · {career.name}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>AGING</h2>
          <p style={fontBody} className="opacity-80 mt-2">
            Roll D6 for years passed, then D8 against your terms completed.
          </p>
        </div>

        <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
          {ageGain === null ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-3">
                <Die sides={6} value={null} rolling={rolling} size="lg" />
                <Die sides={8} value={null} rolling={rolling} size="lg" />
              </div>
              <Btn onClick={rollAging} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll D6 + D8'}</Btn>
            </div>
          ) : (
            <div>
              <div className="flex gap-3 justify-center">
                <Die sides={6} value={ageGain} size="lg" highlight />
                <Die sides={8} value={ageRoll} size="lg" highlight={ageDecreaseTriggered} />
              </div>
              <div className="mt-3" style={fontUI}>
                Aged <strong>{ageGain}</strong> years (now {character.age + ageGain}).
              </div>
              <div className="mt-2" style={fontUI}>
                D8 = {ageRoll} {ageDecreaseTriggered ? `< ${termNum} (terms)` : `≥ ${termNum} (terms)`}
              </div>
              <div className="mt-3 inline-block">
                <Stamp rotation={ageDecreaseTriggered ? 4 : -4} color={ageDecreaseTriggered ? '#8B2E2E' : '#4a5d23'}>
                  {ageDecreaseTriggered ? 'AGE TAKES A TOLL' : 'STILL SHARP'}
                </Stamp>
              </div>
            </div>
          )}
        </div>

        {ageDecreaseTriggered && (
          <div className="mb-6">
            <SectionLabel className="mb-2">Reduce one attribute (D minimum)</SectionLabel>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(ATTRS).map(([id, a]) => {
                const v = character.attributes[id];
                const tooLow = v <= 6;
                return (
                  <Card key={id} selected={agePenaltyAttr === id} onClick={() => !tooLow && setAgePenaltyAttr(id)} disabled={tooLow}>
                    <div className="text-center">
                      <div style={fontUI} className="text-xs uppercase tracking-widest">{a.short}</div>
                      <div style={fontDisplay} className="text-xl">{dieLetter(v)} → {dieLetter(decrease(v))}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {ageGain !== null && (
          <div className="flex justify-end">
            <Btn sound="next" onClick={() => setStage('war')} disabled={ageDecreaseTriggered && !agePenaltyAttr}>
              War Check →
            </Btn>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STAGE: war
  // ----------------------------------------------------------------------
  if (stage === 'war') {
    return (
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Term {termNum} · {career.name}</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.05em' }}>WAR CHECK</h2>
          <p style={fontBody} className="opacity-80 mt-2">
            Roll D8. If lower than terms completed, war breaks out.
          </p>
        </div>

        <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
          {warRoll === null ? (
            <div className="flex flex-col items-center gap-4">
              <Die sides={8} value={null} rolling={rolling} size="lg" />
              <Btn onClick={rollWar} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll D8'}</Btn>
            </div>
          ) : (
            <div>
              <Die sides={8} value={warRoll} size="lg" highlight={warBreaks} />
              <div className="mt-3" style={fontUI}>
                D8 = {warRoll} {warBreaks ? `< ${termNum}` : `≥ ${termNum}`}
              </div>
              <div className="mt-3 inline-block">
                <Stamp rotation={warBreaks ? -8 : 4} color={warBreaks ? '#8B2E2E' : '#4a5d23'}>
                  {warBreaks ? 'THE WAR FOUND YOU' : 'PEACE HOLDS'}
                </Stamp>
              </div>
              <p style={fontBody} className="mt-3 max-w-md mx-auto text-sm">
                {warBreaks
                  ? 'The bombs are falling. Time to fight or flee.'
                  : 'Another six years pass without the world ending. Sign on for another term?'}
              </p>
            </div>
          )}
        </div>

        {warRoll !== null && (
          <div className="flex justify-end">
            <Btn sound="next" onClick={finalizeTerm}>
              {warBreaks ? 'To War →' : 'Continue →'}
            </Btn>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ============================================================================
// STEP 5: AT WAR
// ============================================================================

function AtWarStep({ character, setCharacter, next, back }) {
  const lastTerm = character.terms[character.terms.length - 1];
  const lastCareer = CAREERS.find(c => c.id === lastTerm?.careerId);
  const lastGroup = lastCareer?.group;

  // Civilian for Draft purposes: not military, not intel
  const isCivilian = lastGroup && lastGroup !== 'military' && lastGroup !== 'intel';

  // null = unanswered; true/false once chosen. Non-civilian = N/A, locked false.
  const [isLocal, setIsLocal] = useState(isCivilian ? null : true);
  const drafted = isCivilian && isLocal === false;

  // Which column to roll on
  const specialtyColumn = drafted ? 'military' : (AT_WAR_COLUMN[lastGroup] || 'other');
  const columnSpecialties = AT_WAR_SPECIALTIES[specialtyColumn];

  // Ranged Combat requirement: drafted AND RC untrained
  const rcUntrained = (character.skills.rangedCombat || 0) < 6;
  const rcRequired = drafted && rcUntrained;

  const [increasedSkills, setIncreasedSkills] = useState({});
  const [rolls, setRolls] = useState([]); // list of rolled (specialty, dieValue) attempts
  const [specialty, setSpecialty] = useState(null);
  const [rolling, setRolling] = useState(false);

  const skillCurrent = (s) => character.skills[s] || 0;
  const skillAfter = (s) => increasedSkills[s] ? advance(skillCurrent(s) || 6) : skillCurrent(s);
  const skillsTouched = Object.keys(increasedSkills).filter(s => increasedSkills[s]).length;
  const hasRC = !!increasedSkills.rangedCombat;
  const valid = skillsTouched === 2 && (!rcRequired || hasRC);

  const toggleSkill = (s) => {
    const cur = skillAfter(s);
    if (cur >= 12 && !increasedSkills[s]) return;
    if (increasedSkills[s]) {
      const next = { ...increasedSkills }; delete next[s]; setIncreasedSkills(next);
    } else if (skillsTouched < 2) {
      setIncreasedSkills({ ...increasedSkills, [s]: 1 });
    }
  };

  const rollSpec = () => {
    setRolling(true);
    setTimeout(() => {
      const r = rollDie(6);
      const sp = columnSpecialties[r - 1];
      const dup = character.specialties.includes(sp);
      setRolls(prev => [...prev, { roll: r, specialty: sp, duplicate: dup }]);
      if (!dup) setSpecialty(sp);
      setRolling(false);
    }, 600);
  };

  const latestRoll = rolls[rolls.length - 1];

  const finalize = () => {
    const newSkills = { ...character.skills };
    Object.keys(increasedSkills).forEach(s => {
      newSkills[s] = newSkills[s] ? advance(newSkills[s]) : 6;
    });
    setCharacter({
      ...character,
      skills: newSkills,
      specialties: [...character.specialties, specialty],
      drafted,
      atWarColumn: specialtyColumn,
      events: [...character.events, {
        phase: 'AT WAR', tag: drafted ? 'DRAFTED' : 'WAR',
        title: drafted ? 'Drafted' : 'War Found You',
        text: drafted
          ? 'A stranger in a strange country when the bombs fell. They handed you a rifle.'
          : 'The bombs fell. You went where you were sent.',
      }],
    });
    next();
  };

  const allSkills = Object.keys(SKILLS);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Step 05 of 08</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>AT WAR</h2>
        <p style={fontBody} className="opacity-80 mt-2">
          World War III breaks out. Everyone scrambles for themselves, their unit, their family. Increase any two skills by one step each (no 1×+2 here) and roll one final specialty.
        </p>
      </div>

      {isCivilian && (
        <>
          <Divider label="THE DRAFT" />
          <div style={fontBody} className="text-sm opacity-90 mb-3">
            Your last term was civilian. If you're <em>not</em> a local of the country where the campaign is set, you'll be drafted (or volunteer) into the military for this term.
          </div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card selected={isLocal === true} onClick={() => setIsLocal(true)}>
              <div style={{ ...fontDisplay, fontSize: '1rem' }}>LOCAL</div>
              <div style={fontBody} className="text-xs opacity-80 mt-1">You stay where you are. The war comes to you.</div>
            </Card>
            <Card selected={isLocal === false} onClick={() => setIsLocal(false)}>
              <div style={{ ...fontDisplay, fontSize: '1rem' }}>FOREIGNER</div>
              <div style={fontBody} className="text-xs opacity-80 mt-1">A stranger to the country. They put a rifle in your hands.</div>
            </Card>
          </div>
        </>
      )}

      {drafted && (
        <div className="border-l-4 px-4 py-2 mb-4" style={{ borderColor: '#8B2E2E', background: 'rgba(139,46,46,0.06)' }}>
          <div className="inline-block mb-1">
            <Stamp rotation={-4} color="#8B2E2E">DRAFT NOTICE</Stamp>
          </div>
          <div style={fontBody} className="text-sm mt-2">
            You'll roll your specialty on the <strong>Military</strong> column. Your starting gear is replaced with a <strong>Combat Arms</strong> kit.
            {rcRequired && <> One of your two skill increases must be <strong>Ranged Combat</strong> (you have no training yet).</>}
            {!rcUntrained && <> Ranged Combat training waived — you already have it.</>}
          </div>
        </div>
      )}

      {(!isCivilian || isLocal !== null) && (
        <>
          <Divider label="SKILL INCREASES · TWO SKILLS · +1 EACH" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {[...allSkills]
              .sort((a, b) => (skillAfter(a) >= 12 ? 1 : 0) - (skillAfter(b) >= 12 ? 1 : 0))
              .map(s => {
                const cur = skillCurrent(s);
                const after = skillAfter(s);
                const used = increasedSkills[s];
                const maxed = after >= 12 && !used;
                const isRC = s === 'rangedCombat';
                return (
                  <Card key={s} selected={!!used} onClick={() => !maxed && toggleSkill(s)} disabled={maxed}>
                    <div className="flex justify-between items-baseline">
                      <div style={{ ...fontDisplay, fontSize: '0.95rem' }}>
                        {SKILLS[s].name.toUpperCase()}
                        {rcRequired && isRC && <span className="ml-2 text-[10px]" style={{ color: '#8B2E2E', ...fontUI }}>· REQUIRED</span>}
                      </div>
                      <div className="text-[10px] uppercase opacity-60" style={fontUI}>{ATTRS[SKILLS[s].attr].short}</div>
                    </div>
                    <div style={fontBody} className="text-sm">
                      {dieLetter(cur) || '—'}{used && ` → ${dieLetter(after)}`}
                      {maxed && <span className="text-xs ml-2 opacity-70">(maxed)</span>}
                    </div>
                  </Card>
                );
              })}
          </div>
          <div className="text-center text-sm mb-6" style={fontUI}>
            {skillsTouched} / 2 chosen
            {rcRequired && !hasRC && <span className="ml-3" style={{ color: '#8B2E2E' }}>· Ranged Combat required</span>}
          </div>

          <Divider label={`FINAL SPECIALTY · ${specialtyColumn.toUpperCase()} COLUMN`} />
          <div className="border-2 p-6 text-center mb-4" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
            {rolls.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <Die sides={6} value={null} rolling={rolling} size="lg" />
                <Btn onClick={rollSpec} disabled={rolling || !valid}>{rolling ? 'Rolling…' : 'Roll D6'}</Btn>
              </div>
            ) : (
              <div>
                <Die sides={6} value={latestRoll.roll} size="lg" highlight={!latestRoll.duplicate} rolling={rolling} />
                <div className="mt-3" style={fontUI}>
                  Rolled: <span style={fontDisplay}>{latestRoll.specialty.toUpperCase()}</span>
                </div>
                {latestRoll.duplicate ? (
                  <>
                    <div className="text-xs mt-2 opacity-80" style={fontBody}>
                      You already have this — re-roll.
                    </div>
                    <div className="mt-3">
                      <Btn onClick={rollSpec} disabled={rolling}>{rolling ? 'Rolling…' : 'Re-roll D6'}</Btn>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 inline-block">
                    <Stamp rotation={-3} color="#4a5d23">CONFIRMED</Stamp>
                  </div>
                )}
                {rolls.length > 1 && (
                  <div className="mt-4 text-[10px] uppercase tracking-widest opacity-60" style={fontUI}>
                    Roll history: {rolls.map(r => `${r.roll}=${r.specialty}${r.duplicate ? ' (dup)' : ''}`).join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Btn variant="secondary" onClick={back}>← Back</Btn>
            <Btn sound="next" onClick={finalize} disabled={!valid || !specialty}>Final Touches →</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// STEP 6: FINAL TOUCHES
// ============================================================================

function FinalTouchesStep({ character, setCharacter, next, back }) {
  const [moralRoll, setMoralRoll] = useState(null);
  const [moraleRoll, setMoraleRoll] = useState(null);
  const [moraleValue, setMoraleValue] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [moralCode, setMoralCode] = useState(character.moralCode || '');
  const [bigDream, setBigDream] = useState(character.bigDream || '');
  const [buddies, setBuddies] = useState(character.buddies || '');

  const hitCap = capacity(character.attributes.str, character.attributes.agl);
  const stressCap = capacity(character.attributes.int, character.attributes.emp);

  const rollMorale = () => {
    setRolling(true);
    setTimeout(() => {
      const a = rollDie(6); const b = rollDie(6);
      setMoraleRoll({ a, b, sum: a + b });
      setMoraleValue(unitMoraleFromRoll(a + b));
      setRolling(false);
    }, 700);
  };

  const finalize = () => {
    setCharacter({
      ...character,
      hitCapacity: hitCap,
      stressCapacity: stressCap,
      unitMorale: moraleValue,
      moralCode, bigDream, buddies,
    });
    next();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Step 06 of 08</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>FINAL TOUCHES</h2>
      </div>

      <Divider label="DERIVED CAPACITIES" />
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border-2 p-4 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
          <div style={fontUI} className="uppercase text-xs tracking-widest">Hit Capacity</div>
          <div style={{ ...fontDisplay, fontSize: '2.5rem', lineHeight: 1 }}>{hitCap}</div>
          <div style={fontUI} className="text-xs opacity-60">⌈(STR + AGL) / 4⌉</div>
        </div>
        <div className="border-2 p-4 text-center" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
          <div style={fontUI} className="uppercase text-xs tracking-widest">Stress Capacity</div>
          <div style={{ ...fontDisplay, fontSize: '2.5rem', lineHeight: 1 }}>{stressCap}</div>
          <div style={fontUI} className="text-xs opacity-60">⌈(INT + EMP) / 4⌉</div>
        </div>
      </div>

      <Divider label="UNIT MORALE" />
      <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
        {moraleRoll === null ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3">
              <Die sides={6} value={null} rolling={rolling} size="lg" />
              <Die sides={6} value={null} rolling={rolling} size="lg" />
            </div>
            <Btn onClick={rollMorale} disabled={rolling}>Roll 2D6 for Unit Morale</Btn>
          </div>
        ) : (
          <div>
            <div className="flex gap-3 justify-center">
              <Die sides={6} value={moraleRoll.a} size="lg" highlight />
              <Die sides={6} value={moraleRoll.b} size="lg" highlight />
            </div>
            <div style={fontDisplay} className="text-3xl mt-3">{dieLetter(moraleValue)}</div>
            <div style={fontUI} className="text-xs opacity-70">2D6 = {moraleRoll.sum} → unit morale d{moraleValue}</div>
          </div>
        )}
      </div>

      <Divider label="WHAT MOVES YOU" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label style={fontUI} className="block uppercase text-xs tracking-[0.3em] mb-1">Moral Code</label>
          <textarea rows="3" value={moralCode} onChange={(e) => setMoralCode(e.target.value)}
            placeholder="Never harm a child. Always pay debts. Honor my dead..."
            className="w-full px-3 py-2 border-2 bg-transparent outline-none resize-none"
            style={{ ...fontBody, borderColor: '#2d3a17' }} />
        </div>
        <div>
          <label style={fontUI} className="block uppercase text-xs tracking-[0.3em] mb-1">Big Dream</label>
          <textarea rows="3" value={bigDream} onChange={(e) => setBigDream(e.target.value)}
            placeholder="Get home. Find my sister. See the ocean again..."
            className="w-full px-3 py-2 border-2 bg-transparent outline-none resize-none"
            style={{ ...fontBody, borderColor: '#2d3a17' }} />
        </div>
        <div>
          <label style={fontUI} className="block uppercase text-xs tracking-[0.3em] mb-1">Buddies</label>
          <textarea rows="3" value={buddies} onChange={(e) => setBuddies(e.target.value)}
            placeholder="The medic who pulled me from the Vistula. My old sergeant..."
            className="w-full px-3 py-2 border-2 bg-transparent outline-none resize-none"
            style={{ ...fontBody, borderColor: '#2d3a17' }} />
        </div>
      </div>

      <div className="flex justify-between">
        <Btn variant="secondary" onClick={back}>← Back</Btn>
        <Btn sound="next" onClick={finalize} disabled={!moraleValue || !moralCode.trim() || !bigDream.trim()}>Gear & Supplies →</Btn>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 7: GEAR
// ============================================================================

function GearStep({ character, setCharacter, next, back }) {
  const lastTerm = character.terms[character.terms.length - 1];
  // Drafted civilians get Combat Arms gear regardless of their last career
  const sourceCareerId = character.drafted ? 'combatArms' : lastTerm?.careerId;
  const lastCareer = CAREERS.find(c => c.id === sourceCareerId);
  const slots = lastCareer?.gearSlots || [];

  const [stage, setStage] = useState('kit'); // kit → supplies
  const [picks, setPicks] = useState({}); // slotIdx → pickIdx
  const [resolved, setResolved] = useState(null);
  const [supplies, setSupplies] = useState(null);
  const [rolling, setRolling] = useState(false);

  const pickText = (pick) => typeof pick === 'string' ? pick : pick.text;
  const pickIsWeapon = (pick) => typeof pick === 'string' ? true : pick.weapon !== false;

  const allSlotsPicked = slots.every((slot, i) =>
    slot.picks.length === 1 || picks[i] !== undefined
  );

  const setPick = (slotIdx, pickIdx) => {
    setPicks({ ...picks, [slotIdx]: pickIdx });
  };

  const resolveKit = () => {
    setRolling(true);
    setTimeout(() => {
      const items = slots.map((slot, i) => {
        const pickIdx = slot.picks.length === 1 ? 0 : picks[i];
        const pick = slot.picks[pickIdx];
        const text = pickText(pick);
        const isWeapon = pickIsWeapon(pick);
        let line = rollDiceInText(text);
        if (slot.reloads && isWeapon) {
          const reloads = rollDie(slot.reloads);
          line += ` — ${reloads} reload${reloads > 1 ? 's' : ''}`;
        }
        return line;
      });
      setResolved(items);
      setStage('supplies');
      setRolling(false);
    }, 600);
  };

  const rollSupplies = () => {
    setRolling(true);
    setTimeout(() => {
      setSupplies({ rations: rollDie(6), water: rollDie(6), ammo: rollDie(6) });
      setRolling(false);
    }, 700);
  };

  const finalize = () => {
    setCharacter({
      ...character,
      gear: { career: lastCareer?.name || 'Civilian', items: resolved },
      rations: supplies.rations,
      water: supplies.water,
      ammoCurrency: supplies.ammo,
    });
    next();
  };

  // ----------------------------------------------------------------------
  // STAGE: kit (slot picks)
  // ----------------------------------------------------------------------
  if (stage === 'kit') {
    return (
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="mb-6 text-center">
          <SectionLabel>Step 07 of 08</SectionLabel>
          <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>STARTING GEAR</h2>
          <p style={fontBody} className="opacity-80 max-w-xl mx-auto mt-2">
            {character.drafted ? (
              <>Drafted into the military. Your <strong>{lastTerm?.career}</strong> kit was replaced with a <strong>Combat Arms</strong> issue. Pick where the rules give you a choice; the rest is fixed.</>
            ) : (
              <>Your last career — <strong>{lastCareer?.name || 'Civilian'}</strong> — sets your starting kit. Pick where the rules give you a choice; the rest is fixed.</>
            )}
          </p>
          {character.drafted && (
            <div className="mt-3 inline-block">
              <Stamp rotation={-3} color="#8B2E2E">DRAFTED · COMBAT ARMS ISSUE</Stamp>
            </div>
          )}
        </div>

        <Divider label={`KIT · ${(lastCareer?.name || 'CIVILIAN').toUpperCase()}`} />
        <div className="space-y-3 mb-6">
          {slots.map((slot, i) => {
            const single = slot.picks.length === 1;
            const reloadHint = slot.reloads ? ` · D${slot.reloads} reloads` : '';
            if (single) {
              return (
                <div key={i} className="border-2 border-dashed p-3 flex items-baseline justify-between"
                     style={{ borderColor: '#8b7e58', background: 'rgba(255,250,235,0.4)' }}>
                  <div style={fontBody}>· {pickText(slot.picks[0])}</div>
                  {slot.reloads && (
                    <div className="text-xs uppercase tracking-widest opacity-70" style={fontUI}>
                      D{slot.reloads} reloads
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={i}>
                <div className="text-xs uppercase tracking-widest mb-1 opacity-70" style={fontUI}>
                  Slot {i + 1} · pick one{reloadHint}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {slot.picks.map((p, j) => (
                    <Card key={j} selected={picks[i] === j} onClick={() => setPick(i, j)}>
                      <div style={{ ...fontBody, fontSize: '0.9rem' }}>{pickText(p)}</div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between">
          <Btn variant="secondary" onClick={back}>← Back</Btn>
          <Btn sound="next" onClick={resolveKit} disabled={!allSlotsPicked || rolling}>
            {rolling ? 'Rolling…' : 'Roll Kit & Supplies →'}
          </Btn>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STAGE: supplies (resolved kit + 3D6 supplies roll)
  // ----------------------------------------------------------------------
  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Step 07 of 08 · {lastCareer?.name || 'Civilian'}</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>SUPPLIES</h2>
        <p style={fontBody} className="opacity-80 max-w-xl mx-auto mt-2">
          Your kit is set. Now roll for what you carry into the war.
        </p>
      </div>

      <Divider label="ROLLED KIT" />
      <div className="border-2 p-4 mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
        <div style={fontBody} className="text-sm space-y-1">
          {resolved.map((item, i) => <div key={i}>· {item}</div>)}
        </div>
      </div>

      <Divider label="SUPPLIES · 3D6" />
      <div className="border-2 p-6 text-center mb-6" style={{ borderColor: '#2d3a17', background: 'rgba(255,250,235,0.6)' }}>
        {supplies === null ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3">
              <Die sides={6} value={null} rolling={rolling} size="lg" />
              <Die sides={6} value={null} rolling={rolling} size="lg" />
              <Die sides={6} value={null} rolling={rolling} size="lg" />
            </div>
            <div style={fontUI} className="text-xs uppercase tracking-widest opacity-70">food · water · ammo</div>
            <Btn onClick={rollSupplies} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll 3D6 for Supplies'}</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div>
              <Die sides={6} value={supplies.rations} size="lg" highlight />
              <div className="mt-2" style={fontUI}>
                <div className="uppercase text-xs tracking-widest opacity-70">Food</div>
                <div style={fontDisplay} className="text-2xl">{supplies.rations}</div>
                <div className="text-[10px] opacity-60">rations</div>
              </div>
            </div>
            <div>
              <Die sides={6} value={supplies.water} size="lg" highlight />
              <div className="mt-2" style={fontUI}>
                <div className="uppercase text-xs tracking-widest opacity-70">Water</div>
                <div style={fontDisplay} className="text-2xl">{supplies.water}</div>
                <div className="text-[10px] opacity-60">rations</div>
              </div>
            </div>
            <div>
              <Die sides={6} value={supplies.ammo} size="lg" highlight />
              <div className="mt-2" style={fontUI}>
                <div className="uppercase text-xs tracking-widest opacity-70">Ammo</div>
                <div style={fontDisplay} className="text-2xl">{supplies.ammo}</div>
                <div className="text-[10px] opacity-60">rounds (currency)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Btn variant="secondary" onClick={() => { setStage('kit'); setResolved(null); setSupplies(null); }}>
          ← Re-pick Kit
        </Btn>
        <Btn sound="next" onClick={finalize} disabled={!supplies}>Finalize Dossier →</Btn>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 8: CHARACTER SHEET
// ============================================================================

function CharacterSheet({ character, restart }) {
  const printRef = useRef(null);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${character.name.replace(/\s+/g, '_')}_T2K_dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <div className="mb-6 text-center">
        <SectionLabel>Step 08 of 08</SectionLabel>
        <h2 style={{ ...fontDisplay, fontSize: '2.5rem', letterSpacing: '0.05em' }}>FIELD DOSSIER</h2>
      </div>

      <div ref={printRef} className="border-4 p-6 md:p-10 relative" style={{ borderColor: '#1a1a1a', background: 'rgba(255,250,235,0.85)' }}>
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2" style={{ borderColor: '#1a1a1a' }}>
          <div>
            <div style={{ ...fontUI, color: '#8B2E2E', letterSpacing: '0.4em' }} className="text-xs uppercase">
              Twilight 2000 · Personnel File
            </div>
            <div style={{ ...fontDisplay, fontSize: '2rem', letterSpacing: '0.04em', lineHeight: 1 }} className="mt-1">
              {(character.name || 'UNKNOWN').toUpperCase()}
            </div>
            <div style={fontBody} className="text-sm mt-1">
              {character.nationality} · Age {character.age}
              {character.rankLabel && <> · {character.rankLabel}</>}
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <Stamp rotation={6}>CLEARED FOR DEPLOYMENT</Stamp>
          </div>
        </div>

        <SectionLabel className="mb-2">ATTRIBUTES & CUF</SectionLabel>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {Object.entries(ATTRS).map(([id, a]) => (
            <div key={id} className="border-2 p-3 text-center" style={{ borderColor: '#2d3a17' }}>
              <div style={fontUI} className="uppercase text-xs tracking-widest opacity-70">{a.name}</div>
              <div style={{ ...fontDisplay, fontSize: '2.2rem', lineHeight: 1 }} className="my-1">{dieLetter(character.attributes[id])}</div>
              <div style={fontUI} className="text-xs opacity-60">d{character.attributes[id]}</div>
            </div>
          ))}
          <div className="border-2 p-3 text-center" style={{ borderColor: '#8B2E2E' }}>
            <div className="uppercase text-xs tracking-widest" style={{ ...fontUI, color: '#8B2E2E' }}>CUF</div>
            <div style={{ ...fontDisplay, fontSize: '2.2rem', lineHeight: 1 }} className="my-1">{dieLetter(character.cuf)}</div>
            <div style={fontUI} className="text-xs opacity-60">d{character.cuf}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="border-2 p-3 text-center" style={{ borderColor: '#2d3a17' }}>
            <div style={fontUI} className="uppercase text-xs tracking-widest opacity-70">Hit Capacity</div>
            <div style={{ ...fontDisplay, fontSize: '1.8rem' }}>{character.hitCapacity}</div>
          </div>
          <div className="border-2 p-3 text-center" style={{ borderColor: '#2d3a17' }}>
            <div style={fontUI} className="uppercase text-xs tracking-widest opacity-70">Stress Capacity</div>
            <div style={{ ...fontDisplay, fontSize: '1.8rem' }}>{character.stressCapacity}</div>
          </div>
          <div className="border-2 p-3 text-center" style={{ borderColor: '#2d3a17' }}>
            <div style={fontUI} className="uppercase text-xs tracking-widest opacity-70">Unit Morale</div>
            <div style={{ ...fontDisplay, fontSize: '1.8rem' }}>{dieLetter(character.unitMorale)}</div>
          </div>
        </div>

        <SectionLabel className="mb-2">SKILLS</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 mb-6">
          {Object.entries(SKILLS).map(([id, s]) => {
            const v = character.skills[id] || 0;
            return (
              <div key={id} className="flex items-baseline justify-between border-b" style={{ borderColor: 'rgba(45,58,23,0.2)' }}>
                <span style={fontBody} className="text-sm">
                  {s.name} <span className="opacity-50 text-xs">[{ATTRS[s.attr].short}]</span>
                </span>
                <span style={fontDisplay} className="text-lg">{v ? dieLetter(v) : '·'}</span>
              </div>
            );
          })}
        </div>

        {character.specialties.length > 0 && (<>
          <SectionLabel className="mb-2">SPECIALTIES</SectionLabel>
          <div className="flex flex-wrap gap-2 mb-6">
            {character.specialties.map((s, i) => (
              <div key={i} className="px-3 py-1 border-2 text-sm" style={{ ...fontDisplay, borderColor: '#2d3a17', letterSpacing: '0.08em' }}>
                {s.toUpperCase()}
              </div>
            ))}
          </div>
        </>)}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {character.moralCode && (
            <div>
              <SectionLabel className="mb-1">MORAL CODE</SectionLabel>
              <p style={fontBody} className="text-sm">{character.moralCode}</p>
            </div>
          )}
          {character.bigDream && (
            <div>
              <SectionLabel className="mb-1">BIG DREAM</SectionLabel>
              <p style={fontBody} className="text-sm">{character.bigDream}</p>
            </div>
          )}
          {character.buddies && (
            <div>
              <SectionLabel className="mb-1">BUDDIES</SectionLabel>
              <p style={fontBody} className="text-sm">{character.buddies}</p>
            </div>
          )}
        </div>

        <SectionLabel className="mb-2">GEAR & EQUIPMENT</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-60 mb-1" style={fontUI}>
              Starting Kit{character.gear?.career && <span className="opacity-90"> · {character.gear.career}</span>}
            </div>
            <div style={fontBody} className="text-sm space-y-0.5">
              {(character.gear?.items || []).map((item, i) => <div key={i}>· {item}</div>)}
              {(!character.gear?.items || character.gear.items.length === 0) && <div className="opacity-60">— no kit —</div>}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest opacity-60 mb-1" style={fontUI}>Supplies</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="border p-2 text-center" style={{ borderColor: '#2d3a17' }}>
                <div className="text-[10px] uppercase tracking-widest opacity-70" style={fontUI}>Food</div>
                <div style={{ ...fontDisplay, fontSize: '1.4rem' }}>{character.rations || 0}</div>
                <div className="text-[10px] opacity-60" style={fontUI}>rations</div>
              </div>
              <div className="border p-2 text-center" style={{ borderColor: '#2d3a17' }}>
                <div className="text-[10px] uppercase tracking-widest opacity-70" style={fontUI}>Water</div>
                <div style={{ ...fontDisplay, fontSize: '1.4rem' }}>{character.water || 0}</div>
                <div className="text-[10px] opacity-60" style={fontUI}>rations</div>
              </div>
              <div className="border p-2 text-center" style={{ borderColor: '#8B2E2E' }}>
                <div className="text-[10px] uppercase tracking-widest" style={{ ...fontUI, color: '#8B2E2E' }}>Ammo</div>
                <div style={{ ...fontDisplay, fontSize: '1.4rem' }}>{character.ammoCurrency || 0}</div>
                <div className="text-[10px] opacity-60" style={fontUI}>currency</div>
              </div>
            </div>
          </div>
        </div>

        <SectionLabel className="mb-2">SERVICE RECORD</SectionLabel>
        <div className="space-y-2 mb-6">
          {character.events.map((e, i) => (
            <div key={i} className="flex gap-3 text-sm" style={fontBody}>
              <div className="w-28 shrink-0 uppercase text-xs tracking-widest opacity-60" style={fontUI}>{e.phase}</div>
              <div className="w-24 shrink-0">
                <span className="px-2 py-0.5 border text-[10px]" style={{ borderColor: '#8B2E2E', color: '#8B2E2E', ...fontUI, letterSpacing: '0.1em' }}>{e.tag}</span>
              </div>
              <div>
                <div style={fontDisplay} className="text-sm">{e.title}</div>
                <div className="opacity-80">{e.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t flex justify-between items-end" style={{ borderColor: '#1a1a1a' }}>
          <div className="text-xs opacity-60" style={fontBody}>
            FILED: {new Date().toLocaleDateString()} · TERMS SERVED: {character.terms.length}
          </div>
          <Stamp rotation={-7} color="#1a1a1a">DOSSIER · COMPLETE</Stamp>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 justify-between mt-6">
        <Btn variant="secondary" onClick={restart}>← New Character</Btn>
        <div className="flex gap-3">
          <Btn variant="secondary" onClick={exportJSON}>Export JSON</Btn>
          <Btn onClick={() => window.print()}>Print Dossier</Btn>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN
// ============================================================================

const blank = {
  name: '', nationality: '', age: 18,
  attributes: { str: 8, agl: 8, int: 8, emp: 8 },
  cuf: 6, // D
  rankLabel: null, rankIndex: 0, rankTrack: null,
  skills: {},
  specialties: [],
  childhood: null,
  terms: [],
  warBrokeOut: false,
  drafted: false, atWarColumn: null,
  hitCapacity: 0, stressCapacity: 0, unitMorale: 0,
  moralCode: '', bigDream: '', buddies: '',
  gear: { career: null, items: [] },
  rations: 0, water: 0, ammoCurrency: 0,
  events: [],
};

const STEPS = ['welcome', 'attributes', 'childhood', 'careers', 'war', 'final', 'gear', 'sheet'];

export default function App() {
  useFonts();
  const [step, setStep] = useState('welcome');
  const [character, setCharacter] = useState(blank);
  const [muted, setMuted] = useState(false);
  const toggleMute = () => setMuted(m => !m);

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);
  const restart = () => { setCharacter(blank); setStep('welcome'); };

  return (
    <SoundContext.Provider value={{ muted, toggleMute }}>
    <PaperBg>
      {step !== 'welcome' && (
        <div className="border-b-4 px-4 py-3 flex items-center justify-between" style={{ borderColor: '#2d3a17', background: 'rgba(45,58,23,0.95)', color: '#ebe3d2' }}>
          <div style={{ ...fontDisplay, letterSpacing: '0.2em' }} className="text-lg">T—2000 · DOSSIER</div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-1.5 items-center">
              {STEPS.slice(1).map((s, i) => {
                const j = i + 1;
                const active = idx === j;
                const done = idx > j;
                return (
                  <div key={s} className="w-6 h-6 flex items-center justify-center border-2 text-xs"
                    style={{
                      ...fontDisplay,
                      borderColor: active || done ? '#ebe3d2' : 'rgba(235,227,210,0.4)',
                      background: active ? '#8B2E2E' : done ? '#ebe3d2' : 'transparent',
                      color: active ? '#ebe3d2' : done ? '#2d3a17' : 'rgba(235,227,210,0.6)',
                    }}>{j}</div>
                );
              })}
            </div>
            <button onClick={toggleMute}
              className="border-2 px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition-opacity hover:opacity-80"
              style={{ ...fontUI, borderColor: '#ebe3d2', color: '#ebe3d2', background: 'transparent' }}
              title={muted ? 'Audio muted' : 'Audio on'}>
              {muted ? '♪̸ OFF' : '♪ ON'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 max-w-7xl mx-auto">
        <div>
          {step === 'welcome'    && <WelcomeStep        character={character} setCharacter={setCharacter} next={next} />}
          {step === 'attributes' && <AttributesStep     character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'childhood'  && <ChildhoodStep      character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'careers'    && <CareerStep         character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'war'        && <AtWarStep          character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'final'      && <FinalTouchesStep   character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'gear'       && <GearStep           character={character} setCharacter={setCharacter} next={next} back={back} />}
          {step === 'sheet'      && <CharacterSheet     character={character} restart={restart} />}
        </div>

        {step !== 'welcome' && step !== 'sheet' && step !== 'gear' && (
          <aside className="hidden lg:block py-8 pr-6 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto">
            <LivePreview character={character} />
          </aside>
        )}
      </div>

      <footer className="text-center py-6 text-xs opacity-60" style={fontUI}>
        Twilight 2000 is © Free League Publishing. This is a fan-made character creator for personal use.
      </footer>
    </PaperBg>
    </SoundContext.Provider>
  );
}