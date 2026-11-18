# 설치·배포·테스트·수정

## A. 손으로 설치 (누구나, 10분)

1. Google Drive에서 새 Google 시트를 만든다.
2. 시트 메뉴 **확장 프로그램 > Apps Script**.
3. `Code.gs` 내용을 지우고 수정한 `Code.gs`를 붙여 넣는다.
4. 왼쪽 `+` > **HTML** → 이름 `Index`(확장자 없이) → `Index.html` 붙여 넣기.
5. (선택) 프로젝트 설정 > "appsscript.json 매니페스트 파일 표시" → `appsscript.json` 붙여 넣기. 안 하면 프로젝트 설정의 시간대만 맞춘다.
6. 함수 목록에서 `setup` → **실행** → 권한 검토 → 계정 선택 → (경고가 나오면 고급 > 이동) → **모두 선택** → 계속.
7. 실행 로그의 **배포 파일 폴더**에 `STEPS[].file`로 시작하는 파일을 올린다. `checkSetup` 실행 → "배포 파일 N개 확인 완료".
8. **배포 > 새 배포 > 유형: 웹 앱** → 실행 사용자 **나** / 액세스 **모든 사용자** → 배포 → 나온 `/exec` 주소를 공유.

Google Workspace 계정은 관리자 정책 때문에 "모든 사용자"가 안 보일 수 있다. 그때는 "도메인 내 모든 사용자"만 되므로 외부 참가자는 개인 Gmail 계정으로 배포한다.

## B. clasp로 설치 (개발자)

```bash
npm i -g @google/clasp
clasp login                                   # https://script.google.com/home/usersettings 에서 Apps Script API 켜기
mkdir my-gate && cd my-gate
clasp create --type sheets --title "My Gate"  # 시트에 붙은 프로젝트 생성
cp <skill>/assets/{Code.gs,Index.html,appsscript.json} .
clasp push
clasp open                                    # 편집기에서 setup 실행(권한 승인), 파일 업로드
clasp deploy --description "v1"               # 나온 deploymentId를 기록해 둔다
```

수정 뒤 같은 주소 유지: `clasp push && clasp deploy -i <deploymentId> -d "v2 …"`
(`clasp deploy`만 하면 새 주소가 생긴다.)

## C. AI 에이전트가 브라우저로 설치 (Aside 등)

- **프로젝트 만들기**: Drive API `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
  - 메타데이터: `{"name": "...", "mimeType": "application/vnd.google-apps.script"}`
  - 본문 파트 `Content-Type: application/vnd.google-apps.script+json`: `{"files":[{"name":"Code","type":"server_js","source":"..."},{"name":"Index","type":"html","source":"..."},{"name":"appsscript","type":"json","source":"..."}]}`
  - `drive` 범위만 있어도 **생성은 된다.**
- **코드 고치기**: 같은 API로 PATCH하면 `403 drive.scripts scope is required`. 편집기에서 바꾼다.
  - 파일 선택 → 편집기 클릭 → Ctrl+A → `navigator.clipboard.writeText(code)` → Ctrl+V → Ctrl+S.
  - 확인: `GET https://www.googleapis.com/drive/v3/files/<scriptId>/export?mimeType=application/vnd.google-apps.script%2Bjson` 의 source가 로컬 파일과 같은지 비교한다.
- API로 만든 직후 편집기 함수 목록이 "함수 없음"이면, 편집기에 줄 하나 추가하고 저장하면 함수가 뜬다.
- `setup` 첫 실행 때 권한 팝업이 새 탭으로 열린다 → "모두 선택" → 계속.
- 배포 대화상자: **배포 > 새 배포**(처음) / **배포 > 배포 관리 > 수정(연필) > 버전: 새 버전 > 배포**(수정할 때).
- 배포 파일은 Drive API로 `SOURCE_FOLDER_ID` 폴더에 multipart 업로드하면 된다.

## 테스트 (배포 직후 반드시)

`aside-test@…`처럼 표시가 나는 테스트 이메일 하나로 실제 주소에서 끝까지 해 본다.

1. 이메일 입장 → 2단계 이후가 잠겨 있는지
2. 1단계 다운로드 → 파일 이름·내용이 맞는지
3. 1단계 업로드 → 다음 단계가 열리는지, 시트(진행현황·단계 결과·응답상세·활동로그)와 Drive(`02_참가자결과/<이메일>/`)에 들어갔는지
4. CHECK가 marker/required면: 다른 단계 결과, 빈 양식을 올려 거절 문구가 나오는지
5. 한글 txt: 메모장 ANSI(CP949) 저장 파일도 한글이 깨지지 않는지
6. 마지막 단계까지 → "전체 완료"
7. 로그인하지 않은 창(시크릿 창)에서 주소가 열리는지

**정리**: 테스트 이메일이 들어간 행만 각 탭에서 지우고(아래에서부터), Drive의 테스트 이메일 폴더를 휴지통으로 보낸다. 실제 참가자 행은 건드리지 않는다. 같은 브라우저 입력칸에 테스트 이메일이 남지 않게 한다(Index.html은 이메일을 저장하지 않는다).

## 운영 중 수정할 때

1. **고치기 전에 지금 배포된 코드를 먼저 내려받아 로컬과 비교한다.** 다른 사람(또는 다른 세션)이 그사이 고쳐서 배포했을 수 있다. 배포 관리의 버전 설명을 보고, 로컬에 없는 변경은 합친 뒤에 붙여 넣는다.
2. 항상 **기존 배포의 새 버전**으로 올린다. 주소가 그대로라 이미 나간 링크를 다시 보낼 필요가 없다.
3. 배포 직후 1분 정도는 이전 버전이 열릴 수 있다. 확인은 잠깐 뒤 새로고침해서 한다.
4. 이미 페이지를 열어 둔 참가자는 **새로고침**해야 새 화면이 적용된다(서버 코드는 바로 바뀌지만 화면 코드는 그대로 남음). 공지에 한 줄 넣는다.
5. 단계를 추가·삭제할 때 기존 `key`, `short`는 바꾸지 않는다. 시트 열 이름이 `short`로 만들어지므로 바꾸면 진행 기록이 끊긴다. 바꿔야 하면 `setup()`을 다시 실행하고 기존 열을 손으로 옮긴다.
6. 배포 파일만 바꿀 때는 코드 배포가 필요 없다. 같은 이름 앞부분으로 새 파일(`step1_v2.md`)을 올리면 가장 최근 파일이 내려간다.

## 알려진 함정

| 증상 | 원인 | 처리 |
|---|---|---|
| txt를 올리면 한글이 `���` | 메모장 ANSI(CP949) 저장 | Index.html `readText`가 UTF-8 → UTF-16 → EUC-KR 순서로 판별 (이미 반영) |
| 시트 날짜가 날짜만 보임 | 기본 서식 | `ensureSheets_`가 `yyyy-mm-dd hh:mm` 서식 지정 (이미 반영) |
| 시트에 `=`로 시작한 답이 수식으로 바뀜 | 셀 입력 | `safeCell_`이 앞에 `'`를 붙임 |
| 긴 답이 잘림 | 셀 5만 자 제한 | 4.9만 자에서 자르고 원문은 Drive 파일에 |
| 입장 칸에 남의 이메일이 미리 채워짐 | localStorage·자동완성 | 저장하지 않고 `autocomplete="off"` (이미 반영) |
| 테스트 후 참가자 데이터를 지움 | 탭 전체 삭제 | 테스트 이메일 행만 지운다 |
| 고친 코드를 올렸더니 다른 수정이 사라짐 | 배포본과 로컬이 달랐음 | 위 "운영 중 수정할 때" 1번 |
