import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['coverage/'] },

  js.configs.recommended,

  {
    files: ['public/js/**/*.js'],
    languageOptions: { globals: globals.browser }
  },

  {
    files: ['shared/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] }
  },

  {
    files: ['server.js', 'lib/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node }
  },

  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  },

  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': 'error'
    }
  }
];
