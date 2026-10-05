import { cardSVG, cardBackSVG } from './cards.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const point = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** 화면의 실제 패 위치를 이용해 내기 → 뒤집기 → 먹기 순서로 보여 줍니다. */
export class TableMotion {
  constructor({ speed, sound }) {
    this.speed = speed;
    this.sound = sound;
  }

  get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  get duration() { return this.speed() === 'fast' ? 180 : 350; }
  wait(ms = 120) { return pause(this.reduced ? 0 : this.speed() === 'fast' ? ms / 2 : ms); }

  async fly(card, from, to, { flip = false, take = false, offset = 0 } = {}) {
    if (!from || !to) return;
    if (this.reduced) { if (!take) this.sound('slap'); return; }
    const start = point(from), end = point(to);
    const width = take ? from.width : to.width, height = width * 1.5;
    const captureScale = Math.min(1, to.width / width);
    const ghost = document.createElement('div');
    ghost.className = `card-flight${take ? ' capture-flight' : ''}`;
    ghost.dataset.cardId = card.id;
    ghost.dataset.motion = take ? 'capture' : flip ? 'flip' : 'slap';
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    ghost.innerHTML = flip ? cardBackSVG : cardSVG(card);
    document.body.append(ghost);
    const transform = (p, scale = 1, rotation = 0, flipAngle = 0) => `translate(${p.x - width / 2}px, ${p.y - height / 2}px) rotate(${rotation}deg) scale(${scale}) rotateY(${flipAngle}deg)`;
    try {
      if (flip) {
        this.sound('flip');
        await ghost.animate([{ transform: transform(start) }, { transform: transform(start, 1.1, -5, 90) }], { duration: this.duration / 2, fill: 'forwards', easing: 'ease-in' }).finished;
        ghost.innerHTML = cardSVG(card);
        await ghost.animate([{ transform: transform(start, 1.1, -5, -90) }, { transform: transform(start, 1.1, -5) }], { duration: this.duration / 2, fill: 'forwards', easing: 'ease-out' }).finished;
      }
      const destination = { x: end.x + offset, y: end.y + offset / 2 };
      await ghost.animate(take ? [
        { transform: transform(start, 1, 0), opacity: 1 },
        { transform: transform({ x: (start.x + destination.x) / 2, y: (start.y + destination.y) / 2 - 30 }, .9, -8), opacity: 1, offset: .5 },
        { transform: transform(destination, captureScale, 4), opacity: .3 },
      ] : [
        { transform: transform(start, flip ? 1.1 : from.width / width, -8), filter: 'drop-shadow(0 8px 6px #0006)' },
        { transform: transform({ x: (start.x + destination.x) / 2, y: (start.y + destination.y) / 2 - 24 }, 1.16, 4), offset: .6 },
        { transform: transform(destination, .96, -2), offset: .91 },
        { transform: transform(destination, 1, -2), filter: 'drop-shadow(1px 2px 1px #0005)' },
      ], { duration: this.duration, fill: 'forwards', easing: take ? 'ease-in' : 'cubic-bezier(.16,.7,.35,1)' }).finished;
      if (!take) { this.sound('slap'); this.impact(destination); }
    } finally { ghost.remove(); }
  }

  impact({ x, y }) {
    if (this.reduced) return;
    const ring = document.createElement('div');
    ring.className = 'card-impact'; ring.style.left = `${x}px`; ring.style.top = `${y}px`;
    document.body.append(ring);
    const animation = ring.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: .6 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], { duration: 260, fill: 'forwards' });
    animation.finished.finally(() => ring.remove());
  }

  /** 패가 모인 자리에서 특수 상황을 보여 준 뒤 먹는 동작으로 이어집니다. */
  async special(kind, rect, cards = []) {
    const effects = {
      '폭탄': { key: 'bomb', caption: '세 장 폭탄!', detail: '같은 월 네 장 획득', color: '#ffcc57' },
      '뻑': { key: 'ppeok', caption: '뻑!', detail: '세 장이 바닥에 남아요', color: '#ff735f' },
      '따닥': { key: 'ttadak', caption: '따닥!', detail: '같은 월 네 장 획득', color: '#a4f4df' },
      '모아먹기': { key: 'gather', title: '한 번에!', caption: '바닥 세 장 + 한 장', detail: '같은 월 네 장 획득', color: '#ffe2a0' },
    };
    const effect = effects[kind];
    if (!effect || !rect) return;
    const center = point(rect), size = Math.min(280, innerWidth - 24);
    const x = Math.max(size / 2 + 12, Math.min(innerWidth - size / 2 - 12, center.x));
    const y = Math.max(100, Math.min(innerHeight - 100, center.y));
    const layer = document.createElement('div');
    layer.className = `turn-effect effect-${effect.key}${this.reduced ? ' effect-static' : ''}`;
    layer.dataset.effect = kind;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = `${x}px`; layer.style.top = `${y}px`;
    layer.style.setProperty('--effect-color', effect.color);
    const burst = '<svg class="effect-burst" viewBox="0 0 240 240"><path d="M120 4 139 64 184 21 174 83 236 75 191 119 236 163 174 155 184 217 139 174 120 236 101 174 56 217 66 155 4 163 49 119 4 75 66 83 56 21 101 64Z"/></svg>';
    layer.innerHTML = `${burst}<i class="effect-ring"></i><i class="effect-ring effect-ring-second"></i><div class="effect-stamp"><small>${effect.caption}</small><strong>${effect.title || kind}${kind === '폭탄' ? '!' : ''}</strong><span>${effect.detail}</span></div>${Array.from({ length: 12 }, (_, i) => `<i class="effect-spark" style="--spark-angle:${i * 30}deg"></i>`).join('')}`;
    document.body.append(layer);
    this.sound('special');
    try {
      if (this.reduced) { await pause(450); return; }
      const duration = this.speed() === 'fast' ? 700 : 950;
      const stamp = layer.querySelector('.effect-stamp');
      const frames = kind === '뻑' ? [
        { transform: 'scale(2) rotate(-20deg)', opacity: 0 },
        { transform: 'scale(.92) rotate(-10deg)', opacity: 1, offset: .2 },
        { transform: 'scale(1) rotate(-10deg)', opacity: 1, offset: .75 },
        { transform: 'scale(1.05) rotate(-10deg)', opacity: 0 },
      ] : kind === '따닥' ? [
        { transform: 'scale(.5) rotate(4deg)', opacity: 0 },
        { transform: 'scale(1.12) rotate(-4deg)', opacity: 1, offset: .18 },
        { transform: 'scale(.94) rotate(3deg)', opacity: 1, offset: .28 },
        { transform: 'scale(1.12) rotate(-3deg)', opacity: 1, offset: .4 },
        { transform: 'scale(1)', opacity: 1, offset: .78 },
        { transform: 'scale(1.1)', opacity: 0 },
      ] : [
        { transform: 'scale(.3)', opacity: 0 },
        { transform: 'scale(1.2) rotate(-4deg)', opacity: 1, offset: .22 },
        { transform: 'scale(1)', opacity: 1, offset: .78 },
        { transform: 'scale(1.15)', opacity: 0 },
      ];
      const animations = [stamp.animate(frames, { duration, fill: 'forwards' })];
      layer.querySelectorAll('.effect-ring').forEach((ring, i) => animations.push(ring.animate([
        { transform: 'scale(.25)', opacity: .9 }, { transform: 'scale(1.3)', opacity: 0 },
      ], { duration: duration * .7, delay: i * 130, fill: 'both', easing: 'ease-out' })));
      animations.push(layer.querySelector('.effect-burst').animate([
        { transform: 'scale(.2) rotate(-12deg)', opacity: 0 },
        { transform: 'scale(1) rotate(6deg)', opacity: .9, offset: .25 },
        { transform: 'scale(1.2) rotate(12deg)', opacity: 0 },
      ], { duration, fill: 'forwards' }));
      layer.querySelectorAll('.effect-spark').forEach((spark, i) => {
        const angle = i * Math.PI / 6;
        animations.push(spark.animate([
          { transform: `translate(-50%,-50%) rotate(${i * 30}deg) scale(.3)`, opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * size * .48}px),calc(-50% + ${Math.sin(angle) * size * .48}px)) rotate(${i * 30}deg) scale(1)`, opacity: 0 },
        ], { duration: duration * .8, fill: 'forwards', easing: 'ease-out' }));
      });
      for (const card of cards) animations.push(card.animate([
        { filter: `drop-shadow(0 0 2px ${effect.color})` },
        { filter: `drop-shadow(0 0 18px ${effect.color})`, offset: .35 },
        { filter: 'drop-shadow(1px 3px 3px #0005)' },
      ], { duration: duration * .8 }));
      if (kind === '폭탄') {
        const field = document.querySelector('.table-field');
        if (field) animations.push(field.animate([
          { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
        ], { duration: 250, delay: 80 }));
      }
      await Promise.allSettled(animations.map(animation => animation.finished));
    } finally { layer.remove(); }
  }

  async collect(cards, positions, player) {
    if (!cards.length) return;
    this.sound('collect');
    await Promise.all(cards.map((card, index) => {
      const pile = document.querySelector(`#${player ? 'opponent' : 'my'}-captures [data-type="${card.type}"]`);
      const target = pile?.querySelector('.captured-mini:last-child') || pile?.querySelector('.capture-placeholder');
      return this.fly(card, positions.get(card.id), target?.getBoundingClientRect(), { take: true, offset: index % 3 * 2 });
    }));
  }
}
