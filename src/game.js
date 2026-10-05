import { createDeck, sortCards } from './cards.js';

export function scoreCards(cards) {
  const bright = cards.filter(c => c.type === 'bright');
  const animal = cards.filter(c => c.type === 'animal');
  const ribbon = cards.filter(c => c.type === 'ribbon');
  const pi = cards.reduce((n, c) => n + c.pi, 0);
  const brightPoints = bright.length === 5 ? 15 : bright.length === 4 ? 4 : bright.length === 3 ? (bright.some(c => c.group === 'rain') ? 2 : 3) : 0;
  const godori = animal.filter(c => c.group === 'godori').length === 3;
  const sets = ['red', 'blue', 'grass'].filter(group => ribbon.filter(c => c.group === group).length === 3);
  const animalPoints = Math.max(0, animal.length - 4) + (godori ? 5 : 0);
  const ribbonPoints = Math.max(0, ribbon.length - 4) + sets.length * 3;
  const piPoints = Math.max(0, pi - 9);
  return {
    total: brightPoints + animalPoints + ribbonPoints + piPoints,
    bright: bright.length, animal: animal.length, ribbon: ribbon.length, pi,
    brightPoints, animalPoints, ribbonPoints, piPoints, godori, sets,
  };
}

function shuffled(cards, rng) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class MatgoGame {
  constructor({ rng = Math.random, dealer = 0, difficulty = 'normal', carry = 1 } = {}) {
    this.rng = rng;
    this.difficulty = difficulty;
    let cards;
    // 바닥 총통은 다시 나누며, 손패 총통은 즉시 승리합니다.
    for (let attempt = 0; attempt < 200; attempt++) {
      cards = shuffled(createDeck(), rng);
      if (![...new Set(cards.slice(20, 28).map(c => c.month))].some(m => cards.slice(20, 28).filter(c => c.month === m).length === 4)) break;
    }
    this.state = {
      hands: [sortCards(cards.slice(0, 10)), sortCards(cards.slice(10, 20))],
      table: sortCards(cards.slice(20, 28)), deck: cards.slice(28), captured: [[], []],
      turn: dealer, dealer, phase: 'playing', go: [0, 0], thresholds: [6, 6],
      shakes: [0, 0], shaken: [[], []], passes: [0, 0], ppeokOwners: {}, ppeoks: [0, 0],
      moves: [0, 0], events: [], pending: null, lastTurn: null, result: null, carry,
    };
    this.log('새로운 판이 시작되었습니다.', 'deal');
    for (const player of [dealer, 1 - dealer]) {
      if (this.state.hands[player].some(c => this.state.hands[player].filter(h => h.month === c.month).length === 4)) {
        this.finish(player, '총통', 10);
        break;
      }
    }
  }

  log(text, kind = 'normal') {
    this.state.events.push({ text, kind, player: this.state.turn });
    if (this.state.events.length > 40) this.state.events.shift();
  }

  score(player) { return scoreCards(this.state.captured[player]); }
  slots(player) { return this.state.hands[player].length + this.state.passes[player]; }
  matches(month) { return this.state.table.filter(c => c.month === month); }

  shakeOptions(player = this.state.turn) {
    return [...new Set(this.state.hands[player].map(c => c.month))].filter(month =>
      this.state.hands[player].filter(c => c.month === month).length === 3 && this.matches(month).length === 0 && !this.state.shaken[player].includes(month));
  }

  bombOptions(player = this.state.turn) {
    return [...new Set(this.state.hands[player].map(c => c.month))].filter(month =>
      this.state.hands[player].filter(c => c.month === month).length === 3 && this.matches(month).length === 1);
  }

  shake(month) {
    const s = this.state, player = s.turn;
    if (s.phase !== 'playing' || !this.shakeOptions(player).includes(month)) return false;
    s.shaken[player].push(month);
    s.shakes[player]++;
    this.log(`${player === 0 ? '나' : '다람'}: ${month}월 흔들기! 승리 점수 ×2`, 'shake');
    return true;
  }

  removeTable(cards) {
    const ids = new Set(cards.map(c => c.id));
    this.state.table = this.state.table.filter(c => !ids.has(c.id));
  }

  play(cardId, { bomb = false } = {}) {
    const s = this.state;
    if (s.phase !== 'playing') return false;
    const player = s.turn;
    const pass = cardId === 'pass';
    const card = s.hands[player].find(c => c.id === cardId);
    if (pass ? s.passes[player] < 1 : !card) return false;
    if (bomb && (!card || !this.bombOptions(player).includes(card.month))) return false;

    const tx = {
      player, played: [], drawn: null, taken: [], labels: [], steals: 0,
      last: this.slots(player) === 1, stage: 'hand', choices: [],
    };
    s.pending = tx;
    s.phase = 'resolving';
    s.moves[player]++;
    if (pass) {
      s.passes[player]--;
      tx.labels.push('폭탄 뒤집기');
    } else if (bomb) {
      tx.played = s.hands[player].filter(c => c.month === card.month);
      s.hands[player] = s.hands[player].filter(c => c.month !== card.month);
      const floor = this.matches(card.month);
      this.removeTable(floor);
      tx.taken.push(...tx.played, ...floor);
      s.passes[player] += 2;
      s.shakes[player]++;
      tx.labels.push('폭탄');
      tx.steals++;
    } else {
      tx.played = [card];
      s.hands[player] = s.hands[player].filter(c => c.id !== cardId);
    }
    tx.drawn = s.deck.pop() || null;

    if (pass || bomb) return this.resolveDraw();
    const floor = this.matches(card.month);
    const sameDraw = tx.drawn?.month === card.month;
    if (floor.length === 1 && sameDraw) {
      this.removeTable(floor);
      if (tx.last) {
        tx.taken.push(card, ...floor, tx.drawn);
      } else {
        s.table.push(card, ...floor, tx.drawn);
        s.ppeokOwners[card.month] = player;
        s.ppeoks[player]++;
        tx.labels.push('뻑');
      }
      return this.completeTurn();
    }
    if (floor.length === 2 && sameDraw) {
      this.removeTable(floor);
      tx.taken.push(card, ...floor, tx.drawn);
      tx.labels.push('따닥');
      tx.steals++;
      return this.completeTurn();
    }
    if (floor.length === 2) {
      tx.choices = floor.map(c => c.id);
      s.phase = 'choice';
      return true;
    }
    if (floor.length) {
      this.removeTable(floor);
      tx.taken.push(card, ...floor);
      if (floor.length === 3) this.takePpeok(card.month, tx);
    } else {
      s.table.push(card);
      tx.placed = card.id;
    }
    return this.resolveDraw();
  }

  choose(cardId) {
    const s = this.state, tx = s.pending;
    if (s.phase !== 'choice' || !tx?.choices.includes(cardId)) return false;
    const chosen = s.table.find(c => c.id === cardId);
    if (!chosen) return false;
    this.removeTable([chosen]);
    tx.choices = [];
    s.phase = 'resolving';
    if (tx.stage === 'hand') {
      tx.taken.push(tx.played[0], chosen);
      return this.resolveDraw();
    }
    tx.taken.push(tx.drawn, chosen);
    return this.completeTurn();
  }

  takePpeok(month, tx) {
    const owner = this.state.ppeokOwners[month];
    tx.steals += owner === tx.player ? 2 : 1;
    tx.labels.push(owner === tx.player ? '자뻑 회수' : '뻑 먹기');
    delete this.state.ppeokOwners[month];
  }

  resolveDraw() {
    const s = this.state, tx = s.pending;
    tx.stage = 'draw';
    if (!tx.drawn) return this.completeTurn();
    const floor = this.matches(tx.drawn.month);
    if (floor.length === 2) {
      tx.choices = floor.map(c => c.id);
      s.phase = 'choice';
      return true;
    }
    if (floor.length) {
      this.removeTable(floor);
      tx.taken.push(tx.drawn, ...floor);
      if (floor.length === 3) this.takePpeok(tx.drawn.month, tx);
      if (floor.some(c => c.id === tx.placed) && !tx.last) {
        tx.labels.push('쪽');
        tx.steals++;
      }
    } else s.table.push(tx.drawn);
    return this.completeTurn();
  }

  stealPi(player, amount) {
    const from = 1 - player, stolen = [];
    while (amount > 0) {
      const available = this.state.captured[from].filter(c => c.type === 'pi').sort((a, b) => a.pi - b.pi);
      const card = available[0];
      if (!card) break;
      this.state.captured[from] = this.state.captured[from].filter(c => c.id !== card.id);
      this.state.captured[player].push(card);
      stolen.push(card);
      amount -= card.pi;
    }
    return stolen;
  }

  completeTurn() {
    const s = this.state, tx = s.pending;
    if (!s.table.length && tx.taken.length && !tx.last) {
      tx.labels.push('판쓸이');
      tx.steals++;
    }
    s.captured[tx.player].push(...tx.taken);
    tx.stolen = this.stealPi(tx.player, tx.steals);
    s.table = sortCards(s.table);
    s.lastTurn = tx;
    s.pending = null;
    const who = tx.player === 0 ? '나' : '다람';
    this.log(`${who}: ${tx.played.length ? `${tx.played[0].month}월 패` : '폭탄 패'} · ${tx.taken.length}장 획득${tx.labels.length ? ` · ${tx.labels.join(', ')}` : ''}${tx.stolen.length ? ` · 피 ${tx.stolen.reduce((n, c) => n + c.pi, 0)}장 가져오기` : ''}`, tx.labels[0] || 'play');
    if (s.ppeoks[tx.player] >= 3) { this.finish(tx.player, '3뻑', 7); return true; }
    const score = this.score(tx.player).total;
    if (score >= 7 && score > s.thresholds[tx.player]) {
      if (!this.slots(tx.player)) this.finish(tx.player, '마지막 패 스톱');
      else s.phase = 'decision';
    } else this.nextTurn();
    return true;
  }

  nextTurn() {
    const s = this.state;
    if (!this.slots(0) && !this.slots(1)) {
      this.finish(null, '나가리');
      return;
    }
    s.turn = this.slots(1 - s.turn) ? 1 - s.turn : s.turn;
    s.phase = 'playing';
  }

  decide(go) {
    const s = this.state;
    if (s.phase !== 'decision') return false;
    if (!go) this.finish(s.turn, '스톱');
    else {
      s.go[s.turn]++;
      s.thresholds[s.turn] = this.score(s.turn).total;
      this.log(`${s.turn === 0 ? '나' : '다람'}: ${s.go[s.turn]}고!`, 'go');
      this.nextTurn();
    }
    return true;
  }

  settlement(player) {
    const s = this.state, score = this.score(player), other = this.score(1 - player);
    const factors = [];
    if (s.go[player] >= 3) factors.push({ name: `${s.go[player]}고`, value: 2 ** (s.go[player] - 2) });
    if (s.shakes[player]) factors.push({ name: '흔들기·폭탄', value: 2 ** s.shakes[player] });
    if (score.piPoints > 0 && other.pi <= 7) factors.push({ name: '피박', value: 2 });
    if (score.brightPoints > 0 && !other.bright) factors.push({ name: '광박', value: 2 });
    if (score.animal >= 7) factors.push({ name: '멍따', value: 2 });
    if (s.go[1 - player] > 0) factors.push({ name: '고박', value: 2 });
    if (s.carry > 1) factors.push({ name: '나가리 배판', value: s.carry });
    const multiplier = factors.reduce((n, f) => n * f.value, 1);
    return { base: score.total, goBonus: s.go[player], multiplier, factors, total: (score.total + s.go[player]) * multiplier };
  }

  finish(winner, reason, fixedScore) {
    const s = this.state;
    const settlement = winner === null ? { base: 0, goBonus: 0, multiplier: 1, factors: [], total: 0 }
      : fixedScore ? { base: fixedScore, goBonus: 0, multiplier: s.carry, factors: s.carry > 1 ? [{ name: '나가리 배판', value: s.carry }] : [], total: fixedScore * s.carry }
        : this.settlement(winner);
    s.phase = 'finished';
    s.result = { winner, reason, ...settlement };
    this.log(winner === null ? '나가리! 다음 판은 두 배로 진행됩니다.' : `${winner === 0 ? '내' : '다람의'} 승리! ${settlement.total}점 · ${reason}`, 'result');
  }

  cardValue(card, player = this.state.turn) {
    const score = this.score(player), owned = this.state.captured[player];
    const gain = scoreCards([...owned, card]).total - score.total;
    let value = gain * 5 + (card.type === 'bright' ? 4 : card.type === 'animal' ? 2.4 : card.type === 'ribbon' ? 2 : card.pi * 1.8);
    if (card.group === 'godori') value += owned.filter(c => c.group === 'godori').length * 2.5;
    if (['red', 'blue', 'grass'].includes(card.group)) value += owned.filter(c => c.group === card.group).length * 2;
    return value;
  }

  bestChoice() {
    const choices = this.state.pending?.choices || [];
    return this.state.table.filter(c => choices.includes(c.id)).sort((a, b) => this.cardValue(b) - this.cardValue(a))[0]?.id;
  }

  recommend() {
    const s = this.state, hand = s.hands[s.turn];
    const bomb = this.bombOptions()[0];
    if (bomb) return { id: hand.find(c => c.month === bomb).id, bomb: true, reason: `${bomb}월 세 장으로 폭탄! 네 장을 먹고 배율을 올릴 수 있어요.` };
    const scored = hand.map(c => {
      const matches = this.matches(c.month);
      const best = [...matches].sort((a, b) => this.cardValue(b) - this.cardValue(a))[0];
      const value = matches.length === 3 ? matches.reduce((n, m) => n + this.cardValue(m), 0) + this.cardValue(c) + 4
        : best ? this.cardValue(c) + this.cardValue(best) : -this.cardValue(c) + hand.filter(h => h.month === c.month).length * .3;
      return { id: c.id, value, month: c.month, best };
    }).sort((a, b) => b.value - a.value);
    if (!scored.length || (s.passes[s.turn] && scored[0].value < 0)) return { id: 'pass', reason: '폭탄 패로 뒤집기만 하고 좋은 손패를 남겨 두세요.' };
    const best = scored[0];
    return { id: best.id, reason: best.best ? `${best.month}월 패로 ${best.best.name.split(' ').slice(2).join(' ')}를 먹을 수 있어요.` : `${best.month}월 패를 내려놓고 다음 기회를 만들어 보세요.` };
  }

  aiAction() {
    const s = this.state;
    if (s.turn !== 1 || s.phase === 'finished') return false;
    if (s.phase === 'choice') return this.choose(this.bestChoice());
    if (s.phase === 'decision') {
      const go = this.difficulty === 'hard' && this.slots(1) >= 3 && this.score(0).total < 5 && s.go[1] < 2;
      return this.decide(go);
    }
    if (s.phase !== 'playing') return false;
    if (this.difficulty === 'easy') {
      const ids = [...s.hands[1].map(c => c.id), ...(s.passes[1] ? ['pass'] : [])];
      return this.play(ids[Math.floor(this.rng() * ids.length)]);
    }
    for (const month of this.shakeOptions()) this.shake(month);
    const move = this.recommend();
    return this.play(move.id, { bomb: !!move.bomb });
  }
}
