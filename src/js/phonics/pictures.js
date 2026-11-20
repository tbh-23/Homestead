// Outline pictures for the decodable books (HAR-45), drawn to be coloured in:
// black strokes 3.5 units wide at the 400 x 300 viewBox, whatever an item's
// scale, round joins and caps, every enclosed region filled white so a shape
// in front hides the one behind and each region is one patch to colour. No
// colour anywhere: only black, white and "none" (open lines).
//
// A book stores a scene as data, a list of items { kind, x, y, scale, pose }
// (plus a few kind-specific options such as `cap`, `drips` or `flip`), never
// as SVG. renderScene() draws it. Grounded things (people, animals, a bus)
// stand on (x, y); floating things (a tap on the wall, the sun, a cloud, a
// fish, a map, a bee) are centred on it. The ground line is at y = 262.
// No DOM: a string out, so Node tests and the print document share it.

export const VIEW_W = 400;
export const VIEW_H = 300;
export const GROUND_Y = 262;
export const STROKE = 3.5;

const W = 'fill="#fff"';
const OPEN = 'fill="none"';
const INK = 'fill="#000" stroke="none"';

const dot = (x, y, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r}" ${INK}/>`;
// A limb: a capsule from the origin, `len` long, rotated `deg` clockwise from
// pointing straight down, placed at (x, y).
const limb = (x, y, deg, len = 50, w = 13) => `<rect x="${-w / 2}" y="${-w / 2}" width="${w}" height="${len + w / 2}" rx="${w / 2}" ${W} transform="translate(${x} ${y}) rotate(${deg})"/>`;
const limbEnd = (x, y, deg, len = 50) => {
  const r = (deg * Math.PI) / 180;
  return [x - Math.sin(r) * len, y + Math.cos(r) * len];
};
// Several overlapping shapes outlined as one: a double-width stroke under a
// stroke-free white copy leaves only the outer edge (a cloud, a tree crown).
const union = (shapes, w) => `<g stroke-width="${2 * w}">${shapes.join('')}</g><g stroke="none">${shapes.join('')}</g>`;
const circle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${W}/>`;

// ---- people ----------------------------------------------------------------
// pose: 'stand' | 'sit'; arms: 'down' | 'out' (right arm held out, to hold
// something) | 'pat' (right arm reaching down to the right) | 'wave' (right
// arm up) | 'both' (both arms out); cap: true for a cap instead of hair;
// hair: 'short' | 'long'; seat: false to sit on the ground (or a mat, a bed)
// rather than a stool.
const ARMS = {
  down: [14, -14],
  out: [14, -88],
  pat: [14, -46],
  wave: [14, -160],
  both: [70, -70],
};
function person({ pose = 'stand', arms = 'down', cap = false, hair = 'short', seat = true } = {}) {
  const sit = pose === 'sit';
  const dy = sit ? (seat === false ? 58 : 12) : 0; // the upper body sits lower
  const [la, ra] = ARMS[arms] || ARMS.down;
  let legs;
  if (sit) {
    // Stool legs sit behind the stool top; the shirt hem, thigh and stool share
    // y = -50 so no sub-millimetre gap forms along the lap or knee.
    const stool = seat === false ? '' : `<rect x="-32" y="-44" width="9" height="44" rx="3" ${W}/><rect x="16" y="-44" width="9" height="44" rx="3" ${W}/>
      <rect x="-36" y="-50" width="72" height="12" rx="4" ${W}/>`;
    legs = seat === false
      ? `<path d="M0 -16 H48 V0 H0 Z" ${W}/><ellipse cx="50" cy="-10" rx="8" ry="11" ${W}/>`
      : `${stool}
      <path d="M0 -50 V-66 H37 Q45 -66 45 -58 V-5 H30 V-50 Z" ${W}/>
      <ellipse cx="40" cy="-5" rx="13" ry="5.5" ${W}/>`;
  } else {
    legs = `<rect x="-17" y="-64" width="14" height="62" rx="7" ${W}/><rect x="3" y="-64" width="14" height="62" rx="7" ${W}/>
      <ellipse cx="-13" cy="-4" rx="12" ry="6.5" ${W}/><ellipse cx="13" cy="-4" rx="12" ry="6.5" ${W}/>`;
  }
  const sy = -116 + dy; // shoulders
  const [lx, ly] = limbEnd(-22, sy, la);
  const [rx, ry] = limbEnd(22, sy, ra);
  const arm = (x, y, deg, hx, hy) => `${limb(x, y, deg)}<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="7.5" ${W}/>`;
  const hy = -150 + dy; // head centre
  const top = cap
    ? `<path d="M-28 ${hy - 6} C-28 ${hy - 42} 28 ${hy - 42} 28 ${hy - 6} Z" ${W}/><path d="M20 ${hy - 12} H52 Q58 ${hy - 12} 58 ${hy - 6} H20 Z" ${W}/><circle cx="0" cy="${hy - 32}" r="4" ${W}/>`
    : hair === 'long'
      ? `<path d="M-29 ${hy + 22} C-36 ${hy - 10} -28 ${hy - 34} 0 ${hy - 34} C28 ${hy - 34} 36 ${hy - 10} 29 ${hy + 22} L18 ${hy + 22} C22 ${hy} 20 ${hy - 14} 0 ${hy - 16} C-20 ${hy - 14} -22 ${hy} -18 ${hy + 22} Z" ${W}/>`
      : `<path d="M-27 ${hy - 2} C-30 ${hy - 30} -14 ${hy - 36} 0 ${hy - 36} C14 ${hy - 36} 30 ${hy - 30} 27 ${hy - 2} C18 ${hy - 16} -18 ${hy - 16} -27 ${hy - 2} Z" ${W}/>`;
  // The arm held up or out is drawn over the body; arms at the sides behind it.
  const front = arms === 'down' ? '' : arm(22, sy, ra, rx, ry);
  const back = arms === 'down' ? arm(-22, sy, la, lx, ly) + arm(22, sy, ra, rx, ry) : arm(-22, sy, la, lx, ly);
  const longBack = !cap && hair === 'long' ? top : '';
  const ty = -124 + dy;
  const by = sit ? (seat === false ? 0 : -50) : -56;
  return `${longBack}${legs}${back}<path d="M-26 ${ty + 16} Q-26 ${ty} -10 ${ty} H10 Q26 ${ty} 26 ${ty + 16} V${by} H-26 Z" ${W}/>${front}
    <circle cx="0" cy="${hy}" r="26" ${W}/>${longBack ? '' : top}
    ${dot(-9, hy + 1)}${dot(9, hy + 1)}<path d="M-9 ${hy + 12} Q0 ${hy + 19} 9 ${hy + 12}" ${OPEN}/>`;
}

// ---- animals ---------------------------------------------------------------
// pose: 'sit' | 'fat' (a big round cat) | 'sip' (head down to a bowl) |
// 'nap' (curled up asleep). cap: true for a cap.
function cat({ pose = 'sit', cap = false } = {}) {
  const fat = pose === 'fat';
  if (pose === 'nap') {
    return `<path d="M40 -12 C78 -10 84 -40 64 -50 C58 -52 54 -46 60 -42 C70 -34 64 -22 40 -24 Z" ${W}/>
      <ellipse cx="4" cy="-28" rx="54" ry="28" ${W}/>
      <path d="M-58 -46 L-56 -70 L-42 -54 Z" ${W}/><path d="M-30 -56 L-20 -74 L-14 -50 Z" ${W}/>
      <circle cx="-38" cy="-32" r="24" ${W}/>
      <path d="M-50 -34 Q-46 -30 -42 -34 M-34 -34 Q-30 -30 -26 -34" ${OPEN}/><path d="M-41 -24 l3 3 l3 -3 z" ${INK}/>
      <path d="M40 -36 Q30 -20 14 -12" ${OPEN}/>`;
  }
  const rx = fat ? 58 : 42;
  const ry = fat ? 42 : 34;
  const [hx, hy] = pose === 'sip' ? [-48, -50] : fat ? [-32, -100] : [-30, -86];
  const head = `<g transform="translate(${hx} ${hy})">
      ${cap ? '' : `<path d="M-24 -10 L-22 -42 L-6 -24 Z" ${W}/><path d="M24 -10 L22 -42 L6 -24 Z" ${W}/>`}
      <circle r="26" ${W}/>
      ${cap ? `<path d="M-24 -12 C-24 -46 24 -46 24 -12 Z" ${W}/><path d="M16 -18 H44 Q50 -18 50 -12 H16 Z" ${W}/>` : ''}
      ${dot(-9, -2)}${dot(9, -2)}<path d="M-4 8 L0 12 L4 8 Z" ${INK}/>
      <path d="M0 12 Q-4 18 -9 15 M0 12 Q4 18 9 15" ${OPEN}/>
      <path d="M-18 3 L-36 0 M-18 8 L-35 11 M18 3 L36 0 M18 8 L35 11" ${OPEN}/>
    </g>`;
  const bowl = pose === 'sip'
    ? `<path d="M-118 -18 L-112 -3 Q-110 0 -88 0 Q-66 0 -64 -3 L-58 -18 Z" ${W}/><ellipse cx="-88" cy="-18" rx="30" ry="6" ${W}/>` : '';
  return `<path d="M${rx - 8} -14 C${rx + 40} -12 ${rx + 46} -62 ${rx + 26} -86 C${rx + 20} -92 ${rx + 12} -86 ${rx + 16} -80 C${rx + 30} -60 ${rx + 26} -28 ${rx - 8} -28 Z" ${W}/>
    <ellipse cx="0" cy="${-ry}" rx="${rx}" ry="${ry}" ${W}/>
    <ellipse cx="-18" cy="-5" rx="13" ry="7" ${W}/><ellipse cx="10" cy="-5" rx="13" ry="7" ${W}/>
    ${head}${bowl}`;
}

function dog({ pose = 'stand' } = {}) {
  const sitting = pose === 'sit';
  const legs = sitting
    ? `<rect x="-28" y="-40" width="13" height="40" rx="6" ${W}/><rect x="-10" y="-40" width="13" height="40" rx="6" ${W}/><ellipse cx="30" cy="-14" rx="26" ry="16" ${W}/>`
    : `<rect x="-36" y="-44" width="13" height="44" rx="6" ${W}/><rect x="-18" y="-44" width="13" height="44" rx="6" ${W}/>
       <rect x="26" y="-44" width="13" height="44" rx="6" ${W}/><rect x="44" y="-44" width="13" height="44" rx="6" ${W}/>`;
  const body = sitting
    ? `<ellipse cx="10" cy="-50" rx="36" ry="34" ${W}/>`
    : `<ellipse cx="10" cy="-56" rx="56" ry="26" ${W}/>`;
  return `<path d="M54 -62 C70 -70 76 -90 70 -104 C66 -110 60 -106 62 -100 C66 -86 58 -76 50 -74 Z" ${W}/>
    ${legs}${body}
    <circle cx="-42" cy="-88" r="25" ${W}/>
    <path d="M-60 -78 C-74 -80 -84 -76 -82 -66 C-80 -58 -68 -60 -56 -64 Z" ${W}/>
    <path d="M-34 -106 C-20 -110 -12 -96 -18 -76 C-22 -66 -30 -70 -32 -80 Z" ${W}/>
    ${dot(-48, -94)}<ellipse cx="-80" cy="-72" rx="5" ry="4" ${INK}/>
    <path d="M-70 -62 Q-62 -58 -56 -64" ${OPEN}/>`;
}

function pig() {
  return `<path d="M58 -60 C70 -64 72 -76 64 -78 C58 -80 56 -72 62 -70" ${OPEN}/>
    <rect x="-30" y="-36" width="14" height="36" rx="5" ${W}/><rect x="-12" y="-36" width="14" height="36" rx="5" ${W}/>
    <rect x="24" y="-36" width="14" height="36" rx="5" ${W}/><rect x="40" y="-36" width="14" height="36" rx="5" ${W}/>
    <ellipse cx="12" cy="-56" rx="52" ry="32" ${W}/>
    <path d="M-58 -92 L-56 -116 L-40 -100 Z" ${W}/><path d="M-30 -100 L-20 -120 L-14 -94 Z" ${W}/>
    <circle cx="-38" cy="-74" r="27" ${W}/>
    <ellipse cx="-60" cy="-68" rx="13" ry="11" ${W}/>${dot(-64, -68, 2.6)}${dot(-56, -68, 2.6)}
    ${dot(-42, -84)}<path d="M-46 -56 Q-38 -52 -32 -58" ${OPEN}/>`;
}

function hen() {
  return `<path d="M-6 -16 V0 M-6 0 L-14 4 M-6 0 L2 4 M10 -16 V0 M10 0 L2 4 M10 0 L18 4" ${OPEN}/>
    <path d="M26 -60 L58 -98 L66 -76 L60 -50 Z" ${W}/>
    <ellipse cx="2" cy="-46" rx="42" ry="32" ${W}/>
    <path d="M-12 -52 Q8 -30 30 -48" ${OPEN}/>
    <path d="M-50 -110 C-48 -124 -40 -120 -40 -112 C-36 -126 -26 -122 -28 -110 C-22 -120 -14 -114 -20 -104 Z" ${W}/>
    <circle cx="-34" cy="-90" r="20" ${W}/>
    <path d="M-52 -94 L-68 -88 L-52 -82 Z" ${W}/><path d="M-50 -80 C-54 -70 -44 -68 -44 -78 Z" ${W}/>
    ${dot(-38, -94)}`;
}

function duck() {
  return `<path d="M-14 -6 L-22 2 L-6 2 Z M10 -6 L2 2 L18 2 Z" ${W}/>
    <path d="M34 -42 L66 -60 L58 -28 Z" ${W}/>
    <ellipse cx="6" cy="-32" rx="46" ry="26" ${W}/>
    <path d="M-10 -36 Q12 -18 34 -34" ${OPEN}/>
    <circle cx="-32" cy="-76" r="21" ${W}/>
    <path d="M-50 -76 C-70 -80 -78 -72 -72 -66 C-64 -62 -54 -66 -48 -68 Z" ${W}/>
    ${dot(-34, -80)}`;
}

function frog() {
  return `<ellipse cx="-42" cy="-14" rx="24" ry="14" ${W}/><ellipse cx="42" cy="-14" rx="24" ry="14" ${W}/>
    <ellipse cx="0" cy="-34" rx="46" ry="32" ${W}/>
    <ellipse cx="-20" cy="-4" rx="12" ry="6" ${W}/><ellipse cx="20" cy="-4" rx="12" ry="6" ${W}/>
    <circle cx="-20" cy="-64" r="14" ${W}/><circle cx="20" cy="-64" r="14" ${W}/>
    ${dot(-20, -64, 5)}${dot(20, -64, 5)}
    <path d="M-26 -36 Q0 -18 26 -36" ${OPEN}/>`;
}

function fish() {
  return `<path d="M42 0 L76 -26 L70 0 L76 26 Z" ${W}/>
    <path d="M-10 -26 L8 -42 L22 -24 Z" ${W}/>
    <path d="M-56 0 C-34 -34 30 -34 50 0 C30 34 -34 34 -56 0 Z" ${W}/>
    ${dot(-32, -5, 3.6)}<path d="M-18 -16 Q-10 0 -18 16" ${OPEN}/><path d="M-50 4 Q-46 8 -42 6" ${OPEN}/>`;
}

function bee() {
  return `<ellipse cx="-6" cy="-26" rx="16" ry="22" ${W} transform="rotate(-20 -6 -26)"/>
    <ellipse cx="14" cy="-26" rx="16" ry="22" ${W} transform="rotate(20 14 -26)"/>
    <path d="M30 0 L44 0 L30 6 Z" ${W}/>
    <ellipse cx="4" cy="2" rx="32" ry="20" ${W}/>
    <path d="M-6 -16 Q-12 2 -6 20 M8 -18 Q2 2 8 21 M22 -14 Q16 2 22 16" ${OPEN}/>
    <circle cx="-34" cy="0" r="14" ${W}/>${dot(-38, -3)}
    <path d="M-38 -12 Q-44 -26 -50 -28 M-30 -13 Q-30 -28 -24 -32" ${OPEN}/>`;
}

// ---- things ----------------------------------------------------------------
function tap({ drips = 0 } = {}) {
  let d = '';
  for (let i = 0; i < Math.min(drips, 4); i++) d += `<path d="M40 ${50 + i * 26} C32 ${62 + i * 26} 36 ${68 + i * 26} 40 ${68 + i * 26} C44 ${68 + i * 26} 48 ${62 + i * 26} 40 ${50 + i * 26} Z" ${W}/>`;
  return `<rect x="-72" y="-22" width="28" height="48" rx="5" ${W}/>
    <path d="M-44 -10 H26 C44 -10 50 0 50 14 V40 H30 V18 C30 14 28 12 24 12 H-44 Z" ${W}/>
    <rect x="-9" y="-36" width="18" height="28" ${W}/><rect x="-30" y="-46" width="60" height="14" rx="7" ${W}/>${d}`;
}

function capThing() {
  return `<path d="M-48 0 C-48 -66 48 -66 48 0 Z" ${W}/><path d="M36 -12 H94 Q102 -12 102 -4 V0 H36 Z" ${W}/>
    <path d="M0 -48 V0 M-24 -40 Q-14 -20 -14 0 M24 -40 Q14 -20 14 0" ${OPEN}/><circle cx="0" cy="-50" r="5" ${W}/>`;
}

function hat() {
  return `<ellipse cx="0" cy="-10" rx="66" ry="13" ${W}/>
    <path d="M-36 -12 L-30 -70 Q0 -82 30 -70 L36 -12 Q0 -4 -36 -12 Z" ${W}/>
    <path d="M-34 -30 Q0 -22 34 -30 L33 -42 Q0 -34 -33 -42 Z" ${W}/>`;
}

function map() {
  return `<path d="M-90 -55 L-30 -43 L30 -55 L90 -43 V67 L30 55 L-30 67 L-90 55 Z" ${W}/>
    <path d="M-30 -43 V67 M30 -55 V55" ${OPEN}/>
    <path d="M-70 30 Q-40 -10 -10 20 T60 0" ${OPEN} stroke-dasharray="8 7"/>
    <path d="M56 -16 L72 0 M72 -16 L56 0" ${OPEN}/>`;
}

function mat() {
  return `<rect x="-100" y="-16" width="200" height="16" rx="5" ${W}/>
    <path d="M-100 -12 H-110 M-100 -8 H-112 M-100 -4 H-110 M100 -12 H110 M100 -8 H112 M100 -4 H110" ${OPEN}/>`;
}

function rug() {
  return `<ellipse cx="0" cy="-10" rx="108" ry="12" ${W}/>
    <ellipse cx="0" cy="-10" rx="82" ry="7" ${W}/>
    <path d="M-24 -10 L0 -15 L24 -10 L0 -5 Z" ${W}/>`;
}

function sun() {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    rays += `M${(Math.cos(a) * 44).toFixed(1)} ${(Math.sin(a) * 44).toFixed(1)} L${(Math.cos(a) * 62).toFixed(1)} ${(Math.sin(a) * 62).toFixed(1)} `;
  }
  return `<path d="${rays.trim()}" ${OPEN}/><circle r="34" ${W}/>`;
}

function bus() {
  const windows = [-92, -48, -4, 40].map((x) => `<rect x="${x}" y="-92" width="36" height="28" rx="4" ${W}/>`).join('');
  return `<rect x="-112" y="-104" width="224" height="84" rx="14" ${W}/>${windows}
    <rect x="80" y="-92" width="22" height="58" rx="3" ${W}/><path d="M-112 -46 H80" ${OPEN}/>
    <circle cx="-62" cy="-20" r="19" ${W}/><circle cx="-62" cy="-20" r="6" ${W}/>
    <circle cx="58" cy="-20" r="19" ${W}/><circle cx="58" cy="-20" r="6" ${W}/>`;
}

function van() {
  return `<path d="M-90 -20 V-86 Q-90 -94 -82 -94 H40 Q52 -94 60 -80 L82 -52 Q90 -48 90 -40 V-20 Z" ${W}/>
    <path d="M40 -84 L58 -56 H20 V-84 Z" ${W}/><rect x="-74" y="-84" width="80" height="28" rx="4" ${W}/>
    <circle cx="-50" cy="-20" r="18" ${W}/><circle cx="-50" cy="-20" r="6" ${W}/>
    <circle cx="54" cy="-20" r="18" ${W}/><circle cx="54" cy="-20" r="6" ${W}/>`;
}

function cup() {
  return `<path d="M26 -52 C54 -54 58 -18 26 -18 L27 -28 C44 -28 44 -44 26 -42 Z" ${W}/>
    <path d="M-32 -64 H32 L26 -6 Q25 0 19 0 H-19 Q-25 0 -26 -6 Z" ${W}/>
    <path d="M-30 -52 H30" ${OPEN}/>`;
}

function pot() {
  return `<rect x="-62" y="-60" width="20" height="10" rx="5" ${W}/><rect x="42" y="-60" width="20" height="10" rx="5" ${W}/>
    <path d="M-46 -62 H46 V-12 Q46 0 34 0 H-34 Q-46 0 -46 -12 Z" ${W}/>
    <path d="M-52 -62 H52 Q54 -74 0 -76 Q-54 -74 -52 -62 Z" ${W}/><rect x="-8" y="-86" width="16" height="12" rx="5" ${W}/>`;
}

function pan() {
  return `<rect x="40" y="-22" width="70" height="12" rx="6" ${W}/>
    <path d="M-50 -24 H50 L44 -6 Q42 0 34 0 H-34 Q-42 0 -44 -6 Z" ${W}/><path d="M-46 -16 H46" ${OPEN}/>`;
}

function bag() {
  return `<path d="M-22 -70 C-22 -98 22 -98 22 -70" ${OPEN}/>
    <path d="M-40 -72 H40 L46 0 H-46 Z" ${W}/><path d="M-30 -60 H30" ${OPEN}/>`;
}

function box() {
  return `<path d="M-46 -64 L-26 -84 H62 L42 -64 Z" ${W}/><path d="M42 -64 L62 -84 V-20 L42 0 Z" ${W}/>
    <rect x="-46" y="-64" width="88" height="64" ${W}/><path d="M-46 -40 H42" ${OPEN}/>`;
}

function bed() {
  return `<rect x="-118" y="-96" width="20" height="96" rx="4" ${W}/>
    <rect x="98" y="-66" width="18" height="66" rx="4" ${W}/>
    <rect x="-100" y="-34" width="200" height="16" rx="3" ${W}/>
    <rect x="-100" y="-58" width="200" height="26" rx="8" ${W}/>
    <ellipse cx="-70" cy="-62" rx="24" ry="11" ${W}/>
    <path d="M-40 -64 H98 V-30 H-40 Q-48 -46 -40 -64 Z" ${W}/><path d="M-20 -64 Q-26 -48 -20 -30" ${OPEN}/>`;
}

function ship() {
  return `<rect x="-6" y="-128" width="26" height="46" ${W}/><path d="M-6 -112 H20" ${OPEN}/>
    <rect x="-56" y="-84" width="104" height="44" rx="4" ${W}/>
    <circle cx="-30" cy="-62" r="8" ${W}/><circle cx="-2" cy="-62" r="8" ${W}/><circle cx="26" cy="-62" r="8" ${W}/>
    <path d="M-116 -42 H116 L88 0 H-88 Z" ${W}/>
    <path d="M-130 10 Q-116 0 -102 10 T-74 10 T-46 10 T-18 10 T10 10 T38 10 T66 10 T94 10 T122 10" ${OPEN}/>`;
}

function bell() {
  return `<circle cx="0" cy="-84" r="9" ${W}/><circle cx="0" cy="4" r="9" ${W}/>
    <path d="M-38 -6 C-38 -30 -32 -76 0 -78 C32 -76 38 -30 38 -6 Z" ${W}/>
    <rect x="-46" y="-12" width="92" height="13" rx="6" ${W}/>`;
}

function cloud({ rain: falls = false } = {}, w) {
  let drops = '';
  if (falls) {
    for (const [x, y] of [[-46, 46], [-14, 62], [18, 46], [50, 62]]) {
      drops += `<path d="M${x} ${y} C${x - 7} ${y + 11} ${x - 4} ${y + 17} ${x} ${y + 17} C${x + 4} ${y + 17} ${x + 7} ${y + 11} ${x} ${y} Z" ${W}/>`;
    }
  }
  const shapes = [circle(-48, 8, 26), circle(-16, -10, 34), circle(24, -14, 30), circle(52, 8, 24), `<rect x="-60" y="4" width="118" height="30" rx="15" ${W}/>`];
  return `${union(shapes, w)}${drops}`;
}

function rain(_opts, w) {
  return cloud({ rain: true }, w);
}

function tree(_opts, w) {
  return `<path d="M-14 0 L-10 -90 H10 L14 0 Z" ${W}/>
    ${union([circle(-36, -116, 32), circle(0, -146, 38), circle(36, -116, 32), circle(0, -104, 34)], w)}`;
}

// Added for the generator's focus sounds (chick, moth, bath, seat, leaf, pail,
// jug, dish, rock, log, sock, sheep).
function chick() {
  return `<path d="M-8 -4 V2 M-8 2 L-14 5 M-8 2 L-2 5 M8 -4 V2 M8 2 L2 5 M8 2 L14 5" ${OPEN}/>
    <ellipse cx="0" cy="-26" rx="26" ry="22" ${W}/>
    <circle cx="-16" cy="-52" r="15" ${W}/>
    <path d="M-30 -54 L-42 -50 L-30 -46 Z" ${W}/>
    <path d="M-2 -30 Q10 -18 20 -30" ${OPEN}/>
    ${dot(-19, -55, 2.8)}`;
}

function moth() {
  return `<path d="M-4 -6 C-30 -44 -66 -40 -64 -12 C-62 8 -30 12 -4 2 Z" ${W}/>
    <path d="M4 -6 C30 -44 66 -40 64 -12 C62 8 30 12 4 2 Z" ${W}/>
    <path d="M-4 4 C-24 14 -40 30 -26 38 C-14 42 -4 26 -2 10 Z" ${W}/>
    <path d="M4 4 C24 14 40 30 26 38 C14 42 4 26 2 10 Z" ${W}/>
    <ellipse cx="0" cy="4" rx="7" ry="26" ${W}/>
    <path d="M-3 -20 Q-10 -36 -18 -40 M3 -20 Q10 -36 18 -40" ${OPEN}/>
    <circle cx="-34" cy="-16" r="8" ${W}/><circle cx="34" cy="-16" r="8" ${W}/>`;
}

function bath() {
  return `<rect x="-96" y="-12" width="14" height="12" rx="4" ${W}/><rect x="82" y="-12" width="14" height="12" rx="4" ${W}/>
    <rect x="80" y="-110" width="10" height="56" rx="3" ${W}/><path d="M90 -104 H104 V-92" ${OPEN}/>
    <path d="M-110 -60 H110 V-52 C110 -26 92 -10 70 -10 H-70 C-92 -10 -110 -26 -110 -52 Z" ${W}/>
    <path d="M-96 -46 Q-80 -40 -64 -46 T-32 -46 T0 -46 T32 -46 T64 -46 T96 -46" ${OPEN}/>`;
}

function seat() {
  return `<rect x="-44" y="-130" width="12" height="80" rx="4" ${W}/>
    <rect x="-44" y="-130" width="80" height="16" rx="6" ${W}/>
    <rect x="-40" y="-56" width="12" height="56" rx="4" ${W}/><rect x="28" y="-56" width="12" height="56" rx="4" ${W}/>
    <rect x="-50" y="-62" width="100" height="14" rx="5" ${W}/>`;
}

function leaf() {
  return `<path d="M-54 6 C-40 -40 20 -54 58 -40 C46 0 -6 26 -54 6 Z" ${W}/>
    <path d="M-54 6 C-20 -10 20 -26 58 -40 M-20 -6 L-14 -28 M6 -16 L14 -38 M-18 -4 L-2 6 M10 -16 L28 -6" ${OPEN}/>
    <path d="M-54 6 L-70 16" ${OPEN}/>`;
}

function pail() {
  return `<path d="M-38 -70 C-36 -112 36 -112 38 -70" ${OPEN}/>
    <path d="M-44 -72 H44 L34 0 H-34 Z" ${W}/><path d="M-41 -54 H41" ${OPEN}/>
    <circle cx="-42" cy="-70" r="5" ${W}/><circle cx="42" cy="-70" r="5" ${W}/>`;
}

function jug() {
  return `<path d="M30 -70 C64 -70 64 -24 30 -22 L30 -34 C48 -36 48 -58 30 -58 Z" ${W}/>
    <path d="M-34 -82 L-44 -94 H24 L30 -82 C40 -60 40 -20 30 0 H-34 C-44 -20 -44 -60 -34 -82 Z" ${W}/>
    <path d="M-38 -64 H34" ${OPEN}/>`;
}

function dish() {
  return `<ellipse cx="0" cy="-12" rx="70" ry="14" ${W}/>
    <path d="M-70 -12 C-66 4 66 4 70 -12" ${OPEN}/>
    <ellipse cx="0" cy="-14" rx="44" ry="7" ${W}/>`;
}

function rock() {
  return `<path d="M-74 0 C-80 -30 -60 -58 -26 -64 C6 -72 50 -60 68 -36 C80 -20 78 -6 72 0 Z" ${W}/>
    <path d="M-30 -40 Q-14 -48 0 -42 M24 -24 Q38 -30 48 -22" ${OPEN}/>`;
}

function sock() {
  return `<path d="M-20 -60 H20 V-4 C20 20 6 30 -18 30 H-46 C-62 30 -66 8 -50 4 L-20 -4 Z" ${W}/>
    <rect x="-24" y="-70" width="48" height="16" rx="5" ${W}/>
    <path d="M-20 -30 H20" ${OPEN}/>`;
}

function log() {
  return `<path d="M-80 -40 H70 V0 H-80 Z" ${W}/>
    <ellipse cx="70" cy="-20" rx="12" ry="20" ${W}/><ellipse cx="70" cy="-20" rx="5" ry="9" ${W}/>
    <ellipse cx="-80" cy="-20" rx="12" ry="20" ${W}/>
    <path d="M-50 -30 H-10 M10 -12 H44" ${OPEN}/>`;
}

function sheep(_opts, w) {
  return `<rect x="-40" y="-40" width="12" height="40" rx="5" ${W}/><rect x="-18" y="-40" width="12" height="40" rx="5" ${W}/>
    <rect x="18" y="-40" width="12" height="40" rx="5" ${W}/><rect x="38" y="-40" width="12" height="40" rx="5" ${W}/>
    ${union([circle(-30, -64, 24), circle(0, -76, 26), circle(30, -66, 24), circle(48, -50, 18), circle(-40, -46, 18), circle(8, -46, 24)], w)}
    <ellipse cx="-62" cy="-74" rx="18" ry="22" ${W}/>
    <path d="M-76 -92 C-90 -96 -94 -84 -80 -80 Z" ${W}/><path d="M-50 -94 C-38 -100 -32 -88 -46 -84 Z" ${W}/>
    ${dot(-68, -78)}${dot(-56, -78)}<path d="M-66 -64 Q-62 -60 -58 -64" ${OPEN}/>`;
}

// Slice B additions: every noun in the generator and expanded bank gets its
// own silhouette (rat, quiz, net, kit, keg, yak, fox, web, ring, king, drum,
// crab, train, tray, jeep, seal).
function rat() {
  return `<path d="M30 -12 C58 -10 68 -26 60 -38 C56 -44 50 -38 54 -34 C60 -26 52 -18 30 -20 Z" ${W}/>
    <ellipse cx="2" cy="-22" rx="34" ry="20" ${W}/>
    <ellipse cx="-16" cy="-4" rx="9" ry="5" ${W}/><ellipse cx="14" cy="-4" rx="9" ry="5" ${W}/>
    <circle cx="-22" cy="-44" r="11" ${W}/>
    <path d="M-24 -36 C-44 -36 -56 -26 -58 -18 C-56 -10 -38 -8 -22 -14 Z" ${W}/>
    <circle cx="-36" cy="-46" r="10" ${W}/>
    ${dot(-38, -24, 2.6)}${dot(-58, -18, 3.2)}
    <path d="M-48 -14 L-62 -10 M-48 -18 L-62 -20" ${OPEN}/>`;
}

function quiz() {
  return `<rect x="-46" y="-56" width="92" height="112" rx="8" ${W}/>
    <rect x="-20" y="-66" width="40" height="16" rx="5" ${W}/>
    <path d="M-10 -30 C-10 -42 10 -42 10 -30 C10 -22 0 -20 0 -13" ${OPEN}/>${dot(0, -4, 3)}
    <rect x="-30" y="8" width="14" height="14" rx="2" ${W}/><path d="M-8 15 H28" ${OPEN}/>
    <rect x="-30" y="30" width="14" height="14" rx="2" ${W}/><path d="M-8 37 H28" ${OPEN}/>`;
}

function net() {
  return `<rect x="-6" y="-58" width="12" height="58" rx="5" ${W}/>
    <path d="M0 -120 C46 -120 68 -104 68 -88 C68 -72 46 -60 0 -60 Z" ${W}/>
    <path d="M22 -114 Q30 -90 22 -66 M42 -106 Q48 -90 42 -74 M14 -90 H64" ${OPEN}/>
    <ellipse cx="0" cy="-90" rx="14" ry="32" ${W}/><ellipse cx="0" cy="-90" rx="7" ry="25" ${W}/>`;
}

function kit() {
  return `<path d="M-20 -64 V-76 Q-20 -82 -14 -82 H14 Q20 -82 20 -76 V-64 H10 V-73 H-10 V-64 Z" ${W}/>
    <rect x="-48" y="-66" width="96" height="66" rx="10" ${W}/>
    <path d="M-8 -50 H8 V-38 H20 V-22 H8 V-10 H-8 V-22 H-20 V-38 H-8 Z" ${W}/>`;
}

function keg() {
  return `<path d="M-30 -76 H30 C46 -52 46 -24 30 0 H-30 C-46 -24 -46 -52 -30 -76 Z" ${W}/>
    <path d="M-38 -56 H38 M-38 -20 H38 M-14 -69 Q-20 -38 -14 0 M14 -69 Q20 -38 14 0" ${OPEN}/>
    <ellipse cx="0" cy="-76" rx="30" ry="7" ${W}/>`;
}

function yak() {
  return `<path d="M52 -58 C66 -54 70 -36 62 -24" ${OPEN}/>
    <rect x="-32" y="-38" width="14" height="38" rx="5" ${W}/><rect x="-12" y="-38" width="14" height="38" rx="5" ${W}/>
    <rect x="20" y="-38" width="14" height="38" rx="5" ${W}/><rect x="38" y="-38" width="14" height="38" rx="5" ${W}/>
    <path d="M-42 -58 C-42 -92 56 -90 56 -54 V-28 L42 -20 L28 -28 L14 -20 L0 -28 L-14 -20 L-28 -28 L-42 -22 Z" ${W}/>
    <path d="M-62 -86 C-76 -96 -76 -112 -62 -114 C-66 -104 -62 -94 -52 -88 Z" ${W}/>
    <path d="M-26 -86 C-12 -96 -12 -112 -26 -114 C-22 -104 -26 -94 -36 -88 Z" ${W}/>
    <circle cx="-44" cy="-70" r="24" ${W}/>
    <ellipse cx="-48" cy="-58" rx="14" ry="10" ${W}/>${dot(-53, -58, 2.5)}${dot(-43, -58, 2.5)}
    ${dot(-48, -76)}`;
}

function fox() {
  return `<path d="M28 -30 C56 -32 82 -48 78 -76 C66 -82 44 -68 24 -44 Z" ${W}/>
    <path d="M56 -68 L62 -60 L70 -62" ${OPEN}/>
    <rect x="-28" y="-38" width="12" height="38" rx="5" ${W}/><rect x="-12" y="-38" width="12" height="38" rx="5" ${W}/>
    <rect x="18" y="-38" width="12" height="38" rx="5" ${W}/><rect x="32" y="-38" width="12" height="38" rx="5" ${W}/>
    <ellipse cx="6" cy="-48" rx="42" ry="24" ${W}/>
    <path d="M-54 -84 L-52 -112 L-34 -92 Z" ${W}/><path d="M-26 -90 L-16 -114 L-12 -84 Z" ${W}/>
    <path d="M-14 -74 C-14 -90 -26 -96 -40 -96 C-52 -96 -58 -88 -62 -80 L-74 -70 L-58 -62 C-52 -54 -44 -52 -34 -52 C-20 -52 -14 -60 -14 -74 Z" ${W}/>
    ${dot(-42, -78)}${dot(-74, -70, 3.2)}`;
}

function webRing(r) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return [+(Math.cos(a) * r).toFixed(1), +(Math.sin(a) * r).toFixed(1)];
  });
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < 8; i++) {
    const [nx, ny] = pts[(i + 1) % 8];
    const ma = ((i + 0.5) * Math.PI) / 4;
    d += ` Q${(Math.cos(ma) * r * 0.82).toFixed(1)} ${(Math.sin(ma) * r * 0.82).toFixed(1)} ${nx} ${ny}`;
  }
  return `<path d="${d} Z" ${W}/>`;
}

function web() {
  return `${webRing(58)}${webRing(38)}${webRing(19)}
    <path d="M-58 0 H58 M0 -58 V58 M-41 -41 L41 41 M-41 41 L41 -41" ${OPEN}/>
    <circle cx="0" cy="0" r="7" ${W}/>`;
}

function ring() {
  return `<path d="M-14 -58 L-24 -72 L-12 -86 H12 L24 -72 L14 -58 Z" ${W}/>
    <path d="M-24 -72 H24 M-12 -86 L-6 -72 M12 -86 L6 -72" ${OPEN}/>
    <circle cx="0" cy="-30" r="30" ${W}/><circle cx="0" cy="-30" r="18" ${W}/>`;
}

function king() {
  return `<ellipse cx="-14" cy="-5" rx="12" ry="6" ${W}/><ellipse cx="14" cy="-5" rx="12" ry="6" ${W}/>
    <path d="M-38 -8 L-28 -116 Q-26 -126 -12 -126 H12 Q26 -126 28 -116 L38 -8 Z" ${W}/>
    <rect x="-10" y="-126" width="20" height="118" ${W}/>
    ${dot(0, -96, 3)}${dot(0, -70, 3)}${dot(0, -44, 3)}
    <circle cx="-34" cy="-78" r="8" ${W}/><circle cx="34" cy="-78" r="8" ${W}/>
    <circle cx="0" cy="-152" r="26" ${W}/>
    <path d="M-26 -168 L-28 -196 L-12 -180 L0 -198 L12 -180 L28 -196 L26 -168 Z" ${W}/>
    ${dot(-9, -150)}${dot(9, -150)}<path d="M-9 -139 Q0 -132 9 -139" ${OPEN}/>`;
}

function drum() {
  return `<path d="M-46 -62 H46 V-10 Q46 0 0 0 Q-46 0 -46 -10 Z" ${W}/>
    <path d="M-46 -46 L-24 -12 L0 -46 L24 -12 L46 -46" ${OPEN}/>
    <ellipse cx="0" cy="-62" rx="46" ry="11" ${W}/>
    <path d="M-42 -88 L-8 -66 M42 -88 L8 -66" ${OPEN}/>
    <circle cx="-8" cy="-66" r="5.5" ${W}/><circle cx="8" cy="-66" r="5.5" ${W}/>`;
}

function crab() {
  return `<path d="M-34 -18 L-54 -4 M-38 -28 L-60 -20 M34 -18 L54 -4 M38 -28 L60 -20" ${OPEN}/>
    <path d="M-28 -40 L-44 -56 M28 -40 L44 -56" ${OPEN}/>
    <path d="M-44 -54 C-62 -54 -64 -76 -46 -76 L-44 -64 L-34 -72 C-28 -62 -34 -50 -44 -54 Z" ${W}/>
    <path d="M44 -54 C62 -54 64 -76 46 -76 L44 -64 L34 -72 C28 -62 34 -50 44 -54 Z" ${W}/>
    <ellipse cx="0" cy="-26" rx="40" ry="24" ${W}/>
    <rect x="-16" y="-58" width="6" height="14" ${W}/><rect x="10" y="-58" width="6" height="14" ${W}/>
    <circle cx="-13" cy="-62" r="8" ${W}/><circle cx="13" cy="-62" r="8" ${W}/>
    ${dot(-13, -62, 3)}${dot(13, -62, 3)}
    <path d="M-12 -20 Q0 -12 12 -20" ${OPEN}/>`;
}

function train() {
  return `<rect x="44" y="-116" width="22" height="36" rx="3" ${W}/>
    <rect x="38" y="-122" width="34" height="10" rx="4" ${W}/>
    <rect x="-100" y="-108" width="76" height="88" rx="6" ${W}/>
    <rect x="-108" y="-114" width="92" height="10" rx="4" ${W}/>
    <rect x="-84" y="-92" width="44" height="32" rx="4" ${W}/>
    <rect x="-24" y="-82" width="108" height="62" rx="8" ${W}/>
    <path d="M84 -20 L104 -20 L84 -44 Z" ${W}/>
    <circle cx="-64" cy="-20" r="20" ${W}/><circle cx="-64" cy="-20" r="7" ${W}/>
    <circle cx="8" cy="-18" r="18" ${W}/><circle cx="8" cy="-18" r="6" ${W}/>
    <circle cx="58" cy="-18" r="18" ${W}/><circle cx="58" cy="-18" r="6" ${W}/>`;
}

function tray() {
  return `<path d="M-74 -18 C-74 -30 -54 -30 -54 -18" ${OPEN}/>
    <path d="M54 -18 C54 -30 74 -30 74 -18" ${OPEN}/>
    <path d="M-68 -18 H68 L58 0 H-58 Z" ${W}/>
    <path d="M-56 -10 H56" ${OPEN}/>`;
}

function jeep() {
  return `<rect x="-104" y="-76" width="16" height="38" rx="6" ${W}/>
    <path d="M12 -96 L28 -58 H18 L4 -96 Z" ${W}/>
    <path d="M-88 -20 V-62 H28 L34 -58 H84 Q92 -58 92 -50 V-20 Z" ${W}/>
    <path d="M-58 -62 V-74 H-34 V-62 Z" ${W}/>
    <circle cx="-50" cy="-20" r="20" ${W}/><circle cx="-50" cy="-20" r="7" ${W}/>
    <circle cx="52" cy="-20" r="20" ${W}/><circle cx="52" cy="-20" r="7" ${W}/>`;
}

function seal() {
  return `<path d="M42 -16 L66 -36 L60 -14 L72 -4 L42 -4 Z" ${W}/>
    <path d="M-46 -58 C-46 -20 -36 -4 -10 -4 H46 C50 -22 30 -36 4 -40 C-14 -42 -20 -50 -22 -60 Z" ${W}/>
    <circle cx="-34" cy="-64" r="21" ${W}/>
    <ellipse cx="-12" cy="-5" rx="18" ry="6.5" ${W}/>
    ${dot(-40, -70)}${dot(-53, -61, 3.2)}
    <path d="M-47 -55 Q-41 -50 -35 -55 M-50 -57 L-66 -55 M-50 -52 L-65 -47" ${OPEN}/>`;
}

// ---- the library -------------------------------------------------------------
// kind -> (options, stroke width at this scale) => markup in local units.
export const PICTURES = {
  person, cat, dog, pig, hen, duck, frog, fish, bee,
  tap, cap: capThing, hat, map, mat, rug, sun, bus, van, cup, pot, pan, bag, box, bed, ship, bell, cloud, rain, tree,
  chick, moth, bath, seat, leaf, pail, jug, dish, rock, log, sock, sheep,
  rat, quiz, net, kit, keg, yak, fox, web, ring, king, drum, crab, train, tray, jeep, seal,
};

export const PICTURE_KINDS = Object.keys(PICTURES);

const num = (v, d) => (Number.isFinite(v) ? v : d);

// True for a kind the library draws. An own property only, so a saved book
// with kind "constructor" or "toString" is not a picture.
export const isPictureKind = (kind) => typeof kind === 'string' && Object.hasOwn(PICTURES, kind);

// One item as a group in scene coordinates. The stroke width is divided by the
// scale so every line prints at the same weight. `tilt` turns the item
// (degrees, clockwise) about its anchor: a pot tipped over.
export function renderItem(item) {
  if (!isPictureKind(item?.kind)) throw new Error(`No picture called "${item?.kind}"`);
  const draw = PICTURES[item.kind];
  const s = num(item.scale, 1);
  const w = +(STROKE / s).toFixed(3);
  const sx = item.flip ? -s : s;
  const tilt = Number.isFinite(item.tilt) && item.tilt ? ` rotate(${item.tilt})` : '';
  return `<g transform="translate(${num(item.x, 200)} ${num(item.y, GROUND_Y)})${tilt} scale(${sx} ${s})" stroke="#000" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round">${draw(item, w)}</g>`;
}

/**
 * A scene (a list of items, drawn back to front) as an SVG string. An item
 * the library cannot draw (a book saved by a newer version, or a hand-edited
 * file) is left out rather than breaking the page it is on.
 */
export function renderScene(scene = [], { label = '' } = {}) {
  const items = (Array.isArray(scene) ? scene : []).filter((item) => isPictureKind(item?.kind)).map(renderItem).join('');
  const aria = label ? ` role="img" aria-label="${String(label).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}"` : ' aria-hidden="true"';
  return `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg"${aria}><path d="M8 ${GROUND_Y} H392" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round"/>${items}</svg>`;
}
