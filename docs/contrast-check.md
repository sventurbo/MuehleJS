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
- **Date**: 2026-10-07
- **Script version**: `scripts/contrast-check.js` (Node.js, no external dependencies)
- **Source**: the `:root` block of `public/css/tokens.css`, reached through `scripts/css-bundle.js`, which resolves the layered `@import` chain of `public/css/style.css`. Every `light-dark(<light>, <dark>)` pair is split into its two themes; `rgb(r g b / a)` colours are checked without their alpha

## Results

The tables are the output of `npm run contrast-check` (`runContrastCheck()` in `scripts/contrast-check.js`) under Node.js 26. FG and BG are the token values resolved to sRGB hex; ratios are rounded to two decimals, as the checker reports them.

### Dark Mode (`prefers-color-scheme: dark`)

| Color Pair | FG | BG | Ratio | Required | Status |
|---|---|---|---|---|---|
| Body text on main background | #f2f2f7 | #0a0a0c | 17.73:1 | 4.5:1 | ✅ Pass |
| Secondary text on main background | #9a9aa4 | #0a0a0c | 7.10:1 | 4.5:1 | ✅ Pass |
| Body text on card background | #f2f2f7 | #1f1f24 | 14.71:1 | 4.5:1 | ✅ Pass |
| Secondary text on card background | #9a9aa4 | #1f1f24 | 5.89:1 | 4.5:1 | ✅ Pass |
| Body text on surface background | #f2f2f7 | #16161a | 16.17:1 | 4.5:1 | ✅ Pass |
| Secondary text on surface background | #9a9aa4 | #16161a | 6.47:1 | 4.5:1 | ✅ Pass |
| Accent gold on main background | #ff9f0a | #0a0a0c | 9.62:1 | 3:1 | ✅ Pass |
| Accent blue on main background | #2f6fe0 | #0a0a0c | 4.21:1 | 3:1 | ✅ Pass |
| Accent green on main background | #30d158 | #0a0a0c | 9.78:1 | 3:1 | ✅ Pass |
| Accent red on main background | #ff453a | #0a0a0c | 5.81:1 | 3:1 | ✅ Pass |
| Accent cyan on main background | #64d2ff | #0a0a0c | 11.50:1 | 3:1 | ✅ Pass |
| Input text on input background | #f2f2f7 | #121216 | 16.75:1 | 4.5:1 | ✅ Pass |
| Button text on primary button | #ffffff | #2f6fe0 | 4.70:1 | 4.5:1 | ✅ Pass |
| Secondary button text on secondary background | #f2f2f7 | #26262c | 13.48:1 | 4.5:1 | ✅ Pass |
| Pip on background | #6c6c78 | #0a0a0c | 3.82:1 | 3:1 | ✅ Pass |
| Chat bubble text on bubble background | #f2f2f7 | #2b3a52 | 10.29:1 | 4.5:1 | ✅ Pass |
| Toast text on toast background | #f2f2f7 | #1f1f24 | 14.71:1 | 4.5:1 | ✅ Pass |
| Board label on board plate | #ffffff | #26262c | 15.04:1 | 3:1 | ✅ Pass |
| Board label on board plate-end | #ffffff | #141418 | 18.37:1 | 3:1 | ✅ Pass |
| Destructive button text on dialog surface | #ff453a | #16161a | 5.30:1 | 4.5:1 | ✅ Pass |

### Light Mode (`prefers-color-scheme: light`)

| Color Pair | FG | BG | Ratio | Required | Status |
|---|---|---|---|---|---|
| Body text on main background | #1c1c1e | #f2f2f7 | 15.25:1 | 4.5:1 | ✅ Pass |
| Secondary text on main background | #5c5c66 | #f2f2f7 | 5.92:1 | 4.5:1 | ✅ Pass |
| Body text on card background | #1c1c1e | #ffffff | 17.01:1 | 4.5:1 | ✅ Pass |
| Secondary text on card background | #5c5c66 | #ffffff | 6.61:1 | 4.5:1 | ✅ Pass |
| Body text on surface background | #1c1c1e | #ffffff | 17.01:1 | 4.5:1 | ✅ Pass |
| Secondary text on surface background | #5c5c66 | #ffffff | 6.61:1 | 4.5:1 | ✅ Pass |
| Accent gold on main background | #9a5b00 | #f2f2f7 | 4.86:1 | 3:1 | ✅ Pass |
| Accent blue on main background | #0b62d6 | #f2f2f7 | 5.04:1 | 3:1 | ✅ Pass |
| Accent green on main background | #12813f | #f2f2f7 | 4.44:1 | 3:1 | ✅ Pass |
| Accent red on main background | #c9221c | #f2f2f7 | 5.05:1 | 3:1 | ✅ Pass |
| Accent cyan on main background | #0d6a86 | #f2f2f7 | 5.50:1 | 3:1 | ✅ Pass |
| Input text on input background | #1c1c1e | #f2f2f7 | 15.25:1 | 4.5:1 | ✅ Pass |
| Button text on primary button | #ffffff | #0b62d6 | 5.63:1 | 4.5:1 | ✅ Pass |
| Secondary button text on secondary background | #1c1c1e | #e8e8ed | 13.93:1 | 4.5:1 | ✅ Pass |
| Pip on background | #83838d | #f2f2f7 | 3.36:1 | 3:1 | ✅ Pass |
| Chat bubble text on bubble background | #1c1c1e | #d4dcea | 12.34:1 | 4.5:1 | ✅ Pass |
| Toast text on toast background | #1c1c1e | #ffffff | 17.01:1 | 4.5:1 | ✅ Pass |
| Board label on board plate | #3a3a40 | #ffffff | 11.30:1 | 3:1 | ✅ Pass |
| Board label on board plate-end | #3a3a40 | #e9e9ef | 9.34:1 | 3:1 | ✅ Pass |
| Destructive button text on dialog surface | #c9221c | #ffffff | 5.63:1 | 4.5:1 | ✅ Pass |

## Summary

- **Total tested pairs**: 40 (20 dark + 20 light)
- **Passed**: 40/40 (100%)
- **Failed**: 0
- **Smallest margins**: Button text on primary button (dark) at 4.70:1 against 4.5:1, and Pip on background (light) at 3.36:1 against 3:1

All color pairs meet WCAG 2.1 AA requirements in both light and dark themes. The board plate follows the theme, and so does `--board-label`: the coordinate labels are #3a3a40 on the light plate and #ffffff on the dark one.
