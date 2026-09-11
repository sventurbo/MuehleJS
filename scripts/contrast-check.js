#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { contrastRatio, resolveColor } = require('./contrast');

// ── CSS Variable Parser ──

function parseCssVariables(cssContent) {
  const variables = { dark: {}, light: {} };

  const rootMatch = cssContent.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (rootMatch) {
    const rootBody = rootMatch[1];
    const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = varRegex.exec(rootBody)) !== null) {
      variables.dark[match[1].trim()] = match[2].trim();
    }
  }

  const lightMatch = cssContent.match(/@media\s*\(prefers-color-scheme:\s*light\)\s*\{[\s\S]*?:root\s*\{([\s\S]*?)\n\s*\}\s*\}/);
  if (lightMatch) {
    const lightBody = lightMatch[1];
    const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = varRegex.exec(lightBody)) !== null) {
      variables.light[match[1].trim()] = match[2].trim();
    }
  }

  return variables;
}

// ── Contrast Test Definitions ──

const CONTRAST_TESTS = [
  { name: 'Body text on main background', fgVar: 'text-main', bgVar: 'bg-main', aaThreshold: 4.5, description: 'Fließtext auf Hintergrund' },
  { name: 'Secondary text on main background', fgVar: 'text-muted', bgVar: 'bg-main', aaThreshold: 4.5, description: 'Sekundärtext auf Hintergrund' },
  { name: 'Body text on card background', fgVar: 'text-main', bgVar: 'bg-card', aaThreshold: 4.5, description: 'Fließtext auf Karten-Hintergrund' },
  { name: 'Secondary text on card background', fgVar: 'text-muted', bgVar: 'bg-card', aaThreshold: 4.5, description: 'Sekundärtext auf Karten-Hintergrund' },
  { name: 'Body text on surface background', fgVar: 'text-main', bgVar: 'bg-surface', aaThreshold: 4.5, description: 'Fließtext auf Surface-Hintergrund' },
  { name: 'Secondary text on surface background', fgVar: 'text-muted', bgVar: 'bg-surface', aaThreshold: 4.5, description: 'Sekundärtext auf Surface-Hintergrund' },
  { name: 'Accent gold on main background', fgVar: 'accent-gold', bgVar: 'bg-main', aaThreshold: 3, description: 'Gold-Akzent auf Hintergrund' },
  { name: 'Accent blue on main background', fgVar: 'accent-blue', bgVar: 'bg-main', aaThreshold: 3, description: 'Blau-Akzent auf Hintergrund' },
  { name: 'Accent green on main background', fgVar: 'accent-green', bgVar: 'bg-main', aaThreshold: 3, description: 'Grün-Akzent auf Hintergrund' },
  { name: 'Accent red on main background', fgVar: 'accent-red', bgVar: 'bg-main', aaThreshold: 3, description: 'Rot-Akzent auf Hintergrund' },
  { name: 'Accent cyan on main background', fgVar: 'accent-cyan', bgVar: 'bg-main', aaThreshold: 3, description: 'Cyan-Akzent auf Hintergrund' },
  { name: 'Input text on input background', fgVar: 'text-main', bgVar: 'input-bg', aaThreshold: 4.5, description: 'Eingabefeld-Text auf Feld-Hintergrund' },
  { name: 'Button text on primary button', fgVar: 'white-stone-color', bgVar: 'accent-blue', aaThreshold: 4.5, description: 'Primärer Button-Text auf Button-Hintergrund' },
  { name: 'Secondary button text on secondary background', fgVar: 'text-main', bgVar: 'btn-secondary-bg', aaThreshold: 4.5, description: 'Sekundärer Button-Text auf Hintergrund' },
  { name: 'Pip on background', fgVar: 'pip-inactive', bgVar: 'bg-main', aaThreshold: 3, description: 'Pip auf Hintergrund' },
  { name: 'Opponent turn text on background', fgVar: 'opponent-turn-color', bgVar: 'bg-main', aaThreshold: 4.5, description: 'Gegner-am-Zug-Text auf Hintergrund' },
  { name: 'Chat bubble text on card background', fgVar: 'chat-bubble-me', bgVar: 'bg-card', aaThreshold: 4.5, description: 'Chat-Bubble-Text auf Hintergrund' },
  { name: 'Toast text on toast background', fgVar: 'text-main', bgVar: 'bg-card', aaThreshold: 4.5, description: 'Toast-Text auf Toast-Hintergrund' },
  { name: 'Board label on board plate', fgVar: 'board-label', bgVar: 'board-plate', aaThreshold: 3, description: 'Spielfeld-Labels auf Brett' },
  { name: 'Board label on board plate-end', fgVar: 'board-label', bgVar: 'board-plate-end', aaThreshold: 3, description: 'Spielfeld-Labels auf Brett-Ende' },
];

// ── Main Check Function ──

function runContrastCheck(cssContent) {
  const variables = parseCssVariables(cssContent);
  const results = [];
  let allPassed = true;

  for (const [themeName, themeVars] of Object.entries(variables)) {
    for (const test of CONTRAST_TESTS) {
      const fgValue = themeVars[test.fgVar];
      const bgValue = themeVars[test.bgVar];
      if (!fgValue || !bgValue) continue;
      const fgColor = resolveColor(fgValue, themeVars);
      const bgColor = resolveColor(bgValue, themeVars);
      if (!fgColor || !bgColor) continue;
      const ratio = contrastRatio(fgColor, bgColor);
      const passed = ratio >= test.aaThreshold;
      results.push({
        name: test.name,
        description: test.description,
        theme: themeName === 'dark' ? 'Dunkel' : 'Hell',
        fgColor, bgColor, ratio: ratio.toFixed(2), required: test.aaThreshold, passed
      });
      if (!passed) allPassed = false;
    }
  }
  return { results, allPassed };
}

// ── Main ──

const cssPath = path.join(__dirname, '..', 'public', 'css', 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const { results, allPassed } = runContrastCheck(cssContent);

console.log('\nWCAG 2.1 AA Contrast Verification');
console.log('═'.repeat(100));
const header = ['Test', 'Theme', 'FG', 'BG', 'Ratio', 'Status'].map((h, i) => {
  const widths = [40, 8, 10, 10, 10, 6];
  return h.padEnd(widths[i]);
}).join(' ');
console.log(header);
console.log('─'.repeat(90));

let passCount = 0;
let failCount = 0;
for (const r of results) {
  const status = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const theme = r.theme === 'Dunkel' ? '\x1b[90mDunkel\x1b[0m' : '\x1b[94mHell\x1b[0m';
  const row = [r.description.substring(0, 38), r.theme, r.fgColor, r.bgColor, `${r.ratio}:1`, status].map((v, i) => {
    const widths = [40, 8, 10, 10, 10, 6];
    return String(v).padEnd(widths[i]);
  }).join(' ');
  console.log(row);
  if (r.passed) passCount++; else failCount++;
}

console.log('─'.repeat(100));
console.log(`\x1b[1mResults: ${passCount} passed, ${failCount} failed, ${results.length} total\x1b[0m`);
console.log('\x1b[1mMinimum ratio: 4.5:1 for normal text, 3:1 for large text/UI elements\x1b[0m');

if (!allPassed) {
  console.log('\x1b[31m\nERROR: Some color pairs fail WCAG 2.1 AA contrast requirements.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m\nSUCCESS: All color pairs meet WCAG 2.1 AA contrast requirements.\x1b[0m');
  process.exit(0);
}
