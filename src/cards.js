export const MONTH_NAMES = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국화', '단풍', '오동', '비'];
export const TYPE_NAMES = { bright: '광', animal: '열끗', ribbon: '띠', pi: '피' };
const specs = {
  1: [['bright'], ['ribbon', 'red'], ['pi'], ['pi']],
  2: [['animal', 'godori'], ['ribbon', 'red'], ['pi'], ['pi']],
  3: [['bright'], ['ribbon', 'red'], ['pi'], ['pi']],
  4: [['animal', 'godori'], ['ribbon', 'grass'], ['pi'], ['pi']],
  5: [['animal'], ['ribbon', 'grass'], ['pi'], ['pi']],
  6: [['animal'], ['ribbon', 'blue'], ['pi'], ['pi']],
  7: [['animal'], ['ribbon', 'grass'], ['pi'], ['pi']],
  8: [['bright'], ['animal', 'godori'], ['pi'], ['pi']],
  9: [['pi', 'sake', 2], ['ribbon', 'blue'], ['pi'], ['pi']],
  10: [['animal'], ['ribbon', 'blue'], ['pi'], ['pi']],
  11: [['bright'], ['pi', '', 2], ['pi'], ['pi']],
  12: [['bright', 'rain'], ['animal'], ['ribbon', 'rain'], ['pi', '', 2]],
};

export function createDeck() {
  return Object.entries(specs).flatMap(([month, entries]) => entries.map(([type, group = '', pi = 1], index) => ({
    id: `${month}-${index}`, month: Number(month), index, type, group, pi: type === 'pi' ? pi : 0,
    name: `${month}월 ${MONTH_NAMES[month]} ${type === 'pi' && pi === 2 ? '쌍피' : TYPE_NAMES[type]}${group === 'godori' ? ' · 고도리' : ''}`,
  })));
}

export const sortCards = cards => [...cards].sort((a, b) => a.month - b.month || a.index - b.index);

const flower = (x, y, color = '#d9353f', size = 10) => `<g transform="translate(${x} ${y})"><g fill="${color}" stroke="#202b24" stroke-width="1">${[0, 72, 144, 216, 288].map(a => `<ellipse cy="-${size * .5}" rx="${size * .4}" ry="${size * .6}" transform="rotate(${a})"/>`).join('')}</g><circle r="${size * .19}" fill="#f3c76a"/></g>`;
const leaves = (x, y, color = '#255f45', scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})" stroke="#172d24" stroke-width="1.2" fill="${color}"><path d="M0 0 Q-24 -14 -27 -3 Q-23 12 0 0 Q-15 -25 -6 -30 Q8 -19 0 0 Q19 -24 26 -12 Q23 2 0 0 Q26 4 23 16 Q8 21 0 0"/></g>`;
const bird = (x, y, scale = 1, color = '#f7f3da') => `<g transform="translate(${x} ${y}) scale(${scale})" stroke="#182722" stroke-width="1.8" stroke-linejoin="round"><path d="M-22 1 Q-10 -22 0 -5 Q20 -17 23 0 Q8 9 -1 5 Q-11 15 -22 1" fill="${color}"/><path d="M0 -4 Q8 -15 13 -7 L19 -6 L13 -3 Q8 6 2 5" fill="${color}"/><circle cx="11" cy="-7" r="1" fill="#182722"/><path d="M-6 4 L-2 13 M-1 5 L3 13" fill="none"/></g>`;
const branch = '<path d="M-8 101 Q35 73 51 20 M30 73 L8 34 M43 46 L77 27 M12 87 L80 65" fill="none" stroke="#262d25" stroke-width="6" stroke-linecap="round"/>';

function plant(card) {
  const { month: m, index: i } = card;
  const shift = i > 1 ? (i - 2) * 7 : 0;
  switch (m) {
    case 1: return `<path d="M-8 100 Q19 79 40 65 L76 72 L83 116 H-8Z" fill="#202b24"/><path d="M30 100 L42 42 M41 65 L12 30 M41 55 L68 24" stroke="#713c2e" stroke-width="7"/>${[[16, 35], [43, 48], [65, 29], [32, 19], [64, 62]].map(([x, y]) => `<path d="M${x - 19} ${y + 8} Q${x - 10} ${y - 13} ${x} ${y - 5} Q${x + 10} ${y - 13} ${x + 18} ${y + 8}Z" fill="#275842" stroke="#182722" stroke-width="2"/>`).join('')}`;
    case 2: return `${branch}${[[12, 33], [29, 58], [51, 26], [64, 66], [66, 27 + shift]].map(p => flower(...p, '#d7353f', 10)).join('')}`;
    case 3: return `${branch}${[[12, 34], [32, 63], [49, 22], [64, 40], [68, 67 + shift], [20, 87]].map(p => flower(...p, '#f091a0', 11)).join('')}`;
    case 4: return `<path d="M7 0 Q26 7 69 4 M18 0 Q33 26 18 75 M47 0 Q31 31 40 65 M66 0 Q61 24 58 86" fill="none" stroke="#24282b" stroke-width="4"/>${[18, 40, 59].flatMap((x, n) => [0, 1, 2, 3, 4].map(j => `<ellipse cx="${x + (j % 2 ? 4 : -3)}" cy="${20 + j * 10 + n * 4}" rx="7" ry="8" fill="${j % 2 ? '#645385' : '#34304c'}" stroke="#24282b"/>`)).join('')}`;
    case 5: return `<path d="M0 115 Q20 55 30 47 Q28 85 18 115 M20 115 Q54 56 59 43 Q64 84 42 115 M38 115 Q73 74 83 69 L63 115" fill="#34724d" stroke="#193d2c" stroke-width="2"/>${[[24, 55], [57, 65], [40, 88]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 0 Q-25 -18 -18 2 Q-7 14 0 0 Q3 -28 13 -20 Q26 -2 0 0 Q26 3 14 17 Q1 23 0 0" fill="#55528a" stroke="#232941" stroke-width="1.5"/><path d="M-5 1 L2 5 L8 1" fill="none" stroke="#edc460" stroke-width="3"/></g>`).join('')}`;
    case 6: return `${leaves(22, 91)}${leaves(55, 75, '#357852')}${flower(27, 50, '#cc2c3d', 22)}${flower(62, 89, '#e65060', 19)}${flower(10, 100, '#cc2c3d', 16)}`;
    case 7: return `${branch}${[[15, 38], [43, 42], [22, 78], [61, 75], [55, 103]].map(([x, y]) => `${leaves(x, y, '#36452f', .7)}${flower(x + 6, y - 13, '#b03b50', 7)}`).join('')}`;
    case 8: return `<path d="M-4 79 Q28 38 79 75 L82 120 H-4Z" fill="#292b25"/><path d="M-4 96 Q39 71 79 99 L79 120 H-4Z" fill="#555b39"/>${[5, 13, 22, 35, 49, 65, 73].map((x, n) => `<path d="M${x} 116 Q${x + 5} 86 ${x + 12} ${62 + n * 3}" stroke="#a79d67" stroke-width="1.8" fill="none"/>`).join('')}`;
    case 9: return `${leaves(25, 96, '#386046')}${leaves(57, 71, '#416c40')}${[[21, 60], [55, 93], [61, 34]].map(([x, y]) => `<g transform="translate(${x} ${y})" stroke="#a96a27" fill="#efbc3b">${Array.from({ length: 12 }, (_, n) => `<ellipse cy="-9" rx="3" ry="10" transform="rotate(${n * 30})"/>`).join('')}<circle r="6" fill="#f3d664"/></g>`).join('')}`;
    case 10: return `${branch}${[[14, 35], [49, 26], [31, 70], [64, 62], [14, 102]].map(([x, y], n) => `<path transform="translate(${x} ${y}) rotate(${n * 24})" d="M0 16 L-4 5 L-17 9 L-11 0 L-18 -7 L-6 -5 L-5 -17 L1 -9 L10 -17 L8 -5 L21 -7 L13 2 L17 10 L4 6 L2 16Z" fill="${n % 2 ? '#c44727' : '#dc6528'}" stroke="#5c2a22" stroke-width="1.2"/>`).join('')}`;
    case 11: return `${leaves(22, 86, '#424d37', 1.3)}${leaves(55, 65, '#424d37', 1.1)}<path d="M14 115 Q23 53 37 15 M39 115 Q56 52 65 27" stroke="#262d25" stroke-width="4"/>${[[34, 31], [61, 43], [15, 64]].map(([x, y]) => `<g transform="translate(${x} ${y})" fill="#716495" stroke="#352e49">${[0, 1, 2].map(j => `<path d="M${j * 6 - 9} 0 Q${j * 6 - 17} -21 ${j * 6 - 8} -22 Q${j * 6 + 1} -20 ${j * 6 - 9} 0"/>`).join('')}</g>`).join('')}`;
    case 12: return `<path d="M-5 11 Q30 3 79 21 M45 0 Q53 39 81 52 M18 7 Q39 36 21 69 M63 20 Q46 55 53 88" stroke="#25342c" stroke-width="4" fill="none"/>${[9, 21, 34, 50, 65].map((x, n) => `<path d="M${x} ${10 + n * 2} Q${x - 7} 44 ${x - 3} ${69 + n * 5}" stroke="#416847" stroke-width="3" fill="none"/>`).join('')}<path d="M0 105 Q26 87 80 104 L80 120 H0Z" fill="#315047"/>`;
  }
}

function feature(card) {
  const m = card.month;
  if (card.type === 'ribbon') {
    const color = card.group === 'blue' ? '#334f8c' : '#d42f40';
    const label = card.group === 'blue' ? '청단' : card.group === 'red' ? '홍단' : '';
    return `<g transform="rotate(-12 40 60)"><path d="M29 25 H51 V89 L40 82 L29 89Z" fill="${color}" stroke="#202b24" stroke-width="1.7"/>${label ? `<text x="40" y="47" text-anchor="middle" font-family="serif" font-size="11" fill="#fff8e4">${label[0]}</text><text x="40" y="62" text-anchor="middle" font-family="serif" font-size="11" fill="#fff8e4">${label[1]}</text>` : '<path d="M33 34 L47 34 M33 40 L47 40" stroke="#f59185" stroke-width="2"/>'}</g>`;
  }
  if (card.type === 'bright') {
    if (m === 1) return `<circle cx="58" cy="23" r="14" fill="#d54435"/>${bird(38, 79, 1.2)}<path d="M32 83 L25 102 M39 85 L40 108" stroke="#bd463b" stroke-width="2"/>`;
    if (m === 3) return '<path d="M5 80 H75 V113 H5Z" fill="#cf3939" stroke="#282824" stroke-width="2"/><path d="M5 87 H75 M5 105 H75 M15 88 V104 M29 88 V104 M43 88 V104 M57 88 V104 M70 88 V104" stroke="#faf2d2" stroke-width="4"/>';
    if (m === 8) return '<circle cx="47" cy="32" r="24" fill="#f1c859" stroke="#c6a442" stroke-width="1"/>';
    if (m === 11) return `<g fill="#e8aa36" stroke="#282d24" stroke-width="1.5"><path d="M15 26 Q29 13 44 29 Q59 12 70 15 Q66 40 45 45 L56 65 Q45 70 38 50 Q23 59 13 47 Q22 44 30 35Z"/><path d="M42 44 Q74 55 75 90 Q64 75 51 66 Q65 93 64 106 Q47 90 42 63"/></g>`;
    return '<g stroke="#263b30" stroke-width="2"><path d="M33 60 L27 87 L48 91 L43 62Z" fill="#477d84"/><circle cx="39" cy="53" r="7" fill="#efc59b"/><path d="M12 47 Q36 18 63 47Z" fill="#d59537"/><path d="M36 43 V73 M28 88 L22 104 M44 90 L48 107" fill="none"/></g><path d="M6 63 L4 82 M71 61 L68 81 M14 20 L12 31" stroke="#60889a" stroke-width="2"/>';
  }
  if (card.group === 'sake') return '<path d="M18 73 H58 L53 102 H24Z" fill="#dc3d38" stroke="#293429" stroke-width="2"/><ellipse cx="38" cy="73" rx="20" ry="5" fill="#fff0c9" stroke="#293429"/><text x="38" y="92" text-anchor="middle" fill="#fff4dd" font-size="14" font-family="serif">寿</text>';
  if (card.type !== 'animal') return '';
  if ([2, 4, 8, 12].includes(m)) return m === 8 ? `${bird(29, 39, .66, '#efe9c9')}${bird(59, 48, .48, '#efe9c9')}` : bird(43, m === 4 ? 82 : 43, .85, m === 2 ? '#a2a24e' : '#f2e7cb');
  if (m === 5) return '<path d="M3 84 Q35 62 77 83 L77 91 Q35 73 3 94Z" fill="#bd783b" stroke="#383526" stroke-width="2"/><path d="M14 83 V102 M59 83 V102" stroke="#383526" stroke-width="4"/>';
  if (m === 6) return '<g transform="translate(49 36)" fill="#e3bd54" stroke="#222b28" stroke-width="2"><path d="M0 0 Q-29 -25 -25 -1 Q-22 16 -3 7 Q-24 30 -12 33 Q2 34 0 9 Q16 31 23 24 Q26 13 7 6 Q31 6 25 -13 Q19 -25 3 0"/><path d="M0 -5 L4 14 M1 -5 L-5 -14 M3 -5 L9 -14" fill="none"/></g>';
  if (m === 7) return '<g fill="#8c6953" stroke="#2c2e25" stroke-width="2"><path d="M13 80 Q20 60 46 66 L61 77 L72 78 L68 92 L59 95 L46 89 L22 94 L13 86Z"/><path d="M22 91 L19 105 M48 91 L52 103"/><path d="M54 76 L53 64 L62 73"/></g><circle cx="63" cy="81" r="2" fill="#202b24"/>';
  if (m === 10) return '<g fill="#c19a66" stroke="#302d24" stroke-width="2"><path d="M14 90 Q19 74 43 79 L49 57 L59 58 L64 69 L56 76 L57 93 L44 98 L24 98Z"/><path d="M22 95 L19 111 M44 96 L48 111 M53 58 L47 42 L39 38 M49 47 L54 35 M56 58 L66 44 L70 35 M66 44 L76 44" fill="none"/><circle cx="59" cy="64" r="1"/></g>';
  return '';
}

export function cardSVG(card) {
  const badge = card.type === 'bright' ? '光' : card.type === 'pi' && card.pi === 2 ? '쌍' : '';
  return `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="78" height="118" rx="5" fill="#f6f0d9"/><clipPath id="clip-${card.id}"><rect x="3" y="3" width="74" height="114" rx="3"/></clipPath><g clip-path="url(#clip-${card.id})">${plant(card)}${feature(card)}</g><rect x="1.5" y="1.5" width="77" height="117" rx="4" fill="none" stroke="#263229" stroke-width="2.5"/>${badge ? `<rect x="55" y="96" width="20" height="19" rx="2" fill="${card.type === 'bright' ? '#d02e35' : '#384c35'}"/><text x="65" y="110" text-anchor="middle" fill="#fff8df" font-family="serif" font-weight="bold" font-size="14">${badge}</text>` : ''}<rect x="5" y="5" width="16" height="15" rx="3" fill="#faf5e1" fill-opacity=".91"/><text x="13" y="16" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="700" fill="#263b2d">${card.month}</text></svg>`;
}

export const cardBackSVG = `<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1" y="1" width="78" height="118" rx="5" fill="#9d302e" stroke="#e9b899" stroke-width="2"/><rect x="7" y="7" width="66" height="106" rx="2" fill="none" stroke="#d17962"/><path d="M40 23 L60 60 L40 97 L20 60Z" fill="none" stroke="#d49a6b" stroke-width="1.5"/><path d="M40 37 L53 60 L40 83 L27 60Z" fill="none" stroke="#d49a6b"/><circle cx="40" cy="60" r="6" fill="#d49a6b"/><path d="M12 12 L68 108 M68 12 L12 108" stroke="#c26350" opacity=".3"/></svg>`;
