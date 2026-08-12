import { spawn } from 'node:child_process';

const configuredBaseUrl = process.env.PERFORMANCE_BASE_URL?.replace(/\/$/, '');
const host = '127.0.0.1';
const port = 4323;
const baseUrl = configuredBaseUrl || `http://${host}:${port}`;
const immutable = 'public, max-age=31536000, immutable';
let startedPreview = false;

function command(args, stdio = 'ignore') {
  return spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    env: process.env,
    stdio,
  });
}

async function waitForExit(child) {
  return await new Promise((resolve) => child.once('exit', resolve));
}

async function startPreview() {
  if (configuredBaseUrl) return;
  const child = command(['astro', 'preview', '--background', '--host', host, '--port', String(port)], ['ignore', 'pipe', 'pipe']);
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) throw new Error(`Unable to start workerd preview.\n${output}`);
  startedPreview = true;

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // Workerd startup is asynchronous.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Workerd preview did not become healthy within 20 seconds.');
}

async function stopPreview() {
  if (!startedPreview) return;
  await waitForExit(command(['astro', 'preview', 'stop']));
}

function attribute(tag, name) {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

function responsivePictures(html) {
  return [...html.matchAll(/<picture\b[^>]*data-responsive-wallpaper[^>]*>[\s\S]*?<\/picture>/g)]
    .map((match) => match[0]);
}

function assetUrls(picture) {
  const urls = new Set();
  for (const match of picture.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
    for (const candidate of match[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) urls.add(url);
    }
  }
  return [...urls];
}

function firstPath(html, pattern) {
  return attribute(html.match(pattern)?.[0] || '', 'href');
}

async function fetchPage(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { accept: 'text/html' } });
  const html = await response.text();
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  if (html.includes('/original/')) throw new Error(`${path} exposes an original asset path`);
  if (/PIXABAY_API_KEY|ADMIN_PASSWORD|AUTH_SECRET/.test(html)) throw new Error(`${path} exposes a secret name`);
  return html;
}

function assertImageMarkup(path, html) {
  const pictures = responsivePictures(html);
  for (const picture of pictures) {
    const image = picture.match(/<img\b[^>]*>/)?.[0];
    if (!image) throw new Error(`${path} has a responsive picture without an img fallback`);
    for (const name of ['width', 'height', 'sizes', 'loading', 'fetchpriority']) {
      if (!attribute(image, name)) throw new Error(`${path} image is missing ${name}`);
    }
    if (!/srcset=/.test(picture)) throw new Error(`${path} image is missing responsive candidates`);
  }
  return pictures;
}

function assertPriority(path, pictures) {
  if (pictures.length === 0) return;
  const firstImage = pictures[0].match(/<img\b[^>]*>/)?.[0] || '';
  const firstShouldBePriority = path === '/' || path.startsWith('/explore')
    || path.startsWith('/search') || path.startsWith('/category/') || path.startsWith('/tag/')
    || path.startsWith('/popular') || path.startsWith('/wallpaper/');
  if (firstShouldBePriority
    && (attribute(firstImage, 'loading') !== 'eager' || attribute(firstImage, 'fetchpriority') !== 'high')) {
    throw new Error(`${path} does not prioritize its LCP candidate`);
  }
  for (const picture of pictures.slice(1)) {
    const image = picture.match(/<img\b[^>]*>/)?.[0] || '';
    if (attribute(image, 'loading') !== 'lazy') throw new Error(`${path} has an eager below-fold image`);
  }
}

async function assertAsset(path) {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok) throw new Error(`Preview asset ${path} returned ${response.status}`);
  if (response.headers.get('cache-control') !== immutable) throw new Error(`Preview asset ${path} is not immutable`);
  const etag = response.headers.get('etag');
  await response.body?.cancel();
  if (!etag) throw new Error(`Preview asset ${path} has no ETag`);
  const cached = await fetch(new URL(path, baseUrl), { headers: { 'If-None-Match': etag } });
  if (cached.status !== 304 || cached.headers.get('cache-control') !== immutable) {
    throw new Error(`Preview asset ${path} did not return a cacheable 304`);
  }
}

async function assertFonts() {
  for (const path of ['/fonts/plus-jakarta-sans-latin-v12.woff2', '/fonts/outfit-latin-v15.woff2']) {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    if (response.headers.get('cache-control') !== immutable) throw new Error(`${path} is not immutable`);
    await response.body?.cancel();
  }
}

try {
  await startPreview();
  const home = await fetchPage('/');
  const routes = ['/', '/explore', '/search?q=impasto', '/categories', '/popular'];
  const wallpaperPath = firstPath(home, /<a\b[^>]*href="\/wallpaper\/[^"]+"[^>]*>/);
  if (wallpaperPath) routes.push(wallpaperPath);
  const categories = await fetchPage('/categories');
  const categoryPath = firstPath(categories, /<a\b[^>]*href="\/category\/[^"]+"[^>]*>/);
  if (categoryPath) routes.push(categoryPath);
  if (process.env.PERFORMANCE_TAG_PATH?.startsWith('/tag/')) routes.push(process.env.PERFORMANCE_TAG_PATH);

  const uniqueAssets = new Set();
  const report = [];
  for (const path of [...new Set(routes)]) {
    const html = path === '/' ? home : path === '/categories' ? categories : await fetchPage(path);
    const pictures = assertImageMarkup(path, html);
    assertPriority(path, pictures);
    pictures.slice(0, 1).flatMap(assetUrls).forEach((url) => uniqueAssets.add(url));
    report.push({ path, htmlBytes: Buffer.byteLength(html), responsiveImages: pictures.length });
  }

  for (const asset of [...uniqueAssets].slice(0, 8)) await assertAsset(asset);
  await assertFonts();
  console.log(JSON.stringify({ success: true, baseUrl, routes: report, checkedAssets: Math.min(uniqueAssets.size, 8) }, null, 2));
} finally {
  await stopPreview();
}
