/**
 * BoardAnimation.test.js
 * Static guards for the stone animations on the board.
 *
 * The animations only work because boardRenderer.js patches the board instead
 * of rebuilding it: a freshly inserted SVG node has no previous state to
 * animate from. These assertions pin that decision and the renderer/CSS
 * contract (class names, keyframes, custom properties) so a later refactor
 * cannot quietly bring back a board that just jumps.
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const css = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');
const boardJs = fs.readFileSync(path.join(publicDir, 'js', 'boardRenderer.js'), 'utf8');

/** Returns the declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(match).toBeTruthy();
  return match[1];
}

/** Returns the body of the first media query whose prelude contains `needle`. */
function mediaBlock(needle) {
  const start = css.indexOf(needle);
  expect(start).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced media query for "${needle}"`);
}

describe('Board renderer keeps its nodes', () => {
  test('render() patches the board instead of replacing the interactive layer', () => {
    expect(boardJs).not.toMatch(/interactiveLayer\.innerHTML\s*=/);
  });

  test('stone state is toggled on the existing node', () => {
    expect(boardJs).toContain("classList.toggle('piece-selectable'");
    expect(boardJs).toContain("classList.toggle('piece-removable'");
  });

  test('clicks are delegated once instead of re-bound on every render', () => {
    expect(boardJs.match(/addEventListener\('click'/g)).toHaveLength(1);
  });

  test('changes are classified by the shared, tested board diff', () => {
    expect(boardJs).toContain('window.MuehleRules.diffBoards(');
  });
});

describe('Stone animations', () => {
  const effects = {
    'piece-entering': ['pieceEnter'],
    'piece-arriving': ['pieceTravel', 'pieceLift'],
    'piece-leaving': ['pieceLeave']
  };

  test.each(Object.entries(effects))('.%s is set by the renderer and animated in CSS', (className, keyframes) => {
    expect(boardJs).toContain(`'${className}'`);
    const body = ruleBody(`.${className}`);
    keyframes.forEach(name => {
      expect(body).toContain(name);
      expect(css).toContain(`@keyframes ${name}`);
    });
  });

  test('the travel offset set by the renderer is what the keyframes read', () => {
    expect(boardJs).toContain("'--travel-x'");
    expect(boardJs).toContain("'--travel-y'");
    expect(css).toMatch(/@keyframes pieceTravel\s*\{[^}]*var\(--travel-x\) var\(--travel-y\)/);
  });

  test('stones scale around their own centre, not the SVG origin', () => {
    const body = ruleBody('.game-piece');
    expect(body).toMatch(/transform-box:\s*fill-box/);
    expect(body).toMatch(/transform-origin:\s*center/);
  });

  test('a fading stone never swallows a click meant for its point', () => {
    expect(ruleBody('.piece-leaving')).toMatch(/pointer-events:\s*none/);
  });

  test('a captured stone is removed even if animationend never fires', () => {
    expect(boardJs).toMatch(/setTimeout\(\(\) => el\.remove\(\), LEAVE_FALLBACK_MS\)/);
  });

  test('reduced motion collapses every animation, including these', () => {
    const reduced = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\*,[\s\S]*?\{[^}]*animation-duration:\s*0\.001ms !important/);
  });
});

describe('Mill beam', () => {
  test('each beam removes only itself, so a second mill keeps its full fade', () => {
    expect(boardJs).toContain("beam.addEventListener('animationend', () => beam.remove(), { once: true })");
    expect(boardJs).toMatch(/setTimeout\(\(\) => beam\.remove\(\), MILL_BEAM_FALLBACK_MS\)/);
  });

  test('no timer clears the whole mill layer', () => {
    const timers = boardJs.match(/setTimeout\([^;]*;/g) || [];
    timers.forEach(call => expect(call).not.toContain('millGlowLayer'));
  });

  test('the fallback outlasts the fade it backs up', () => {
    const [, value, unit] = ruleBody('.mill-gold-beam').match(/millBeam\s+([\d.]+)(m?s)/);
    const fadeMs = parseFloat(value) * (unit === 's' ? 1000 : 1);
    const fallbackMs = Number(boardJs.match(/const MILL_BEAM_FALLBACK_MS = (\d+);/)[1]);
    expect(fallbackMs).toBeGreaterThan(fadeMs);
  });

  test('a new game drops the previous game\'s beam', () => {
    expect(boardJs).toMatch(/if \(!sameGame\) \{[^}]*this\.millGlowLayer\.innerHTML = ''/);
  });

  test('reduced motion shows the beam without a fade instead of one that ends at opacity 0', () => {
    const reduced = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\.mill-gold-beam\s*\{[^}]*animation:\s*none/);
  });
});
