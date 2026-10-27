import * as RULES from '/shared/muehleRules.js';

export const POINT_COORDS = {
  'a7': { x: 60, y: 60 },
  'd7': { x: 300, y: 60 },
  'g7': { x: 540, y: 60 },
  'g4': { x: 540, y: 300 },
  'g1': { x: 540, y: 540 },
  'd1': { x: 300, y: 540 },
  'a1': { x: 60, y: 540 },
  'a4': { x: 60, y: 300 },

  'b6': { x: 140, y: 140 },
  'd6': { x: 300, y: 140 },
  'f6': { x: 460, y: 140 },
  'f4': { x: 460, y: 300 },
  'f2': { x: 460, y: 460 },
  'd2': { x: 300, y: 460 },
  'b2': { x: 140, y: 460 },
  'b4': { x: 140, y: 300 },

  'c5': { x: 220, y: 220 },
  'd5': { x: 300, y: 220 },
  'e5': { x: 380, y: 220 },
  'e4': { x: 380, y: 300 },
  'e3': { x: 380, y: 380 },
  'd3': { x: 300, y: 380 },
  'c3': { x: 220, y: 380 },
  'c4': { x: 220, y: 300 }
};

const HIT_RADIUS_POINTER = 28;
const HIT_RADIUS_TOUCH = 36;

// animationend never fires while the board is hidden or motion is reduced.
const LEAVE_FALLBACK_MS = 1000;
const MILL_BEAM_FALLBACK_MS = 3000;

const REJECT_FEEDBACK_MS = 600;

// prettier-ignore
const BOARD_LINES = [
  ['a7', 'd7'], ['d7', 'g7'], ['g7', 'g4'], ['g4', 'g1'],
  ['g1', 'd1'], ['d1', 'a1'], ['a1', 'a4'], ['a4', 'a7'],

  ['b6', 'd6'], ['d6', 'f6'], ['f6', 'f4'], ['f4', 'f2'],
  ['f2', 'd2'], ['d2', 'b2'], ['b2', 'b4'], ['b4', 'b6'],

  ['c5', 'd5'], ['d5', 'e5'], ['e5', 'e4'], ['e4', 'e3'],
  ['e3', 'd3'], ['d3', 'c3'], ['c3', 'c4'], ['c4', 'c5'],

  ['d7', 'd6'], ['d6', 'd5'],
  ['g4', 'f4'], ['f4', 'e4'],
  ['d1', 'd2'], ['d2', 'd3'],
  ['a4', 'b4'], ['b4', 'c4']
];

function boardLinesMarkup() {
  return BOARD_LINES.map(([from, to]) => {
    const a = POINT_COORDS[from];
    const b = POINT_COORDS[to];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="board-line" stroke-width="3.5" stroke-linecap="round"/>`;
  }).join('');
}

function gridLabelsMarkup() {
  return Object.entries(POINT_COORDS)
    .map(([pt, c]) => {
      const dy = c.y < 300 ? -18 : c.y > 300 ? 18 : 0;
      const dx = c.y === 300 ? (c.x < 300 ? -18 : 18) : 0;
      return `<text x="${c.x + dx}" y="${c.y + dy}" class="grid-label">${pt}</text>`;
    })
    .join('');
}

function pointGroupsMarkup(hitRadius) {
  return Object.entries(POINT_COORDS)
    .map(
      ([pt, c]) => `
    <g class="board-point-group" role="button" tabindex="0" aria-label="Feld ${pt}" data-point="${pt}" transform="translate(${c.x}, ${c.y})">
      <circle cx="0" cy="0" r="${hitRadius}" fill="transparent" class="hit-area" />
      <circle cx="0" cy="0" r="6" class="grid-socket" stroke-width="1.5" />
      <g class="point-markers">
        <circle cx="0" cy="0" r="16" class="dest-indicator" stroke-width="1.5" />
        <circle cx="0" cy="0" r="5" class="dest-dot" />
        <circle cx="0" cy="0" r="27" fill="none" class="selection-ring" stroke-width="2" />
        <circle cx="0" cy="0" r="26" class="removal-target" stroke-width="2" />
      </g>
    </g>
  `
    )
    .join('');
}

export class BoardRenderer {
  constructor(containerElement, onPointClick) {
    this.container = containerElement;
    this.onPointClick = onPointClick;
    this.selectedPoint = null;
    this.validDestinations = [];
    this.removablePoints = [];
    this.hitRadius = BoardRenderer.hitRadius();

    this.pieces = new Map();
    this.gameId = null;

    this.#initSvg();
  }

  #initSvg() {
    this.container.innerHTML = `
      <svg viewBox="0 0 600 600" class="muehle-svg" preserveAspectRatio="xMidYMid meet">
        <title>Mühle-Spielbrett mit 24 Feldern</title>
        <defs>
          <radialGradient id="boardGrad" cx="50%" cy="50%" r="75%">
            <stop offset="0%" class="plate-stop-start" />
            <stop offset="100%" class="plate-stop-end" />
          </radialGradient>

          <radialGradient id="whitePieceGrad" cx="34%" cy="28%" r="78%">
            <stop offset="0%" class="stone-w-stop-hi" />
            <stop offset="100%" class="stone-w-stop-lo" />
          </radialGradient>

          <radialGradient id="blackPieceGrad" cx="34%" cy="28%" r="78%">
            <stop offset="0%" class="stone-b-stop-hi" />
            <stop offset="100%" class="stone-b-stop-lo" />
          </radialGradient>

          <!-- userSpaceOnUse: a straight beam has no bounding box of its own. -->
          <filter id="goldGlow" filterUnits="userSpaceOnUse" x="0" y="0" width="600" height="600">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <rect x="12" y="12" width="576" height="576" rx="28" class="board-plate" fill="url(#boardGrad)" stroke-width="1"/>
        <rect x="26" y="26" width="548" height="548" rx="20" fill="none" class="board-plate-inner" stroke-width="1"/>

        <g id="grid-lines" class="grid-lines">${boardLinesMarkup()}</g>

        <g id="mill-glow-lines"></g>

        <g id="grid-labels" class="grid-labels" text-anchor="middle" dominant-baseline="central">${gridLabelsMarkup()}</g>

        <g id="interactive-layer">${pointGroupsMarkup(this.hitRadius)}</g>
      </svg>
    `;

    this.interactiveLayer = this.container.querySelector('#interactive-layer');
    this.millGlowLayer = this.container.querySelector('#mill-glow-lines');

    this.pointGroups = {};
    this.interactiveLayer.querySelectorAll('.board-point-group').forEach(group => {
      this.pointGroups[group.getAttribute('data-point')] = group;
    });

    this.interactiveLayer.addEventListener('click', e => {
      const pt = e.target.closest('.board-point-group')?.getAttribute('data-point');
      if (pt) this.onPointClick?.(pt);
    });

    this.#initKeyboardNavigation();
  }

  #initKeyboardNavigation() {
    const points = Array.from(this.interactiveLayer.querySelectorAll('.board-point-group')).map(group => {
      const pt = group.getAttribute('data-point');
      return { element: group, point: pt, ...POINT_COORDS[pt] };
    });

    const focusPoint = pt => {
      const group = this.pointGroups[pt];
      if (group) group.focus();
    };

    const moveFocus = (dx, dy) => {
      const active = document.activeElement;
      if (!active || !active.classList.contains('board-point-group')) return;
      const current = points.find(p => p.element === active);
      if (!current) return;

      const candidates = points.filter(p => {
        if (dx > 0) return p.x > current.x;
        if (dx < 0) return p.x < current.x;
        if (dy > 0) return p.y > current.y;
        return p.y < current.y;
      });

      if (candidates.length === 0) {
        const ordered = points.slice().sort((a, b) => a.y - b.y || a.x - b.x);
        const index = ordered.findIndex(p => p.point === current.point);
        const step = dx > 0 || dy > 0 ? 1 : -1;
        focusPoint(ordered[(index + step + ordered.length) % ordered.length].point);
        return;
      }

      let best = candidates[0];
      let bestDist = Math.abs(best.x - current.x) + Math.abs(best.y - current.y);
      for (const cand of candidates.slice(1)) {
        const dist = Math.abs(cand.x - current.x) + Math.abs(cand.y - current.y);
        if (dist < bestDist) {
          best = cand;
          bestDist = dist;
        }
      }
      focusPoint(best.point);
    };

    this.interactiveLayer.addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        const pt = e.target.closest('.board-point-group')?.getAttribute('data-point');
        if (pt) this.onPointClick?.(pt);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFocus(-1, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFocus(1, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(0, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(0, 1);
      }
    });
  }

  render(gameState, playerColor, selectedPoint = null, validDestinations = []) {
    this.selectedPoint = selectedPoint;
    this.validDestinations = validDestinations;
    this.removablePoints = RULES.getCaptureTargets(gameState, playerColor);

    const isMyTurn = gameState.turn === playerColor && !RULES.isGameOver(gameState);
    const canSelect = isMyTurn && gameState.phase === 'MOVING' && !gameState.awaitingRemoval;

    this.#syncPieces(gameState);

    Object.keys(POINT_COORDS).forEach(pt => {
      const isRemovable = this.removablePoints.includes(pt);

      const group = this.pointGroups[pt];
      group.classList.toggle('is-destination', this.validDestinations.includes(pt));
      group.classList.toggle('is-selected', this.selectedPoint === pt);
      group.classList.toggle('is-capturable', isRemovable);

      const piece = this.pieces.get(pt);
      if (piece) {
        piece.el.classList.toggle('piece-selectable', canSelect && piece.color === playerColor);
        piece.el.classList.toggle('piece-removable', isRemovable);
      }
    });
  }

  #syncPieces(gameState) {
    const board = gameState.board;
    const sameGame = gameState.gameId === this.gameId;

    if (!sameGame) {
      this.interactiveLayer.querySelectorAll('.game-piece').forEach(el => el.remove());
      this.pieces.clear();
      this.millGlowLayer.replaceChildren();
      this.gameId = gameState.gameId;
    }

    const shown = {};
    this.pieces.forEach((piece, pt) => {
      shown[pt] = piece.color;
    });
    const { moved, placed, removed } = RULES.diffBoards(shown, board);

    if (moved) {
      this.#removePiece(moved.from, false);
      this.#addPiece(moved.to, board[moved.to], { from: moved.from });
    }
    removed.forEach(pt => this.#removePiece(pt, sameGame));
    placed.forEach(pt => this.#addPiece(pt, board[pt], sameGame ? { enter: true } : {}));
  }

  #addPiece(pt, color, { from = null, enter = false } = {}) {
    const group = this.pointGroups[pt];
    const isWhite = color === 'W';
    const fillGrad = isWhite ? 'url(#whitePieceGrad)' : 'url(#blackPieceGrad)';

    if (from) {
      this.interactiveLayer.append(group);
    }

    group.insertAdjacentHTML(
      'beforeend',
      `
      <g class="game-piece ${isWhite ? 'piece-white' : 'piece-black'}">
        <circle cx="0" cy="0" r="21" class="stone-body" fill="${fillGrad}" stroke-width="1"/>
        <ellipse cx="-5.5" cy="-7.5" rx="7.5" ry="4.5" class="stone-gloss" transform="rotate(-30 -5.5 -7.5)"/>
      </g>
    `
    );
    const el = group.lastElementChild;

    if (from) {
      el.style.setProperty('--travel-x', `${POINT_COORDS[from].x - POINT_COORDS[pt].x}px`);
      el.style.setProperty('--travel-y', `${POINT_COORDS[from].y - POINT_COORDS[pt].y}px`);
      BoardRenderer.#playOnce(el, 'piece-arriving');
    } else if (enter) {
      BoardRenderer.#playOnce(el, 'piece-entering');
    }

    this.pieces.set(pt, { color, el });
  }

  #removePiece(pt, animate) {
    const piece = this.pieces.get(pt);
    if (!piece) return;
    this.pieces.delete(pt);

    const { el } = piece;
    if (!animate) {
      el.remove();
      return;
    }
    el.classList.add('piece-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), LEAVE_FALLBACK_MS);
  }

  static #playOnce(el, className) {
    el.classList.add(className);
    el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
  }

  rejectPoint(pt) {
    const group = this.pointGroups[pt];
    if (!group) return;
    group.classList.add('is-rejected');
    setTimeout(() => group.classList.remove('is-rejected'), REJECT_FEEDBACK_MS);
  }

  static hitRadius() {
    return window.matchMedia('(pointer: coarse)').matches ? HIT_RADIUS_TOUCH : HIT_RADIUS_POINTER;
  }

  highlightMill(millPoints) {
    if (!millPoints || millPoints.length < 3) {
      this.millGlowLayer.replaceChildren();
      return;
    }

    const c1 = POINT_COORDS[millPoints[0]];
    const c2 = POINT_COORDS[millPoints[2]];

    this.millGlowLayer.insertAdjacentHTML(
      'beforeend',
      `
      <line x1="${c1.x}" y1="${c1.y}" x2="${c2.x}" y2="${c2.y}"
            stroke-width="6" stroke-linecap="round"
            filter="url(#goldGlow)" class="mill-gold-beam" />
    `
    );
    const beam = this.millGlowLayer.lastElementChild;
    beam.addEventListener('animationend', () => beam.remove(), { once: true });
    setTimeout(() => beam.remove(), MILL_BEAM_FALLBACK_MS);
  }
}
