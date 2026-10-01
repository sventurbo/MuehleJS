/**
 * prettier.config.js
 * Prettier owns the layout of the code, so no review has to discuss it.
 *
 * The options describe the style the code was already written in, measured
 * before Prettier was introduced, so formatting it changed as few lines as
 * possible: single quotes, semicolons (the default), two-space indentation (the
 * default), no trailing commas, single arrow parameters without parentheses,
 * and lines of up to 120 characters. Object keys keep their quotes where the
 * author put them; the board coordinates ('a7', 'd7', …) are written as the
 * strings they are everywhere else. The stylesheets have always used double
 * quotes ("tokens.css", content: "", grid areas), so they keep them.
 */

export default {
  printWidth: 120,
  singleQuote: true,
  trailingComma: 'none',
  arrowParens: 'avoid',
  quoteProps: 'preserve',
  overrides: [{ files: '*.css', options: { singleQuote: false } }]
};
