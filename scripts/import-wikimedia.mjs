import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'ElysiumWallpaperCurator/0.1 (https://github.com/elysium; admin@elysium.local)';
const DEFAULT_BASE_URL = 'http://localhost:4321';
const TARGET_PER_CATEGORY = boundedInteger(process.env.TARGET_PER_CATEGORY, 100, 1, 200);
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MIN_LONG_EDGE = 1920;
const MIN_SHORT_EDGE = 1080;
const COMMONS_REQUEST_DELAY_MS = 650;
const DOWNLOAD_CONCURRENCY = 1;

const CATEGORY_DEFINITIONS = [
  {
    id: 'cat_nature',
    slug: 'nature',
    name: 'Nature',
    description: 'Serene landscapes, forests, flora, and natural sceneries.',
    roots: [
      'Category:Featured pictures of nature',
      'Category:Featured pictures of landscapes',
      'Category:Featured pictures of natural phenomena',
      'Category:Quality images of landscapes',
      'Category:Quality images of nature',
    ],
    blockedTitle: /\b(?:dead|eating|fossil|skeleton|skull)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_space',
    slug: 'space',
    name: 'Space',
    description: 'Galaxies, nebulas, stars, and cosmic phenomenon.',
    roots: [
      'Category:Featured pictures of astronomy',
      'Category:Quality images of astronomy',
    ],
    blockedTitle: /\b(?:diagram|map|chart|orbit)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_dark',
    slug: 'dark',
    name: 'Dark',
    description: 'OLED black backgrounds, night photography, and moody dark aesthetic.',
    roots: [
      'Category:Featured night photography',
      'Category:Featured pictures of astronomy',
      'Category:Quality images of landscapes',
    ],
    blockedTitle: /\b(?:daylight|noon|bright|sunlight)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_architecture',
    slug: 'architecture',
    name: 'Architecture',
    description: 'Modern structures, urban photography, and interior design.',
    roots: [
      'Category:Featured pictures of architecture',
      'Category:Quality images of architecture',
    ],
    blockedTitle: /\b(?:diagram|map|blueprint)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_automotive',
    slug: 'automotive',
    name: 'Automotive',
    description: 'High performance vehicles and conceptual transport.',
    roots: [
      'Category:Featured pictures of vehicles',
      'Category:Quality images of vehicles',
    ],
    blockedTitle: /\b(?:crash|accident|wreck)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_abstract',
    slug: 'abstract',
    name: 'Abstract',
    description: 'Fluid dynamics, geometric shapes, and minimal compositions.',
    roots: [
      'Category:Featured pictures of patterns',
      'Category:Quality images of patterns',
    ],
    blockedTitle: /\b(?:map|diagram)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_animals',
    slug: 'animals',
    name: 'Animals',
    description: 'Featured wildlife, birds, marine life, and animal portraits.',
    roots: ['Category:Featured pictures of animals'],
    blockedTitle: /\b(?:dead|eating|fossil|moulage|parasite|parasit|rescue operation|skeleton|skull|stranded)\b/i,
    maxDepth: 3,
  },
  {
    id: 'cat_art',
    slug: 'art',
    name: 'Art',
    description: 'Featured paintings, sculpture, crafts, and visual art from across cultures.',
    roots: [
      'Category:Featured pictures of paintings',
      'Category:Featured pictures of drawings',
      'Category:Featured pictures of digital art',
      'Category:Featured pictures of illustrations',
      'Category:Featured pictures of posters',
      'Category:Featured pictures of prints',
      'Category:Featured pictures of sculptures',
      'Category:Featured pictures of decorative and applied arts',
      'Category:Featured pictures of graffiti',
    ],
    blockedTitle: /\b(?:aircraft|building|dog|drone|palace|retriever|station)\b/i,
    maxDepth: 2,
  },
  {
    id: 'cat_food',
    slug: 'food',
    name: 'Food',
    description: 'Featured food photography, ingredients, drinks, and culinary compositions.',
    roots: [
      'Category:Featured pictures of food',
      'Category:Featured pictures of fruit',
      'Category:Quality images of beverages',
    ],
    blockedTitle: /\b(?:acorns?|aesculus|akelei|agriculture|animal|arctium|bessen|beuk|birds on stick|bolster|botanical|brassica|butcher|campo de colza|cavia|child|cipreskegels|cirsium|cuy|elzenproppen|fagus|farm|felder|feldweg|field|flower|goudenregen|groot koeienoog|grote klit|guinea pig|hamamelis|hanging|head|helenium|hortus|hypericum|iris pseudacorus|iris sibirica|kastanje|kegels zonder zaad|laburnum|lisdodde|market|narcissus|offal|ophiopogon|paardenkastanje|path|people|person|pig|plant|prepar|quercus|rapsfeld|raw meat|rijpe vruchten|selling|shells?|slaughter|skinned|speerdistel|squid drying|street|telekia|tree with|triteleia|trompetnarcis|typha|verbena|vineyard|vrucht van een|worker|zaadbox|zaadboxen|zaadbundel|zaadcapsule|zaaddoos|zaaddozen|zaadpeulen|zaadpluizen|zaadzetting|zaden van)\b/i,
    maxDepth: 0,
  },
];

const BLOCKED_TITLE = /\b(?:adult|anatom|autopsy|blood|carcass|copulat|corpse|dead|diagram|dissect|erotic|genital|icon|logo|map|mating|medical|nude|nudity|penis|pig heads|poster|sex|slaughter|testicle|vulva)\b/i;
const BLOCKED_SUBCATEGORY = /(?:\bby country\b|\bby user\b|\bby year\b|\bin [A-Z][a-z]+\b|photographs taken with|pictures by|valued images)/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function boundedInteger(raw, fallback, min, max) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received ${raw}`);
  }
  return value;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function truncate(value, max) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function decodeHtml(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return value
    .replace(/&#(x?[0-9a-f]+);/gi, (match, code) => {
      const numeric = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
    })
    .replace(/&([a-z]+);/gi, (match, entity) => named[entity.toLowerCase()] ?? match);
}

function cleanHtml(value = '') {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function extractHttpsUrl(value = '') {
  const href = value.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return undefined;
  const absolute = href.startsWith('//')
    ? `https:${href}`
    : href.startsWith('/') ? `https://commons.wikimedia.org${href}` : href;
  try {
    const url = new URL(decodeHtml(absolute));
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function readDevVariable(name) {
  const content = readFileSync(resolve('.dev.vars'), 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  const raw = line.slice(line.indexOf('=') + 1).trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(60_000, (retryAfter + 1) * 1000);
  return Math.min(15_000, 800 * 2 ** attempt);
}

async function fetchWithRetry(url, init = {}, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await response?.body?.cancel().catch(() => undefined);
    if (attempt < attempts - 1) await delay(retryDelay(response, attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

async function commonsApi(parameters, method = 'GET') {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    ...parameters,
  });
  const requestUrl = method === 'GET' ? `${COMMONS_API}?${params}` : COMMONS_API;
  const response = await fetchWithRetry(requestUrl, {
    method,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body: params } : {}),
  });
  const data = await response.json();
  if (data.error) throw new Error(`Wikimedia API error: ${data.error.info || data.error.code}`);
  await delay(COMMONS_REQUEST_DELAY_MS);
  return data;
}

async function listCategoryMembers(categoryTitle) {
  const members = [];
  let continuation;
  do {
    const data = await commonsApi({
      list: 'categorymembers',
      cmtitle: categoryTitle,
      cmnamespace: '6|14',
      cmtype: 'file|subcat',
      cmlimit: '500',
      ...(continuation ? { cmcontinue: continuation } : {}),
    });
    members.push(...(data.query?.categorymembers || []));
    continuation = data.continue?.cmcontinue;
  } while (continuation && members.length < 1_000);
  return members;
}

async function collectFileTitles(definition, desiredCount) {
  const files = new Set();
  const visited = new Set();
  const queue = definition.roots.map((title) => ({ title, depth: 0 }));
  const fileGoal = Math.max(120, desiredCount * 5);

  while (queue.length > 0 && files.size < fileGoal && visited.size < 42) {
    const current = queue.shift();
    if (!current || visited.has(current.title)) continue;
    visited.add(current.title);
    const members = await listCategoryMembers(current.title);
    for (const member of members) {
      if (member.ns === 6) files.add(member.title);
      if (member.ns === 14 && current.depth < definition.maxDepth
        && !BLOCKED_SUBCATEGORY.test(member.title)) {
        queue.push({ title: member.title, depth: current.depth + 1 });
      }
    }
    process.stdout.write(`\r${definition.name}: collected ${files.size} featured file titles from ${visited.size} categories`);
  }
  process.stdout.write('\n');
  return [...files];
}

function validLicense(shortName) {
  const normalized = shortName.toLowerCase().replace(/[–—]/g, '-');
  if (/\b(?:nc|nd)\b|noncommercial|no derivatives/.test(normalized)) return false;
  return normalized.includes('public domain') || normalized.includes('cc0')
    || normalized.includes('cc by') || normalized.includes('cc-by');
}

function wallpaperDimensions(width, height) {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  return longEdge >= MIN_LONG_EDGE && shortEdge >= MIN_SHORT_EDGE;
}

function orientation(width, height) {
  const ratio = width / height;
  if (ratio > 1.18) return 'landscape';
  if (ratio < 0.85) return 'portrait';
  return 'square';
}

function candidateScore(candidate) {
  const megapixels = Math.min(30, (candidate.width * candidate.height) / 1_000_000);
  const ratio = candidate.width / candidate.height;
  const targets = [16 / 9, 3 / 2, 4 / 3, 1, 3 / 4, 2 / 3, 9 / 16];
  const ratioDistance = Math.min(...targets.map((target) => Math.abs(Math.log(ratio / target))));
  const stableNoise = [...candidate.sourceExternalId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 17;
  return megapixels - ratioDistance * 10 + stableNoise / 20;
}

function mapImagePage(page, definition) {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata || {};
  const license = cleanHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || '');
  const rawTitle = page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '');
  const title = truncate(rawTitle.replace(/_/g, ' '), 150);
  const assetUrl = info?.thumburl || info?.url;
  const assetWidth = info?.thumbwidth || info?.width;
  const assetHeight = info?.thumbheight || info?.height;
  const assetMimeType = info?.thumbmime || info?.mime;
  if (!info || !ALLOWED_MIME_TYPES.has(assetMimeType) || !wallpaperDimensions(info.width, info.height)
    || !wallpaperDimensions(assetWidth, assetHeight)
    || BLOCKED_TITLE.test(title)
    || definition.blockedTitle?.test(title) || !validLicense(license)) {
    return null;
  }

  const rawArtist = metadata.Artist?.value || metadata.Credit?.value || '';
  const creator = truncate(cleanHtml(rawArtist) || 'Unknown Wikimedia Commons contributor', 200);
  const sourceUrl = info.descriptionurl;
  if (!sourceUrl?.startsWith('https://') || !assetUrl?.startsWith('https://')) return null;
  const licenseUrl = metadata.LicenseUrl?.value?.startsWith('https://')
    ? metadata.LicenseUrl.value
    : license.toLowerCase().includes('public domain')
      ? 'https://creativecommons.org/publicdomain/mark/1.0/'
      : 'https://creativecommons.org/licenses/';
  const sourceProvenance = truncate(`Wikimedia Commons featured/quality image, page ID ${page.pageid}: ${sourceUrl}`, 500);
  const licenseNote = truncate(`${license}. Source: ${sourceUrl}. License: ${licenseUrl}. Elysium stores Wikimedia's official up-to-1920px rendition as its unmodified download master; previews use the same license.`, 500);
  const sourceDescription = cleanHtml(metadata.ImageDescription?.value || '');

  return {
    sourceExternalId: String(page.pageid),
    sourceUrl,
    creatorUrl: extractHttpsUrl(rawArtist),
    assetUrl,
    title,
    description: truncate(sourceDescription || `Featured ${definitionLabel(page.title)} from Wikimedia Commons.`, 2_000),
    creator,
    license,
    licenseNote,
    sourceProvenance,
    width: assetWidth,
    height: assetHeight,
    size: 0,
    mimeType: assetMimeType,
    orientation: orientation(assetWidth, assetHeight),
  };
}

function definitionLabel(fileTitle) {
  return fileTitle.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

async function loadCandidates(fileTitles, existingSourceIds, definition) {
  const candidates = [];
  for (let index = 0; index < fileTitles.length; index += 50) {
    const titles = fileTitles.slice(index, index + 50);
    const data = await commonsApi({
      prop: 'imageinfo',
      titles: titles.join('|'),
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1920',
      iiurlheight: '1920',
    }, 'POST');
    for (const page of data.query?.pages || []) {
      const candidate = mapImagePage(page, definition);
      if (candidate && !existingSourceIds.has(candidate.sourceExternalId)) candidates.push(candidate);
    }
  }
  return candidates.sort((left, right) => candidateScore(right) - candidateScore(left));
}

function interleaveOrientations(candidates) {
  const groups = {
    landscape: candidates.filter((candidate) => candidate.orientation === 'landscape'),
    portrait: candidates.filter((candidate) => candidate.orientation === 'portrait'),
    square: candidates.filter((candidate) => candidate.orientation === 'square'),
  };
  const pattern = ['landscape', 'landscape', 'landscape', 'portrait', 'landscape', 'landscape', 'square', 'portrait'];
  const ordered = [];
  while (groups.landscape.length || groups.portrait.length || groups.square.length) {
    let progressed = false;
    for (const groupName of pattern) {
      const candidate = groups[groupName].shift();
      if (candidate) {
        ordered.push(candidate);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return ordered;
}

async function login(baseUrl) {
  const password = process.env.ADMIN_PASSWORD || readDevVariable('ADMIN_PASSWORD');
  if (!password) throw new Error('ADMIN_PASSWORD is missing from the environment and .dev.vars');
  const origin = new URL(baseUrl).origin;
  const response = await fetchWithRetry(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(`Admin login failed: ${await response.text()}`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Admin login did not return a session cookie');
  return { cookie, origin };
}

async function appRequest(baseUrl, session, pathname, init = {}) {
  return fetchWithRetry(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Origin: session.origin,
      Cookie: session.cookie,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function ensureCategories(baseUrl, session) {
  const response = await appRequest(baseUrl, session, '/api/admin/categories');
  if (!response.ok) throw new Error(`Could not list categories: ${await response.text()}`);
  const payload = await response.json();
  const existing = new Map((payload.data || []).map((category) => [category.slug, category]));
  const categories = new Map();
  for (const definition of CATEGORY_DEFINITIONS) {
    let category = existing.get(definition.slug);
    if (!category) {
      const createResponse = await appRequest(baseUrl, session, '/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: definition.name, description: definition.description }),
      });
      if (!createResponse.ok) throw new Error(`Could not create ${definition.name}: ${await createResponse.text()}`);
      category = (await createResponse.json()).data;
    }
    categories.set(definition.slug, category);
  }
  return categories;
}

async function loadExistingWallpapers(baseUrl, session) {
  const wallpapers = [];
  for (const status of ['published', 'draft', 'archived']) {
    for (let page = 1; page <= 500; page += 1) {
      const response = await appRequest(baseUrl, session, `/api/admin/wallpapers?status=${status}&limit=50&page=${page}`);
      if (!response.ok) throw new Error(`Could not list ${status} wallpapers: ${await response.text()}`);
      const payload = await response.json();
      wallpapers.push(...(payload.wallpapers || []));
      if (page >= (payload.totalPages || 1)) break;
    }
  }
  return wallpapers;
}

async function downloadCandidate(candidate) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await delay(400);
      response = await fetch(candidate.assetUrl, {
        signal: AbortSignal.timeout(25_000),
        headers: { 'User-Agent': USER_AGENT, Accept: candidate.mimeType },
      });
      if (response.ok) break;
      lastError = new Error(`source returned HTTP ${response.status}`);
      const retryAfter = response.status === 429 ? Number(response.headers.get('retry-after')) : NaN;
      await response.body?.cancel().catch(() => undefined);
      response = undefined;
      const waitTime = Number.isFinite(retryAfter) && retryAfter >= 0 ? (retryAfter + 1) * 1000 : 2000 * (attempt + 1);
      await delay(Math.min(15_000, waitTime));
    } catch (error) {
      lastError = error;
      await delay(1200 * (attempt + 1));
    }
  }
  if (!response) throw lastError instanceof Error ? lastError : new Error('source download failed');
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') || candidate.size || 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw new Error('source is too large');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('source size is invalid');
  return bytes;
}

async function uploadCandidate(baseUrl, session, category, candidate) {
  const bytes = await downloadCandidate(candidate);
  const extension = candidate.mimeType === 'image/jpeg' ? 'jpg' : candidate.mimeType.split('/')[1];
  const form = new FormData();
  form.set('originalFile', new Blob([bytes], { type: candidate.mimeType }), `${candidate.sourceExternalId}.${extension}`);
  form.set('title', candidate.title);
  form.set('description', candidate.description);
  form.set('creator', candidate.creator);
  form.set('categoryId', category.id);
  form.set('sourceProvider', 'wikimedia_commons');
  form.set('sourceExternalId', candidate.sourceExternalId);
  form.set('sourceUrl', candidate.sourceUrl);
  if (candidate.creatorUrl) form.set('creatorUrl', candidate.creatorUrl);
  form.set('sourceProvenance', candidate.sourceProvenance);
  form.set('licenseNote', candidate.licenseNote);
  form.set('status', 'published');
  form.set('isFeatured', 'false');
  form.set('width', String(candidate.width));
  form.set('height', String(candidate.height));

  const response = await appRequest(baseUrl, session, '/api/admin/wallpapers', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `upload returned HTTP ${response.status}`);
    error.isDuplicate = response.status === 409 || payload.code === 'DUPLICATE';
    throw error;
  }
  return payload.data;
}

async function importCategory(baseUrl, session, definition, category, existingWallpapers) {
  const existingForCategory = existingWallpapers.filter((wallpaper) => wallpaper.categoryId === category.id
    && wallpaper.sourceProvider === 'wikimedia_commons');
  const needed = Math.max(0, TARGET_PER_CATEGORY - existingForCategory.length);
  if (needed === 0) {
    console.log(`${definition.name}: already has ${TARGET_PER_CATEGORY} Wikimedia wallpapers; skipped.`);
    return { imported: 0, failed: 0, existing: existingForCategory.length };
  }

  const existingSourceIds = new Set(existingWallpapers
    .filter((wallpaper) => wallpaper.sourceProvider === 'wikimedia_commons' && wallpaper.sourceExternalId)
    .map((wallpaper) => wallpaper.sourceExternalId));
  console.log(`\n${definition.name}: need ${needed} new wallpapers.`);
  const fileTitles = await collectFileTitles(definition, needed);
  const candidates = interleaveOrientations(await loadCandidates(fileTitles, existingSourceIds, definition));
  console.log(`${definition.name}: ${candidates.length} high-resolution, license-approved candidates.`);
  if (candidates.length < needed) throw new Error(`${definition.name} has only ${candidates.length} eligible candidates`);

  let cursor = 0;
  let imported = 0;
  let failed = 0;
  const failures = [];

  await new Promise((resolveImport) => {
    let active = 0;
    const launch = () => {
      while (active < DOWNLOAD_CONCURRENCY && imported + active < needed && cursor < candidates.length) {
        const candidate = candidates[cursor];
        cursor += 1;
        active += 1;
        console.log(`${definition.name}: trying ${cursor}/${candidates.length} — ${candidate.title}`);
        void uploadCandidate(baseUrl, session, category, candidate).then(() => {
          imported += 1;
          existingSourceIds.add(candidate.sourceExternalId);
          if (imported % 10 === 0 || imported === needed) {
            console.log(`${definition.name}: imported ${imported}/${needed}`);
          }
        }).catch((error) => {
          failed += 1;
          const failure = `${candidate.title}: ${error instanceof Error ? error.message : 'upload failed'}`;
          failures.push(failure);
          if (failures.length <= 5) console.log(`${definition.name}: skipped — ${failure}`);
        }).finally(() => {
          active -= 1;
          if (imported >= needed || (active === 0 && cursor >= candidates.length)) resolveImport();
          else launch();
        });
      }
      if (active === 0 && (imported >= needed || cursor >= candidates.length)) resolveImport();
    };
    launch();
  });

  if (imported < needed) {
    throw new Error(`${definition.name}: imported ${imported}/${needed}; sample failures: ${failures.slice(0, 5).join(' | ')}`);
  }
  if (failures.length > 0) console.log(`${definition.name}: skipped ${failures.length} failed/duplicate candidates.`);
  return { imported, failed, existing: existingForCategory.length };
}

async function main() {
  const baseUrl = (process.env.ELYSIUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const health = await fetchWithRetry(`${baseUrl}/api/health`);
  if (!health.ok) throw new Error(`Elysium is not healthy at ${baseUrl}`);
  const session = await login(baseUrl);
  const categories = await ensureCategories(baseUrl, session);
  const existingWallpapers = await loadExistingWallpapers(baseUrl, session);
  const report = {};

  const categoryFilter = process.env.CATEGORIES
    ? process.env.CATEGORIES.split(',').map((item) => item.trim().toLowerCase())
    : null;

  const targetDefinitions = categoryFilter
    ? CATEGORY_DEFINITIONS.filter((definition) => categoryFilter.includes(definition.slug) || categoryFilter.includes(definition.name.toLowerCase()))
    : CATEGORY_DEFINITIONS;

  for (const definition of targetDefinitions) {
    const category = categories.get(definition.slug);
    report[definition.slug] = await importCategory(baseUrl, session, definition, category, existingWallpapers);
  }

  console.log('\nImport complete:');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`Wikimedia import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
