import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const rustDir = join(root, 'src-tauri');
const outputPath = join(root, 'THIRD-PARTY-NOTICES.txt');
const checkOnly = process.argv.includes('--check');
const divider = '='.repeat(88);
const subDivider = '-'.repeat(88);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryUrl(pkg) {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!raw) return pkg.homepage ?? null;
  return raw.replace(/^git\+/, '').replace(/\.git$/, '');
}

function authorText(pkg) {
  const values = [];
  if (typeof pkg.author === 'string') values.push(pkg.author);
  else if (pkg.author?.name) values.push(pkg.author.email ? `${pkg.author.name} <${pkg.author.email}>` : pkg.author.name);
  for (const contributor of pkg.contributors ?? []) {
    if (typeof contributor === 'string') values.push(contributor);
    else if (contributor?.name) values.push(contributor.email ? `${contributor.name} <${contributor.email}>` : contributor.name);
  }
  return [...new Set(values)].join('; ');
}

function packageFiles(packageDir, pattern) {
  return readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function addTextBlock(map, text, usedBy, label) {
  const normalized = normalizeText(text);
  if (!normalized) throw new Error(`${usedBy}: ${label} 파일이 비어 있습니다.`);
  const key = hashText(normalized);
  const current = map.get(key) ?? { text: normalized, labels: new Set(), usedBy: new Set() };
  current.labels.add(label);
  current.usedBy.add(usedBy);
  map.set(key, current);
}

function runCargoAbout(tempJson) {
  const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const result = spawnSync(cargo, [
    'about', 'generate',
    '--format', 'json',
    '--locked',
    '--offline',
    '--fail',
    '--config', 'about.toml',
    '--output-file', tempJson,
  ], {
    cwd: rustDir,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      '`cargo-about` 실행에 실패했습니다.',
      '설치: cargo install --locked cargo-about --version 0.9.1 --features cli',
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
}

function collectJavaScript() {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const components = [];
  const licenseBlocks = new Map();
  const noticeBlocks = new Map();

  for (const [relativePath, lockPackage] of Object.entries(lock.packages ?? {})) {
    if (!relativePath.startsWith('node_modules/') || lockPackage.dev) continue;
    const packageDir = join(root, relativePath);
    const manifestPath = join(packageDir, 'package.json');
    if (!existsSync(manifestPath)) throw new Error(`${relativePath}: package.json이 없습니다. npm ci를 먼저 실행하세요.`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const name = manifest.name ?? relativePath.replace(/^node_modules\//, '');
    const version = manifest.version ?? lockPackage.version;
    const id = `${name}@${version}`;
    const licenseFiles = packageFiles(packageDir, /^(licen[cs]e|copying)(?:[._-].*)?$/i);
    if (licenseFiles.length === 0) throw new Error(`${id}: 배포할 라이선스 파일을 찾지 못했습니다.`);
    for (const file of licenseFiles) {
      addTextBlock(licenseBlocks, readFileSync(join(packageDir, file), 'utf8'), id, file);
    }
    for (const file of packageFiles(packageDir, /^(notice|copyright)(?:[._-].*)?$/i)) {
      addTextBlock(noticeBlocks, readFileSync(join(packageDir, file), 'utf8'), id, file);
    }
    components.push({
      id,
      name,
      version,
      license: manifest.license ?? lockPackage.license ?? 'UNKNOWN',
      authors: authorText(manifest),
      source: repositoryUrl(manifest) ?? `https://www.npmjs.com/package/${encodeURIComponent(name)}/v/${version}`,
    });
  }

  components.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return { components, licenseBlocks, noticeBlocks };
}

function collectRust(cargoAbout) {
  const components = cargoAbout.crates.map(({ package: pkg, license }) => ({
    id: `${pkg.name}@${pkg.version}`,
    name: pkg.name,
    version: pkg.version,
    license,
    authors: [...new Set(pkg.authors ?? [])].join('; '),
    source: pkg.repository ?? `https://crates.io/crates/${pkg.name}/${pkg.version}`,
    manifestPath: pkg.manifest_path,
  })).sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const noticeBlocks = new Map();
  for (const component of components) {
    const packageDir = dirname(component.manifestPath);
    for (const file of packageFiles(packageDir, /^(notice|copyright)(?:[._-].*)?$/i)) {
      addTextBlock(noticeBlocks, readFileSync(join(packageDir, file), 'utf8'), component.id, file);
    }
  }

  const licenseBlocks = cargoAbout.licenses.map((license) => ({
    id: license.id,
    name: license.name,
    text: normalizeText(license.text),
    usedBy: [...new Set(license.used_by.map((item) => `${item.crate.name}@${item.crate.version}`))]
      .sort((a, b) => a.localeCompare(b, 'en')),
  })).sort((a, b) => `${a.id}:${hashText(a.text)}`.localeCompare(`${b.id}:${hashText(b.text)}`, 'en'));

  if (licenseBlocks.some((block) => !block.text)) throw new Error('Rust 라이선스 전문이 비어 있습니다.');
  return { components, licenseBlocks, noticeBlocks };
}

function componentLines(components) {
  return components.flatMap((component) => [
    `${component.id} — ${component.license}`,
    ...(component.authors ? [`  Copyright/Authors: ${component.authors}`] : []),
    `  Source: ${component.source}`,
  ]);
}

function mapBlocks(map, prefix) {
  return [...map.entries()]
    .map(([hash, block]) => ({ hash, ...block, usedBy: [...block.usedBy].sort((a, b) => a.localeCompare(b, 'en')) }))
    .sort((a, b) => `${[...a.labels].sort().join(',')}:${a.hash}`.localeCompare(`${[...b.labels].sort().join(',')}:${b.hash}`, 'en'))
    .flatMap((block, index) => [
      subDivider,
      `[${prefix}-${String(index + 1).padStart(3, '0')}] ${[...block.labels].sort().join(', ')}`,
      `Used by: ${block.usedBy.join(', ')}`,
      '',
      block.text,
      '',
    ]);
}

function rustLicenseLines(blocks) {
  return blocks.flatMap((block, index) => [
    subDivider,
    `[RUST-LICENSE-${String(index + 1).padStart(3, '0')}] ${block.name} (${block.id})`,
    `Used by: ${block.usedBy.join(', ')}`,
    '',
    block.text,
    '',
  ]);
}

function buildNotices(javaScript, rust) {
  // 공개 후보와 비공개 준비 원본 모두 같은 원문에서 참조 고지를 생성합니다.
  const referenceRoot = existsSync(join(root, 'licenses/reference'))
    ? join(root, 'licenses/reference') : join(root, 'public-source-template/licenses/reference');
  // 공식 고정판의 라이선스 전문을 파일에서 읽습니다. 타 패키지 전문으로 대체하지 않습니다.
  const references = [
    {
      "file": "colour-BSD-3-Clause.txt",
      "label": "Colour — BSD-3-Clause",
      "url": "https://raw.githubusercontent.com/colour-science/colour/907242acd5e514a94b626a9dcf4bfe953aa0b8dc/LICENSE",
      "sha256": "cd9efcd4b6ac5218189d90ffc25f9766f8411e62c5526c452145e1cc8b19baf7"
    },
    {
      "file": "daltonlens-MIT.txt",
      "label": "DaltonLens-Python — MIT",
      "url": "https://raw.githubusercontent.com/DaltonLens/DaltonLens-Python/3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d/LICENSE",
      "sha256": "aaef9255b6f8684950d56c1db08906f1f16d8dfc3d7c43197f6ef7789a843cc2"
    },
    {
      "file": "tailwind-MIT.txt",
      "label": "Tailwind CSS — MIT",
      "url": "https://raw.githubusercontent.com/tailwindlabs/tailwindcss/f723e834ad032aa0f42405f95f684be3cfcac8ef/LICENSE",
      "sha256": "60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985"
    },
    {
      "file": "radix-MIT.txt",
      "label": "Radix Colors — MIT",
      "url": "https://raw.githubusercontent.com/radix-ui/colors/dbdb85470547c7d34b9001f48fddb08ded335979/LICENSE",
      "sha256": "d981bc30e0d78b9ffc8f279fcaa274ea0444ff51d983548a609397d5c8a42dc2"
    },
    {
      "file": "leonardo-Apache-2.0.txt",
      "label": "Adobe Leonardo — Apache-2.0",
      "url": "https://raw.githubusercontent.com/adobe/leonardo/eb6481da40df27654ac8efa42038007f6fad2431/LICENSE",
      "sha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
    }
  ];
  const referenceLicenses = references.flatMap((reference) => {
    // Git의 줄바꿈 변환만 정규화하고 원자료 SHA-256을 확인합니다.
    const original = readFileSync(join(referenceRoot, reference.file), 'utf8').replace(/\r\n?/g, '\n');
    if (hashText(original) !== reference.sha256) {
      throw new Error(`공식 고정판의 라이선스 원문과 다릅니다: ${reference.file}`);
    }
    return [
      subDivider,
      `[REFERENCE-LICENSE] ${reference.label}`,
      `File: licenses/reference/${reference.file}`,
      `Original license: ${reference.url}`,
      `SHA-256 (LF): ${reference.sha256}`,
      '',
      original.trim(),
      '',
    ];
  });

  const mpl = rust.components.filter((component) => component.license.includes('MPL-2.0'));
  const lines = [
    'THIRD-PARTY SOFTWARE NOTICES',
    'PCssak Palette — Copyright 2026 PCssak and the respective contributors.',
    'Application licensing is specified in the LICENSE or licence attached to the received copy.',
    '',
    'AUTOMATICALLY GENERATED — DO NOT EDIT BY HAND',
    'Run: npm run licenses:generate',
    'Verify: npm run licenses:check',
    'Inputs: package-lock.json, src-tauri/Cargo.lock, installed package license files, fixed reference licenses',
    'Target: x86_64-pc-windows-msvc (runtime dependencies; dev/build-only packages excluded)',
    '',
    `Bundled components: JavaScript ${javaScript.components.length}, Rust ${rust.components.length}`,
    '',
    divider,
    'REFERENCE IMPLEMENTATIONS AND PLATFORM RUNTIME',
    divider,
    'Colour — BSD-3-Clause — Machado severity 1.0 matrix coefficients',
    'Copyright 2013 Colour Developers',
    'Source: https://github.com/colour-science/colour/blob/907242acd5e514a94b626a9dcf4bfe953aa0b8dc/colour/blindness/datasets/machado2010.py',
    'DaltonLens-Python — MIT — matrix cross-check; rounding policy differs',
    'Copyright (c) 2021 DaltonLens',
    'Source: https://github.com/DaltonLens/DaltonLens-Python/blob/3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d/daltonlens/simulate.py',
    'See docs/COLOR-PROVENANCE.md in the source edition for acquisition and limitations.',
    '',
    'Tailwind CSS — MIT — palette-step/spacing design reference; exact table adoption not established',
    'Copyright (c) Tailwind Labs, Inc.',
    'Source: https://github.com/tailwindlabs/tailwindcss/blob/f723e834ad032aa0f42405f95f684be3cfcac8ef/packages/tailwindcss/theme.css',
    '',
    'Radix Colors — MIT — semantic-step design reference; exact table adoption not established',
    'Copyright (c) 2021-2022 Modulz; Copyright (c) 2022-Present WorkOS',
    'Source: https://github.com/radix-ui/colors/blob/dbdb85470547c7d34b9001f48fddb08ded335979/src/light.ts',
    '',
    'Leonardo — Apache-2.0 — contrast-driven behavior/API reference; Palette ratios are not an official fixed table',
    'Authors: Nate Baldwin and contributors',
    'Source: https://github.com/adobe/leonardo/blob/eb6481da40df27654ac8efa42038007f6fad2431/packages/contrast-colors/README.md',
    'No separate NOTICE file occurs in the non-truncated tree for this pinned Leonardo revision.',
    '',
    'Tauri Bundler NSIS installer template 2.11.4 — Apache-2.0 OR MIT',
    'Copyright: Tauri Programme within The Commons Conservancy and contributors',
    'Source: https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi',
    'PCssak Palette modifies the template to limit language selection and localized EULA',
    'acceptance to clean installs and to pass the selected language to the first app run.',
    '',
    'Microsoft Edge WebView2 Runtime — Microsoft platform component',
    'Terms: https://www.microsoft.com/software-download/retail-webview2',
    'PCssak Palette does not modify WebView2. Its operating-system/runtime communications',
    'and any explicitly enabled application updater are separate from local color processing.',
    '',
    divider,
    'JAVASCRIPT / FRONTEND COMPONENTS',
    divider,
    ...componentLines(javaScript.components),
    '',
    divider,
    'RUST / NATIVE COMPONENTS',
    divider,
    ...componentLines(rust.components.map(({ manifestPath: _manifestPath, ...component }) => component)),
    '',
    divider,
    'MPL-2.0 SOURCE CODE AVAILABILITY',
    divider,
    'The following covered components are distributed in executable form. Their exact',
    'Source Code Form remains available under MPL-2.0 at these versioned package pages:',
    ...mpl.map((component) => `  ${component.id}: https://crates.io/crates/${component.name}/${component.version}`),
    '',
    'MPL-2.0 is file-level copyleft. It applies to the covered components and modifications',
    'to their covered files. Preserve original MPL notices and source availability.',
    'See the source edition COPYRIGHT.md for combining those files into a GPL larger work.',
    '',
    divider,
    'MANUAL REFERENCE LICENSE TEXTS',
    divider,
    ...referenceLicenses,
    divider,
    'JAVASCRIPT LICENSE TEXTS',
    divider,
    ...mapBlocks(javaScript.licenseBlocks, 'JS-LICENSE'),
    divider,
    'RUST LICENSE TEXTS',
    divider,
    ...rustLicenseLines(rust.licenseBlocks),
    divider,
    'ADDITIONAL UPSTREAM NOTICE AND COPYRIGHT FILES',
    divider,
    ...mapBlocks(javaScript.noticeBlocks, 'JS-NOTICE'),
    ...mapBlocks(rust.noticeBlocks, 'RUST-NOTICE'),
  ];
  return `${lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()}\n`;
}

function main() {
  const tempDir = mkdtempSync(join(tmpdir(), 'pcssak-licenses-'));
  try {
    const cargoJson = join(tempDir, 'cargo-about.json');
    runCargoAbout(cargoJson);
    const generated = buildNotices(collectJavaScript(), collectRust(JSON.parse(readFileSync(cargoJson, 'utf8'))));
    if (checkOnly) {
      const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').replace(/\r\n?/g, '\n') : '';
      if (current !== generated) {
        throw new Error('THIRD-PARTY-NOTICES.txt가 현재 잠금 파일과 다릅니다. npm run licenses:generate를 실행하세요.');
      }
      console.log('제3자 라이선스 고지가 현재 잠금 파일과 일치합니다.');
      return;
    }
    writeFileSync(outputPath, generated, 'utf8');
    console.log(`제3자 라이선스 고지를 생성했습니다: ${outputPath}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
