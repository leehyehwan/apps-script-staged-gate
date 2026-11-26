---
name: "apps-script-staged-gate"
description: "Build, deploy, and update a Google Apps Script web app where participants enter with their email, download step files in order, and must upload each step's result to unlock the next step, with uploads saved to Google Drive and parsed into Google Sheets. Use for workshops, courses, AI questionnaire chains (e.g. ICP → target → profile → tone), staged assignments, or any '다운로드 → 결과 업로드 → 다음 단계 열림' flow, and for changing steps, upload rules, or redeploying an existing one."
---

# Apps Script Staged Gate

참가자: 이메일 입장 → ① 파일 다운로드 → 결과 업로드 → ② 열림 → … → 마지막 단계(보통 다운로드만).
저장: Drive `02_참가자결과/<이메일>/`에 원본, Sheet에 진행현황·단계별 결과(항목별 열)·응답상세(세로형)·활동로그.

## 폴더 규칙 (필수)

새로 만드는 웹앱과 교육 자료는 **무조건** 상위 폴더 아래 **날짜 폴더 하나**에 모은다. 내 드라이브 루트나 다른 폴더에 만들지 않는다.

- 상위 폴더: `CONFIG.PARENT_FOLDER_ID` (기본값 `1RJjj_dUbUSQXuETgA74ZZ1IA4SNX5vii` = maetel 공유 드라이브 `메텔 Grill 교육`). 다른 조직이 쓸 때는 자기 폴더 ID로 바꾼다.
- 날짜 폴더 이름: `YYYY-MM-DD_<이름>` (만든 날, 한국 시간). 예: `2026-11-15_Grill 질문지 웹앱`, `2026-11-26_리드결과_3차`.
  - 웹앱은 `setup()`이 `<상위>/YYYY-MM-DD_<ROOT_FOLDER_NAME>/`를 만들고 그 안에 `01_배포파일`, `02_참가자결과`, 결과 시트를 만든 뒤 스크립트 파일(또는 스크립트가 붙은 시트)도 옮긴다. `ROOT_FOLDER_NAME`에는 날짜를 넣지 않는다.
  - 에이전트가 Drive API로 직접 만드는 것(스크립트 프로젝트, 시트, 문서, 업로드 파일)은 먼저 날짜 폴더를 만들고(있으면 재사용) `parents: [날짜 폴더 ID]`, `supportsAllDrives=true`로 만든다.
  - 같은 교육의 후속 자료(리드 결과, 통합 시트, 검토 웹앱, 계획서 등)도 상위 폴더 바로 아래에 그날 날짜 폴더를 만들어 넣는다. 그 자료에서 만든 웹앱은 원본 자료의 날짜 폴더에 함께 둔다.
- 상위 폴더 바로 아래에는 날짜 폴더만 둔다. 날짜 없는 폴더나 파일이 보이면 만든 날(createdTime, 한국 시간) 기준 날짜 폴더로 옮기거나 이름 앞에 날짜를 붙인다.
- 옮겨도 Drive ID는 그대로라 운영 중인 웹앱(스크립트 속성에 ID 저장)은 계속 동작한다. 옮긴 뒤 웹앱 주소가 열리는지만 확인한다.

## 파일

- `assets/Code.gs` — 서버. **맨 위 `CONFIG`와 `STEPS`만 바꾼다.** 아래 공통 코드는 건드리지 않는다.
- `assets/Index.html` — 참가자 화면. 문구는 `CONFIG`에서 받아 온다. 보통 수정 없음.
- `assets/appsscript.json` — 시간대, 웹앱(실행: 나 / 액세스: 모든 사용자).
- `scripts/check.mjs` — 배포 전 설정 점검 + 샘플 결과 파일 파싱 미리 보기.
- `references/config-examples.md` — 상황별 설정 예시(기본, AI 질문지 4단계, 표지 검사, 필수 항목 검사, PDF 과제).
- `references/deploy-and-test.md` — 설치 3가지(손, clasp, AI 에이전트), 테스트 체크리스트, 운영 중 수정 규칙, 알려진 함정.

## 진행 순서

1. **요구 정리** (모르면 합리적인 기본값으로 정하고 알린다)
   - 단계 목록: 제목, 설명, 배포 파일 이름, 업로드 여부(마지막만 보통 없음)
   - 업로드 검사 수준 `CONFIG.UPLOAD.CHECK`: `none`(기본, 아무 파일) / `marker`(결과 첫 줄 표지) / `required`(표지 + 필수 항목)
     - 현장 교육은 `none`을 권한다. 형식 검사는 참가자를 막아 진행이 멈추는 일이 잦다.
   - 결과 파일에 고정 표지(`[○○ 결과]`)·필수 항목·줄글 섹션·부록이 있는지 → `marker`, `requiredItems`, `PARSE.FREE_TEXT_SECTIONS`, `PARSE.STOP_AT`
   - 화면 문구: 제목, 브랜드, 파일을 부르는 말(질문지/과제), 문의 대상
   - 배포할 Google 계정, 참가자 제한 여부(시트 `참가자명단` 탭으로 운영)
   - 날짜 폴더 뒤에 붙일 이름(`ROOT_FOLDER_NAME`, 예: `KOTRA 3일과정 질문지 웹앱`). 상위 폴더는 위 폴더 규칙을 따른다.
2. **작업 폴더에 `assets/` 3개 복사 → `CONFIG`/`STEPS` 수정.** `key`는 영문, `short`는 시트 열 이름이 되므로 짧고 겹치지 않게.
3. **점검**: `node scripts/check.mjs Code.gs` (오류 0이어야 함). 결과 양식 샘플이 있으면 `node scripts/check.mjs Code.gs <stepKey> sample.md`로 항목이 어떻게 나뉘는지, 검사 통과 여부를 본다. 나뉘는 모양이 이상하면 `PARSE` 옵션을 조정한다.
4. **설치·배포**: `references/deploy-and-test.md`의 A/B/C 중 하나. `setup()` 실행 → 배포 파일 폴더에 파일 업로드 → `checkSetup()`으로 확인 → 웹앱 배포.
5. **실제 주소에서 테스트** 이메일로 끝까지 진행(체크리스트) → 테스트 행·폴더만 정리.
6. 사용자에게: 참가자 링크, 날짜 폴더·결과 시트 링크, 검사 수준, 참가자 제한 방법, 수정·재배포 방법을 알려 준다.

## 수정 요청이 오면

- 먼저 지금 배포된 코드를 내려받아 로컬과 비교한다. 로컬에 없는 변경이 있으면 합친 뒤에 고친다.
- 고친 뒤 **기존 배포의 새 버전**으로 배포(주소 유지). 열어 둔 참가자는 새로고침해야 한다고 알린다.
- 배포 파일만 바꾸는 경우는 코드 배포 없이 같은 이름 앞부분의 새 파일을 폴더에 올리면 된다.
- 기존 `key`/`short`를 바꾸지 않는다(진행 기록이 끊김).
- 수정 뒤에도 실제 주소에서 해당 기능을 다시 확인하고, 테스트 데이터는 테스트 이메일 행만 지운다.

## 지켜야 할 것

- 배포 파일(질문지 등)의 저작권·라이선스를 확인한다. 공개 저장소에 올릴 때 남의 질문지 원문은 넣지 않는다.
- 실제 참가자 데이터가 있는 시트를 테스트 중에 통째로 지우지 않는다.
- 공유 링크 외부 공개(액세스: 모든 사용자)는 배포 전에 사용자에게 확인받는다.
