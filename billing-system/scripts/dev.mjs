/**
 * Runs the API and the React dev server together in one terminal.
 *
 * Deliberately dependency-free rather than pulling in `concurrently`: the whole
 * job is two child processes and a shared exit, and a build tool that needs its
 * own install step to start the app is friction nobody asked for.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// npm is a shell script on Windows, so it has to be invoked through the shell.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const targets = [
  { name: 'api', colour: '\x1b[36m', cwd: path.join(root, 'server') },
  { name: 'web', colour: '\x1b[35m', cwd: path.join(root, 'client') },
];

const children = [];
let shuttingDown = false;

/** Prefixes each line so two interleaved logs stay readable. */
function pipe(stream, name, colour) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${colour}[${name}]\x1b[0m ${line}\n`);
    }
  });
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const { name, colour, cwd } of targets) {
  const child = spawn(npm, ['run', 'dev'], { cwd, shell: process.platform === 'win32' });
  children.push(child);

  pipe(child.stdout, name, colour);
  pipe(child.stderr, name, colour);

  child.on('error', (error) => {
    process.stdout.write(`${colour}[${name}]\x1b[0m failed to start: ${error.message}\n`);
    stopAll(1);
  });

  // If either side dies the other is useless on its own, so both go down
  // together rather than leaving a half-running app behind.
  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.stdout.write(`${colour}[${name}]\x1b[0m exited (${code})\n`);
    stopAll(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(0));
}

process.stdout.write('Starting API and web dev servers. Press Ctrl+C to stop both.\n');
