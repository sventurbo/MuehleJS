/**
 * boardRenderer.js
 * Crisp SVG board renderer for Mühle.
 * Manages coordinates, pieces, selection highlights, valid move markers, and mill effects.
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
        <defs>
          <!-- Board Wood/Slate Gradient -->
          <radialGradient id="boardGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stop-color="#2a2e39" />
            <stop offset="100%" stop-color="#181b22" />
          </radialGradient>

          <!-- White Piece Realistic Gradient & Shadow -->
          <radialGradient id="whitePieceGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="40%" stop-color="#ecebf0" />
            <stop offset="85%" stop-color="#c9c8d3" />
            <stop offset="100%" stop-color="#a2a0b1" />
          </radialGradient>

          <!-- Black Piece Realistic Gradient & Shadow -->
          <radialGradient id="blackPieceGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stop-color="#4e5565" />
            <stop offset="40%" stop-color="#2a2e3a" />
            <stop offset="85%" stop-color="#15171d" />
            <stop offset="100%" stop-color="#090a0d" />
          </radialGradient>

          <!-- Drop Shadow for Pieces -->
          <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.6"/>
          </filter>

          <!-- Glow for Mill -->
          <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <!-- Glow for Valid Move Targets -->
          <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Board Surface Plate -->
        <rect x="15" y="15" width="570" height="570" rx="24" class="board-plate" fill="url(#boardGrad)" stroke-width="4"/>
        <rect x="25" y="25" width="550" height="550" rx="18" fill="none" stroke="#252a36" stroke-width="1.5"/>

        <!-- Grid Lines Group -->
        <g id="grid-lines" class="grid-lines">
          ${BOARD_LINES.map(([p1, p2]) => {
            const c1 = POINT_COORDS[p1];
            const c2 = POINT_COORDS[p2];
            return `<line x1="${c1.x}" y1="${c1.y}" x2="${c2.x}" y2="${c2.y}" class="board-line" stroke-width="5" stroke-linecap="round"/>`;
          }).join('')}
        </g>

        <!-- Active Mill Glowing Lines Group -->
        <g id="mill-glow-lines"></g>

        <!-- Board Intersection Points (Base sockets) -->
        <g id="grid-nodes">
          ${Object.entries(POINT_COORDS).map(([pt, c]) => `
            <circle cx="${c.x}" cy="${c.y}" r="9" class="grid-socket" stroke-width="2.5" />
          `).join('')}
        </g>

        <!-- Coordinate Labels (subtle) -->
        <g id="grid-labels" class="grid-labels" font-size="10" class="grid-label" text-anchor="middle" dominant-baseline="central">
          ${Object.entries(POINT_COORDS).map(([pt, c]) => {
            const dy = (c.y < 300) ? -18 : (c.y > 300 ? 18 : 0);
            const dx = (c.y === 300) ? (c.x < 300 ? -18 : 18) : 0;
            return `<text x="${c.x + dx}" y="${c.y + dy}">${pt}</text>`;
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

      // 2. Highlight for valid destination (concentric, perfectly centered pulsing indicator)
      if (isValidDest) {
        elementsHtml += `
          <circle cx="0" cy="0" r="18" fill="rgba(46, 213, 115, 0.22)" stroke="#2ed573" stroke-width="2.5" stroke-dasharray="5,3" class="dest-indicator" filter="url(#cyanGlow)">
            <animate attributeName="r" values="14;21;14" dur="1.3s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1.3s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values="0.15;0.35;0.15" dur="1.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="0" cy="0" r="6" fill="#2ed573" class="dest-dot">
            <animate attributeName="r" values="5;7;5" dur="1.3s" repeatCount="indefinite" />
          </circle>
        `;
      }

      // 3. Highlight for selected stone (concentric animated dashed ring)
      if (isSelected) {
        elementsHtml += `
          <circle cx="0" cy="0" r="26" fill="none" stroke="#ffa502" stroke-width="3" stroke-dasharray="6,4" class="selection-ring">
            <animate attributeName="stroke-dashoffset" values="0;40" dur="2s" repeatCount="indefinite" />
          </circle>
        `;
      }

      // 4. Highlight for removable opponent piece (concentric pulsing target)
      if (isRemovable) {
        elementsHtml += `
          <circle cx="0" cy="0" r="26" fill="rgba(255, 71, 87, 0.25)" stroke="#ff4757" stroke-width="3" stroke-dasharray="5,3" class="removal-target">
            <animate attributeName="r" values="24;28;24" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />
          </circle>
        `;
      }

      // 5. Piece graphics
      if (piece) {
        const isWhite = piece === 'W';
        const fillGrad = isWhite ? 'url(#whitePieceGrad)' : 'url(#blackPieceGrad)';
        const rimColor = isWhite ? '#ffffff' : '#495266';
        const innerRim = isWhite ? '#d0cee0' : '#1d212b';

        let pieceClasses = `game-piece ${isWhite ? 'piece-white' : 'piece-black'}`;
        if (isMyTurn && isMyPiece && gameState.phase === 'MOVING' && !gameState.awaitingRemoval) {
          pieceClasses += ' piece-selectable';
        }
        if (isRemovable) {
          pieceClasses += ' piece-removable';
        }

        elementsHtml += `
          <g class="${pieceClasses}">
            <!-- Stone Body -->
            <circle cx="0" cy="0" r="21" fill="${fillGrad}" stroke="${rimColor}" stroke-width="2" filter="url(#pieceShadow)"/>
            <!-- Stone Embossed Rings -->
            <circle cx="0" cy="0" r="14" fill="none" stroke="${innerRim}" stroke-width="1.5" stroke-opacity="0.7"/>
            <circle cx="0" cy="0" r="7" fill="none" stroke="${innerRim}" stroke-width="1.5" stroke-opacity="0.5"/>
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
            stroke="#ffa502" stroke-width="8" stroke-linecap="round"
            filter="url(#goldGlow)" class="mill-gold-beam" />
    `;

    // Remove glow after 2 seconds
    setTimeout(() => {
      this.millGlowLayer.innerHTML = '';
    }, 2500);
  }
}

window.BoardRenderer = BoardRenderer;
window.POINT_COORDS = POINT_COORDS;

