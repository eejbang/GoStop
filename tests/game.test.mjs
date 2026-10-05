import test from 'node:test';
import assert from 'node:assert/strict';
import { MatgoGame, scoreCards } from '../src/game.js';
import { createDeck, cardSVG } from '../src/cards.js';

const deck = createDeck();
const get = (...ids) => ids.map(id => {
  const card = deck.find(c => c.id === id);
  assert.ok(card, `패 ${id}가 존재해야 합니다`);
  return card;
});
const rng = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

function fixture({ hand = ['1-0', '2-2'], table = ['1-2'], draw = '3-2', captured = [[], []], opponent = ['4-2'] } = {}) {
  const game = new MatgoGame({ rng: rng(1) });
  Object.assign(game.state, {
    hands: [get(...hand), get(...opponent)], table: get(...table), deck: get(draw), captured: captured.map(ids => get(...ids)),
    phase: 'playing', turn: 0, result: null, events: [], go: [0, 0], thresholds: [6, 6], passes: [0, 0], shakes: [0, 0],
    shaken: [[], []], ppeoks: [0, 0], ppeokOwners: {}, lastTurn: null, pending: null,
  });
  return game;
}

test('48장의 패가 고유하며 한국 화투의 11월 오동·12월 비를 사용한다', () => {
  assert.equal(deck.length, 48);
  assert.equal(new Set(deck.map(c => c.id)).size, 48);
  for (let month = 1; month <= 12; month++) assert.equal(deck.filter(c => c.month === month).length, 4);
  assert.equal(deck.filter(c => c.type === 'bright').length, 5);
  assert.equal(get('11-0')[0].name, '11월 오동 광');
  assert.equal(get('12-0')[0].group, 'rain');
  for (const c of deck) assert.match(cardSVG(c), /^<svg/);
});

test('광·비광·오광 점수가 정확하다', () => {
  assert.equal(scoreCards(get('1-0', '3-0')).total, 0);
  assert.equal(scoreCards(get('1-0', '3-0', '8-0')).total, 3);
  assert.equal(scoreCards(get('1-0', '3-0', '12-0')).total, 2);
  assert.equal(scoreCards(get('1-0', '3-0', '8-0', '12-0')).total, 4);
  assert.equal(scoreCards(get('1-0', '3-0', '8-0', '11-0', '12-0')).total, 15);
});

test('고도리, 홍단·청단·초단과 기본 장수 점수를 합산한다', () => {
  assert.equal(scoreCards(get('2-0', '4-0', '8-1')).total, 5);
  assert.equal(scoreCards(get('2-0', '4-0', '8-1', '5-0', '6-0')).total, 6);
  assert.equal(scoreCards(get('1-1', '2-1', '3-1')).total, 3);
  assert.equal(scoreCards(get('6-1', '9-1', '10-1')).total, 3);
  assert.equal(scoreCards(get('4-1', '5-1', '7-1')).total, 3);
  assert.equal(scoreCards(get('4-1', '5-1', '12-2')).total, 0);
  assert.equal(scoreCards(get('1-1', '2-1', '3-1', '6-1', '9-1', '10-1')).total, 8);
});

test('쌍피와 국진을 피 두 장으로 센다', () => {
  const pi = deck.filter(c => c.type === 'pi' && c.pi === 1).slice(0, 8);
  assert.equal(scoreCards(pi).total, 0);
  assert.equal(scoreCards([...pi, ...get('9-0')]).total, 1);
  assert.equal(scoreCards([...pi, ...get('9-0', '11-1')]).total, 3);
});

test('한 장을 낸 뒤 더미 한 장을 뒤집고 먹는다', () => {
  const game = fixture({ table: ['1-2', '3-3'] });
  assert.equal(game.play('1-0'), true);
  assert.deepEqual(game.state.captured[0].map(c => c.id).sort(), ['1-0', '1-2', '3-2', '3-3']);
  assert.equal(game.state.deck.length, 0);
  assert.equal(game.state.turn, 1);
});

test('먹을 패 두 장일 때 손패 단계에서 선택하고 이어서 뒤집는다', () => {
  const game = fixture({ table: ['1-2', '1-3', '3-3'] });
  game.play('1-0');
  assert.equal(game.state.phase, 'choice');
  assert.equal(game.choose('3-3'), false);
  assert.equal(game.choose('1-3'), true);
  assert.deepEqual(game.state.table.map(c => c.id), ['1-2']);
  assert.equal(game.state.captured[0].length, 4);
});

test('뒤집은 패의 먹을 패 두 장도 선택할 수 있다', () => {
  const game = fixture({ table: ['1-2', '3-1', '3-3'] });
  game.play('1-0');
  assert.equal(game.state.phase, 'choice');
  assert.equal(game.state.pending.stage, 'draw');
  game.choose('3-1');
  assert.deepEqual(game.state.table.map(c => c.id), ['3-3']);
});

test('뻑은 세 장을 남기고, 자뻑은 상대 피 두 장을 가져온다', () => {
  const game = fixture({ draw: '1-1', captured: [[], ['2-3', '3-3', '4-3']] });
  game.play('1-0');
  assert.equal(game.state.table.length, 3);
  assert.equal(game.state.captured[0].length, 0);
  assert.equal(game.state.ppeokOwners[1], 0);
  assert.equal(game.state.ppeoks[0], 1);
  game.state.turn = 0;
  game.state.hands[0] = get('1-3', '5-3');
  game.state.deck = get('6-3');
  game.play('1-3');
  assert.equal(game.state.captured[0].length, 6);
  assert.equal(game.state.captured[1].length, 1);
  assert.equal(game.state.ppeokOwners[1], undefined);
});

test('따닥은 네 장을 먹고 상대 피를 가져온다', () => {
  const game = fixture({ table: ['1-2', '1-3', '4-1'], draw: '1-1', captured: [[], ['2-3']] });
  game.play('1-0');
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.captured[0].length, 5);
  assert.equal(game.state.captured[1].length, 0);
  assert.ok(game.state.lastTurn.labels.includes('따닥'));
});

test('쪽과 판쓸이는 피를 가져오며 마지막 패의 특수 보상은 제외한다', () => {
  const jjok = fixture({ table: ['4-1'], draw: '1-2', captured: [[], ['2-3']] });
  jjok.play('1-0');
  assert.ok(jjok.state.lastTurn.labels.includes('쪽'));
  assert.equal(jjok.state.captured[0].length, 3);
  const sweep = fixture({ table: ['1-2', '3-3'], captured: [[], ['2-3']] });
  sweep.play('1-0');
  assert.ok(sweep.state.lastTurn.labels.includes('판쓸이'));
  const last = fixture({ hand: ['1-0'], table: ['4-1'], draw: '1-2', captured: [[], ['2-3']] });
  last.play('1-0');
  assert.equal(last.state.captured[0].length, 2);
  assert.ok(!last.state.lastTurn.labels.includes('쪽'));
  const lastPpeok = fixture({ hand: ['1-0'], draw: '1-1' });
  lastPpeok.play('1-0');
  assert.equal(lastPpeok.state.captured[0].length, 3);
  assert.equal(lastPpeok.state.ppeoks[0], 0);
});

test('폭탄은 세 장을 내고 빈 턴 두 번을 보존한다', () => {
  const game = fixture({ hand: ['1-0', '1-1', '1-2', '2-2'], table: ['1-3', '4-1'], draw: '5-2', captured: [[], ['3-3']] });
  const before = game.slots(0);
  assert.deepEqual(game.bombOptions(0), [1]);
  game.play('1-0', { bomb: true });
  assert.equal(game.state.hands[0].length, 1);
  assert.equal(game.state.passes[0], 2);
  assert.equal(game.slots(0), before - 1);
  assert.equal(game.state.shakes[0], 1);
  assert.equal(game.state.captured[0].length, 5);
  game.state.turn = 0;
  game.state.deck = get('6-2');
  game.play('pass');
  assert.equal(game.state.passes[0], 1);
  assert.equal(game.state.hands[0].length, 1);
});

test('흔들기는 동일 월 세 장에만 허용하고 중복 선언을 막는다', () => {
  const game = fixture({ hand: ['1-0', '1-1', '1-2', '2-2'], table: ['4-1'] });
  assert.equal(game.shake(2), false);
  assert.equal(game.shake(1), true);
  assert.equal(game.shake(1), false);
  assert.equal(game.state.shakes[0], 1);
});

test('7점에서 선택하며 고 뒤에는 획득 점수가 올라야 다시 선택한다', () => {
  const captured = get('1-1', '2-1', '3-1', '6-1', '9-1', '10-1');
  const game = fixture({ hand: ['4-2', '5-2', '7-2'], table: ['4-3'], draw: '8-2' });
  game.state.captured[0] = captured;
  game.play('4-2');
  assert.equal(game.state.phase, 'decision');
  assert.equal(game.decide(true), true);
  assert.equal(game.state.go[0], 1);
  assert.equal(game.state.thresholds[0], 8);
  game.state.turn = 0;
  game.state.deck = get('8-3');
  game.play('5-2');
  assert.equal(game.state.phase, 'playing');
});

test('3고 보너스와 모든 승리 배율을 중복 적용한다', () => {
  const game = fixture();
  game.state.captured[0] = [...get('1-0', '3-0', '8-0'), ...deck.filter(c => c.type === 'animal').slice(0, 7), ...deck.filter(c => c.type === 'pi').slice(0, 12)];
  game.state.captured[1] = [];
  game.state.go = [3, 1]; game.state.shakes[0] = 1; game.state.carry = 2;
  const settlement = game.settlement(0);
  assert.equal(settlement.multiplier, 128);
  assert.equal(settlement.total, (game.score(0).total + 3) * 128);
  assert.deepEqual(settlement.factors.map(f => f.name), ['3고', '흔들기·폭탄', '피박', '광박', '멍따', '고박', '나가리 배판']);
});

test('세 번 뻑은 7점 즉시 승리하고 총통은 10점이다', () => {
  const game = fixture({ draw: '1-1' });
  game.state.ppeoks[0] = 2;
  game.play('1-0');
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.result.winner, 0);
  assert.equal(game.state.result.total, 7);
  game.finish(1, '총통', 10);
  assert.equal(game.state.result.total, 10);
});

test('실제 패 나누기에서 손패 총통을 감지하고 자동으로 승리 처리한다', () => {
  const seeded = rng(71);
  const first = new MatgoGame({ rng: seeded });
  assert.equal(first.state.phase, 'playing');
  const next = new MatgoGame({ rng: seeded });
  assert.equal(next.state.phase, 'finished');
  assert.equal(next.state.result.reason, '총통');
  assert.equal(next.state.result.winner, 0);
  assert.equal(next.state.result.total, 10);
});

test('유효하지 않은 입력이 게임 상태를 바꾸지 않는다', () => {
  const game = fixture();
  const before = JSON.stringify(game.state);
  assert.equal(game.play('unknown'), false);
  assert.equal(game.play('pass'), false);
  assert.equal(game.play('1-0', { bomb: true }), false);
  assert.equal(game.choose('1-2'), false);
  assert.equal(game.decide(false), false);
  assert.equal(JSON.stringify(game.state), before);
});

function assertConservation(game) {
  const s = game.state;
  const cards = [...s.hands.flat(), ...s.captured.flat(), ...s.table, ...s.deck];
  const tx = s.pending;
  if (tx) {
    cards.push(...tx.taken);
    const included = new Set(cards.map(c => c.id));
    for (const card of [...tx.played, ...(tx.drawn ? [tx.drawn] : [])]) {
      if (!included.has(card.id)) { cards.push(card); included.add(card.id); }
    }
  }
  assert.equal(cards.length, 48, '모든 패가 보존되어야 합니다');
  assert.equal(new Set(cards.map(c => c.id)).size, 48, '패가 중복되지 않아야 합니다');
  assert.equal(s.hands[0].length + s.hands[1].length + s.passes[0] + s.passes[1], s.deck.length, '남은 턴과 더미 장수가 일치해야 합니다');
}

test('시드가 다른 600판에서 패 보존, 선택, AI와 정상 종료를 검증한다', () => {
  const outcomes = new Set();
  let decisions = 0, bombs = 0, choices = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const game = new MatgoGame({ rng: rng(seed), difficulty: ['easy', 'normal', 'hard'][seed % 3], dealer: seed % 2 });
    let steps = 0;
    while (game.state.phase !== 'finished') {
      assert.ok(steps++ < 90, `시드 ${seed}에서 게임이 멈추면 안 됩니다`);
      assertConservation(game);
      const s = game.state;
      if (s.phase === 'choice') choices++;
      if (s.phase === 'decision') decisions++;
      if (s.turn === 1) assert.equal(game.aiAction(), true);
      else if (s.phase === 'choice') game.choose(game.bestChoice());
      else if (s.phase === 'decision') game.decide(seed % 4 !== 0 && s.go[0] < 3 && game.slots(0) > 1);
      else {
        for (const month of game.shakeOptions()) game.shake(month);
        const move = game.recommend();
        if (move.bomb) bombs++;
        assert.equal(game.play(move.id, { bomb: !!move.bomb }), true);
      }
    }
    assertConservation(game);
    outcomes.add(game.state.result.winner);
    assert.ok(Number.isFinite(game.state.result.total));
  }
  assert.deepEqual([...outcomes].sort(), [0, 1, null]);
  assert.ok(decisions > 100 && bombs > 20 && choices > 100, '주요 분기가 반복 검증되어야 합니다');
});
