import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.tmp', 'cosmetics-v1');
const target = process.argv.includes('--local') ? '--local' : '--linked';
const publish = process.argv.includes('--publish');
const backgroundsOnly = process.argv.includes('--backgrounds-only');
const catalogs = [
  { kind: 'avatars', file: 'components/avatarAssets.ts', widths: [128, 384] },
  { kind: 'frames', file: 'components/profileFrameAssets.ts', widths: [128, 384] },
  { kind: 'titles', file: 'components/profileTitleAssets.ts', widths: [256, 768] },
];
const backgroundIds = ['banzai', 'sakura'];

function parseAssetMap(source) {
  const assets = [];
  const pattern = /^\s+((?:'[^']+'|[A-Za-z][\w-]*)):\s.*?require\('([^']+)'\),$/gmu;
  for (const match of source.matchAll(pattern)) {
    assets.push({ id: match[1].replaceAll("'", ''), source: match[2] });
  }
  return assets;
}

async function renderVariant(kind, id, relativeSource, width) {
  const source = path.resolve(root, 'components', relativeSource);
  const image = sharp(source).rotate().resize({ width, withoutEnlargement: true });
  const { data, info } = await image.webp({ quality: 82, effort: 6 }).toBuffer({ resolveWithObject: true });
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const objectPath = `v1/${kind}/${id}.${width}.${hash}.webp`;
  const destination = path.join(output, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return { path: objectPath, width: info.width, height: info.height };
}

async function renderBackgroundLayer(id, layer) {
  const source = path.join('/home/rodaja/Descargas/GymBro/backgrounds', `${id}-${layer}.png`);
  const image = sharp(source).rotate().resize({ width: 1440, withoutEnlargement: true });
  const { data, info } = await image.webp({ quality: 80, effort: 6 }).toBuffer({ resolveWithObject: true });
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const objectPath = `v1/backgrounds/${id}-${layer}.${hash}.webp`;
  const destination = path.join(output, objectPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return { path: objectPath, width: info.width, height: info.height };
}

async function buildManifest() {
  await rm(output, { recursive: true, force: true });
  const manifest = { version: 1, assets: { avatars: {}, frames: {}, titles: {}, backgrounds: {} } };
  if (!backgroundsOnly) {
    for (const catalog of catalogs) {
      const source = await readFile(path.join(root, catalog.file), 'utf8');
      for (const asset of parseAssetMap(source)) {
        manifest.assets[catalog.kind][asset.id] = await Promise.all(
          catalog.widths.map((width) => renderVariant(catalog.kind, asset.id, asset.source, width)),
        );
      }
    }
  }
  for (const id of backgroundIds) {
    manifest.assets.backgrounds[id] = await Promise.all([1, 2, 3, 4].map((layer) => renderBackgroundLayer(id, layer)));
  }
  await mkdir(path.join(output, 'v1'), { recursive: true });
  await writeFile(path.join(output, 'v1', backgroundsOnly ? 'backgrounds-manifest.json' : 'manifest.json'), `${JSON.stringify(backgroundsOnly ? { version: 1, assets: { backgrounds: manifest.assets.backgrounds } } : manifest, null, 2)}\n`);
  return manifest;
}

async function upload() {
  if (backgroundsOnly) {
    await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--recursive', '--cache-control', 'public, max-age=31536000, immutable', path.join(output, 'v1', 'backgrounds'), 'ss:///cosmetics/v1'], { cwd: root });
    await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--cache-control', 'public, max-age=300', '--content-type', 'application/json', path.join(output, 'v1', 'backgrounds-manifest.json'), 'ss:///cosmetics/v1/backgrounds-manifest.json'], { cwd: root });
    return;
  }
  await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--recursive', '--cache-control', 'public, max-age=31536000, immutable', path.join(output, 'v1', 'avatars'), 'ss:///cosmetics/v1'], { cwd: root });
  await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--recursive', '--cache-control', 'public, max-age=31536000, immutable', path.join(output, 'v1', 'frames'), 'ss:///cosmetics/v1'], { cwd: root });
  await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--recursive', '--cache-control', 'public, max-age=31536000, immutable', path.join(output, 'v1', 'titles'), 'ss:///cosmetics/v1'], { cwd: root });
  await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--recursive', '--cache-control', 'public, max-age=31536000, immutable', path.join(output, 'v1', 'backgrounds'), 'ss:///cosmetics/v1'], { cwd: root });
  await execFile('npx', ['supabase', '--experimental', '--yes', 'storage', 'cp', target, '--cache-control', 'public, max-age=300', '--content-type', 'application/json', path.join(output, 'v1', 'manifest.json'), 'ss:///cosmetics/v1/manifest.json'], { cwd: root });
}

const manifest = await buildManifest();
if (publish) await upload();
console.log(JSON.stringify({ event: 'cosmetics_prepared', output, assets: Object.fromEntries(Object.entries(manifest.assets).map(([kind, assets]) => [kind, Object.keys(assets).length])), backgroundsOnly, published: publish, target }, null, 2));
