/**
 * boardRenderer.js
 * Crisp SVG board renderer for Mühle.
 * Manages coordinates, pieces, selection highlights, valid move markers, and mill effects.
 *
 * Colours live in css/style.css. Gradient stops are addressed by class so the
 * board follows the active light/dark theme instead of hardcoding hex values.
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
        <g id="interactive-layer"></g>
      </svg>
    `;

    this.interactiveLayer = this.container.querySelector('#interactive-layer');
    this.millGlowLayer = this.container.querySelector('#mill-glow-lines');
  }

  /**
   * Updates the board display with the given game state.
   */
  render(gameState, playerColor, selectedPoint = null, validDestinations = [], removablePoints = []) {
    this.selectedPoint = selectedPoint;
    this.validDestinations = validDestinations;
    this.removablePoints = removablePoints;

    const board = gameState.board;
    const isMyTurn = gameState.turn === playerColor && !gameState.winner;

    // Build interactive elements
    let elementsHtml = '';

    Object.entries(POINT_COORDS).forEach(([pt, c]) => {
      const piece = board[pt];
      const isSelected = this.selectedPoint === pt;
      const isValidDest = this.validDestinations.includes(pt);
      const isRemovable = this.removablePoints.includes(pt);
      const isMyPiece = piece === playerColor;

      // Group for this point, translated to the exact intersection coordinates
      elementsHtml += `<g class="board-point-group" data-point="${pt}" transform="translate(${c.x}, ${c.y})" style="cursor: pointer;">`;

      // 1. Transparent wide hit area for easy clicking
      elementsHtml += `<circle cx="0" cy="0" r="28" fill="transparent" class="hit-area" />`;

      // 2. Valid destination: a calm concentric ring plus a solid centre dot
      if (isValidDest) {
        elementsHtml += `
          <circle cx="0" cy="0" r="16" class="dest-indicator" stroke-width="1.5" />
          <circle cx="0" cy="0" r="5" class="dest-dot" />
        `;
      }

      // 3. Selected stone: a single solid accent ring
      if (isSelected) {
        elementsHtml += `
          <circle cx="0" cy="0" r="27" fill="none" class="selection-ring" stroke-width="2" />
        `;
      }

      // 4. Removable opponent piece: a tinted target ring
      if (isRemovable) {
        elementsHtml += `
          <circle cx="0" cy="0" r="26" class="removal-target" stroke-width="2" />
        `;
      }

      // 5. Piece graphics
      if (piece) {
        const isWhite = piece === 'W';
        const fillGrad = isWhite ? 'url(#whitePieceGrad)' : 'url(#blackPieceGrad)';

        let pieceClasses = `game-piece ${isWhite ? 'piece-white' : 'piece-black'}`;
        if (isMyTurn && isMyPiece && gameState.phase === 'MOVING' && !gameState.awaitingRemoval) {
          pieceClasses += ' piece-selectable';
        }
        if (isRemovable) {
          pieceClasses += ' piece-removable';
        }

        elementsHtml += `
          <g class="${pieceClasses}">
            <!-- Stone body -->
            <circle cx="0" cy="0" r="21" class="stone-body" fill="${fillGrad}" stroke-width="1"/>
            <!-- Single specular highlight -->
            <ellipse cx="-5.5" cy="-7.5" rx="7.5" ry="4.5" class="stone-gloss" transform="rotate(-30 -5.5 -7.5)"/>
          </g>
        `;
      }

      elementsHtml += `</g>`;
    });

    this.interactiveLayer.innerHTML = elementsHtml;

    // Attach click listeners to point groups
    this.interactiveLayer.querySelectorAll('.board-point-group').forEach(el => {
      el.addEventListener('click', (e) => {
        const pt = el.getAttribute('data-point');
        if (pt && this.onPointClick) {
          this.onPointClick(pt);
        }
      });
    });
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
