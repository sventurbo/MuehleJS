/**
 * boardRenderer.js
 * Crisp SVG board renderer for Mühle.
 * Manages coordinates, pieces, selection highlights, valid move markers, and mill effects.
 *
 * Colours live in css/style.css. Gradient stops are addressed by class so the
 * board follows the active light/dark theme instead of hardcoding hex values.
 *
 * The board's DOM is built once and then patched: every stone keeps its SVG
 * node for as long as it stays on its point. Only that lets CSS animate a stone
 * at all — a freshly inserted node has no previous state to transition from.
 */

const POINT_COORDS = {
  // Outer square
  'a7': { x: 60, y: 60 },
  'd7': { x: 300, y: 60 },
  'g7': { x: 540, y: 60 },
  'g4': { x: 540, y: 300 },
  'g1': { x: 540, y: 540 },
  'd1': { x: 300, y: 540 },
  'a1': { x: 60, y: 540 },
  'a4': { x: 60, y: 300 },

  // Middle square
  'b6': { x: 140, y: 140 },
  'd6': { x: 300, y: 140 },
  'f6': { x: 460, y: 140 },
  'f4': { x: 460, y: 300 },
  'f2': { x: 460, y: 460 },
  'd2': { x: 300, y: 460 },
  'b2': { x: 140, y: 460 },
  'b4': { x: 140, y: 300 },

  // Inner square
  'c5': { x: 220, y: 220 },
  'd5': { x: 300, y: 220 },
  'e5': { x: 380, y: 220 },
  'e4': { x: 380, y: 300 },
  'e3': { x: 380, y: 380 },
  'd3': { x: 300, y: 380 },
  'c3': { x: 220, y: 380 },
  'c4': { x: 220, y: 300 }
};

/* Radius of the invisible tap/click target around each intersection, in SVG
   user units. Neighbouring points are 80 units apart, so 36 still leaves the
   targets disjoint while giving a fingertip roughly 44 CSS px on a phone. */
const HIT_RADIUS_POINTER = 28;
const HIT_RADIUS_TOUCH = 36;

/* A captured stone is removed on `animationend`. That event never fires while
   the board is hidden, so the node is dropped after this long regardless. */
const LEAVE_FALLBACK_MS = 1000;

const BOARD_LINES = [
  // Outer square
  ['a7', 'd7'], ['d7', 'g7'], ['g7', 'g4'], ['g4', 'g1'],
  ['g1', 'd1'], ['d1', 'a1'], ['a1', 'a4'], ['a4', 'a7'],

  // Middle square
  ['b6', 'd6'], ['d6', 'f6'], ['f6', 'f4'], ['f4', 'f2'],
  ['f2', 'd2'], ['d2', 'b2'], ['b2', 'b4'], ['b4', 'b6'],

  // Inner square
  ['c5', 'd5'], ['d5', 'e5'], ['e5', 'e4'], ['e4', 'e3'],
  ['e3', 'd3'], ['d3', 'c3'], ['c3', 'c4'], ['c4', 'c5'],

  // Cross bridges
  ['d7', 'd6'], ['d6', 'd5'], // North
  ['g4', 'f4'], ['f4', 'e4'], // East
  ['d1', 'd2'], ['d2', 'd3'], // South
  ['a4', 'b4'], ['b4', 'c4']  // West
];

class BoardRenderer {
  constructor(containerElement, onPointClick) {
    this.container = containerElement;
    this.onPointClick = onPointClick;
    this.selectedPoint = null;
    this.validDestinations = [];
    this.removablePoints = [];
    this.lastMillPoints = [];
    this.hitRadius = BoardRenderer.hitRadius();

    // Stones currently on screen: point -> { color, el }. Stones that are still
    // fading out after a capture are already gone from here.
    this.pieces = new Map();
    this.gameId = null;

    this._initSvg();
  }

  _initSvg() {
    this.container.innerHTML = `
      <svg viewBox="0 0 600 600" class="muehle-svg" preserveAspectRatio="xMidYMid meet">
        <title>Mühle-Spielbrett mit 24 Feldern</title>
        <defs>
          <!-- Board surface: a very subtle vignette, themed via CSS -->
          <radialGradient id="boardGrad" cx="50%" cy="50%" r="75%">
            <stop offset="0%" class="plate-stop-start" />
            <stop offset="100%" class="plate-stop-end" />
          </radialGradient>

          <!-- Stone gradients, themed via CSS -->
          <radialGradient id="whitePieceGrad" cx="34%" cy="28%" r="78%">
            <stop offset="0%" class="stone-w-stop-hi" />
            <stop offset="100%" class="stone-w-stop-lo" />
          </radialGradient>

          <radialGradient id="blackPieceGrad" cx="34%" cy="28%" r="78%">
            <stop offset="0%" class="stone-b-stop-hi" />
            <stop offset="100%" class="stone-b-stop-lo" />
          </radialGradient>

          <!-- Soft glow for the mill beam -->
          <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Board Surface Plate -->
        <rect x="12" y="12" width="576" height="576" rx="28" class="board-plate" fill="url(#boardGrad)" stroke-width="1"/>
        <rect x="26" y="26" width="548" height="548" rx="20" fill="none" class="board-plate-inner" stroke-width="1"/>

        <!-- Grid Lines Group -->
        <g id="grid-lines" class="grid-lines">
          ${BOARD_LINES.map(([p1, p2]) => {
            const c1 = POINT_COORDS[p1];
            const c2 = POINT_COORDS[p2];
            return `<line x1="${c1.x}" y1="${c1.y}" x2="${c2.x}" y2="${c2.y}" class="board-line" stroke-width="3.5" stroke-linecap="round"/>`;
          }).join('')}
        </g>

        <!-- Active Mill Glowing Lines Group -->
        <g id="mill-glow-lines"></g>

        <!-- Board Intersection Points (Base sockets) -->
        <g id="grid-nodes">
          ${Object.entries(POINT_COORDS).map(([pt, c]) => `
            <circle cx="${c.x}" cy="${c.y}" r="6" class="grid-socket" stroke-width="1.5" />
          `).join('')}
        </g>

        <!-- Coordinate Labels (subtle) -->
        <g id="grid-labels" class="grid-labels" font-size="9" text-anchor="middle" dominant-baseline="central">
          ${Object.entries(POINT_COORDS).map(([pt, c]) => {
            const dy = (c.y < 300) ? -18 : (c.y > 300 ? 18 : 0);
            const dx = (c.y === 300) ? (c.x < 300 ? -18 : 18) : 0;
            return `<text x="${c.x + dx}" y="${c.y + dy}" class="grid-label">${pt}</text>`;
          }).join('')}
        </g>

        <!-- Interactive Pieces and Target Markers Layer -->
        <g id="interactive-layer">
          ${Object.entries(POINT_COORDS).map(([pt, c]) => `
            <g class="board-point-group" data-point="${pt}" transform="translate(${c.x}, ${c.y})" style="cursor: pointer;">
              <!-- Transparent wide hit area for easy clicking / tapping -->
              <circle cx="0" cy="0" r="${this.hitRadius}" fill="transparent" class="hit-area" />
              <!-- Destination, selection and capture markers; the stone follows -->
              <g class="point-markers"></g>
            </g>
          `).join('')}
        </g>
      </svg>
    `;

    this.interactiveLayer = this.container.querySelector('#interactive-layer');
    this.millGlowLayer = this.container.querySelector('#mill-glow-lines');

    this.pointGroups = {};
    this.markerLayers = {};
    this.interactiveLayer.querySelectorAll('.board-point-group').forEach(group => {
      const pt = group.getAttribute('data-point');
      this.pointGroups[pt] = group;
      this.markerLayers[pt] = group.querySelector('.point-markers');
    });

    // One delegated listener: the groups outlive every render, and a stone that
    // is still fading out lets the click through to its point.
    this.interactiveLayer.addEventListener('click', (e) => {
      const group = e.target.closest('.board-point-group');
      const pt = group && group.getAttribute('data-point');
      if (pt && this.onPointClick) {
        this.onPointClick(pt);
      }
    });
  }

  /**
   * Updates the board display with the given game state.
   *
   * The capture targets are derived from `gameState` here rather than passed in,
   * so a `.removal-target` ring can never outlive the state it was computed
   * from: the click handler in app.js asks the same function with the same
   * state and therefore always accepts what the board shows.
   */
  render(gameState, playerColor, selectedPoint = null, validDestinations = []) {
    this.selectedPoint = selectedPoint;
    this.validDestinations = validDestinations;
    this.removablePoints = window.MuehleRules.getCaptureTargets(gameState, playerColor);

    const isMyTurn = gameState.turn === playerColor && !gameState.winner;
    const canSelect = isMyTurn && gameState.phase === 'MOVING' && !gameState.awaitingRemoval;

    this._syncPieces(gameState);

    Object.keys(POINT_COORDS).forEach(pt => {
      const isRemovable = this.removablePoints.includes(pt);
      let markersHtml = '';

      // 1. Valid destination: a calm concentric ring plus a solid centre dot
      if (this.validDestinations.includes(pt)) {
        markersHtml += `
          <circle cx="0" cy="0" r="16" class="dest-indicator" stroke-width="1.5" />
          <circle cx="0" cy="0" r="5" class="dest-dot" />
        `;
      }

      // 2. Selected stone: a single solid accent ring
      if (this.selectedPoint === pt) {
        markersHtml += `
          <circle cx="0" cy="0" r="27" fill="none" class="selection-ring" stroke-width="2" />
        `;
      }

      // 3. Removable opponent piece: a tinted target ring
      if (isRemovable) {
        markersHtml += `
          <circle cx="0" cy="0" r="26" class="removal-target" stroke-width="2" />
        `;
      }

      this.markerLayers[pt].innerHTML = markersHtml;

      // 4. Stone state. Toggled on the existing node, never by rewriting its
      //    class attribute, which would cut short a running entry animation.
      const piece = this.pieces.get(pt);
      if (piece) {
        piece.el.classList.toggle('piece-selectable', canSelect && piece.color === playerColor);
        piece.el.classList.toggle('piece-removable', isRemovable);
      }
    });
  }

  /**
   * Brings the stones on screen in line with `gameState.board`, touching only
   * the points that changed: a placed stone pops in, a moved stone travels from
   * its old point, a captured stone fades out. A new game starts from a clean
   * board instead of animating the previous game's stones away.
   */
  _syncPieces(gameState) {
    const board = gameState.board;
    const sameGame = gameState.gameId === this.gameId;

    if (!sameGame) {
      this.interactiveLayer.querySelectorAll('.game-piece').forEach(el => el.remove());
      this.pieces.clear();
      this.gameId = gameState.gameId;
    }

    const shown = {};
    this.pieces.forEach((piece, pt) => { shown[pt] = piece.color; });
    const { moved, placed, removed } = window.MuehleRules.diffBoards(shown, board);

    if (moved) {
      this._removePiece(moved.from, false);
      this._addPiece(moved.to, board[moved.to], { from: moved.from });
    }
    removed.forEach(pt => this._removePiece(pt, sameGame));
    placed.forEach(pt => this._addPiece(pt, board[pt], sameGame ? { enter: true } : {}));
  }

  /**
   * Puts a stone on `pt`. `from` makes it travel there from another point,
   * `enter` lets it pop in; with neither it simply appears.
   */
  _addPiece(pt, color, { from = null, enter = false } = {}) {
    const group = this.pointGroups[pt];
    const isWhite = color === 'W';
    const fillGrad = isWhite ? 'url(#whitePieceGrad)' : 'url(#blackPieceGrad)';

    if (from) {
      // Paint the travelling stone above every point it crosses on the way.
      this.interactiveLayer.appendChild(group);
    }

    group.insertAdjacentHTML('beforeend', `
      <g class="game-piece ${isWhite ? 'piece-white' : 'piece-black'}">
        <!-- Stone body -->
        <circle cx="0" cy="0" r="21" class="stone-body" fill="${fillGrad}" stroke-width="1"/>
        <!-- Single specular highlight -->
        <ellipse cx="-5.5" cy="-7.5" rx="7.5" ry="4.5" class="stone-gloss" transform="rotate(-30 -5.5 -7.5)"/>
      </g>
    `);
    const el = group.lastElementChild;

    if (from) {
      // Start offset in local user units; the keyframes glide it back to 0.
      el.style.setProperty('--travel-x', `${POINT_COORDS[from].x - POINT_COORDS[pt].x}px`);
      el.style.setProperty('--travel-y', `${POINT_COORDS[from].y - POINT_COORDS[pt].y}px`);
      BoardRenderer._playOnce(el, 'piece-arriving');
    } else if (enter) {
      BoardRenderer._playOnce(el, 'piece-entering');
    }

    this.pieces.set(pt, { color, el });
  }

  /**
   * Takes the stone off `pt`, letting it fade out first when `animate` is set.
   * It leaves `this.pieces` immediately, so the next render already treats the
   * point as empty while the old node finishes its exit.
   */
  _removePiece(pt, animate) {
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

  /**
   * Runs the animation behind `className` once. The class is dropped again
   * afterwards so the animation cannot replay when the node is re-inserted
   * or its screen is shown again.
   */
  static _playOnce(el, className) {
    el.classList.add(className);
    el.addEventListener('animationend', () => el.classList.remove(className), { once: true });
  }

  /**
   * Coarse pointers (fingers) need a larger target than a mouse cursor.
   */
  static hitRadius() {
    const coarse = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    return coarse ? HIT_RADIUS_TOUCH : HIT_RADIUS_POINTER;
  }

  /**
   * Highlights mill lines when a mill is active or formed.
   */
  highlightMill(millPoints) {
    if (!millPoints || millPoints.length < 3) {
      this.millGlowLayer.innerHTML = '';
      return;
    }

    const c1 = POINT_COORDS[millPoints[0]];
    const c2 = POINT_COORDS[millPoints[2]];

    this.millGlowLayer.innerHTML = `
      <line x1="${c1.x}" y1="${c1.y}" x2="${c2.x}" y2="${c2.y}"
            stroke-width="6" stroke-linecap="round"
            filter="url(#goldGlow)" class="mill-gold-beam" />
    `;

    // Remove glow after the fade-out animation has finished
    setTimeout(() => {
      this.millGlowLayer.innerHTML = '';
    }, 2500);
  }
}

window.BoardRenderer = BoardRenderer;
window.POINT_COORDS = POINT_COORDS;
