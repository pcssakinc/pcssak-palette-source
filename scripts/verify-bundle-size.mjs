import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDirectory = join(root, 'dist');
const assetsDirectory = join(distDirectory, 'assets');
const manifestPath = join(distDirectory, '.vite', 'manifest.json');

// v0.1.6의 실제 두 색·고급 역할 작업 공간과 12개 언어를 포함한 고정 기준선입니다.
// 데스크톱 로컬 자산이라도 기능 추가를 이유로 무제한 증가하지 않도록 측정값에 약 2%만 허용합니다.
const maximumChunkBytes = 500_000;
const maximumTotalBytes = 830_000;
const maximumTotalGzipBytes = 240_000;
const requiredGroups = [
  { name: 'react-vendor', prefix: 'react-vendor-' },
  { name: 'color-vendor', prefix: 'color-vendor-' },
  { name: 'tauri-vendor', prefix: 'tauri-vendor-' },
  { name: 'i18n-v017', prefix: 'i18n-v017-' },
  { name: 'i18n', prefix: 'i18n-' },
];

const errors = [];
let entries;
let manifest;
try {
  [entries, manifest] = await Promise.all([
    readdir(assetsDirectory, { withFileTypes: true }),
    readFile(manifestPath, 'utf8').then((contents) => JSON.parse(contents)),
  ]);
} catch (error) {
  console.error(`번들 검증 실패: 산출물 또는 Vite manifest를 읽을 수 없습니다: ${error.message}`);
  process.exit(1);
}

if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  console.error('번들 검증 실패: Vite manifest의 최상위 값이 객체가 아닙니다.');
  process.exit(1);
}

const normalizeManifestFile = (file) => file.replaceAll('\\', '/');
const isJavascriptChunk = (chunk) =>
  chunk &&
  typeof chunk === 'object' &&
  typeof chunk.file === 'string' &&
  normalizeManifestFile(chunk.file).endsWith('.js');

const javascriptFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort();

if (javascriptFiles.length === 0) {
  console.error('번들 검증 실패: dist/assets에 JavaScript 청크가 없습니다.');
  process.exit(1);
}

const diskJavascriptFiles = new Set(javascriptFiles.map((name) => `assets/${name}`));
const javascriptEntries = Object.entries(manifest).filter(([, chunk]) => isJavascriptChunk(chunk));
const manifestJavascriptFiles = new Set();
const fileOwner = new Map();

for (const [key, chunk] of javascriptEntries) {
  const file = normalizeManifestFile(chunk.file);
  manifestJavascriptFiles.add(file);
  if (fileOwner.has(file)) {
    errors.push(`${file}을 둘 이상의 manifest 항목이 가리킵니다: ${fileOwner.get(file)}, ${key}`);
  } else {
    fileOwner.set(file, key);
  }
  if (!diskJavascriptFiles.has(file)) {
    errors.push(`manifest의 JavaScript 파일이 dist/assets에 없습니다: ${file}`);
  }
}

for (const file of diskJavascriptFiles) {
  if (!manifestJavascriptFiles.has(file)) {
    errors.push(`dist/assets의 JavaScript 파일이 manifest에 없습니다: ${file}`);
  }
}

const entryChunks = javascriptEntries.filter(([, chunk]) => chunk.isEntry === true);
if (entryChunks.length !== 1) {
  errors.push(`JavaScript 진입점이 정확히 하나여야 하지만 ${entryChunks.length}개입니다.`);
}
const [entryKey, entryChunk] = entryChunks[0] ?? [];
const entryFile = normalizeManifestFile(entryChunk?.file ?? '');
if (
  entryKey !== 'index.html' ||
  entryChunk?.src !== 'index.html' ||
  !/^assets\/index-[^/]+\.js$/u.test(entryFile)
) {
  errors.push('index.html 진입점의 key, src 또는 출력 파일 계약이 다릅니다.');
}

const requiredGroupKeys = new Set();
for (const required of requiredGroups) {
  const matches = javascriptEntries.filter(([, chunk]) => chunk.name === required.name);
  if (matches.length !== 1) {
    errors.push(`${required.name} manifest 그룹이 정확히 하나여야 하지만 ${matches.length}개입니다.`);
    continue;
  }

  const [key, chunk] = matches[0];
  const file = normalizeManifestFile(chunk.file);
  const assetName = file.startsWith('assets/') ? file.slice('assets/'.length) : file;
  if (
    !file.startsWith(`assets/${required.prefix}`) ||
    !file.endsWith('.js') ||
    assetName.includes('/')
  ) {
    errors.push(`${required.name} 그룹의 출력 파일명이 올바르지 않습니다: ${file}`);
    continue;
  }
  if (!diskJavascriptFiles.has(file)) {
    errors.push(`${required.name} 그룹의 실제 파일이 없습니다: ${file}`);
    continue;
  }
  requiredGroupKeys.add(key);
}

const referenceCache = new Map();
function readReferences(key, field) {
  const cacheKey = `${key}:${field}`;
  if (referenceCache.has(cacheKey)) return referenceCache.get(cacheKey);

  const value = manifest[key]?.[field];
  if (value === undefined) {
    referenceCache.set(cacheKey, []);
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${key}의 ${field}가 문자열 배열이 아닙니다.`);
    referenceCache.set(cacheKey, []);
    return [];
  }

  const references = [];
  for (const dependencyKey of new Set(value)) {
    if (!isJavascriptChunk(manifest[dependencyKey])) {
      errors.push(`${key}의 ${field}가 없는 JavaScript 청크를 참조합니다: ${dependencyKey}`);
      continue;
    }
    references.push(dependencyKey);
  }
  referenceCache.set(cacheKey, references);
  return references;
}

// 필수 그룹과 모든 생성 청크가 단일 HTML 진입점에서 정적 또는 동적으로 연결되어야 합니다.
const reachable = new Set();
const pending = entryKey ? [entryKey] : [];
while (pending.length > 0) {
  const key = pending.pop();
  if (reachable.has(key)) continue;
  reachable.add(key);
  pending.push(...readReferences(key, 'imports'), ...readReferences(key, 'dynamicImports'));
}

for (const requiredKey of requiredGroupKeys) {
  if (!reachable.has(requiredKey)) {
    errors.push(`필수 그룹이 index.html 진입점에서 도달할 수 없습니다: ${requiredKey}`);
  }
}
for (const [key] of javascriptEntries) {
  if (!reachable.has(key)) {
    errors.push(`진입점에서 도달할 수 없는 JavaScript 청크가 있습니다: ${key}`);
  }
}

// Vite manifest가 제공하는 정적 imports만 따라가며 순환을 검사합니다.
const visitState = new Map();
const visitPath = [];
let detectedCycle = null;
function visitStaticImports(key) {
  const state = visitState.get(key) ?? 0;
  if (state === 1) {
    const cycleStart = visitPath.indexOf(key);
    detectedCycle = [...visitPath.slice(cycleStart), key];
    return;
  }
  if (state === 2 || detectedCycle) return;

  visitState.set(key, 1);
  visitPath.push(key);
  for (const dependencyKey of readReferences(key, 'imports')) {
    visitStaticImports(dependencyKey);
    if (detectedCycle) return;
  }
  visitPath.pop();
  visitState.set(key, 2);
}

for (const [key] of javascriptEntries) {
  visitStaticImports(key);
  if (detectedCycle) break;
}
if (detectedCycle) {
  const cycleFiles = detectedCycle.map((key) =>
    normalizeManifestFile(manifest[key]?.file ?? key),
  );
  errors.push(`정적 import 순환이 있습니다: ${cycleFiles.join(' -> ')}`);
}

const chunks = [];
for (const name of javascriptFiles) {
  const filePath = join(assetsDirectory, name);
  const bytes = await readFile(filePath);
  const rawBytes = (await stat(filePath)).size;
  const gzipBytes = gzipSync(bytes, { level: 9 }).length;
  chunks.push({ name, rawBytes, gzipBytes });
  if (rawBytes > maximumChunkBytes) {
    errors.push(`${name} 크기 ${rawBytes}바이트가 한도 ${maximumChunkBytes}바이트를 넘습니다.`);
  }
}

const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0);
const totalGzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
if (totalBytes > maximumTotalBytes) {
  errors.push(`전체 JavaScript ${totalBytes}바이트가 v0.1.6 기준선 ${maximumTotalBytes}바이트를 넘습니다.`);
}
if (totalGzipBytes > maximumTotalGzipBytes) {
  errors.push(`전체 gzip ${totalGzipBytes}바이트가 v0.1.6 기준선 ${maximumTotalGzipBytes}바이트를 넘습니다.`);
}

for (const chunk of chunks) {
  console.log(`- ${chunk.name}: ${chunk.rawBytes}바이트, gzip ${chunk.gzipBytes}바이트`);
}
console.log(`전체 JavaScript: ${totalBytes}바이트, gzip ${totalGzipBytes}바이트`);

if (errors.length > 0) {
  console.error(`번들 회귀 검증 실패 (${errors.length}건)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  '번들 회귀 검증 통과: Vite manifest 경계·진입점 도달성·청크 500KB 이하·v0.1.6 총량 한도·정적 import 무순환',
);
