# 통합 캘린더

Notion에 나누어 저장된 영화, 도서, 공연, 전시, 방탈출 기록을 하나의 캘린더에서 확인하는 앱입니다.

정적 캘린더 화면은 Netlify에서 제공하고, 여러 Notion 데이터 소스를 조회해 하나의 공통 형식으로 합치는 작업은 Cloudflare Worker에서 처리합니다.

## 동작 화면

![통합 캘린더 데모](./assets/calendar-demo.gif)

## 주요 기능

- 영화, 도서, 공연, 전시, 방탈출 Notion 기록 통합 조회
- FullCalendar 기반 월별 캘린더 표시
- 텍스트 보기, 이미지 보기, 목록 보기 지원
- 카테고리별 필터링
- 연도/월 선택 이동
- 선택한 항목의 상세 정보 표시
- Notion 원본 페이지로 바로 이동
- 각 데이터베이스의 서로 다른 속성을 공통 캘린더 형식으로 정규화

## 관련 경로

```text
apps/calendar/
├─ index.html
├─ app.js
└─ style.css

workers/calendar-api/
├─ src/
│  └─ index.js
├─ wrangler.toml
├─ package.json
├─ package-lock.json
└─ .env.example
```

## 앱 구조

### Frontend

`apps/calendar/index.html`

캘린더 화면의 HTML 구조와 FullCalendar CDN 로드를 담당합니다.

`apps/calendar/app.js`

캘린더 동작을 담당합니다.

주요 역할:

- Cloudflare Worker의 `/api/calendar` 호출
- FullCalendar 이벤트 렌더링
- 카테고리별 필터 버튼 관리
- 월 이동 컨트롤
- 텍스트 보기, 이미지 보기, 목록 보기 전환
- 상세 패널 렌더링
- Notion 원본 페이지 링크 연결

`apps/calendar/style.css`

캘린더 레이아웃, 필터 버튼, 상세 패널, 이미지 카드 스타일을 담당합니다.

Worker URL은 `index.html`의 `window.APP_CONFIG.API_BASE` 값으로 설정합니다.

```js
window.APP_CONFIG = {
  API_BASE: "https://notion-calendar-api-new.codud9028.workers.dev",
};
```

### Worker

`workers/calendar-api/src/index.js`

Cloudflare Worker에서 여러 Notion 데이터 소스를 조회하고, 각 데이터베이스의 속성을 캘린더에서 사용할 공통 형식으로 변환합니다.

주요 API:

```text
GET /api/calendar
GET /api/health
GET /api/debug-database
```

## API

### `GET /api/calendar`

여러 Notion 데이터 소스의 페이지를 조회해 하나의 캘린더 이벤트 배열로 반환합니다.

요청 예시:

```text
/api/calendar?start=2026-05-01&end=2026-06-01
```

| 파라미터 | 설명 |
| --- | --- |
| `start` | 조회 시작일, `YYYY-MM-DD` 형식 |
| `end` | 조회 종료일, `YYYY-MM-DD` 형식 |

응답 예시:

```json
[
  {
    "id": "notion-page-id",
    "source": "영화",
    "title": "영화 제목",
    "date": "2026-05-10",
    "url": "https://www.notion.so/...",
    "color": "#3b82f6",
    "imageUrl": "https://..."
  }
]
```

### `GET /api/health`

Worker가 정상 응답하는지 확인하기 위한 헬스 체크 API입니다.

요청 예시:

```text
/api/health
```

응답 예시:

```json
{
  "ok": true
}
```

### `GET /api/debug-database`

Notion 데이터베이스 또는 데이터 소스 연결 상태를 확인하기 위한 디버그 API입니다.

요청 예시:

```text
/api/debug-database?id=YOUR_DATA_SOURCE_ID
```

## 통합하는 데이터 소스

캘린더 Worker는 아래 Notion 데이터 소스를 조회합니다.

| 데이터 소스 | 환경변수 | 캘린더 source |
| --- | --- | --- |
| 영화 | `MOVIE_DATA_SOURCE_ID` | `영화` |
| 도서 | `BOOK_DATA_SOURCE_ID` | `도서` |
| 공연 | `PERFORMANCE_DATA_SOURCE_ID` | `공연` |
| 전시 | `EXHIBITION_DATA_SOURCE_ID` | `전시` |
| 방탈출 | `ESCAPE_ROOM_DATA_SOURCE_ID` | `방탈출` |

각 데이터 소스는 서로 다른 속성 구조를 가지고 있으므로, Worker에서 source별 normalize 함수를 통해 공통 형식으로 변환합니다.

공통 형식:

```json
{
  "id": "Notion page ID",
  "source": "카테고리",
  "title": "제목",
  "date": "YYYY-MM-DD",
  "url": "Notion page URL",
  "color": "캘린더 색상",
  "imageUrl": "대표 이미지 URL"
}
```

## Notion 속성 매핑

현재 Worker는 각 데이터 소스의 속성을 아래처럼 읽습니다.

| source | 제목 속성 | 날짜 속성 | 이미지 속성 |
| --- | --- | --- | --- |
| 영화 | `영화명` | `감상일` | `포스터이미지` |
| 도서 | `제목` | `감상일` | `책표지` |
| 공연 | `공연명` | `감상일` | `이미지` |
| 전시 | `전시명` | `감상일` | `이미지` |
| 방탈출 | `테마명` | `체험일` | `이미지` |

Notion 데이터베이스의 속성명이 바뀌면 `workers/calendar-api/src/index.js`의 normalize 함수도 함께 수정해야 합니다.

## 환경변수

Cloudflare Worker의 Variables and Secrets에 아래 값을 등록해야 합니다.

```env
BOOK_DATA_SOURCE_ID=
ESCAPE_ROOM_DATA_SOURCE_ID=
EXHIBITION_DATA_SOURCE_ID=
MOVIE_DATA_SOURCE_ID=
PERFORMANCE_DATA_SOURCE_ID=
NOTION_TOKEN=
NOTION_VERSION=
```

| 변수 | 설명 |
| --- | --- |
| `BOOK_DATA_SOURCE_ID` | 도서 Notion 데이터 소스 ID |
| `ESCAPE_ROOM_DATA_SOURCE_ID` | 방탈출 Notion 데이터 소스 ID |
| `EXHIBITION_DATA_SOURCE_ID` | 전시 Notion 데이터 소스 ID |
| `MOVIE_DATA_SOURCE_ID` | 영화 Notion 데이터 소스 ID |
| `PERFORMANCE_DATA_SOURCE_ID` | 공연 Notion 데이터 소스 ID |
| `NOTION_TOKEN` | Notion Integration Token |
| `NOTION_VERSION` | Notion API 버전 |

실제 값은 GitHub에 커밋하지 않습니다.

> `DATA_SOURCE_ID`는 Notion 페이지 URL의 데이터베이스 ID와 다를 수 있습니다. Notion 데이터베이스의 데이터 소스 관리 화면에서 확인한 ID를 사용합니다.

## 배포

캘린더 API Worker 폴더에서 배포합니다.

```powershell
cd workers/calendar-api
npm install
npx wrangler deploy
```

`wrangler.toml`의 Worker 이름:

```toml
name = "notion-calendar-api-new"
main = "src/index.js"
compatibility_date = "2026-04-30"
workers_dev = true
```

배포 후 Worker URL:

```text
https://notion-calendar-api-new.codud9028.workers.dev
```

프론트엔드의 API URL도 이 Worker URL과 일치해야 합니다.

```js
window.APP_CONFIG = {
  API_BASE: "https://notion-calendar-api-new.codud9028.workers.dev",
};
```

## 동작 흐름

```text
사용자가 캘린더 페이지 접속
        ↓
apps/calendar/app.js
        ↓
GET /api/calendar?start=...&end=...
        ↓
Cloudflare Worker
        ↓
Notion API로 각 데이터 소스 조회
        ↓
영화, 도서, 공연, 전시, 방탈출 데이터 정규화
        ↓
공통 캘린더 이벤트 배열 반환
        ↓
FullCalendar에 이벤트 렌더링
        ↓
사용자가 항목 클릭
        ↓
상세 패널 표시 및 Notion 원본 페이지 링크 제공
```