/**
 * Environment.test.js
 * Guards for the server's configuration through environment variables.
 *
 * `npm start` loads an optional .env file with Node's --env-file-if-exists,
 * and .env.example documents what may go into it. These assertions keep the
 * example in step with the variables the server actually reads, and pin the
 * port precedence that makes `npm start <port>` reliable with a .env present.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePort } from '../server.js';

const root = path.join(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const example = read('.env.example');
const pkg = JSON.parse(read('package.json'));

/** The variables server.js reads, as `process.env.NAME` or (in resolvePort) `env.NAME`. */
const serverVariables = [...new Set(Array.from(read('server.js').matchAll(/\benv\.([A-Z][A-Z_]*)\b/g), m => m[1]))];

describe('.env.example', () => {
  test('documents every variable the server reads', () => {
    expect(serverVariables).toEqual(expect.arrayContaining(['PORT', 'TRUST_PROXY', 'TURN_TIMEOUT_MS']));
    serverVariables.forEach(name => expect(example).toMatch(new RegExp(`^# ${name}=`, 'm')));
  });

  test('leaves every setting commented out, so a copy changes nothing by itself', () => {
    const activeLines = example.split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#'));
    expect(activeLines).toEqual([]);
  });

  test('the real .env stays out of the repository', () => {
    expect(read('.gitignore').split('\n')).toContain('.env');
  });
});

describe('npm start', () => {
  test('loads .env with Node itself, and only if it exists', () => {
    expect(pkg.scripts.start).toBe('node --env-file-if-exists=.env server.js');
    expect(pkg.dependencies).not.toHaveProperty('dotenv');
  });
});

describe('Port precedence', () => {
  test('a port on the command line wins over PORT, even one from .env', () => {
    expect(resolvePort(['8080'], { PORT: '4000' })).toBe(8080);
  });

  test('PORT applies when the command line names none', () => {
    expect(resolvePort([], { PORT: '4000' })).toBe(4000);
  });

  test('without either the server listens on 3000', () => {
    expect(resolvePort([], {})).toBe(3000);
  });

  test('arguments that are not a port number are skipped', () => {
    expect(resolvePort(['--verbose', '9090'], {})).toBe(9090);
  });
});
