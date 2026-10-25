/**
 * Environment.test.js
 * Guards for the environment the server is built and started in.
 *
 * `npm start` loads an optional .env file with Node's --env-file-if-exists,
 * and .env.example documents what may go into it. These assertions keep the
 * example in step with the variables the server actually reads, and pin the
 * port precedence that makes `npm start <port>` reliable with a .env present.
 *
 * They also pin the Node.js versions `npm install` accepts, so the project
 * builds on an Ubuntu machine with the Node.js it ships, and that a start that
 * cannot succeed says so and fails, instead of ending as a success.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

/**
 * Whether `version` lies in an npm range of `^x.y.z` and `>=x.y.z`
 * alternatives, the only forms the "engines" field uses.
 */
function satisfies(version, range) {
  const parse = text => text.split('.').map(Number);
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const current = parse(version);
  return range.split('||').some(alternative => {
    const [, operator, bound] = alternative.trim().match(/^(\^|>=)(\d+\.\d+\.\d+)$/);
    const lowest = parse(bound);
    return compare(current, lowest) >= 0 && (operator === '>=' || current[0] === lowest[0]);
  });
}

describe('Node.js version', () => {
  // .npmrc sets engine-strict, so a version outside this range stops `npm install`.
  const engines = pkg.engines.node;

  test('npm install accepts the Node.js of Ubuntu 26.04 LTS, the current LTS and the newest release', () => {
    for (const version of ['22.22.1', '24.22.1', '26.12.1']) {
      expect(satisfies(version, engines)).toBe(true);
    }
  });

  test('npm install refuses every version without import.meta.main, which starts the server', () => {
    expect(read('server.js')).toMatch(/if \(import\.meta\.main\)/);
    for (const version of ['20.19.0', '22.17.0', '23.11.0', '24.1.0']) {
      expect(satisfies(version, engines)).toBe(false);
    }
  });

  test('the CI also runs on the oldest major that engines admits', () => {
    const oldestMajor = engines.match(/\d+/)[0];
    const matrix = read('.github/workflows/node.js.yml').match(/node-version: \[([^\]]*)\]/)[1];
    expect(matrix.split(',').map(entry => entry.trim())).toContain(`${oldestMajor}.x`);
  });
});

describe('Server start', () => {
  /** Runs `node server.js <port>` until it gives up (or 10 s pass). */
  const startServer = port =>
    spawnSync(process.execPath, ['server.js', String(port)], { cwd: root, encoding: 'utf8', timeout: 10000 });

  test('a port that is taken ends the start with exit code 1 and the reason', async () => {
    const blocker = net.createServer();
    await new Promise(resolve => blocker.listen(0, '0.0.0.0', resolve));
    const { port } = blocker.address();

    try {
      const result = startServer(port);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Cannot listen on port ${port}`);
      expect(result.stderr).toContain('EADDRINUSE');
    } finally {
      blocker.close();
    }
  });

  test('a port outside 1-65535 ends the start with exit code 1 and the reason', () => {
    const result = startServer(99999);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot listen on port 99999: a port is a whole number between 1 and 65535');
  });
});
