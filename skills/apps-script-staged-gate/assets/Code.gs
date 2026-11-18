/**
 * Staged Gate Web App (Google Apps Script)
 *
 * 참가자가 이메일로 입장 → 1단계 파일 다운로드 → 결과 업로드 → 다음 단계 열림 → … → 마지막 단계.
 * 업로드한 파일은 Drive(참가자별 폴더)에 원본 저장, 글 파일은 "항목: 값" 단위로 나눠 Sheet에 기록.
 *
 * ▶ 바꾸는 곳은 맨 위 CONFIG 와 STEPS 두 블록뿐이다. 그 아래 코드는 손대지 않아도 된다.
 * ▶ 처음 한 번: setup() 실행 → 로그에 나온 "배포 파일 폴더"에 STEPS[].file 로 시작하는 파일 업로드 → 웹앱 배포
 */

/* ═════════════════════════ 1. 기본 설정 ═════════════════════════ */
const CONFIG = {
  APP_TITLE: '단계별 과제 제출',                 // 브라우저 탭·화면 제목
  APP_SUBTITLE: '앞 단계 결과를 올리면 다음 단계 파일이 열려요.',
  BRAND: 'workshop',                            // 제목 위 작은 글씨 (비우면 숨김)
  ITEM_NOUN: '질문지',                           // 내려받는 파일을 부르는 말 (예: 질문지, 과제, 워크시트)
  ADMIN_NOUN: '강사',                            // 문제가 생기면 알리라고 안내할 사람

  ROOT_FOLDER_NAME: 'Staged Gate',               // setup()이 Drive에 만드는 폴더 이름
  SOURCE_FOLDER_NAME: '01_배포파일',
  RESULT_FOLDER_NAME: '02_참가자결과',
  SPREADSHEET_NAME: 'Staged Gate 결과',
  MENU_NAME: 'Staged Gate',
  TZ: 'Asia/Seoul',

  UPLOAD: {
    // 'none'     : 아무 파일이나 받는다 (기본)
    // 'marker'   : 글 파일 안에 그 단계의 marker 문자열이 있어야 받는다
    // 'required' : marker + requiredItems 항목이 모두 채워져 있어야 받는다
    CHECK: 'none',
    MAX_MB: 20,
  },

  PARSE: {
    // 비워 두면 "항목: 값" 형태의 줄은 모두 항목으로 읽는다. 채우면 이 이름들만 항목으로 읽는다.
    KNOWN_KEYS: [],
    // 이 제목(##, ###) 아래는 "항목: 값"으로 쪼개지 않고 줄글 그대로 '본문'으로 저장한다.
    FREE_TEXT_SECTIONS: [],                      // 예: ['소개', '첫 메시지']
    // 이 줄을 만나면 그 아래는 읽지 않는다 (앞 단계 결과 사본 같은 부록).
    STOP_AT: /^##\s*부록/,
    // 기록하지 않을 줄
    SKIP_LINES: [/^Powered by /i],
  },

  // 진행현황 시트의 '회사명', '담당자' 칸을 채울 때 결과 파일에서 찾을 항목 이름 (앞에 있는 것부터)
  SUMMARY_FIELDS: {
    company: ['회사명', '기관명', 'Company'],
    person: ['담당자', '이름', 'Name'],
  },

  CELL_LIMIT: 49000,
};

/* ═════════════════════════ 2. 단계 ═════════════════════════
 * key      : 영문 식별자 (바꾸지 말 것: 시트 기록과 연결됨)
 * short    : 시트 열 이름에 쓰는 짧은 이름
 * title    : 화면 제목
 * desc     : 화면 설명 한 줄
 * file     : 배포 파일 폴더에서 찾을 파일 이름 앞부분 (예: 'step1' → step1.md, step1_v2.pdf 중 최신)
 * upload   : true면 결과 업로드 후 다음 단계가 열림. 마지막 단계는 보통 false
 * marker   : (선택) 결과 파일 첫 줄 표지. 파싱 시작점, CHECK가 marker/required일 때 검사에 씀
 * resultHint     : (선택) 화면에 보여 줄 결과 파일 이름 예시
 * requiredItems  : (선택) CHECK='required'일 때 꼭 채워야 할 항목. '항목' 또는 '섹션 > 항목'
 * flatKeys       : (선택) 'item'이면 시트 열 이름을 섹션 없이 항목 이름만으로 만든다
 * sheet          : (선택) 이 단계 결과 시트 이름. 없으면 '01_<short>결과'
 */
const STEPS = [
  {
    key: 'step1', short: '1단계', title: '① 첫 번째 과제',
    desc: '첫 번째 파일을 내려받아 진행하고 결과를 올려 주세요.',
    file: 'step1', upload: true,
    marker: '', resultHint: '이름_1단계결과.md',
  },
  {
    key: 'step2', short: '2단계', title: '② 두 번째 과제',
    desc: '앞 단계 결과를 바탕으로 진행해요.',
    file: 'step2', upload: true,
    marker: '', resultHint: '이름_2단계결과.md',
  },
  {
    key: 'step3', short: '3단계', title: '③ 마지막 자료',
    desc: '마지막 자료예요. 업로드는 없어요.',
    file: 'step3', upload: false,
  },
];

/* ═════════════════════════ 아래는 공통 코드 ═════════════════════════ */

STEPS.forEach((s, i) => {
  s.no = i + 1;
  if (s.upload && !s.sheet) s.sheet = (s.no < 10 ? '0' : '') + s.no + '_' + s.short + '결과';
  s.requiredItems = s.requiredItems || [];
});

const SH = { progress: '진행현황', detail: '응답상세', log: '활동로그', roster: '참가자명단' };
const STAGE_BASE_HEADERS = ['업로드 ID', '업로드 일시', '이메일', '회사명', '파일명', 'Drive 링크', '원문'];
const DETAIL_HEADERS = ['업로드 ID', '업로드 일시', '이메일', '회사명', '단계', '섹션', '항목', '값'];
const LOG_HEADERS = ['일시', '이메일', '활동', '상세'];
const ROSTER_HEADERS = ['이메일', '이름', '메모'];
const TEXT_EXT_RE = /\.(md|markdown|txt|csv|tsv|json|html?|xml|ya?ml)$/i;

let CTX_CACHE = null;

/* ───────────── 웹앱 ───────────── */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.cfgJson = JSON.stringify({
    title: CONFIG.APP_TITLE, subtitle: CONFIG.APP_SUBTITLE, brand: CONFIG.BRAND,
    itemNoun: CONFIG.ITEM_NOUN, maxMb: CONFIG.UPLOAD.MAX_MB, check: CONFIG.UPLOAD.CHECK,
  });
  t.stepsJson = JSON.stringify(STEPS.map(s => ({
    key: s.key, no: s.no, title: s.title, desc: s.desc, upload: !!s.upload,
    marker: s.marker || '', resultHint: s.resultHint || '', file: s.file,
  })));
  t.appTitle = CONFIG.APP_TITLE;
  return t.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 이메일로 입장. 처음이면 참가자 줄을 만들고 진행 상태를 돌려준다. */
function enter(email) {
  email = normEmail_(email);
  if (!isEmail_(email)) throw new Error('이메일 주소 형식을 확인해 주세요. 예: name@company.com');
  const ctx = getCtx_();
  checkRoster_(ctx.ss, email);
  return withLock_(() => {
    const sh = getSheet_(ctx.ss, SH.progress);
    let row = findProgressRow_(sh, email);
    const now = new Date();
    if (row < 0) {
      sh.appendRow([email, now, now]);
      row = sh.getLastRow();
      setProgress_(sh, row, { '완료 단계': '입장' });
      log_(ctx.ss, email, '첫 입장', '');
    } else {
      setProgress_(sh, row, { '최근 접속': now });
      log_(ctx.ss, email, '입장', '');
    }
    return buildState_(email, readProgress_(sh, row));
  });
}

/** 열린 단계의 배포 파일을 돌려준다. 글 파일이면 text도 함께 준다(복사용). */
function downloadFile(email, key) {
  const step = stepByKey_(key);
  const part = requireParticipant_(email);
  assertUnlocked_(step, part.p);
  const file = findSourceFile_(part.ctx.sourceFolder, step.file);
  if (!file) throw new Error(CONFIG.ITEM_NOUN + ' 파일이 아직 준비되지 않았어요. ' + CONFIG.ADMIN_NOUN + '에게 알려 주세요. (' + step.file + ')');
  const blob = file.getBlob();
  const name = file.getName();
  const isText = TEXT_EXT_RE.test(name) || /^text\//.test(blob.getContentType() || '');

  const state = withLock_(() => {
    const now = new Date();
    const patch = { '최근 접속': now };
    patch[step.short + ' 다운로드'] = now;
    setProgress_(part.sh, part.row, patch);
    setProgress_(part.sh, part.row, { '완료 단계': statusLabel_(readProgress_(part.sh, part.row)) });
    log_(part.ctx.ss, part.email, step.title + ' 다운로드', name);
    return buildState_(part.email, readProgress_(part.sh, part.row));
  });
  return {
    fileName: name,
    mimeType: blob.getContentType() || 'application/octet-stream',
    base64: Utilities.base64Encode(blob.getBytes()),
    text: isText ? blob.getDataAsString('UTF-8') : '',
    state: state,
  };
}

/** 결과 업로드: Drive에 원본 저장 + 글 파일이면 항목별로 Sheet 기록. 검사 수준은 CONFIG.UPLOAD.CHECK */
function uploadResult(email, key, fileName, content, base64, mimeType) {
  const step = stepByKey_(key);
  if (!step.upload) throw new Error('이 단계는 업로드가 없어요.');
  const part = requireParticipant_(email);
  assertUnlocked_(step, part.p);

  const isBinary = !!base64;
  let text = isBinary ? '' : cleanText_(content);
  if (!isBinary && !text) throw new Error('파일 내용이 비어 있어요.');

  let parseFrom = text;
  if (text && step.marker) {
    const i = text.indexOf(step.marker);
    if (i >= 0) parseFrom = text.slice(i);
  }
  const fields = text ? parseResult_(parseFrom) : [];

  const problems = checkUpload_(step, text, fields, isBinary);
  if (problems.length) {
    withLock_(() => log_(part.ctx.ss, part.email, step.title + ' 업로드 거절', problems.join(' / ')));
    const shown = problems.slice(0, 8);
    throw new Error(step.title + ' 결과로 받을 수 없어요.\n· ' + shown.join('\n· ') +
      (problems.length > shown.length ? '\n· 외 ' + (problems.length - shown.length) + '개' : ''));
  }

  const flat = flatten_(fields, step.flatKeys === 'item');
  const company = pick_(fields, CONFIG.SUMMARY_FIELDS.company) || String(part.p['회사명'] || '');
  const person = pick_(fields, CONFIG.SUMMARY_FIELDS.person);
  const now = new Date();
  const ts = Utilities.formatDate(now, CONFIG.TZ, 'yyyyMMdd_HHmmss');
  const uploadId = step.key + '-' + ts + '-' + Math.random().toString(36).slice(2, 6);

  // 1) Drive 저장 (원본 그대로)
  const folder = subFolder_(part.ctx.resultFolder, part.email);
  let baseName = sanitizeFileName_(fileName);
  if (!baseName) baseName = step.short + '결과_' + ts + (isBinary ? '' : '.md');
  if (!isBinary && !/\.[A-Za-z0-9]{1,8}$/.test(baseName)) baseName += '.md';
  const savedName = step.no + '_' + step.short + '_' + ts + '_' + baseName;
  const blob = isBinary
    ? Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/octet-stream', savedName)
    : Utilities.newBlob(text, /\.md$/i.test(baseName) ? 'text/markdown' : 'text/plain', savedName);
  const file = folder.createFile(blob);

  // 2) Sheet 기록
  const state = withLock_(() => {
    const ss = part.ctx.ss;
    appendWide_(getSheet_(ss, step.sheet), {
      '업로드 ID': uploadId, '업로드 일시': now, '이메일': part.email, '회사명': company,
      '파일명': savedName, 'Drive 링크': file.getUrl(), '원문': isBinary ? '(글이 아닌 파일, Drive 링크 참고)' : text,
    }, flat);
    appendDetail_(getSheet_(ss, SH.detail), fields, { uploadId: uploadId, now: now, email: part.email, company: company, stage: step.title });

    const patch = { '최근 접속': now };
    patch[step.short + ' 업로드'] = now;
    patch[step.short + ' 파일명'] = savedName;
    patch[step.short + ' 파일'] = file.getUrl();
    if (company) patch['회사명'] = company;
    if (person && !part.p['담당자']) patch['담당자'] = person;
    setProgress_(part.sh, part.row, patch);
    setProgress_(part.sh, part.row, { '완료 단계': statusLabel_(readProgress_(part.sh, part.row)) });
    log_(ss, part.email, step.title + ' 결과 업로드', savedName + ' (항목 ' + fields.length + '개)');
    return buildState_(part.email, readProgress_(part.sh, part.row));
  });

  return { state: state, savedName: savedName, fieldCount: fields.length };
}

/* ───────────── 업로드 검사 ───────────── */

function checkUpload_(step, text, fields, isBinary) {
  const mode = CONFIG.UPLOAD.CHECK;
  if (mode === 'none') return [];
  const problems = [];
  if (isBinary) return ['글 파일(.md, .txt 등)만 받아요'];
  if (step.marker && text.indexOf(step.marker) < 0) {
    const other = STEPS.filter(s => s !== step && s.marker && text.indexOf(s.marker) >= 0)[0];
    problems.push(other ? '다른 단계(' + other.title + ') 결과예요' : '"' + step.marker + '" 표지가 없어요');
    return problems;
  }
  if (mode !== 'required') return problems;
  step.requiredItems.forEach(req => {
    const parts = String(req).split('>').map(s => s.trim());
    const item = parts.pop();
    const sec = parts.join(' > ');
    const hit = fields.filter(f => f.item === item && (!sec || f.section === sec || f.section.indexOf(sec) === 0))[0];
    if (!hit) problems.push(req + ' (없음)');
    else if (!isFilled_(hit.value)) problems.push(req + ' (비어 있음)');
  });
  return problems;
}

/** 빈칸, 말줄임표, <이름> 같은 양식 자리표시가 남아 있으면 채운 게 아니다 */
function isFilled_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return false;
  if (/^[….\-·_\s]+$/.test(s)) return false;
  if (/<(?!https?:|mailto:)[^<>\n@]{1,80}>/.test(s)) return false;
  return true;
}

/* ───────────── 관리자용 ───────────── */

/** 처음 한 번 실행: 폴더·시트를 만들고 ID를 저장한다. 다시 실행해도 안전하다(시트 열·서식만 맞춤). */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const root = folderFromProp_(props, 'ROOT_FOLDER_ID') || DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', root.getId());
  const src = folderFromProp_(props, 'SOURCE_FOLDER_ID') || subFolder_(root, CONFIG.SOURCE_FOLDER_NAME);
  props.setProperty('SOURCE_FOLDER_ID', src.getId());
  const result = folderFromProp_(props, 'RESULT_FOLDER_ID') || subFolder_(root, CONFIG.RESULT_FOLDER_NAME);
  props.setProperty('RESULT_FOLDER_ID', result.getId());

  let ss = null;
  const sid = props.getProperty('SHEET_ID');
  if (sid) { try { ss = SpreadsheetApp.openById(sid); } catch (e) { ss = null; } }
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }
  props.setProperty('SHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  ensureSheets_(ss);
  return checkSetup();
}

/** 설정 상태 점검: 폴더·시트 주소, 빠진 배포 파일, 웹앱 주소를 로그에 남긴다 */
function checkSetup() {
  const props = PropertiesService.getScriptProperties();
  const lines = [];
  try {
    const src = DriveApp.getFolderById(props.getProperty('SOURCE_FOLDER_ID'));
    lines.push('루트 폴더: ' + DriveApp.getFolderById(props.getProperty('ROOT_FOLDER_ID')).getUrl());
    lines.push('배포 파일 폴더(여기에 파일 업로드): ' + src.getUrl());
    lines.push('참가자 결과 폴더: ' + DriveApp.getFolderById(props.getProperty('RESULT_FOLDER_ID')).getUrl());
    lines.push('결과 시트: ' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
    const missing = STEPS.filter(s => !findSourceFile_(src, s.file)).map(s => s.file + '*');
    lines.push(missing.length ? '아직 없는 배포 파일: ' + missing.join(', ') : '배포 파일 ' + STEPS.length + '개 확인 완료');
    let url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
    lines.push(url ? '웹앱 주소: ' + url : '웹앱 주소: 아직 배포 전');
  } catch (e) {
    lines.push('설정이 아직 안 되어 있어요. setup()을 먼저 실행해 주세요. (' + e.message + ')');
  }
  const report = lines.join('\n');
  Logger.log(report);
  try { SpreadsheetApp.getUi().alert(report); } catch (e) { /* 편집기에서 실행하면 무시 */ }
  return report;
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(CONFIG.MENU_NAME)
      .addItem('초기 설정 실행', 'setup')
      .addItem('설정 상태 점검', 'checkSetup')
      .addToUi();
  } catch (e) { /* 단독 스크립트면 무시 */ }
}

/* ───────────── 진행 상태 ───────────── */

function progressHeaders_() {
  const h = ['이메일', '최초 접속', '최근 접속', '회사명', '담당자', '완료 단계'];
  STEPS.forEach(s => {
    h.push(s.short + ' 다운로드');
    if (s.upload) h.push(s.short + ' 업로드', s.short + ' 파일명', s.short + ' 파일');
  });
  return h;
}

/** 앞에서부터 연속으로 업로드를 마친 단계 수 */
function completedCount_(p) {
  let n = 0;
  for (let i = 0; i < STEPS.length; i++) {
    if (!STEPS[i].upload) break;
    if (p[STEPS[i].short + ' 업로드']) n++; else break;
  }
  return n;
}

function assertUnlocked_(step, p) {
  const done = completedCount_(p);
  if (step.no > done + 1) throw new Error('아직 열리지 않은 단계예요. ' + STEPS[done].title + ' 결과를 먼저 업로드해 주세요.');
}

function isFinished_(p) {
  const last = STEPS[STEPS.length - 1];
  return last.upload ? completedCount_(p) >= STEPS.length
    : completedCount_(p) >= STEPS.length - 1 && !!p[last.short + ' 다운로드'];
}

function statusLabel_(p) {
  if (isFinished_(p)) return '전체 완료';
  const done = completedCount_(p);
  if (done === 0) return p[STEPS[0].short + ' 다운로드'] ? STEPS[0].title + ' 진행 중' : '입장';
  const next = STEPS[done];
  return STEPS[done - 1].title + ' 업로드 완료 → ' + next.title + (p[next.short + ' 다운로드'] ? ' 진행 중' : ' 대기');
}

function buildState_(email, p) {
  const done = completedCount_(p);
  return {
    email: email,
    company: String(p['회사명'] || ''),
    name: String(p['담당자'] || ''),
    completed: done,
    finished: isFinished_(p),
    steps: STEPS.map(s => ({
      key: s.key,
      unlocked: s.no <= done + 1,
      downloadedAt: fmt_(p[s.short + ' 다운로드']),
      uploadedAt: s.upload ? fmt_(p[s.short + ' 업로드']) : '',
      uploadedName: s.upload ? String(p[s.short + ' 파일명'] || '') : '',
      done: s.upload ? !!p[s.short + ' 업로드'] : !!p[s.short + ' 다운로드'],
    })),
  };
}

function requireParticipant_(email) {
  email = normEmail_(email);
  if (!isEmail_(email)) throw new Error('먼저 이메일로 입장해 주세요.');
  const ctx = getCtx_();
  checkRoster_(ctx.ss, email);
  const sh = getSheet_(ctx.ss, SH.progress);
  const row = findProgressRow_(sh, email);
  if (row < 0) throw new Error('먼저 이메일로 입장해 주세요.');
  return { ctx: ctx, email: email, sh: sh, row: row, p: readProgress_(sh, row) };
}

/* ───────────── 결과 파일 읽기 ───────────── */

function cleanText_(s) {
  let t = String(s || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^```/.test(t)) { // AI 답을 코드 블록째 복사한 경우
    t = t.replace(/^```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  }
  return t.trim();
}

function normKey_(k) {
  return String(k || '').replace(/["'“”‘’`]/g, '').replace(/\s+/g, ' ').trim();
}

function isItemKey_(key) {
  const k = normKey_(key);
  if (!k || k.length > 40) return false;
  if (CONFIG.PARSE.KNOWN_KEYS.length) return CONFIG.PARSE.KNOWN_KEYS.indexOf(k) >= 0;
  if (k.length < 2) return false;                     // '예: …', '주: …' 같은 한 글자는 앞 항목에 이어 붙임
  if (/^https?$/i.test(k) || /:\/\//.test(k)) return false;
  if ((k.match(/\s/g) || []).length > 6) return false;  // 문장은 항목 이름으로 보지 않는다
  if (/[.!?。]$/.test(k)) return false;
  return true;
}

function isFreeText_(title) {
  return CONFIG.PARSE.FREE_TEXT_SECTIONS.some(p => String(title || '').indexOf(p) === 0);
}

/**
 * 글을 [{section, item, value}]로 나눈다.
 * "## / ###" 제목은 섹션, "항목: 값" 줄은 항목, 그 밖의 줄은 앞 항목에 이어 붙이거나 섹션 '본문'으로 둔다.
 */
function parseResult_(text) {
  const lines = String(text).split('\n');
  const out = [];
  let h2 = '', h3 = '', cur = null;
  const sectionOf = () => [h2, h3].filter(Boolean).join(' > ');
  const bodyOf = section => {
    for (let i = out.length - 1; i >= 0; i--) if (out[i].section === section && out[i].item === '본문') return out[i];
    const b = { section: section, item: '본문', value: '' };
    out.push(b);
    return b;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    const t = line.trim();
    if (CONFIG.PARSE.STOP_AT && CONFIG.PARSE.STOP_AT.test(t)) break;
    if (/^```/.test(t)) { cur = null; continue; }
    if (CONFIG.PARSE.SKIP_LINES.some(r => r.test(t))) continue;
    if (STEPS.some(s => s.marker && t === s.marker)) continue;

    const hm = t.match(/^(#{2,6})\s+(.+)$/);
    if (hm) {
      if (hm[1].length === 2) { h2 = hm[2].trim(); h3 = ''; } else { h3 = hm[2].trim(); }
      cur = null;
      continue;
    }

    const section = sectionOf();
    if (isFreeText_(h3 || h2)) {
      const b = bodyOf(section);
      if (t || b.value) b.value = b.value ? b.value + '\n' + line : line;
      continue;
    }

    const km = t.replace(/\*\*|__/g, '').match(/^(?:[-*•]\s+)?(.{1,40}?)\s*[:：]\s?(.*)$/);
    if (km && isItemKey_(km[1])) {
      cur = { section: section, item: normKey_(km[1]), value: km[2].trim() };
      out.push(cur);
      continue;
    }

    if (cur) {
      if (t || cur.value) cur.value = cur.value ? cur.value + '\n' + t : t;
    } else {
      const b = bodyOf(section);
      if (t || b.value) b.value = b.value ? b.value + '\n' + line : line;
    }
  }

  return out
    .map(f => ({ section: f.section, item: f.item, value: String(f.value).replace(/\n{3,}/g, '\n\n').trim() }))
    .filter(f => f.item !== '본문' || f.value);
}

function flatten_(fields, itemOnly) {
  const o = {};
  fields.forEach(f => {
    let k = f.item === '본문' ? (f.section || '본문')
      : ((itemOnly || !f.section) ? f.item : f.section + ' > ' + f.item);
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      let n = 2;
      while (Object.prototype.hasOwnProperty.call(o, k + ' (' + n + ')')) n++;
      k = k + ' (' + n + ')';
    }
    o[k] = f.value;
  });
  return o;
}

function pick_(fields, names) {
  for (let i = 0; i < names.length; i++) {
    const hit = fields.filter(f => f.item === names[i] && isFilled_(f.value))[0];
    if (hit) return String(hit.value).split('\n')[0].trim();
  }
  return '';
}

/* ───────────── 시트 ───────────── */

function ensureSheets_(ss) {
  ensureSheet_(ss, SH.progress, progressHeaders_());
  STEPS.filter(s => s.upload).forEach(s => ensureSheet_(ss, s.sheet, STAGE_BASE_HEADERS));
  ensureSheet_(ss, SH.detail, DETAIL_HEADERS);
  ensureSheet_(ss, SH.log, LOG_HEADERS);
  ensureSheet_(ss, SH.roster, ROSTER_HEADERS);
  // 날짜 칸은 시각까지 보이게 (기본 서식은 날짜만 보임)
  const dateFmt = 'yyyy-mm-dd hh:mm';
  const fmtCol = (sh, col) => { if (sh.getMaxRows() > 1) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat(dateFmt); };
  const prog = ss.getSheetByName(SH.progress);
  getHeaders_(prog).forEach((h, i) => { if (/접속$|다운로드$|업로드$/.test(h)) fmtCol(prog, i + 1); });
  STEPS.filter(s => s.upload).forEach(s => fmtCol(ss.getSheetByName(s.sheet), 2));
  fmtCol(ss.getSheetByName(SH.detail), 2);
  fmtCol(ss.getSheetByName(SH.log), 1);
  ['Sheet1', '시트1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh, headers);
  sh.setFrozenRows(1);
  return sh;
}

function getSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) { ensureSheets_(ss); sh = ss.getSheetByName(name); }
  return sh;
}

function getHeaders_(sh) {
  const lc = sh.getLastColumn();
  if (lc < 1) return [];
  const h = sh.getRange(1, 1, 1, lc).getValues()[0].map(v => String(v));
  while (h.length && !h[h.length - 1]) h.pop();
  return h;
}

/** 없는 열 이름은 오른쪽 끝에 새로 만든다 (결과 항목이 늘어도 자동으로 열이 생김) */
function ensureHeaders_(sh, needed) {
  const h = getHeaders_(sh);
  const missing = needed.filter(k => h.indexOf(k) < 0);
  if (!missing.length) return h;
  const start = h.length + 1;
  const need = start + missing.length - 1;
  if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#eef2f7');
  return h.concat(missing);
}

function findProgressRow_(sh, email) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (normEmail_(vals[i][0]) === email) return i + 2;
  return -1;
}

function readProgress_(sh, row) {
  const h = ensureHeaders_(sh, progressHeaders_());
  const v = sh.getRange(row, 1, 1, h.length).getValues()[0];
  const o = {};
  h.forEach((k, i) => { o[k] = v[i]; });
  return o;
}

function setProgress_(sh, row, patch) {
  const h = ensureHeaders_(sh, progressHeaders_());
  Object.keys(patch).forEach(k => {
    const c = h.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1).setValue(safeCell_(patch[k]));
  });
}

function appendWide_(sh, base, flat) {
  const h = ensureHeaders_(sh, STAGE_BASE_HEADERS.concat(Object.keys(flat)));
  const row = h.map(k => {
    if (Object.prototype.hasOwnProperty.call(base, k)) return safeCell_(base[k]);
    if (Object.prototype.hasOwnProperty.call(flat, k)) return safeCell_(flat[k]);
    return '';
  });
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function appendDetail_(sh, fields, meta) {
  if (!fields.length) return;
  const rows = fields.map(f => [
    meta.uploadId, meta.now, meta.email, safeCell_(meta.company), meta.stage,
    safeCell_(f.section), safeCell_(f.item), safeCell_(f.value),
  ]);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function log_(ss, email, action, detail) {
  getSheet_(ss, SH.log).appendRow([new Date(), email, action, safeCell_(detail || '')]);
}

/** 참가자명단 탭 A열이 비어 있으면 누구나, 채워져 있으면 명단에 있는 이메일만 입장 */
function checkRoster_(ss, email) {
  const sh = ss.getSheetByName(SH.roster);
  if (!sh || sh.getLastRow() < 2) return;
  const list = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => normEmail_(r[0])).filter(Boolean);
  if (list.length && list.indexOf(email) < 0) {
    throw new Error('참가자 명단에 없는 이메일이에요. 신청할 때 쓴 이메일인지 확인해 주세요.');
  }
}

/* ───────────── Drive ───────────── */

function getCtx_() {
  if (CTX_CACHE) return CTX_CACHE;
  const p = PropertiesService.getScriptProperties().getProperties();
  if (!p.SHEET_ID || !p.SOURCE_FOLDER_ID || !p.RESULT_FOLDER_ID) {
    throw new Error('관리자 초기 설정이 아직 안 되어 있어요. ' + CONFIG.ADMIN_NOUN + '에게 알려 주세요.');
  }
  CTX_CACHE = {
    ss: SpreadsheetApp.openById(p.SHEET_ID),
    sourceFolder: DriveApp.getFolderById(p.SOURCE_FOLDER_ID),
    resultFolder: DriveApp.getFolderById(p.RESULT_FOLDER_ID),
  };
  return CTX_CACHE;
}

function folderFromProp_(props, key) {
  const id = props.getProperty(key);
  if (!id) return null;
  try {
    const f = DriveApp.getFolderById(id);
    return f.isTrashed() ? null : f;
  } catch (e) { return null; }
}

function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 이름이 prefix로 시작하는 파일 중 가장 최근에 바뀐 것 (예: step1.md, step1_v2.md → 최신) */
function findSourceFile_(folder, prefix) {
  const it = folder.getFiles();
  const pre = String(prefix || '').toLowerCase();
  let best = null;
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed()) continue;
    if (f.getName().toLowerCase().indexOf(pre) !== 0) continue;
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  return best;
}

/* ───────────── 도구 ───────────── */

function stepByKey_(key) {
  const s = STEPS.filter(x => x.key === key)[0];
  if (!s) throw new Error('알 수 없는 단계예요.');
  return s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function isEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

function fmt_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  return String(v);
}

function sanitizeFileName_(name) {
  return String(name || '').replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '').slice(0, 120);
}

/** 셀 글자 수 제한(5만 자)과 수식 오인(=, +, -, @ 시작)을 막는다 */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  let s = String(v);
  if (s.length > CONFIG.CELL_LIMIT) s = s.slice(0, CONFIG.CELL_LIMIT) + '\n…(이하 생략, 전체는 Drive 파일 참고)';
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
