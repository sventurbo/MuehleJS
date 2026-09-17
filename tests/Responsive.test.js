/**
 * Responsive.test.js
 * Static guards for the mobile/handheld support of the web client.
 *
 * These assertions are deliberately structural: they pin the decisions that
 * make the app usable on a phone (own row for the name field, 16px inputs,
 * safe-area padding, touch-sized targets, no hover-only affordances) so a
 * later refactor of style.css cannot silently drop them.
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');
const boardJs = fs.readFileSync(path.join(publicDir, 'js', 'boardRenderer.js'), 'utf8');
const audioJs = fs.readFileSync(path.join(publicDir, 'js', 'audio.js'), 'utf8');

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

describe('Viewport & mobile meta tags', () => {
  test('viewport covers the notch and keeps the device width', () => {
    const match = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
    expect(match).toBeTruthy();
    expect(match[1]).toContain('width=device-width');
    expect(match[1]).toContain('initial-scale=1');
    expect(match[1]).toContain('viewport-fit=cover');
  });

  test('pinch-zoom stays available (accessibility)', () => {
    const match = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
    expect(match[1]).not.toContain('user-scalable=no');
    expect(match[1]).not.toContain('maximum-scale');
  });

  test('theme colour is declared for both colour schemes', () => {
    expect(html).toContain('name="theme-color" content="#0a0a0c" media="(prefers-color-scheme: dark)"');
    expect(html).toContain('name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)"');
  });

  test('home-screen (standalone) hints are present', () => {
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('name="mobile-web-app-capable"');
  });
});

describe('Login form on phones', () => {
  test('name field and search button stack into their own rows', () => {
    const phone = mediaBlock('@media (max-width: 700px)');
    expect(phone).toMatch(/\.input-group\s*\{[^}]*flex-direction:\s*column/);
    expect(phone).toMatch(/\.input-group \.btn\s*\{[^}]*width:\s*100%/);
  });

  test('text inputs are 16px so iOS does not zoom in on focus', () => {
    const phone = mediaBlock('@media (max-width: 700px)');
    expect(phone).toMatch(/\.text-input,\s*\n\s*\.chat-form input\s*\{[^}]*font-size:\s*1rem/);
  });

  test('the name input carries mobile keyboard hints', () => {
    const input = html.match(/<input[^>]*id="username-input"[^>]*>/)[0];
    expect(input).toContain('enterkeyhint="go"');
    expect(input).toContain('autocorrect="off"');
    expect(input).toContain('autocapitalize="words"');
  });

  test('the chat input asks for a send key', () => {
    const input = html.match(/<input[^>]*id="chat-input"[^>]*>/)[0];
    expect(input).toContain('enterkeyhint="send"');
  });
});

describe('Game layout on phones', () => {
  test('both player panels share one row above the board', () => {
    const phone = mediaBlock('@media (max-width: 700px)');
    expect(phone).toMatch(/\.game-arena\s*\{[^}]*display:\s*grid/);
    expect(phone).toContain('"player-w player-b"');
    expect(phone).toContain('"board board"');
  });

  test('landscape phones put the panels beside the board', () => {
    const landscape = mediaBlock('@media (orientation: landscape) and (max-height: 560px)');
    expect(landscape).toContain('"player-w board player-b"');
    // The board is sized off the short edge so it stays fully visible.
    expect(landscape).toMatch(/\.board-wrapper\s*\{[^}]*width:\s*min\(/);
  });

  test('the duplicate turn badge is dropped where the banner already says it', () => {
    const phone = mediaBlock('@media (max-width: 700px)');
    expect(phone).toMatch(/\.hud-badge\s*\{[^}]*display:\s*none/);
  });

  test('safe-area insets are respected on notched devices', () => {
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('env(safe-area-inset-top)');
  });

  test('viewport height follows the collapsing iOS toolbars', () => {
    expect(css).toContain('100dvh');
    // The vh fallback has to stay for browsers without dvh support.
    expect(css).toContain('min-height: 100vh');
  });
});

describe('Move log / chat tabs', () => {
  test('the dock tab bar exists and is wired to both panels', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/data-dock-tab="log"/);
    expect(html).toMatch(/data-dock-tab="chat"/);
    expect(html).toMatch(/id="dock-panel-log"[^>]*data-dock-panel="log"/);
    expect(html).toMatch(/id="dock-panel-chat"[^>]*data-dock-panel="chat"/);
    expect(html).toContain('aria-controls="dock-panel-log"');
    expect(html).toContain('aria-controls="dock-panel-chat"');
  });

  test('tabs are hidden on desktop and shown on phones', () => {
    expect(css).toMatch(/\.dock-tabs\s*\{[^}]*display:\s*none/);
    const phone = mediaBlock('@media (max-width: 700px)');
    expect(phone).toMatch(/\.dock-tabs\s*\{[^}]*display:\s*flex/);
    expect(phone).toMatch(/\.dock-panel\s*\{[^}]*display:\s*none/);
    expect(phone).toMatch(/\.dock-panel\.is-active\s*\{[^}]*display:\s*flex/);
  });

  test('app.js switches tabs and marks unread chat messages', () => {
    expect(appJs).toContain('_activateDockTab(name)');
    expect(appJs).toContain("aria-selected");
    expect(appJs).toContain('chatUnreadDot');
  });
});

describe('Touch interaction', () => {
  test('board tap targets grow for coarse pointers but never overlap', () => {
    const pointer = Number(boardJs.match(/const HIT_RADIUS_POINTER = (\d+);/)[1]);
    const touch = Number(boardJs.match(/const HIT_RADIUS_TOUCH = (\d+);/)[1]);
    expect(touch).toBeGreaterThan(pointer);
    // Neighbouring intersections are 80 user units apart.
    expect(2 * touch).toBeLessThan(80);
    expect(boardJs).toContain("window.matchMedia('(pointer: coarse)')");
  });

  test('controls reach a comfortable size on touch devices', () => {
    const coarse = mediaBlock('@media (pointer: coarse)');
    expect(coarse).toMatch(/\.btn\s*\{[^}]*min-height:\s*48px/);
    expect(coarse).toMatch(/\.dock-tab\s*\{[^}]*min-height:\s*44px/);
    expect(coarse).toMatch(/\.btn-icon\s*\{[^}]*width:\s*40px/);
  });

  test('taps do not flash a grey highlight or wait for a double tap', () => {
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
    expect(css).toContain('touch-action: manipulation');
  });

  test('hover affordances are limited to devices with a real pointer', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const hoverAt = rules.indexOf('@media (hover: hover) and (pointer: fine)');
    expect(hoverAt).toBeGreaterThan(-1);
    // Nothing before that block may rely on :hover — on touch it would stick.
    expect(rules.slice(0, hoverAt)).not.toContain(':hover');
    // Touch gets press feedback on the board instead.
    expect(css).toMatch(/\.board-point-group:active \.grid-socket/);
  });

  test('audio is unlocked from a user gesture (iOS autoplay policy)', () => {
    expect(audioJs).toContain('unlock()');
    expect(appJs).toContain("document.addEventListener('pointerdown', unlockAudio");
    expect(appJs).toContain("document.addEventListener('touchend', unlockAudio");
  });

  test('an open modal freezes the page behind it', () => {
    expect(appJs).toContain('_syncModalScrollLock()');
    expect(css).toMatch(/body\.modal-open\s*\{[^}]*overflow:\s*hidden/);
  });
});

describe('Desktop layout is untouched', () => {
  test('the three-column arena still applies above 1023px', () => {
    expect(css).toMatch(/\.game-arena\s*\{\s*display:\s*flex/);
    expect(css).toMatch(/\.player-panel\s*\{\s*width:\s*224px/);
  });

  test('the dock keeps both panels side by side on desktop', () => {
    expect(css).toMatch(/\.game-bottom-dock\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  });
});
