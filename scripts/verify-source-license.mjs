// 설치기·앱에 같은 GPL 원문을 제공하며 번역 안내는 별도 이용 제한을 추가하지 않습니다.
import { existsSync, lstatSync, realpathSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
function rejectLink(file) {
  if (existsSync(file) && (lstatSync(file).isSymbolicLink() || realpathSync(file) !== file)) {
    throw new Error('라이선스 입출력에 링크 경로를 사용할 수 없습니다.');
  }
}
rejectLink(root);
rejectLink(resolve(root, 'LICENSE'));
const license = readFileSync(resolve(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim();
// SPDX 공식 고정판 원문이며 줄끝만 정규화합니다. 본문 변조를 통과시키지 않습니다.
if (createHash('sha256').update(license + '\n').digest('hex') !== 'fb981668c18a279e285fc4d83fba1e836cc84dd4daa73c9697d3cfd2d8aca6e0') {
  throw new Error('GPL 원문 해시가 공식 고정판과 다릅니다.');
}
if (!license.startsWith('GNU GENERAL PUBLIC LICENSE') || !license.includes('END OF TERMS AND CONDITIONS')) {
  throw new Error('완전한 GPLv3 원문이 필요합니다.');
}
const summaries = {
  en: 'This source build is licensed under GPL-3.0-only. You may use, modify and redistribute it, including commercially, under that license. Third-party components retain their own notices. There is no warranty except as required by law. The following English GPL text is authoritative; this summary adds no restrictions.',
  ko: '이 소스 빌드는 GPL-3.0-only로 제공됩니다. 해당 조건에 따라 사용·수정·무료 또는 유료 재배포할 수 있습니다. 제3자 구성요소의 원래 고지는 유지됩니다. 법률이 요구하는 경우를 제외하고 보증하지 않습니다. 아래 영문 GPL 원문이 기준이며 이 요약은 추가 제한을 부과하지 않습니다.',
  ja: 'このソースビルドは GPL-3.0-only で提供されます。同ライセンスに従い、使用、変更、無償または有償での再配布が可能です。第三者の表示は維持されます。法律上必要な場合を除き保証はありません。以下の英語 GPL 原文が正式な条文であり、この要約は制限を追加しません。',
  'zh-Hans': '本源码构建版本采用 GPL-3.0-only 许可证。遵守该许可证即可使用、修改及免费或商业再分发。第三方组件保留原有声明。除法律要求外，不提供担保。以下英文 GPL 原文为准，本摘要不增加限制。',
  'zh-Hant': '本原始碼建置版本採用 GPL-3.0-only 授權。遵守該授權即可使用、修改及免費或商業再散布。第三方元件保留原有聲明。除法律要求外，不提供擔保。以下英文 GPL 原文為準，本摘要不增加限制。',
  fr: 'Cette compilation est sous GPL-3.0-only. Vous pouvez l’utiliser, la modifier et la redistribuer, gratuitement ou commercialement, selon cette licence. Les mentions des tiers sont conservées. Aucune garantie, sauf obligation légale. Le texte anglais de la GPL ci-dessous fait foi ; ce résumé n’ajoute aucune restriction.',
  de: 'Dieser Quellcode-Build steht unter GPL-3.0-only. Nutzung, Änderung und kostenlose oder kommerzielle Weitergabe sind unter dieser Lizenz erlaubt. Hinweise Dritter bleiben erhalten. Keine Gewährleistung, soweit gesetzlich zulässig. Der folgende englische GPL-Text ist maßgeblich; diese Zusammenfassung fügt keine Einschränkungen hinzu.',
  ru: 'Эта сборка из исходного кода предоставляется по GPL-3.0-only. Лицензия разрешает использование, изменение и бесплатное или коммерческое распространение при соблюдении её условий. Уведомления третьих лиц сохраняются. Гарантии отсутствуют, кроме обязательных по закону. Ниже приведён определяющий английский текст GPL; это резюме не вводит ограничений.',
  es: 'Esta compilación se ofrece bajo GPL-3.0-only. Se permite usarla, modificarla y redistribuirla, gratis o comercialmente, conforme a esa licencia. Se conservan los avisos de terceros. Sin garantía, salvo obligación legal. Rige el texto inglés de GPL que sigue; este resumen no añade restricciones.',
  'es-419': 'Esta compilación se ofrece bajo GPL-3.0-only. Se permite usarla, modificarla y redistribuirla, gratis o comercialmente, conforme a esa licencia. Se conservan los avisos de terceros. Sin garantía, salvo obligación legal. Rige el texto inglés de GPL que sigue; este resumen no añade restricciones.',
  'pt-BR': 'Esta compilação é oferecida sob GPL-3.0-only. É permitido usar, modificar e redistribuir, gratuitamente ou comercialmente, conforme essa licença. Os avisos de terceiros são preservados. Sem garantia, salvo obrigação legal. O texto inglês da GPL abaixo prevalece; este resumo não acrescenta restrições.',
  tr: 'Bu kaynak kod derlemesi GPL-3.0-only ile sunulur. Lisans koşulları altında kullanım, değiştirme ve ücretsiz veya ticari yeniden dağıtım mümkündür. Üçüncü taraf bildirimleri korunur. Yasaların gerektirdiği durumlar dışında garanti yoktur. Aşağıdaki İngilizce GPL metni esastır; bu özet ek kısıtlama getirmez.',
};
const eulaDirectory = resolve(root, 'src-tauri/installer/eula');
for (const directory of ['src-tauri', 'src-tauri/installer', 'src-tauri/installer/eula']) rejectLink(resolve(root, directory));
if (write) mkdirSync(eulaDirectory, { recursive: true });
for (const [locale, summary] of Object.entries(summaries)) {
  const expected = `PCssak Palette Source — GPL-3.0-only\n\n${summary}\n\n${license}\n`.replace(/\n/g, '\r\n');
  const file = resolve(eulaDirectory, `${locale}.txt`);
  rejectLink(file);
  if (write) writeFileSync(file, expected, 'utf8');
  if (readFileSync(file, 'utf8') !== expected || Buffer.byteLength(expected) > 64 * 1024) {
    throw new Error(`${locale}: 공개 설치 라이선스 원문·한도 불일치`);
  }
}
if (readdirSync(eulaDirectory).sort().join(',') !== Object.keys(summaries).map(x => x + '.txt').sort().join(',')) {
  throw new Error('설치 라이선스 파일 목록 불일치');
}
const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
for (const locale of Object.keys(summaries)) {
  if (config.bundle.resources[`installer/eula/${locale}.txt`] !== `EULA/${locale}.txt`) {
    throw new Error(`${locale}: 앱 라이선스 연결 누락`);
  }
}
if (config.bundle.licenseFile !== 'installer/eula/en.txt' || config.bundle.resources['../LICENSE'] !== 'LICENSE') {
  throw new Error('설치기 또는 앱의 GPL 원문 연결 누락');
}
console.log('공개 소스 라이선스 검사 통과: 12개 안내·동일 GPL 원문·앱 자산 연결');
