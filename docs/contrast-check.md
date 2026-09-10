# WCAG 2.1 AA Contrast Verification

## Overview

This document records the WCAG 2.1 Level AA contrast verification for both light and dark themes of MuehleJS. All color pairs were programmatically validated using the contrast-check script (`scripts/contrast-check.js`).

## Methodology

- **Standard**: WCAG 2.1 (Web Content Accessibility Guidelines)
- **Level**: AA
- **Algorithm**: Relative luminance-based contrast ratio calculation per WCAG 2.1 §1.4.3
- **Formula**: `CR = (L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter relative luminance
- **Relative Luminance**: `L = 0.2126 * R + 0.7152 * G + 0.0722 * B` (linearized sRGB)
- **Thresholds**:
  - Normal text (< 18pt / < 14pt bold): ≥ 4.5:1
  - Large text (≥ 18pt / ≥ 14pt bold) and UI graphics: ≥ 3:1
- **Date**: 2026-09-10
- **Script version**: `scripts/contrast-check.js` (Node.js, no external dependencies)
- **Source**: `public/css/style.css` (`:root` and `@media (prefers-color-scheme: light)` blocks)

## Results

### Dark Mode (`prefers-color-scheme: dark`)

| Color Pair | FG | BG | Ratio | AA | Status |
|---|---|---|---|---|---|
| Body text on main background | #d8dce4 | #181c22 | 12.44:1 | 4.5:1 | ✅ Pass |
| Secondary text on main background | #90a0b0 | #181c22 | 6.39:1 | 4.5:1 | ✅ Pass |
| Body text on card background | #d8dce4 | #262d38 | 10.08:1 | 4.5:1 | ✅ Pass |
| Secondary text on card background | #90a0b0 | #262d38 | 5.18:1 | 4.5:1 | ✅ Pass |
| Body text on surface background | #d8dce4 | #1e232c | 11.47:1 | 4.5:1 | ✅ Pass |
| Secondary text on surface background | #90a0b0 | #1e232c | 5.89:1 | 4.5:1 | ✅ Pass |
| Gold accent on background | #ffa502 | #181c22 | 8.66:1 | 3:1 | ✅ Pass |
| Blue accent on background | #5a70d0 | #181c22 | 3.80:1 | 3:1 | ✅ Pass |
| Green accent on background | #2ed573 | #181c22 | 8.86:1 | 3:1 | ✅ Pass |
| Red accent on background | #ff4757 | #181c22 | 5.12:1 | 3:1 | ✅ Pass |
| Cyan accent on background | #00d2d3 | #181c22 | 9.09:1 | 3:1 | ✅ Pass |
| Input text on input background | #d8dce4 | #1a1f28 | 12.02:1 | 4.5:1 | ✅ Pass |
| Primary button text on button | #ffffff | #5a70d0 | 4.50:1 | 4.5:1 | ✅ Pass |
| Secondary button text on background | #d8dce4 | #2a313c | 9.53:1 | 4.5:1 | ✅ Pass |
| Pip on background | #6a7080 | #181c22 | 3.45:1 | 3:1 | ✅ Pass |
| Opponent turn text on background | #cad1df | #181c22 | 11.15:1 | 4.5:1 | ✅ Pass |
| Chat bubble text on card | #8a9ab0 | #262d38 | 4.84:1 | 4.5:1 | ✅ Pass |
| Toast text on toast background | #d8dce4 | #262d38 | 10.08:1 | 4.5:1 | ✅ Pass |
| Board label on board plate | #6c7899 | #2a2e39 | 3.09:1 | 3:1 | ✅ Pass |
| Board label on board plate-end | #6c7899 | #181b22 | 3.93:1 | 3:1 | ✅ Pass |

### Light Mode (`prefers-color-scheme: light`)

| Color Pair | FG | BG | Ratio | AA | Status |
|---|---|---|---|---|---|
| Body text on main background | #1a1a2e | #f0f2f5 | 15.21:1 | 4.5:1 | ✅ Pass |
| Secondary text on main background | #555770 | #f0f2f5 | 6.28:1 | 4.5:1 | ✅ Pass |
| Body text on card background | #1a1a2e | #ffffff | 17.06:1 | 4.5:1 | ✅ Pass |
| Secondary text on card background | #555770 | #ffffff | 7.04:1 | 4.5:1 | ✅ Pass |
| Body text on surface background | #1a1a2e | #ffffff | 17.06:1 | 4.5:1 | ✅ Pass |
| Secondary text on surface background | #555770 | #ffffff | 7.04:1 | 4.5:1 | ✅ Pass |
| Gold accent on background | #b06800 | #f0f2f5 | 3.88:1 | 3:1 | ✅ Pass |
| Blue accent on background | #1e4a94 | #f0f2f5 | 7.60:1 | 3:1 | ✅ Pass |
| Green accent on background | #1a8045 | #f0f2f5 | 4.44:1 | 3:1 | ✅ Pass |
| Red accent on background | #c02a38 | #f0f2f5 | 5.16:1 | 3:1 | ✅ Pass |
| Cyan accent on background | #087575 | #f0f2f5 | 4.91:1 | 3:1 | ✅ Pass |
| Input text on input background | #1a1a2e | #f5f6f8 | 15.77:1 | 4.5:1 | ✅ Pass |
| Primary button text on button | #ffffff | #1e4a94 | 8.53:1 | 4.5:1 | ✅ Pass |
| Secondary button text on background | #1a1a2e | #e8ecf0 | 14.37:1 | 4.5:1 | ✅ Pass |
| Pip on background | #606874 | #f0f2f5 | 5.02:1 | 3:1 | ✅ Pass |
| Opponent turn text on background | #3a3a5c | #f0f2f5 | 9.65:1 | 4.5:1 | ✅ Pass |
| Chat bubble text on card | #4a6080 | #ffffff | 6.41:1 | 4.5:1 | ✅ Pass |
| Toast text on toast background | #1a1a2e | #ffffff | 17.06:1 | 4.5:1 | ✅ Pass |
| Board label on board plate | #6c7899 | #2a2e39 | 3.09:1 | 3:1 | ✅ Pass |
| Board label on board plate-end | #6c7899 | #181b22 | 3.93:1 | 3:1 | ✅ Pass |

## Summary

- **Total tested pairs**: 40 (20 dark + 20 light)
- **Passed**: 40/40 (100%)
- **Failed**: 0

All color pairs meet WCAG 2.1 AA requirements in both light and dark themes. The dark mode uses graduated grays (#181c22, #1e232c, #262d38) instead of near-black, and all accent colors were tuned to meet the 3:1 threshold for UI graphics. The game board colors remain theme-independent per Commit 75cd06d.

## Adjusted Colors

The following colors were adjusted from their original values to meet AA contrast:

| Variable | Original | Adjusted | Reason |
|---|---|---|---|
| `--accent-blue` | #3867d6 | #5a70d0 (dark) / #1e4a94 (light) | Dark mode 3.32:1 → 3.80:1; Light mode already 7.60:1 |
| `--accent-gold` | #ffa502 | #b06800 (light only) | Light mode 2.24:1 → 3.88:1 |
| `--accent-green` | #1f9d5a | #1a8045 (light only) | Light mode 3.11:1 → 4.44:1 |
| `--accent-red` | #dc3545 | #c02a38 (light only) | Light mode 4.04:1 → 5.16:1 |
| `--accent-cyan` | #0a9192 | #087575 (light only) | Light mode 3.42:1 → 4.91:1 |
| `--chat-bubble-me` | #253966 (dark) / #dbe4f7 (light) | #8a9ab0 (dark) / #4a6080 (light) | Both modes were <4.5:1 |
| `--pip-inactive` | #3a4250 (dark) / #c8ccd4 (light) | #6a7080 (dark) / #606874 (light) | Both modes were <3:1 |
| `--border-color` | #2e374a (dark) / #c8ccd4 (light) | #3d4658 (dark) / #b0b8c4 (light) | Separated from pip-inactive |
| `--opponent-turn-color` | #576574 (dark) / #555770 (light) | #cad1df (dark) / #3a3a5c (light) | Improved contrast |
| `--black-stone-color` | #1e2129 | #2a3240 (dark) / #1e2530 (light) | Graduated grays |
