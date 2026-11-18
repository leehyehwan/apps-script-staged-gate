#!/usr/bin/env node
// 배포 전에 Code.gs 설정을 점검하고, 샘플 결과 파일이 시트에 어떻게 나뉘어 들어갈지 미리 본다.
//
//   node check.mjs <Code.gs>                         설정 점검만
//   node check.mjs <Code.gs> <stepKey> <sample.md>   + 샘플 파일 파싱·업로드 검사 결과 출력
//
// Apps Script 서비스(SpreadsheetApp 등)는 호출하지 않는 함수만 쓰므로 Node에서 그대로 돌아간다.
import { readFileSync } from 'node:fs';

const [, , codePath, stepKey, samplePath] = process.argv;
if (!codePath) {
  console.error('사용법: node check.mjs <Code.gs> [stepKey sample.md]');
  process.exit(2);
}

const src = readFileSync(codePath, 'utf8');
let api;
try {
  api = new Function(src + '\nreturn { CONFIG, STEPS, parseResult_, flatten_, checkUpload_, cleanText_ };')();
} catch (e) {
  console.error('❌ Code.gs 문법 오류:', e.message);
  process.exit(1);
}
const { CONFIG, STEPS } = api;
const errors = [];
const warns = [];

if (!Array.isArray(STEPS) || STEPS.length < 1) errors.push('STEPS가 비어 있어요.');
const seen = (arr, label) => {
  const dup = arr.filter((v, i) => arr.indexOf(v) !== i);
  if (dup.length) errors.push(`${label} 중복: ${[...new Set(dup)].join(', ')}`);
};
seen(STEPS.map(s => s.key), 'key');
seen(STEPS.map(s => s.short), 'short');
seen(STEPS.filter(s => s.upload).map(s => s.sheet), 'sheet');
STEPS.forEach(s => {
  if (!/^[A-Za-z][\w-]*$/.test(s.key || '')) errors.push(`key "${s.key}"는 영문으로 시작하는 영문·숫자여야 해요.`);
  if (!s.file) errors.push(`${s.key}: file(배포 파일 이름 앞부분)이 없어요.`);
  if (!s.title) errors.push(`${s.key}: title이 없어요.`);
  if (s.sheet && s.sheet.length > 100) errors.push(`${s.key}: 시트 이름이 너무 길어요.`);
  if (/[\[\]*?:\/\\]/.test(s.sheet || '')) errors.push(`${s.key}: 시트 이름에 [ ] * ? : / \\ 를 쓸 수 없어요.`);
});
STEPS.forEach((s, i) => {
  if (i < STEPS.length - 1 && !s.upload) errors.push(`${s.key}: 마지막이 아닌 단계는 upload: true 여야 다음 단계가 열려요.`);
});
const prefixes = STEPS.map(s => String(s.file).toLowerCase());
prefixes.forEach((p, i) => prefixes.forEach((q, j) => {
  if (i !== j && q.startsWith(p)) warns.push(`file "${STEPS[i].file}"가 "${STEPS[j].file}"의 앞부분과 같아요. ${STEPS[i].key} 단계에서 다른 파일이 내려갈 수 있어요.`);
}));
const mode = CONFIG.UPLOAD && CONFIG.UPLOAD.CHECK;
if (!['none', 'marker', 'required'].includes(mode)) errors.push(`CONFIG.UPLOAD.CHECK는 none / marker / required 중 하나여야 해요. (지금: ${mode})`);
if (mode !== 'none') STEPS.filter(s => s.upload && !s.marker).forEach(s => warns.push(`${s.key}: CHECK=${mode}인데 marker가 없어요. 이 단계는 표지 검사를 건너뛰어요.`));
if (mode === 'required') STEPS.filter(s => s.upload && !s.requiredItems.length).forEach(s => warns.push(`${s.key}: CHECK=required인데 requiredItems가 비어 있어요.`));

console.log(`단계 ${STEPS.length}개: ` + STEPS.map(s => `${s.no}.${s.title}${s.upload ? '' : '(업로드 없음)'}`).join(' → '));
console.log(`업로드 검사: ${mode}, 최대 ${CONFIG.UPLOAD.MAX_MB}MB`);
warns.forEach(w => console.log('⚠️ ' + w));
errors.forEach(e => console.log('❌ ' + e));
if (!errors.length) console.log('✅ 설정 점검 통과');

if (stepKey && samplePath) {
  const step = STEPS.find(s => s.key === stepKey);
  if (!step) { console.error(`❌ 단계 "${stepKey}"가 없어요.`); process.exit(1); }
  let raw = readFileSync(samplePath);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { text = new TextDecoder('euc-kr').decode(raw); }
  text = api.cleanText_(text);
  const from = step.marker && text.includes(step.marker) ? text.slice(text.indexOf(step.marker)) : text;
  const fields = api.parseResult_(from);
  console.log(`\n── ${step.title} 샘플 파싱: 항목 ${fields.length}개 ──`);
  const flat = api.flatten_(fields, step.flatKeys === 'item');
  Object.entries(flat).forEach(([k, v]) => console.log(`[${k}] ${String(v).replace(/\n/g, ' ⏎ ').slice(0, 100)}`));
  const problems = api.checkUpload_(step, text, fields, false);
  console.log(problems.length ? `\n업로드 검사(${mode}): 거절\n· ` + problems.join('\n· ') : `\n업로드 검사(${mode}): 통과`);
}
process.exit(errors.length ? 1 : 0);
