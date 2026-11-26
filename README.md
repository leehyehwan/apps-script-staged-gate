# apps-script-staged-gate

참가자가 **이메일로 입장 → 단계별 파일 다운로드 → 결과 업로드 → 다음 단계 열림** 순서로 진행하는 Google Apps Script 웹앱과, 이 웹앱을 상황에 맞게 바꿔 만들어 주는 AI 에이전트용 Skill입니다.

- 교육·워크숍에서 AI 질문지를 순서대로 나눠 줄 때 (예: ICP → 타겟 고객 → 링크드인 프로필 → 톤매너)
- 주차별 과제를 앞 과제 제출 후에만 열어 줄 때
- 업로드한 결과는 Google Drive(참가자별 폴더)에 원본 저장, 글 파일은 "항목: 값" 단위로 Google Sheets에 정리

## 들어 있는 것

```
skills/apps-script-staged-gate/
├── SKILL.md                        # 에이전트가 따라 하는 작업 순서
├── assets/
│   ├── Code.gs                     # 서버 코드 (맨 위 CONFIG·STEPS만 바꾸면 됨)
│   ├── Index.html                  # 참가자 화면
│   └── appsscript.json
├── references/
│   ├── config-examples.md          # 상황별 설정 예시
│   └── deploy-and-test.md          # 설치(손/clasp/AI 에이전트)·테스트·운영 중 수정
└── scripts/
    └── check.mjs                   # 배포 전 설정 점검 + 샘플 결과 파싱 미리 보기
```

## 주요 기능

- 이메일 입장, 같은 이메일로 다시 들어오면 이어서 진행
- 단계 잠금 (서버에서 확인하므로 화면을 조작해도 건너뛸 수 없음)
- 업로드 검사 3단계: `none`(아무 파일) / `marker`(결과 표지 확인) / `required`(필수 항목까지)
- 어떤 파일이든 배포·업로드 (md, txt, pdf, 이미지…), 메모장 ANSI(CP949) txt 한글 자동 판별
- Sheet: 진행현황(1인 1줄) · 단계별 결과(항목별 열, 자동 추가) · 응답상세(세로형) · 활동로그 · 참가자명단(채우면 명단 제한)
- 배포 파일 교체는 Drive 폴더에 새 파일만 올리면 끝 (코드 재배포 불필요)
- 산출물 한곳에 모으기: 웹앱 스크립트·결과 시트·배포 파일·참가자 결과를 `CONFIG.PARENT_FOLDER_ID` 폴더 아래 `YYYY-MM-DD_<이름>` 날짜 폴더 하나에 자동으로 모음 (상위 폴더를 못 열면 setup이 멈춰 내 드라이브에 흩어지지 않음)

## 바로 쓰기 (사람)

1. Google 시트 → 확장 프로그램 > Apps Script
2. `assets/Code.gs`, `assets/Index.html`(파일 이름 `Index`) 붙여 넣기 → `Code.gs` 맨 위 `CONFIG`, `STEPS` 수정 (`PARENT_FOLDER_ID`는 꼭 내 상위 폴더 ID로 바꾸기)
3. `setup` 실행 → 로그에 나온 배포 파일 폴더에 파일 업로드
4. 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자)

자세한 내용: [deploy-and-test.md](skills/apps-script-staged-gate/references/deploy-and-test.md)

## AI 에이전트 Skill로 쓰기

`skills/apps-script-staged-gate` 폴더를 에이전트의 skill 폴더에 복사합니다.

- Claude Code: `~/.claude/skills/apps-script-staged-gate/`
- Aside: `<account>/skills/user/apps-script-staged-gate/`
- 그 밖에 SKILL.md 형식을 읽는 에이전트

그다음 "4단계 질문지를 순서대로 나눠 주는 앱스크립트 만들어 줘, 업로드 검사는 없이"처럼 요청하면 됩니다.

## 설정 점검

```bash
node skills/apps-script-staged-gate/scripts/check.mjs Code.gs                 # 설정 점검
node skills/apps-script-staged-gate/scripts/check.mjs Code.gs step1 result.md # 샘플 결과 파싱 미리 보기
```

## 질문지 (questionnaires/)

웹앱 단계별로 나눠 주는 AI 채팅용 질문지입니다. ChatGPT, Claude, Gemini 대화창에 파일을 첨부해 보내기만 하면 바로 시작합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `maetel-icp-grill.md` | 자사 정의와 ICP(타깃 고객 기준) 정리 → `{회사명}_메텔ICP결과자료_{timestamp}.md` |
| 2 | `maetel-target-grill.md` | ICP 결과를 받아 실제로 만나야 할 고객 3명 정리 |
| 3 | `maetel-profile-grill.md` | 링크드인 프로필(헤드라인, 소개글, 배너) 만들기 |
| 4 | `maetel-tone-grill.md` | 글쓰기 톤매너 키트 만들기 |

모든 질문지는 같은 답변 방식을 씁니다.
- 질문마다 추천 답이 붙고, 답은 `1️⃣ 예  2️⃣ 아니오 (직접 입력)` 두 가지로 받습니다.
- 아니오를 고르면 새 추천 없이 바로 직접 입력을 받고, 입력한 내용은 형식만 다듬어 다시 확인받습니다.
- 버튼(선택지 위젯)은 쓰지 않고, 질문과 추천 답을 본문 글로 보여 줍니다.
