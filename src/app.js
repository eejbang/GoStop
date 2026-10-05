import { MatgoGame, scoreCards } from './game.js';
import { cardSVG, cardBackSVG, sortCards, TYPE_NAMES } from './cards.js';
import { TableMotion } from './table-motion.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readStored = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const saveStored = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경에서도 플레이 가능 */ } };
const savedSettings = readStored('ohu-settings-v1', {});
let settings = {
  difficulty: ['easy', 'normal', 'hard'].includes(savedSettings.difficulty) ? savedSettings.difficulty : 'normal',
  speed: ['normal', 'fast'].includes(savedSettings.speed) ? savedSettings.speed : 'normal',
  sound: savedSettings.sound !== false,
  hints: savedSettings.hints === true,
};
const storedRecords = readStored('ohu-records-v1', {});
let records = {
  wins: Number.isSafeInteger(storedRecords.wins) && storedRecords.wins >= 0 ? storedRecords.wins : 0,
  losses: Number.isSafeInteger(storedRecords.losses) && storedRecords.losses >= 0 ? storedRecords.losses : 0,
  draws: Number.isSafeInteger(storedRecords.draws) && storedRecords.draws >= 0 ? storedRecords.draws : 0,
  best: Number.isSafeInteger(storedRecords.best) && storedRecords.best >= 0 ? storedRecords.best : 0,
  history: Array.isArray(storedRecords.history) ? storedRecords.history.slice(0, 10).filter(r => r && [0, 1, null].includes(r.winner) && Number.isFinite(r.total) && typeof r.date === 'string') : [],
};
let game = new MatgoGame({ difficulty: settings.difficulty });
let started = false, round = 1, aiTimer = null, toastTimer = null, hintId = null, hintText = '', shownResult = false, savedResult = false, previousTurn = null, audioContext = null;
let animating = false, visualTable = null, visualDeckCount = null, visualDrawn = null, drag = null, suppressClickUntil = 0;
const floorSlots = new Map();
const ppeokStacks = new Map();
let queuedPlay = null;
const modal = $('#modal');
const motion = new TableMotion({ speed: () => settings.speed, sound });

const soundOn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9H8L13 5V19L8 15H4Z"/><path d="M16 8Q21 12 16 16M18 5Q26 12 18 19"/></svg>';
const soundOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9H8L13 5V19L8 15H4Z"/><path d="M17 9L23 15M23 9L17 15"/></svg>';

function sound(kind = 'play') {
  if (!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if (['slap', 'flip', 'collect'].includes(kind)) {
      const length = kind === 'slap' ? .07 : .035;
      const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * length), audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
      const source = audioContext.createBufferSource(), filter = audioContext.createBiquadFilter(), volume = audioContext.createGain();
      source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = kind === 'slap' ? 3500 : 6500;
      volume.gain.value = kind === 'slap' ? .28 : .1;
      source.connect(filter); filter.connect(volume); volume.connect(audioContext.destination); source.start();
      return;
    }
    const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'go' ? [392, 523] : kind === 'special' ? [659, 880] : [260];
    const time = audioContext.currentTime;
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = kind === 'play' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, time + i * .09);
      gain.gain.linearRampToValueAtTime(.055, time + i * .09 + .01);
      gain.gain.exponentialRampToValueAtTime(.001, time + i * .09 + .14);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(time + i * .09); oscillator.stop(time + i * .09 + .16);
    });
  } catch { /* 오디오를 지원하지 않는 브라우저 */ }
}

function cardHTML(card, { disabled = true, className = '', action = '', key = '', label = '' } = {}) {
  return `<button type="button" class="flower-card ${className}" ${disabled ? 'disabled' : ''} data-id="${card.id}" data-month="${card.month}" ${action ? `data-action="${action}"` : ''} title="${escape(card.name)}" aria-label="${escape(card.name + label)}">${cardSVG(card)}${key ? `<span class="card-key" aria-hidden="true">${key}</span>` : ''}</button>`;
}

function renderFloor() {
  const s = game.state, tx = s.pending;
  const choice = started && !animating && s.turn === 0 && s.phase === 'choice';
  const table = visualTable ?? s.table;
  const ids = new Set(table.map(c => c.id));
  for (const id of floorSlots.keys()) if (!ids.has(id)) floorSlots.delete(id);
  const stackedMonths = [...new Set(table.map(c => c.month))].filter(month => s.ppeokOwners[month] !== undefined && table.filter(c => c.month === month).length === 3);
  for (const month of ppeokStacks.keys()) if (!stackedMonths.includes(month)) ppeokStacks.delete(month);
  for (const month of stackedMonths) {
    const cards = table.filter(c => c.month === month);
    if (!ppeokStacks.has(month)) ppeokStacks.set(month, cards.map(c => c.id));
    const existing = cards.map(c => floorSlots.get(c.id)).filter(slot => slot !== undefined);
    let slot = existing.length ? Math.min(...existing) : 0;
    if (!existing.length) while ([...floorSlots.values()].includes(slot)) slot++;
    for (const card of cards) floorSlots.set(card.id, slot);
  }
  const columns = Number(getComputedStyle($('#floor')).getPropertyValue('--floor-columns')) || 6;
  for (const card of table) {
    if (floorSlots.has(card.id)) continue;
    let slot = 0;
    while ([...floorSlots.values()].includes(slot)) slot++;
    floorSlots.set(card.id, slot);
  }
  const recommended = choice && settings.hints ? game.bestChoice() : null;
  const renderedStacks = new Set();
  $('#floor').innerHTML = table.map(card => {
    const slot = floorSlots.get(card.id), choosing = choice && tx.choices.includes(card.id);
    const position = `grid-column:${slot % columns + 1};grid-row:${Math.floor(slot / columns) + 1}`;
    if (stackedMonths.includes(card.month)) {
      if (renderedStacks.has(card.month)) return '';
      renderedStacks.add(card.month);
      const cards = ppeokStacks.get(card.month).map(id => table.find(c => c.id === id));
      return `<div class="floor-slot ppeok-stack" data-month="${card.month}" style="${position}" aria-label="${card.month}월 뻑, 세 장 겹침">${cards.map((c, index) => `<div class="stack-layer" style="--stack-index:${index}">${cardHTML(c)}</div>`).join('')}<span class="floor-month">${card.month}월 · 뻑 · 3장</span></div>`;
    }
    return `<div class="floor-slot" data-card-id="${card.id}" style="${position};--slant:${(card.month * 7 + card.index * 3) % 7 - 3}deg">${cardHTML(card, { disabled: !choosing, action: 'choose', className: `${choosing ? 'choice-card' : ''} ${recommended === card.id ? 'hint-target' : ''}` })}<span class="floor-month">${card.month}월</span></div>`;
  }).join('');
  if (!choice && hintId && settings.hints && !animating) {
    const card = s.hands[0].find(c => c.id === hintId);
    if (card) $('#floor').querySelectorAll('.flower-card').forEach(el => el.classList.toggle('hint-target', Number(el.dataset.month) === card.month));
  }
  const deckCount = visualDeckCount ?? s.deck.length;
  $('#deck').innerHTML = deckCount ? cardBackSVG : '';
  $('#deck').classList.toggle('empty', !deckCount);
  $('#deck-count').textContent = deckCount;
  const drawn = animating ? visualDrawn : tx?.stage === 'hand' ? null : tx?.drawn || s.lastTurn?.drawn;
  $('#draw-preview').innerHTML = started && drawn ? `뒤집은 패${cardHTML(drawn)}` : '';
}

function renderHand() {
  const s = game.state, available = started && !animating && s.turn === 0 && s.phase === 'playing' && !modal.open;
  $('#hand-count').textContent = `${s.hands[0].length}장${s.passes[0] ? ` + 뒤집기 ${s.passes[0]}` : ''}`;
  $('#hand').classList.toggle('muted', !available);
  $('#hand').innerHTML = s.hands[0].map((c, i) => {
    const matches = s.table.some(t => t.month === c.month);
    const shaken = started && s.shaken[0].includes(c.month);
    return cardHTML(c, { disabled: !available, action: 'play', key: i === 9 ? '0' : String(i + 1), className: `${matches && available ? 'match-card' : ''} ${hintId === c.id ? 'hinted' : ''} ${shaken ? 'shaken-card' : ''}`, label: `${matches ? ' · 바닥에 같은 무늬 있음' : ''}${shaken ? ' · 자동 흔들기 적용' : ''}` });
  }).join('') + (s.passes[0] ? `<button class="flower-card pass-card ${hintId === 'pass' ? 'hinted' : ''}" data-action="play" data-id="pass" ${available ? '' : 'disabled'} aria-label="폭탄 패로 뒤집기만 하기"><svg viewBox="0 0 32 32" fill="none" stroke-width="1.5"><path d="M25 12A10 10 0 1 0 1 16M25 5V12H18"/></svg><small>뒤집기 ${s.passes[0]}</small></button>` : '') + (!s.hands[0].length && !s.passes[0] ? '<span class="empty-hand">손패를 모두 냈어요.</span>' : '');
  $('#special-actions').innerHTML = available ? [
    ...game.bombOptions(0).map(m => `<button data-action="bomb" data-month="${m}">${m}월 폭탄 <span>×2</span></button>`),
  ].join('') : '';
  const slots = game.slots(1);
  $('#opponent-hand').innerHTML = Array.from({ length: Math.min(s.hands[1].length, 10) }, () => `<span class="card-back">${cardBackSVG}</span>`).join('') + (slots ? `<span class="hidden-count">${slots}</span>` : '');
  $('#opponent-hand').setAttribute('aria-label', `상대 손패 ${s.hands[1].length}장, 폭탄 뒤집기 ${s.passes[1]}회`);
}

function renderCaptures() {
  for (const player of [0, 1]) {
    const score = game.score(player);
    $(player ? '#opponent-captures' : '#my-captures').innerHTML = ['bright', 'animal', 'ribbon', 'pi'].map(type => {
      const cards = game.state.captured[player].filter(c => c.type === type);
      const count = type === 'pi' ? score.pi : cards.length;
      return `<button class="capture-pile" data-type="${type}" data-action="${player ? 'captured-ai' : 'captured-me'}" aria-label="${player ? '다람이' : '나'}의 ${TYPE_NAMES[type]} ${count}장 보기"><span class="capture-pile-label">${TYPE_NAMES[type]} <b>${count}</b></span><span class="capture-fan">${cards.length ? cards.slice(-5).map(c => `<span class="captured-mini" data-id="${c.id}">${cardSVG(c)}</span>`).join('') : '<span class="capture-placeholder"></span>'}</span></button>`;
    }).join('');
  }
}

function updateHints() {
  hintId = null; hintText = '';
  if (started && settings.hints && !animating && game.state.turn === 0 && game.state.phase === 'playing') {
    const move = game.recommend(); hintId = move.id; hintText = move.reason;
  }
  $('#hint-btn').setAttribute('aria-pressed', String(settings.hints));
  $('#hint-btn').classList.toggle('selected', settings.hints);
  $('#hint-label').textContent = settings.hints ? '힌트 켜짐' : '힌트 보기';
  $('#hint-btn').title = settings.hints ? '힌트가 매 차례 표시됩니다. 다시 누르면 끕니다.' : '매 차례 추천 손패와 먹을 바닥 패를 표시합니다.';
}

function renderScore(player) {
  const s = game.state, score = game.score(player);
  const parts = [['광', score.bright], ['열끗', score.animal], ['띠', score.ribbon], ['피', score.pi]];
  $(player === 0 ? '#my-score' : '#ai-score').innerHTML = `<div class="score-top"><div class="score-name"><span class="score-avatar">${player === 0 ? '나' : '람'}</span>${player === 0 ? '나' : '다람'}${player === 1 ? '<small>AI</small>' : ''}${s.go[player] ? `<span class="go-tag">${s.go[player]}고</span>` : ''}</div><div class="score-number">${score.total}<small>점</small></div></div><div class="score-stats">${parts.map(([name, n]) => `<span>${name}<b>${n}</b></span>`).join('')}</div><div class="score-progress" role="progressbar" aria-label="${player === 0 ? '나' : '다람'}의 7점 달성" aria-valuenow="${Math.min(score.total, 7)}" aria-valuemin="0" aria-valuemax="7"><span style="width:${Math.min(100, score.total / 7 * 100)}%"></span></div>`;
}

function renderCollections() {
  const cards = game.state.captured[0];
  const sets = [{ name: '고도리', key: 'godori', icon: '鳥', class: '', months: [2, 4, 8] }, { name: '홍단', key: 'red', icon: '紅', class: 'red', months: [1, 2, 3] }, { name: '청단', key: 'blue', icon: '靑', class: 'blue', months: [6, 9, 10] }, { name: '초단', key: 'grass', icon: '草', class: 'grass', months: [4, 5, 7] }];
  $('#collections').innerHTML = sets.map(set => {
    const owned = cards.filter(c => c.group === set.key), n = owned.length;
    return `<div class="collection-row ${set.class} ${n === 3 ? 'complete' : ''}"><span class="collection-name"><span class="collection-icon">${set.icon}</span>${set.name}</span><span class="collection-slots" aria-label="${set.name} ${n}장, 3장 중"><span style="display:contents">${set.months.map(m => `<i class="${owned.some(c => c.month === m) ? 'filled' : ''}" title="${m}월">${m}</i>`).join('')}</span><small>${n === 3 ? '완성' : `${n}/3`}</small></span></div>`;
  }).join('');
}

function updateSoundButton() {
  $('#sound-btn').innerHTML = settings.sound ? soundOn : soundOff;
  $('#sound-btn').setAttribute('aria-label', settings.sound ? '소리 끄기' : '소리 켜기');
  $('#sound-btn').setAttribute('title', settings.sound ? '소리 끄기' : '소리 켜기');
  $('#sound-btn').setAttribute('aria-pressed', String(settings.sound));
}

function render() {
  const s = game.state;
  updateHints(); renderFloor(); renderHand(); renderCaptures(); renderScore(0); renderScore(1); renderCollections(); updateSoundButton();
  $('#welcome').hidden = started;
  $('#my-dealer').hidden = s.dealer !== 0;
  $('#opponent-dealer').hidden = s.dealer !== 1;
  $('#my-captured-count').textContent = s.captured[0].length;
  $('#ai-captured-count').textContent = s.captured[1].length;
  $('#round-label').textContent = `${round}번째 판${s.carry > 1 ? ` · 나가리 ${s.carry}배` : ''}`;
  $('#opponent-description').textContent = { easy: '오늘은 가볍게 즐겨 볼까요?', normal: '느긋하지만, 패는 야무지게', hard: '한 수 앞을 보는 승부사' }[game.difficulty];
  $('#my-description').textContent = !started ? '좋은 패가 들어올 것 같은 예감' : s.go[0] ? `${s.go[0]}고! 조금 더 크게 가 볼까요?` : game.score(0).total >= 7 ? '이제 결정할 시간이에요' : '한 장씩, 차근차근 모아 봐요';
  for (const player of [0, 1]) if (started && s.shakes[player]) {
    $(player ? '#opponent-description' : '#my-description').textContent += ` · 흔들기 ×${2 ** s.shakes[player]}`;
  }
  const yourTurn = started && s.turn === 0 && s.phase === 'playing';
  const choosing = started && s.turn === 0 && s.phase === 'choice';
  const thinking = started && s.turn === 1 && s.phase !== 'finished';
  let message = !started ? '' : s.phase === 'finished' ? (s.result.winner === null ? '나가리! 다음 판에서 다시 만나요.' : `${s.result.winner === 0 ? '내가' : '다람이가'} ${s.result.total}점으로 승리했어요.`)
    : choosing ? `${s.pending.stage === 'draw' ? '뒤집은 패와' : '낸 패와'} 같은 무늬 두 장! 먹을 패를 골라 주세요.`
      : s.phase === 'decision' ? `${s.turn === 0 ? '나' : '다람'}의 고·스톱 선택` : hintText || (yourTurn ? '같은 무늬의 패를 모아 보세요' : '다람이가 패를 고르고 있어요');
  $('#table-message').textContent = message;
  $('#table-message').classList.toggle('choice-message', choosing);
  $('#hand-prompt').textContent = !started ? '준비가 되면 첫 판을 시작해 주세요' : choosing ? '바닥에서 먹을 패를 골라 주세요' : yourTurn ? '패를 누르거나 같은 무늬 위로 끌어 치세요' : s.phase === 'finished' ? '다음 판에도 좋은 패가 들어오길!' : '상대의 패를 기다리는 중';
  $('#turn-label').textContent = !started ? '한 판의 여유를 즐겨 보세요' : s.phase === 'finished' ? '이번 판이 끝났어요' : modal.open ? '잠깐 쉬어 가는 중' : choosing ? '먹을 패를 골라 주세요' : yourTurn ? '내 차례 · 낼 패를 선택해 주세요' : thinking ? '다람이의 차례' : '고 또는 스톱을 선택해 주세요';
  $('#turn-dot').classList.toggle('active', yourTurn || choosing);
  $('#turn-dot').classList.toggle('thinking', thinking && !modal.open);
  $('#hint-btn').disabled = animating || modal.open;
  $('#round-multiplier').innerHTML = `<span>${s.carry > 1 ? '나가리 배판 · 나의 배율' : '나의 승리 배율'}</span><strong>×${game.settlement(0).multiplier}</strong>`;
  $('#game-log').innerHTML = (started ? s.events.slice(-3) : [{ text: '다람이가 당신을 기다리고 있어요.' }, { text: '첫 판을 시작하고 오늘의 운을 확인해 보세요.' }]).map(e => `<li>${escape(e.text)}</li>`).join('');
  if (started && s.lastTurn && previousTurn !== s.lastTurn) {
    previousTurn = s.lastTurn;
    const specials = s.lastTurn.labels.filter(t => t !== '폭탄 뒤집기');
    if (specials.length) toast(specials.join(' · '));
    if (specials.length) sound('special');
  }
  if (started && s.phase === 'finished') {
    recordResult();
    if (!shownResult) { shownResult = true; showResult(); }
  } else if (started && s.turn === 0 && s.phase === 'choice' && !modal.open) showCaptureChoice();
  else if (started && s.turn === 0 && s.phase === 'decision' && !modal.open) showDecision();
  scheduleAI();
}

function scheduleAI() {
  clearTimeout(aiTimer); aiTimer = null;
  if (!started || animating || modal.open || document.hidden || game.state.turn !== 1 || game.state.phase === 'finished') return;
  aiTimer = setTimeout(() => {
    if (game.state.phase === 'playing') runPlay(() => game.aiAction());
    else if (game.state.phase === 'choice') runChoice(() => game.aiAction());
    else { game.aiAction(); render(); }
  }, settings.speed === 'fast' ? 300 : 900);
}

function toast(text) {
  const el = $('#event-toast');
  el.textContent = text; el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function clearHint() {
  hintId = null; hintText = '';
}

function startGame({ next = false } = {}) {
  const result = game.state.result;
  const carry = next && result?.winner === null ? Math.min(8, game.state.carry * 2) : 1;
  const dealer = next && result?.winner !== null && result ? result.winner : 0;
  if (started) round++;
  clearTimeout(aiTimer); clearTimeout(toastTimer); $('#event-toast').classList.remove('show'); clearHint();
  game = new MatgoGame({ difficulty: settings.difficulty, dealer, carry });
  visualTable = null; visualDeckCount = null; visualDrawn = null; animating = false; queuedPlay = null; floorSlots.clear(); ppeokStacks.clear();
  started = true; shownResult = false; savedResult = false; previousTurn = null;
  modal.close(); render(); sound('go');
  if (game.state.shaken[0].length && game.state.phase !== 'finished') toast('자동 흔들기 · ×' + 2 ** game.state.shakes[0]);
}

function showModal(html, name) {
  clearTimeout(aiTimer); aiTimer = null;
  $('#modal-content').innerHTML = html;
  $('.modal-close').hidden = ['decision', 'choice'].includes(name);
  modal.dataset.kind = name;
  if (!modal.open) modal.showModal();
  $('#turn-label').textContent = started && game.state.phase !== 'finished' ? '잠깐 쉬어 가는 중' : $('#turn-label').textContent;
}

function closeModal() {
  if (['decision', 'choice'].includes(modal.dataset.kind)) return;
  queuedPlay = null;
  modal.close(); render();
}

function showRules() {
  showModal(`<p class="modal-kicker">알고 나면 더 재미있는</p><h2 id="modal-title">맞고, 이렇게 즐겨요</h2><p class="modal-description">같은 월의 무늬를 모으는 2인 화투 게임이에요.<br>컴퓨터 다람이와 번갈아 패를 내고, 먼저 7점을 만들어 보세요.</p><div class="rule-steps"><div class="rule-step"><b>01</b><strong>같은 무늬 내기</strong><p>손패 10장, 바닥 8장으로 시작. 같은 월의 패를 내면 가져와요.</p></div><div class="rule-step"><b>02</b><strong>한 장 뒤집기</strong><p>더미에서 한 장을 뒤집어요. 같은 무늬가 있으면 또 가져와요.</p></div><div class="rule-step"><b>03</b><strong>7점, 고 또는 스톱</strong><p>스톱하면 승리! 고하면 계속. 점수가 늘면 다시 선택해요.</p></div></div><h3>모을수록 올라가는 점수</h3><table class="rule-table"><tbody><tr><th>광</th><td>3광 3점 · 비광 포함 3광 2점 · 4광 4점 · 5광 15점</td></tr><tr><th>열끗</th><td>5장부터 1점, 이후 장당 +1점 · 고도리(2·4·8월 새) +5점</td></tr><tr><th>띠</th><td>5장부터 1점, 이후 장당 +1점 · 홍단·청단·초단 각 +3점</td></tr><tr><th>피</th><td>10장부터 1점, 이후 장당 +1점 · 쌍피는 2장으로 계산</td></tr><tr><th>고</th><td>고마다 +1점 · 3고부터 ×2, 4고 ×4, 5고 ×8…</td></tr></tbody></table><h3>패를 모으는 재미</h3><p class="rule-copy"><strong>뻑</strong> 먹으려 낸 패와 뒤집은 패까지 같은 월이면 세 장을 바닥에 남겨요. 이후 먹으면 상대 피 1장, 자기가 만든 뻑을 먹으면 피 2장을 가져와요. 한 판에 3뻑이면 7점으로 승리해요.<br><strong>쪽·따닥·판쓸이</strong> 낸 패를 바로 뒤집어 먹거나, 바닥 두 장을 나머지 두 장으로 먹거나, 바닥을 모두 먹으면 상대 피 1장씩 가져와요.<br><strong>흔들기·폭탄</strong> 손에 같은 월 세 장이 있으면 자동 흔들기가 적용돼요. 내가 선택한 한 장을 그대로 내고, 바닥 한 장을 세 장으로 한 번에 먹으려면 폭탄 버튼을 눌러요. 같은 세 장의 흔들기와 폭탄은 승리 배율 ×2를 한 번만 적용해요. 폭탄 뒤에는 두 번 뒤집기만 할 수 있어요.</p><h3>이 게임에서 쓰는 규칙</h3><p class="rule-copy">기본 화투 48장으로 플레이하며 9월 국진은 쌍피로 계산해요. 피로 점수가 났을 때 상대 피가 7장 이하면 <strong>피박 ×2</strong>, 광으로 점수가 났을 때 상대 광이 없으면 <strong>광박 ×2</strong>. 열끗 7장은 <strong>멍따 ×2</strong>, 고를 한 상대를 이기면 <strong>고박 ×2</strong>예요. 나가리 다음 판은 2배, 연속 나가리는 최대 8배예요. 손패 총통은 10점 즉시 승리, 바닥 총통은 다시 나눠요. 마지막 손패에는 뻑·쪽·판쓸이의 특수 보상을 적용하지 않아요. 첫뻑·첫따닥의 별도 정산은 생략해요.</p><p class="rule-copy">게임 점수로만 승부를 기록해요. 전적은 이 브라우저에 저장돼요.<br>기본 규칙 참고: <a href="https://mgostop.hangame.com/guide/combine/02_01_rule.html" target="_blank" rel="noopener noreferrer">한게임 공식 맞고 가이드 ↗</a></p><div class="modal-footer"><button class="primary-button" data-action="close">알겠어요</button></div>`, 'rules');
}

function showSettings() {
  showModal(`<p class="modal-kicker">나의 속도에 맞춰</p><h2 id="modal-title">편안한 한 판 설정</h2><div class="form-row"><span class="form-label">다람이의 실력</span><div class="option-buttons">${[['easy', '가볍게'], ['normal', '보통'], ['hard', '승부사']].map(([value, text]) => `<button data-action="difficulty" data-value="${value}" class="${settings.difficulty === value ? 'selected' : ''}" aria-pressed="${settings.difficulty === value}">${text}</button>`).join('')}</div><p class="settings-note">다음 판부터 적용돼요. 승부사는 고를 선택하기도 해요.</p></div><div class="form-row"><span class="form-label">플레이 속도</span><div class="option-buttons">${[['normal', '느긋하게'], ['fast', '빠르게']].map(([value, text]) => `<button data-action="speed" data-value="${value}" class="${settings.speed === value ? 'selected' : ''}" aria-pressed="${settings.speed === value}">${text}</button>`).join('')}</div></div><div class="form-row"><span class="form-label">게임 소리</span><div class="option-buttons"><button data-action="set-sound" data-value="on" class="${settings.sound ? 'selected' : ''}" aria-pressed="${settings.sound}">켜기</button><button data-action="set-sound" data-value="off" class="${!settings.sound ? 'selected' : ''}" aria-pressed="${!settings.sound}">끄기</button></div></div><div class="modal-footer"><button class="primary-button" data-action="close">설정 완료</button></div>`, 'settings');
}

function recordResult() {
  if (savedResult) return;
  savedResult = true;
  const r = game.state.result;
  if (r.winner === 0) { records.wins++; records.best = Math.max(records.best, r.total); }
  else if (r.winner === 1) records.losses++;
  else records.draws++;
  records.history.unshift({ winner: r.winner, total: r.total, reason: r.reason, date: new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }) });
  records.history = records.history.slice(0, 10);
  saveStored('ohu-records-v1', records);
}

function showResult() {
  const r = game.state.result;
  const title = r.winner === null ? '다음 판을 기약해요' : r.winner === 0 ? '좋은 패, 멋진 한 판!' : '이번엔 다람이의 승리';
  const description = r.winner === null ? '나가리! 다음 판은 두 배로 즐겨요.' : r.winner === 0 ? '오늘의 작은 승리를 가져가세요.' : '운은 돌고 도니까요. 다음 판은 당신의 차례!';
  showModal(`<div class="result-content"><div class="result-emblem" aria-hidden="true">${r.winner === 0 ? '勝' : r.winner === null ? '和' : '花'}</div><p class="modal-kicker">${round}번째 판 · ${escape(r.reason)}</p><h2 id="modal-title">${title}</h2><p class="modal-description">${description}</p>${r.winner !== null ? `<div class="result-total">${r.total.toLocaleString()}<small>점</small></div><div class="settlement"><div class="settlement-row"><span>획득 점수</span><strong>${r.base}점</strong></div><div class="settlement-row"><span>고 보너스</span><strong>+${r.goBonus}점</strong></div>${r.factors.length ? `<div class="factor-chips">${r.factors.map(f => `<span>${f.name} ×${f.value}</span>`).join('')}</div>` : ''}<div class="settlement-row"><span>최종 점수</span><strong>(${r.base} + ${r.goBonus}) × ${r.multiplier} = ${r.total}점</strong></div></div>` : '<div class="settlement"><div class="settlement-row"><span>다음 판 배율</span><strong>×' + Math.min(8, game.state.carry * 2) + '</strong></div></div>'}<div class="modal-footer"><button class="secondary-button" data-action="close">게임판 보기</button><button class="primary-button" data-action="next">다음 판 시작 <span aria-hidden="true">→</span></button></div></div>`, 'result');
  if (r.winner === 0) sound('win');
}

function showDecision() {
  const score = game.score(0), settle = game.settlement(0);
  showModal(`<div class="result-content"><p class="modal-kicker">이제 나의 선택</p><h2 id="modal-title">한 번 더, 갈까요?</h2><div class="result-total">${score.total}<small>점 달성</small></div><p class="modal-description">스톱하면 <strong>${settle.total}점</strong>으로 승리해요.<br>고를 하면 더 큰 점수에 도전할 수 있어요.</p><div class="settlement"><div class="settlement-row"><span>현재 고</span><strong>${game.state.go[0]}고</strong></div><div class="settlement-row"><span>다음 고 보너스</span><strong>+${game.state.go[0] + 1}점${game.state.go[0] + 1 >= 3 ? ` · ×${2 ** (game.state.go[0] - 1)}` : ''}</strong></div></div><div class="modal-footer"><button class="secondary-button" data-action="go">고! 계속하기 <kbd>G</kbd></button><button class="primary-button" data-action="stop">스톱! 승리하기 <kbd>S</kbd></button></div></div>`, 'decision');
}

function showRecords() {
  const games = records.wins + records.losses;
  showModal(`<p class="modal-kicker">한 판씩 쌓이는 즐거움</p><h2 id="modal-title">나의 맞고 기록</h2><div class="record-grid"><div class="record-stat"><strong>${records.wins}</strong><span>승리</span></div><div class="record-stat"><strong>${games ? Math.round(records.wins / games * 100) : 0}<small style="font-size:12px">%</small></strong><span>승률</span></div><div class="record-stat"><strong>${records.best}</strong><span>최고 승리 점수</span></div></div><p class="modal-description">${records.wins}승 ${records.losses}패 ${records.draws}무 · 이 브라우저에서 함께한 기록이에요.</p><h3>최근 한 판</h3>${records.history.length ? `<ul class="record-history">${records.history.map(r => `<li><span class="${r.winner === 0 ? 'win' : r.winner === 1 ? 'lose' : ''}">${r.winner === 0 ? '승리' : r.winner === 1 ? '패배' : '무승부'} · ${escape(r.reason || '')}</span><span>${r.total}점</span><small>${escape(r.date)}</small></li>`).join('')}</ul>` : '<p class="rule-copy">아직 기록이 없어요. 첫 번째 한 판을 시작해 보세요.</p>'}<div class="modal-footer"><button class="primary-button" data-action="close">알겠어요</button></div>`, 'records');
}

function showCaptured(player) {
  const cards = sortCards(game.state.captured[player]), score = scoreCards(cards);
  showModal(`<p class="modal-kicker">차곡차곡 모은 패</p><h2 id="modal-title">${player === 0 ? '나의' : '다람이의'} 먹은 패</h2><p class="modal-description">총 ${cards.length}장 · 획득 점수 ${score.total}점</p>${['bright', 'animal', 'ribbon', 'pi'].map(type => {
    const group = cards.filter(c => c.type === type);
    return `<div class="capture-category"><span>${TYPE_NAMES[type]} ${type === 'pi' ? score.pi : group.length}장</span><small>${score[`${type}Points`]}점</small></div>${group.length ? `<div class="capture-grid">${group.map(c => cardHTML(c)).join('')}</div>` : '<div class="capture-empty">아직 모은 패가 없어요.</div>'}`;
  }).join('')}<div class="modal-footer"><button class="primary-button" data-action="close">게임으로 돌아가기</button></div>`, 'captured');
}

function hint() {
  if (animating || modal.open) return;
  settings.hints = !settings.hints;
  saveStored('ohu-settings-v1', settings);
  render();
}

function targetOptions(cards, action) {
  const recommended = settings.hints ? [...cards].sort((a, b) => game.cardValue(b, 0) - game.cardValue(a, 0))[0]?.id : null;
  return `<div class="target-options">${cards.map(card => `<div class="target-option">${cardHTML(card, { disabled: false, action, className: `target-card ${card.id === recommended ? 'hint-target' : ''}`, label: ' · 이 바닥 패 선택' })}<strong>${escape(card.name)}</strong><span>${card.id === recommended ? '추천 패' : '이 패 위에 치기'}</span></div>`).join('')}</div>`;
}

function choicePreview(card, title, description = '선택한 이 패로 칩니다.') {
  return `<div class="choice-preview">${cardHTML(card)}<div><small>${title}</small><strong>${escape(card.name)}</strong><p>${description}</p></div></div>`;
}

function requestPlay(cardId, { bomb = false, targetId = null, origin = null } = {}) {
  const s = game.state;
  if (!started || animating || modal.open || s.turn !== 0 || s.phase !== 'playing') return;
  const card = s.hands[0].find(c => c.id === cardId);
  if (!card && cardId !== 'pass') return;
  const targets = card ? game.matches(card.month) : [];
  if (!bomb && targets.length >= 2) {
    queuedPlay = { game, cardId, bomb, origin };
    showModal(`<p class="modal-kicker">내가 칠 바닥 패</p><h2 id="modal-title">어느 패 위에 칠까요?</h2>${choicePreview(card, '내가 선택한 손패')}${targetOptions(targets, 'play-target')}<p class="choice-note">${targets.length === 3 ? '같은 무늬 세 장은 모두 가져옵니다. 내려칠 위치를 골라 주세요.' : '바닥 패를 누르면 그 패 위에 내려칩니다.'}</p><div class="modal-footer"><button class="secondary-button" data-action="close">취소 · 손패 다시 고르기</button></div>`, 'play-select');
    return;
  }
  runPlay(() => game.play(cardId, { bomb }), { targetId, origin });
}

function showCaptureChoice() {
  const tx = game.state.pending;
  const card = tx.stage === 'draw' ? tx.drawn : tx.played[0];
  const targets = game.state.table.filter(c => tx.choices.includes(c.id));
  showModal(`<p class="modal-kicker">같은 무늬 두 장</p><h2 id="modal-title">먹을 바닥 패를 골라 주세요</h2>${choicePreview(card, tx.stage === 'draw' ? '더미에서 뒤집은 패' : '내가 낸 손패', '이 패로 선택한 바닥 패를 먹습니다.')}${targetOptions(targets, 'choose')}<p class="choice-note">선택한 바닥 패를 함께 가져옵니다.</p>`, 'choice');
}

function boardCard(id) { return $(`#floor .flower-card[data-id="${id}"]`); }

function busy(message) {
  $('#table-message').textContent = message;
  $('#table-message').classList.remove('choice-message');
  $('#turn-label').textContent = message;
  $('#hand-prompt').textContent = '패를 치고 있어요';
  $('#hint-btn').disabled = true;
  $('.felt').classList.add('in-motion');
}

function placeVisualCard(card, targetId) {
  if (!visualTable.some(c => c.id === card.id)) visualTable.push(card);
  if (targetId && floorSlots.has(targetId)) floorSlots.set(card.id, floorSlots.get(targetId));
  renderFloor();
  return boardCard(card.id);
}

async function flipDraw(tx) {
  if (!tx.drawn) return;
  busy(`${tx.player ? '다람이가' : '내가'} 한 장을 뒤집어요`);
  const from = $('#deck').getBoundingClientRect();
  const targets = visualTable.filter(c => c.month === tx.drawn.month);
  const needsChoice = game.state.phase === 'choice' && game.state.pending.stage === 'draw';
  const target = needsChoice ? null : targets.at(-1)?.id;
  const element = placeVisualCard(tx.drawn, target);
  const to = element.getBoundingClientRect();
  element.classList.add('landing-card');
  await motion.fly(tx.drawn, from, to, { flip: true });
  element.classList.remove('landing-card');
  visualDeckCount = game.state.deck.length; visualDrawn = tx.drawn;
  renderFloor();
}

async function finishMotion(tx) {
  if (game.state.phase !== 'choice') {
    if (tx.taken.length) {
      busy(`${tx.player ? '다람이가' : '내가'} ${tx.taken.length}장을 가져와요`);
      const positions = new Map();
      for (const card of tx.taken) positions.set(card.id, boardCard(card.id)?.getBoundingClientRect());
      for (const card of tx.stolen || []) {
        const source = $(`#${tx.player ? 'my' : 'opponent'}-captures .captured-mini[data-id="${card.id}"]`) || $(`#${tx.player ? 'my' : 'opponent'}-captures [data-type="pi"]`);
        positions.set(card.id, source?.getBoundingClientRect());
      }
      await motion.wait(180);
      for (const card of tx.taken) boardCard(card.id)?.classList.add('landing-card');
      for (const card of tx.stolen || []) {
        const source = $(`#${tx.player ? 'my' : 'opponent'}-captures .captured-mini[data-id="${card.id}"]`);
        if (source) source.style.visibility = 'hidden';
      }
      await motion.collect([...tx.taken, ...(tx.stolen || [])], positions, tx.player);
    }
    visualTable = null; visualDeckCount = null; visualDrawn = null;
  }
  animating = false;
  $('.felt').classList.remove('in-motion');
  render();
}

async function runPlay(action, { targetId = null, origin = null } = {}) {
  if (animating || modal.open || game.state.phase !== 'playing') return;
  clearTimeout(aiTimer); clearHint();
  const player = game.state.turn;
  const previousTable = [...game.state.table];
  const deckCount = game.state.deck.length;
  const origins = new Map(game.state.hands[player].map(c => [c.id, player === 0 ? $(`#hand [data-id="${c.id}"]`)?.getBoundingClientRect() : $('#opponent-hand .card-back')?.getBoundingClientRect() || $('#opponent-hand').getBoundingClientRect()]));
  if (!action()) return;
  const tx = game.state.pending || game.state.lastTurn;
  if (targetId && game.state.phase === 'choice' && tx.stage === 'hand' && tx.choices.includes(targetId)) game.choose(targetId);
  animating = true; visualTable = previousTable; visualDeckCount = deckCount; visualDrawn = null;
  renderHand(); renderFloor();
  try {
    busy(`${player ? '다람이가' : '내가'} 바닥에 패를 쳐요`);
    for (const card of tx.played) {
      const matches = previousTable.filter(c => c.month === card.month);
      const needsHandChoice = game.state.phase === 'choice' && tx.stage === 'hand';
      const target = targetId || (!needsHandChoice ? matches[0]?.id : null);
      const element = placeVisualCard(card, target);
      const to = element.getBoundingClientRect();
      element.classList.add('landing-card');
      await motion.fly(card, origin || origins.get(card.id), to);
      element.classList.remove('landing-card');
    }
    if (!(game.state.phase === 'choice' && tx.stage === 'hand')) {
      await motion.wait();
      await flipDraw(tx);
    }
    await finishMotion(tx);
  } catch (error) {
    console.error('패 동작 표시 오류', error);
    animating = false; visualTable = null; visualDeckCount = null; visualDrawn = null;
    $('.felt').classList.remove('in-motion'); render();
  }
}

async function runChoice(action, targetId = game.bestChoice()) {
  if (animating || modal.open || game.state.phase !== 'choice') return;
  const tx = game.state.pending, handChoice = tx.stage === 'hand';
  const card = handChoice ? tx.played[0] : tx.drawn;
  const from = boardCard(card.id)?.getBoundingClientRect();
  if (!action()) return;
  animating = true; renderHand(); renderFloor();
  try {
    busy(`${tx.player ? '다람이가' : '내가'} 고른 바닥 패에 쳐요`);
    const element = placeVisualCard(card, targetId);
    const to = element.getBoundingClientRect();
    element.classList.add('landing-card');
    await motion.fly(card, from, to);
    element.classList.remove('landing-card');
    if (handChoice) await flipDraw(tx);
    await finishMotion(tx);
  } catch (error) {
    console.error('먹은 패 표시 오류', error);
    animating = false; visualTable = null; visualDeckCount = null; visualDrawn = null;
    $('.felt').classList.remove('in-motion'); render();
  }
}

function handleAction(action, element) {
  if (animating && action !== 'sound') return;
  const s = game.state;
  switch (action) {
    case 'start': startGame(); break;
    case 'next': startGame({ next: true }); break;
    case 'new':
      if (!started || s.phase === 'finished') startGame({ next: s.phase === 'finished' });
      else showModal('<p class="modal-kicker">새로운 운을 만나러</p><h2 id="modal-title">새 판을 시작할까요?</h2><p class="modal-description">진행 중인 판을 마치고 새로 패를 나눠요.<br>이번 판은 전적에 기록되지 않아요.</p><div class="confirm-actions"><button class="secondary-button" data-action="close">이어서 하기</button><button class="primary-button" data-action="restart">새 판 시작</button></div>', 'new');
      break;
    case 'restart': startGame(); break;
    case 'play': requestPlay(element.dataset.id); break;
    case 'play-target': {
      const move = queuedPlay;
      if (!move || move.game !== game || !modal.open || modal.dataset.kind !== 'play-select') break;
      const card = s.hands[0].find(c => c.id === move.cardId);
      if (!card || !game.matches(card.month).some(c => c.id === element.dataset.id)) break;
      queuedPlay = null; modal.close();
      runPlay(() => game.play(move.cardId, { bomb: move.bomb }), { targetId: element.dataset.id, origin: move.origin });
      break;
    }
    case 'choose':
      if (s.turn === 0 && s.phase === 'choice' && (!modal.open || modal.dataset.kind === 'choice')) {
        if (!s.pending.choices.includes(element.dataset.id)) break;
        modal.close(); runChoice(() => game.choose(element.dataset.id), element.dataset.id);
      }
      break;
    case 'bomb': if (!modal.open && s.turn === 0) { const c = s.hands[0].find(c => c.month === Number(element.dataset.month)); if (c) requestPlay(c.id, { bomb: true }); } break;
    case 'go': case 'stop':
      if (started && s.turn === 0 && s.phase === 'decision') { modal.close(); game.decide(action === 'go'); sound('go'); render(); }
      break;
    case 'hint': hint(); break;
    case 'rules': showRules(); break;
    case 'settings': showSettings(); break;
    case 'records': showRecords(); break;
    case 'captured-me': showCaptured(0); break;
    case 'captured-ai': showCaptured(1); break;
    case 'close': closeModal(); break;
    case 'sound': settings.sound = !settings.sound; saveStored('ohu-settings-v1', settings); updateSoundButton(); if (settings.sound) sound(); break;
    case 'difficulty': settings.difficulty = element.dataset.value; saveStored('ohu-settings-v1', settings); showSettings(); break;
    case 'speed': settings.speed = element.dataset.value; saveStored('ohu-settings-v1', settings); showSettings(); break;
    case 'set-sound': settings.sound = element.dataset.value === 'on'; saveStored('ohu-settings-v1', settings); updateSoundButton(); showSettings(); break;
  }
}

document.addEventListener('click', event => {
  if (performance.now() < suppressClickUntil && !event.target.closest('#modal')) { event.preventDefault(); return; }
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) handleAction(button.dataset.action, button);
});

$('#hand').addEventListener('pointerdown', event => {
  const button = event.target.closest('.flower-card[data-action="play"]');
  if (!button || button.disabled || button.dataset.id === 'pass' || event.button !== 0 || animating || modal.open) return;
  const card = game.state.hands[0].find(c => c.id === button.dataset.id);
  if (!card) return;
  drag = { button, card, pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: button.getBoundingClientRect(), ghost: null };
  button.setPointerCapture(event.pointerId);
});

$('#hand').addEventListener('pointermove', event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
    drag.ghost = document.createElement('div'); drag.ghost.className = 'card-flight drag-flight';
    drag.ghost.innerHTML = cardSVG(drag.card); drag.ghost.style.width = `${drag.rect.width}px`; drag.ghost.style.height = `${drag.rect.height}px`;
    document.body.append(drag.ghost); drag.button.classList.add('drag-origin');
  }
  if (!drag.ghost) return;
  event.preventDefault();
  drag.ghost.style.transform = `translate(${event.clientX - drag.rect.width / 2}px,${event.clientY - drag.rect.height / 2}px) rotate(-7deg) scale(1.08)`;
  $('#floor').querySelectorAll('.flower-card').forEach(el => el.classList.toggle('drop-target', Number(el.dataset.month) === drag.card.month));
});

function endDrag(event, cancel = false) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const current = drag; drag = null;
  current.button.classList.remove('drag-origin');
  if (current.button.hasPointerCapture(event.pointerId)) current.button.releasePointerCapture(event.pointerId);
  $('#floor').querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  if (!current.ghost) {
    if (!cancel && event.pointerType === 'touch') {
      event.preventDefault(); suppressClickUntil = performance.now() + 500;
      requestPlay(current.card.id);
    }
    return;
  }
  current.ghost.remove(); suppressClickUntil = performance.now() + 500;
  if (cancel) return;
  if (event.clientX < 0 || event.clientY < 0 || event.clientX > innerWidth || event.clientY > innerHeight) return;
  const field = $('.table-field').getBoundingClientRect();
  const inField = event.clientX >= field.left && event.clientX <= field.right && event.clientY >= field.top && event.clientY <= field.bottom;
  if (!inField) return;
  const target = document.elementsFromPoint(event.clientX, event.clientY).map(el => el.closest('#floor .flower-card')).find(Boolean);
  if (target && Number(target.dataset.month) !== current.card.month) { $('#table-message').textContent = '같은 무늬 위나 빈 바닥에 패를 놓아 주세요.'; return; }
  const origin = { left: event.clientX - current.rect.width / 2, top: event.clientY - current.rect.height / 2, width: current.rect.width, height: current.rect.height };
  requestPlay(current.card.id, { targetId: target?.dataset.id, origin });
}
$('#hand').addEventListener('pointerup', event => endDrag(event));
$('#hand').addEventListener('pointercancel', event => endDrag(event, true));

$('#hand').addEventListener('pointerover', event => {
  const button = event.target.closest('.flower-card');
  const card = game.state.hands[0].find(c => c.id === button?.dataset.id);
  if (!card || button.disabled) return;
  $('#floor').querySelectorAll('.flower-card').forEach(el => el.classList.toggle('can-eat', game.state.table.find(c => c.id === el.dataset.id)?.month === card.month));
});
$('#hand').addEventListener('pointerleave', () => $('#floor').querySelectorAll('.can-eat').forEach(el => el.classList.remove('can-eat')));
$('#hand').addEventListener('focusin', event => {
  const card = game.state.hands[0].find(c => c.id === event.target.dataset.id);
  if (card) $('#floor').querySelectorAll('.flower-card').forEach(el => el.classList.toggle('can-eat', game.state.table.find(c => c.id === el.dataset.id)?.month === card.month));
});
$('#hand').addEventListener('focusout', () => $('#floor').querySelectorAll('.can-eat').forEach(el => el.classList.remove('can-eat')));

modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (modal.dataset.kind !== 'decision') closeModal();
});
modal.addEventListener('click', event => { if (event.target === modal && modal.dataset.kind !== 'decision') closeModal(); });
modal.addEventListener('close', () => scheduleAI());

document.addEventListener('keydown', event => {
  if (animating || event.repeat || event.ctrlKey || event.altKey || event.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (modal.open) {
    if (modal.dataset.kind === 'decision' && ['g', 's'].includes(key)) { event.preventDefault(); handleAction(key === 'g' ? 'go' : 'stop'); }
    return;
  }
  if (key === 'h') { event.preventDefault(); hint(); }
  else if (started && game.state.turn === 0 && game.state.phase === 'playing' && /^\d$/.test(key)) {
    const index = key === '0' ? 9 : Number(key) - 1;
    const c = game.state.hands[0][index];
    if (c) { event.preventDefault(); requestPlay(c.id); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(aiTimer); aiTimer = null; }
  else scheduleAI();
});

let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { if (!animating) renderFloor(); });
});

render();
