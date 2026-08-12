import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.SMOKE_PREVIEW_PORT ?? '4322', 10);
const timeoutMs = 20_000;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('SMOKE_PREVIEW_PORT must be an integer from 1 to 65535.');
}

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['astro', 'preview', '--host', host, '--port', String(port)],
  {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let output = '';
preview.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
preview.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

const startedAt = Date.now();
let passed = false;

async function stopPreview() {
  const stop = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['astro', 'preview', 'stop'],
    { env: process.env, stdio: 'ignore' },
  );
  await new Promise((resolve) => stop.once('exit', resolve));

  if (preview.exitCode === null) preview.kill('SIGTERM');
}

try {
  while (Date.now() - startedAt < timeoutMs) {
    if (preview.exitCode !== null && preview.exitCode !== 0) {
      throw new Error(`Astro preview exited before the smoke test.\n${output}`);
    }

    try {
      const response = await fetch(`http://${host}:${port}/api/health`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_000),
      });
      const payload = await response.json();

      if (response.ok && payload?.status === 'ok') {
        console.log(`Workerd preview smoke passed at http://${host}:${port}/api/health`);
        passed = true;
        break;
      }
    } catch {
      // Preview startup is asynchronous; retry until the bounded deadline.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!passed) {
    throw new Error(`Workerd preview did not become healthy within ${timeoutMs}ms.\n${output}`);
  }
} finally {
  await stopPreview();
}
