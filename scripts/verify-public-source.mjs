// 공개 후보의 파일·권한·설명 경계를 검사합니다. 전문 비밀정보 검사나 침투 시험을 대신하지 않습니다.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = ['LICENSE', 'COPYRIGHT.md', 'README.md', 'README.ko.md', 'CONTRIBUTING.md',
  'SECURITY.md', 'docs/BUILDING.md', 'docs/PRIVACY.md', 'docs/COLOR-PROVENANCE.md',
  'src/engine/ase.ts', 'src/engine/pack.ts', 'src/engine/doctor.ts', 'src/engine/role-repair.ts',
  'src-tauri/src/entitlement.rs', 'src-tauri/installer/installer.nsi'];
for (const file of required) if (!existsSync(resolve(root, file))) throw new Error(`필수 공개 입력 누락: ${file}`);
const skip = new Set(['.git', 'node_modules', 'target', 'dist', 'gen']);
const forbidden = /(?:^|\/)(?:website|worklogs|release-repo-template|public-source-template|\.githooks)(?:\/|$)|(?:^|\/)(?:AGENTS|HANDOFF|CURRENT-STATUS|업무일지)\.md$|(?:^|\/)(?:backup|restore)-updater-key|tauri\.beta\.conf|wrangler|\.pcssak-keybackup$/i;
const secretName = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|credentials|id_rsa|id_ed25519)$|\.(?:pfx|p12|pem|key|exe|zip|log)$/i;
const contentPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /[A-Za-z]:[\\/]Users[\\/]/i,
  /github\.com\/pcssakinc\/(?:pcssak-(?:biuja|arodama|gongyu|jamak|modusori)|homepage)\b/i,
];
let count = 0;
function walk(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(directory, entry.name);
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`링크 파일 금지: ${file}`);
    if (!prefix && skip.has(entry.name)) continue;
    if (prefix === 'src-tauri' && (entry.name === 'target' || entry.name === 'gen')) continue;
    if (forbidden.test(file) || secretName.test(file)) throw new Error(`공개 제외 파일 발견: ${file}`);
    if (entry.isDirectory()) { walk(absolute, file); continue; }
    if (!entry.isFile()) throw new Error(`일반 파일이 아님: ${file}`);
    count++;
    if (/\.(?:png|ico|icns|webp|jpg|jpeg|gif)$/i.test(file)) continue;
    const content = readFileSync(absolute, 'utf8');
    // 검사기 본인도 제외하지 않습니다. 원문·의심값은 출력하지 않습니다.
    if (contentPatterns.some(pattern => pattern.test(content))) {
      throw new Error(`민감정보 또는 범위 밖 참조 패턴: ${file}`);
    }
  }
}
// 생성 폴더는 빌드 중 존재할 수 있지만 Git에 추적되면 공개를 차단합니다.
if (existsSync(join(root, '.git'))) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of tracked) {
    if (/^(?:\.git|node_modules|target|dist|gen)\/|^src-tauri\/(?:target|gen)\//.test(file)) {
      throw new Error(`생성 파일은 공개 소스에 추적할 수 없습니다: ${file}`);
    }
  }
}
walk(root);
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (pkg.license !== 'GPL-3.0-only') throw new Error('공개 소스 라이선스 선언 불일치');
const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
if (config.identifier !== 'com.pcssak.palette.source' || config.plugins?.updater || config.bundle.createUpdaterArtifacts) {
  throw new Error('소스 빌드와 기존 설치·업데이트 채널이 분리되지 않았습니다.');
}
const capabilityDirectory = resolve(root, 'src-tauri/capabilities');
const capabilityFiles = readdirSync(capabilityDirectory);
if (capabilityFiles.length !== 1 || capabilityFiles[0] !== 'default.json' || config.app.security.capabilities) {
  throw new Error('추가 권한 파일·인라인 권한은 별도 검토가 필요합니다.');
}
const capabilities = JSON.parse(readFileSync(resolve(capabilityDirectory, 'default.json'), 'utf8'));
for (const permission of capabilities.permissions) {
  const id = typeof permission === 'string' ? permission : permission?.identifier;
  if (typeof id !== 'string' || /^(?:updater|process):/.test(id)) {
    throw new Error('기본 소스 빌드에 공식 업데이트 권한이 없어야 합니다.');
  }
}
console.log(`공개 후보 경계 검사 통과: ${count}개 파일. 별도 비밀정보·권리·빌드 검증 필요.`);
