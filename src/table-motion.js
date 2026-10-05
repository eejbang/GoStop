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
