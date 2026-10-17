import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const workflow = readFileSync(new URL('../workflows/fb01.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const step = workflow.split('      - name: Remove the exact owned test container and unused image\n')[1];
assert.ok(step, 'the actual cleanup step must exist');
const body = step.split('      - name: Failure evidence only\n')[0].split('        run: |\n')[1];
assert.ok(body, 'the actual cleanup run block must exist');
const cleanup = body.split('\n').map(line => {
  assert.ok(line === '' || line.startsWith('          '), 'cleanup indentation must be explicit');
  return line.slice(10);
}).join('\n');

const container = 'a'.repeat(64);
const image = `sha256:${'b'.repeat(64)}`;
const owner = '12345-1';

// This external CLI fixture never forwards to a real Docker executable.
const dockerFixture = String.raw`
const fs = require('node:fs');
const file = process.env.CLEANUP_TEST_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
function finish(code = 0, output = '') {
  fs.writeFileSync(file, JSON.stringify(state));
  if (output) process.stdout.write(output + '\n');
  process.exit(code);
}
if (args[0] === 'info') finish();
if (args[0] === 'stop' && args[1] === state.container) {
  if (state.stopExit) finish(state.stopExit, state.container);
  state.stopped = true;
  if (state.delay === 0) state.containerPresent = false;
  finish(0, state.container);
}
if (args[0] === 'container' && args[1] === 'inspect') {
  if (args.at(-1) !== state.container) finish(90);
  if (!state.containerPresent) finish(1);
  if (args[2] === '--format') finish(args[3].includes('Labels') ? (state.containerOwnerQueryExit || 0) : (state.containerImageQueryExit || 0), args[3].includes('Labels') ? state.owner : (state.containerImage || state.image));
  finish(0, '[]');
}
if (args[0] === 'container' && args[1] === 'ls') {
  const filter = args.at(-1);
  if (filter === 'id=' + state.container) {
    if (state.idQueryExit) finish(state.idQueryExit);
    if (state.stopped && state.delay > 0) state.delay--;
    else if (state.stopped) state.containerPresent = false;
    finish(0, state.containerPresent ? state.container : '');
  }
  if (filter === 'ancestor=' + state.image) {
    if (state.imageQueryExit) finish(state.imageQueryExit);
    finish(0, state.sharedImage ? 'c'.repeat(64) : '');
  }
  finish(91);
}
if (args[0] === 'image' && args[1] === 'ls') {
  const failure = state.imagePresent ? state.imagePresenceQueryExit : state.imageAbsenceQueryExit;
  if (failure) finish(failure);
  finish(0, state.imagePresent ? state.image : '');
}
if (args[0] === 'image' && args[1] === 'inspect') {
  if (args.at(-1) !== state.image) finish(92);
  if (args[2] !== '--format') {
    const failure = state.imagePresent ? state.imagePresenceQueryExit : state.imageAbsenceQueryExit;
    if (failure) finish(failure);
  }
  if (!state.imagePresent) finish(1);
  finish(args[2] === '--format' ? (state.imageOwnerQueryExit || 0) : 0, args[2] === '--format' ? (state.imageOwner || state.owner) : '[]');
}
if (args[0] === 'image' && args[1] === 'rm' && args[2] === state.image) {
  state.imagePresent = false;
  finish(0, state.image);
}
finish(99);
`;

function runCleanup(options = {}) {
  const temp = realpathSync(tmpdir());
  const directory = mkdtempSync(path.join(temp, 'fogbound-ci-cleanup-'));
  const bin = path.join(directory, 'bin');
  const stateFile = path.join(directory, 'state.json');
  try {
    mkdirSync(bin);
    const forward = value => value.replaceAll('\\', '/');
    writeFileSync(path.join(directory, 'docker.cjs'), dockerFixture);
    const executable = path.join(bin, 'docker');
    writeFileSync(executable, '#!/usr/bin/env bash\nexec "$CLEANUP_TEST_NODE" "$CLEANUP_TEST_FAKE" "$@"\n');
    chmodSync(executable, 0o755);
    writeFileSync(stateFile, JSON.stringify({container, image, owner, containerPresent: true, imagePresent: true,
      stopped: false, delay: 0, otherContainerPresent: true, calls: [], ...options}));
    writeFileSync(path.join(directory, 'fb01-container-id.txt'), container);
    writeFileSync(path.join(directory, 'image-id.txt'), image);
    const environment = {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      RUNNER_TEMP: forward(directory), GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
      CLEANUP_TEST_BIN: forward(bin), CLEANUP_TEST_NODE: forward(process.execPath),
      CLEANUP_TEST_FAKE: forward(path.join(directory, 'docker.cjs')), CLEANUP_TEST_STATE: forward(stateFile)};
    // Refuse to run the workflow unless PATH resolves exclusively to our fixture.
    const checkFixture = 'set -e\ntest "$(command -v docker)" = "$(cd "$CLEANUP_TEST_BIN" && pwd)/docker"\n';
    const result = spawnSync(process.env.CI_CLEANUP_TEST_BASH || 'bash', ['-c', checkFixture + cleanup], {
      cwd: directory, env: environment, encoding: 'utf8', timeout: 30000,
    });
    assert.ifError(result.error);
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.ok(state.calls.length > 0, `only the fixture may run: ${result.stderr}`);
    return {...result, state};
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), temp);
    assert.ok(path.basename(directory).startsWith('fogbound-ci-cleanup-'));
    rmSync(directory, {recursive: true, force: true});
  }
}

test('an accepted stop waits for delayed exact-container disappearance before removing its unused image', () => {
  const result = runCleanup({delay: 2});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.state.containerPresent, false);
  assert.equal(result.state.imagePresent, false);
  assert.match(result.stdout, /Owned test container absent:/);
  assert.match(result.stdout, /Owned unused image removed:/);
});

test('normal exact-owned resources are removed without affecting an unrelated container', () => {
  const result = runCleanup();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.state.containerPresent, false);
  assert.equal(result.state.imagePresent, false);
  assert.equal(result.state.otherContainerPresent, true);
});

test('already removed resources succeed without another stop or removal', () => {
  const result = runCleanup({containerPresent: false, imagePresent: false});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.state.calls.some(args => args[0] === 'stop' || args[1] === 'rm'));
});

test('a stop that prints the CID but fails remains a failure and preserves the image', () => {
  const result = runCleanup({stopExit: 17});
  assert.equal(result.status, 17);
  assert.equal(result.state.containerPresent, true);
  assert.equal(result.state.imagePresent, true);
  assert.ok(!result.stdout.includes('Owned test container absent:'));
  assert.ok(!result.stdout.includes('Owned unused image removed:'));
});

test('a container that never disappears fails within the finite recheck allowance', () => {
  const result = runCleanup({delay: 1000});
  assert.equal(result.status, 1);
  assert.equal(result.state.stopped, true);
  assert.equal(result.state.containerPresent, true);
  assert.equal(result.state.imagePresent, true);
  const queries = result.state.calls.filter(args => args.at(-1) === `id=${container}`).length;
  assert.equal(queries, 42); // Initial presence, 40 rechecks, final absence.
  assert.ok(!result.stdout.includes('Owned test container absent:'));
});

test('another run owner prevents stopping or removing the resources', () => {
  const result = runCleanup({owner: 'another-run-1'});
  assert.equal(result.status, 1);
  assert.equal(result.state.stopped, false);
  assert.equal(result.state.imagePresent, true);
});

test('a container bound to a different image cannot be stopped by this cleanup', () => {
  const result = runCleanup({containerImage: `sha256:${'d'.repeat(64)}`});
  assert.equal(result.status, 1);
  assert.equal(result.state.stopped, false);
  assert.equal(result.state.imagePresent, true);
});

test('a failed container absence query cannot be reported as successful cleanup', () => {
  const result = runCleanup({idQueryExit: 23});
  assert.equal(result.status, 23);
  assert.equal(result.state.imagePresent, true);
  assert.ok(!result.stdout.includes('Owned test container absent:'));
});

test('an image used by another container is retained', () => {
  const result = runCleanup({sharedImage: true});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.state.containerPresent, false);
  assert.equal(result.state.imagePresent, true);
  assert.equal(result.state.otherContainerPresent, true);
  assert.match(result.stdout, /Owned image retained because another container depends on it:/);
});

test('an image owned by another run is never removed', () => {
  const result = runCleanup({imageOwner: 'another-run-1'});
  assert.equal(result.status, 1);
  assert.equal(result.state.imagePresent, true);
});

test('a failed image-usage query cannot authorize image deletion', () => {
  const result = runCleanup({imageQueryExit: 29});
  assert.equal(result.status, 29);
  assert.equal(result.state.imagePresent, true);
  assert.ok(!result.stdout.includes('Owned unused image removed:'));
});

test('an initial image-presence query failure cannot become absent-as-success', () => {
  const result = runCleanup({imagePresenceQueryExit: 31});
  assert.equal(result.status, 31);
  assert.equal(result.state.imagePresent, true);
  assert.ok(!result.stdout.includes('Owned unused image removed:'));
});

test('a final image-absence query failure cannot produce a removal receipt', () => {
  const result = runCleanup({imageAbsenceQueryExit: 37});
  assert.equal(result.status, 37);
  assert.ok(!result.stdout.includes('Owned unused image removed:'));
});

for (const [field, code] of [['containerOwnerQueryExit', 41], ['containerImageQueryExit', 43], ['imageOwnerQueryExit', 47]]) {
  test(field + ' fails even when the query prints the expected value', () => {
    const result = runCleanup({[field]: code});
    assert.equal(result.status, code);
    assert.equal(result.state.imagePresent, true);
    if (field !== 'imageOwnerQueryExit') assert.equal(result.state.stopped, false);
    assert.ok(!result.stdout.includes('Owned unused image removed:'));
  });
}
