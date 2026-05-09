import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const ngCliScript = path.join(rootDir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const pythonExecutable = process.env.PYTHON ?? (isWindows ? 'py' : 'python3');

if (!existsSync(ngCliScript)) {
  console.error('Angular CLI nem talalhato. Futtasd el eloszor: npm install');
  process.exit(1);
}

const children = [];

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      VOTING_API_HOST: process.env.VOTING_API_HOST ?? '127.0.0.1',
      VOTING_API_PORT: process.env.VOTING_API_PORT ?? '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...options,
  });

  children.push(child);

  child.stdout.on('data', data => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', data => process.stderr.write(`[${name}] ${data}`));

  child.on('exit', code => {
    if (code !== 0 && !shuttingDown) {
      console.error(`[${name}] leallt ezzel a koddal: ${code}`);
      shutdown(code ?? 1);
    }
  });

  child.on('error', error => {
    if (!shuttingDown) {
      console.error(`[${name}] nem indithato: ${error.message}`);
      shutdown(1);
    }
  });

  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(isWindows ? undefined : 'SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('backend', pythonExecutable, ['src/backend_script.py']);
start('frontend', process.execPath, [ngCliScript, 'serve', '--proxy-config', 'proxy.conf.json']);
