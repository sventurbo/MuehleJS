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

import fs from 'node:fs';
import path from 'node:path';
import { loadStylesheet } from '../scripts/css-bundle.js';

const publicDir = path.join(import.meta.dirname, '..', 'public');
const css = loadStylesheet();
const boardJs = fs.readFileSync(path.join(publicDir, 'js', 'boardRenderer.js'), 'utf8');
const appJs = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');

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
    expect(boardJs).toContain("import * as RULES from '/shared/muehleRules.js';");
    expect(boardJs).toContain('RULES.diffBoards(');
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
    // No !important: the rule wins because the responsive layer comes after
    // board.css (pinned in CssModules.test.js), whatever the selectors.
    expect(reduced).toMatch(/\*,[\s\S]*?\{[^}]*animation-duration:\s*0\.001ms;/);
    expect(reduced).toMatch(/\*,[\s\S]*?\{[^}]*transition-duration:\s*0\.001ms;/);
  });
});

describe('Mill beam', () => {
  test('the glow filter is sized in board units, so a straight beam is drawn at all', () => {
    // A horizontal or vertical line has a zero-height/width bounding box; a
    // filter region relative to it is empty and hides the element entirely.
    expect(boardJs).toMatch(/<filter id="goldGlow" filterUnits="userSpaceOnUse"/);
  });

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

  test("a new game drops the previous game's beam", () => {
    expect(boardJs).toMatch(/if \(!sameGame\) \{[^}]*this\.millGlowLayer\.replaceChildren\(\)/);
  });

  test('reduced motion shows the beam without a fade instead of one that ends at opacity 0', () => {
    const reduced = mediaBlock('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/\.mill-gold-beam\s*\{[^}]*animation:\s*none/);
  });
});

describe('Feedback for a click that does nothing', () => {
  test('the renderer marks the point and the stylesheet shakes it', () => {
    expect(boardJs).toContain("group.classList.add('is-rejected')");
    expect(ruleBody('.board-point-group.is-rejected')).toContain('pointReject');
    expect(css).toContain('@keyframes pointReject');
  });

  test('the mark has a cue without motion, so reduced motion keeps one', () => {
    expect(ruleBody('.board-point-group.is-rejected')).toMatch(/filter:\s*drop-shadow/);
  });

  test('a timer that outlasts the shake removes the mark', () => {
    const shakeMs = Number(css.match(/--dur-3:\s*(\d+)ms/)[1]);
    expect(ruleBody('.board-point-group.is-rejected')).toContain('var(--dur-3)');
    const feedbackMs = Number(boardJs.match(/const REJECT_FEEDBACK_MS = (\d+);/)[1]);
    expect(feedbackMs).toBeGreaterThan(shakeMs);
    expect(boardJs).toMatch(/setTimeout\(\(\) => group\.classList\.remove\('is-rejected'\), REJECT_FEEDBACK_MS\)/);
  });

  test('ineffective clicks are answered on the board, not with toasts', () => {
    expect(appJs).toContain('this.board.rejectPoint(point)');
    [
      'Der Gegner ist am Zug!',
      'Dieses Feld ist bereits besetzt',
      'keine direkte Verbindung',
      'gültigen gegnerischen Stein'
    ].forEach(text => expect(appJs).not.toContain(text));
  });

  test('the board markup carries no inline style', () => {
    expect(boardJs).not.toMatch(/\sstyle="/);
    // base.css lists the group in a shared touch-action rule, so match the
    // board's own rule rather than the first one naming the selector.
    expect(css).toMatch(/\n\.board-point-group\s*\{\s*cursor:\s*pointer;/);
  });
});
