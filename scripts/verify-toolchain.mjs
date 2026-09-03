import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const expectedNode = (await readFile(resolve(root, '.nvmrc'), 'utf8')).trim();
const packageManagerMatch = /^npm@(.+)$/u.exec(packageJson.packageManager ?? '');

if (!packageManagerMatch) {
  console.error('도구 체인 검증 실패: packageManager가 npm@<버전> 형식이 아닙니다.');
  process.exit(1);
}

const expectedNpm = packageManagerMatch[1];
const actualNode = process.versions.node;
const errors = [];
let actualNpm;

try {
  actualNpm =
    process.platform === 'win32'
      ? execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd --version'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim()
      : execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
} catch {
  errors.push('현재 PATH의 npm 실행 버전을 확인하지 못했습니다.');
}

if (packageJson.engines?.node !== expectedNode) {
  errors.push(`package.json engines.node가 .nvmrc와 다릅니다: ${packageJson.engines?.node}`);
}
if (packageJson.engines?.npm !== expectedNpm) {
  errors.push(`package.json engines.npm이 packageManager와 다릅니다: ${packageJson.engines?.npm}`);
}
if (actualNode !== expectedNode) {
  errors.push(`Node.js ${expectedNode}이 필요하지만 ${actualNode}입니다.`);
}
if (actualNpm && actualNpm !== expectedNpm) {
  errors.push(`npm ${expectedNpm}이 필요하지만 ${actualNpm}입니다.`);
}

if (errors.length > 0) {
  console.error(`도구 체인 검증 실패 (${errors.length}건)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`도구 체인 검증 통과: Node.js ${actualNode}, npm ${actualNpm}`);
