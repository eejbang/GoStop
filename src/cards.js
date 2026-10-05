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

// 전통 화투 도안을 변경하지 않고 SVG 뷰포트로 한 장씩 표시합니다.
const columns = [6, 69, 133, 196, 259, 323, 387, 450];
const rows = [4, 96, 190, 283, 376, 469];

export function cardSVG(card) {
  const row = Math.floor((card.month - 1) / 2);
  const column = ((card.month - 1) % 2) * 4 + card.index;
  const x = columns[column], y = rows[row], width = 56, height = 88;
  // 도안에 뒤집혀 배치된 3월 광은 실제 손패 방향으로 표시합니다.
  const rotation = card.month === 3 && card.index === 0 ? ' transform="rotate(180 ' + (x + width / 2) + ' ' + (y + height / 2) + ')"' : '';
  return '<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><svg width="80" height="120" viewBox="' + [x, y, width, height].join(' ') + '" preserveAspectRatio="none"><g' + rotation + '><image href="assets/hwatu-reference.png" width="513" height="561"/></g></svg></svg>';
}

export const cardBackSVG = '<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="back-grain" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#f44c36"/><circle cx="3" cy="3" r=".5" fill="#9b120c"/></pattern></defs><rect x="1" y="1" width="78" height="118" rx="3" fill="#d52616" stroke="#7c140b" stroke-width="2"/><rect x="3" y="3" width="74" height="114" rx="2" fill="url(#back-grain)"/><rect x="4" y="4" width="72" height="112" rx="2" fill="none" stroke="#ed4430"/></svg>';
