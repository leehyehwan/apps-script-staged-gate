# 설정 예시

`assets/Code.gs`의 `CONFIG`와 `STEPS`만 바꾼다. 아래는 상황별로 바꾸는 부분만 보여 준다.

## 1. 기본: 아무 파일이나 받고 순서만 잠금 (CHECK: 'none')

교육 현장에서 가장 무난하다. 참가자가 형식을 틀려도 막히지 않고, 강사가 시트·Drive에서 확인한다.

```js
UPLOAD: { CHECK: 'none', MAX_MB: 20 },
```

## 2. AI 질문지 4단계 (예: 영업 교육 ICP → 타겟 → 프로필 → 톤매너)

각 질문지는 AI 대화창에 넣으면 질문을 하고, 마지막에 첫 줄이 정해진 표지(`[ICP 결과]` 등)로 시작하는 결과 md를 준다. 마지막 단계는 다운로드만 한다.

```js
const CONFIG = {
  APP_TITLE: '영업 교육 질문지',
  APP_SUBTITLE: '앞 단계 결과를 올리면 다음 질문지가 열려요.',
  BRAND: 'Example Co.',
  ITEM_NOUN: '질문지',
  ADMIN_NOUN: '강사',
  ROOT_FOLDER_NAME: '영업 교육 질문지',
  SOURCE_FOLDER_NAME: '01_질문지원본',
  RESULT_FOLDER_NAME: '02_참가자결과',
  SPREADSHEET_NAME: '영업 교육 질문지 결과',
  MENU_NAME: '질문지 관리',
  TZ: 'Asia/Seoul',
  UPLOAD: { CHECK: 'none', MAX_MB: 20 },
  PARSE: {
    KNOWN_KEYS: [],
    FREE_TEXT_SECTIONS: ['소개', '현재 경력 설명', '첫 메시지', '개인화', '채널', '리드 관리', '확인한 뒤'],
    STOP_AT: /^##\s*부록/,                 // 결과 끝에 붙는 앞 단계 사본은 기록하지 않음
    SKIP_LINES: [/^Powered by /i],
  },
  SUMMARY_FIELDS: { company: ['회사명'], person: ['담당자', '프로필 주인'] },
  CELL_LIMIT: 49000,
};

const STEPS = [
  { key: 'icp', short: 'ICP', title: '① ICP', desc: '회사 정의와 타깃 고객 기준(ICP)을 정리해요.',
    file: 'icp-questionnaire', upload: true, marker: '[ICP 결과]',
    resultHint: '회사명_ICP결과_날짜.md', flatKeys: 'item' },
  { key: 'target', short: '타겟', title: '② 타겟 고객', desc: '실제로 만날 고객 3명의 카드를 만들어요.',
    file: 'target-questionnaire', upload: true, marker: '[타겟 고객 결과]',
    resultHint: '회사명_타겟결과_날짜.md' },
  { key: 'profile', short: '프로필', title: '③ 링크드인 프로필', desc: '헤드라인, 소개, 경력 설명, 배너를 만들어요.',
    file: 'profile-questionnaire', upload: true, marker: '[링크드인 프로필 결과]',
    resultHint: '회사명_이름_프로필결과_날짜.md' },
  { key: 'tone', short: '톤매너', title: '④ 톤매너', desc: '톤매너 키트와 콘텐츠 주제를 만들어요. 마지막 단계예요.',
    file: 'tone-questionnaire', upload: false },
];
```

`flatKeys: 'item'`은 항목 이름이 겹치지 않는 단계(ICP처럼 한 번씩만 나오는 항목)에서 시트 열 이름을 짧게 만든다. 같은 항목 이름이 섹션마다 반복되면(고객 카드 상·중·하의 `01 누구인가` 등) 빼 둔다.

## 3. 표지만 확인 (CHECK: 'marker')

다른 단계 결과나 엉뚱한 파일만 걸러 낸다. 글 파일만 받는다.

```js
UPLOAD: { CHECK: 'marker', MAX_MB: 5 },
// 각 단계에 marker 필수
{ key: 'icp', ..., marker: '[ICP 결과]' },
```

거절 문구 예: `① ICP 결과로 받을 수 없어요. · 다른 단계(② 타겟 고객) 결과예요`

## 4. 필수 항목까지 확인 (CHECK: 'required')

결과 양식이 확실히 정해져 있고, 빈칸 제출을 막아야 할 때만 쓴다. 참가자가 막혀서 진행이 멈출 수 있으니 현장 교육에서는 신중히 쓴다.

```js
UPLOAD: { CHECK: 'required', MAX_MB: 5 },
{ key: 'icp', ..., marker: '[ICP 결과]',
  requiredItems: ['진출 방향', '담당자', '자사 정의 > 회사명', '자사 정의 > 솔루션', 'ICP > 타겟 산업', 'ICP > 타겟 지역'] },
```

- `'항목'`은 섹션과 상관없이 찾고, `'섹션 > 항목'`은 그 섹션(## 제목) 안에서 찾는다.
- 빈칸, `…`, `<이름>` 같은 양식 자리표시가 남아 있으면 "비어 있음"으로 거절한다.

## 5. 질문지가 아닌 일반 과제 (PDF·이미지 배포, 아무 결과물 제출)

```js
ITEM_NOUN: '과제',
UPLOAD: { CHECK: 'none', MAX_MB: 20 },
STEPS: [
  { key: 'w1', short: '1주차', title: '1주차 과제', desc: '워크시트를 채워 사진이나 PDF로 올려 주세요.', file: 'week1', upload: true },
  { key: 'w2', short: '2주차', title: '2주차 과제', desc: '…', file: 'week2', upload: true },
  { key: 'end', short: '수료', title: '수료 자료', desc: '마지막 자료예요.', file: 'final', upload: false },
]
```

배포 파일은 PDF·이미지·zip도 된다(원본 그대로 내려감). 글이 아닌 결과물은 Drive에만 저장되고 시트에는 파일 이름과 링크만 남는다.

## 6. 마지막 단계도 업로드

마지막 단계도 `upload: true`로 두면 마지막 업로드를 마쳐야 "전체 완료"가 된다.

## 7. 참가자 제한

설정이 아니라 시트에서 한다. `참가자명단` 탭 A열(2행부터)에 이메일을 넣으면 그 사람만 들어온다. 비우면 누구나 들어온다.
