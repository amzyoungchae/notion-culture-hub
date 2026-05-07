# 전시 DB 자동 입력

전시 정보를 검색하고, 선택한 전시를 Notion 전시 데이터베이스에 저장하는 자동화 앱입니다.

정적 검색 화면은 Netlify에서 제공하고, 전시 검색 및 Notion 저장 로직은 Cloudflare Worker에서 처리합니다.

## 동작 화면

![전시 DB 자동 입력 데모](./assets/exhibition-search-demo.gif)

## 주요 기능

- 전시명 키워드 기반 검색
- 기간 범위를 지정한 전시 검색
- 전시명, 장소, 기간, 이미지 정보 표시
- 검색 결과에서 선택한 전시를 Notion 데이터베이스에 추가
- Notion 페이지에 전시명, 장소, 기간, 이미지 등 저장
- 기존에 `performance-automation` 이름으로 관리되던 전시 자동화 코드를 역할 기준으로 `exhibition-automation`으로 정리

## 관련 경로

```text
apps/exhibition-search/
└─ index.html

workers/exhibition-automation/
├─ src/
│  └─ index.js
├─ wrangler.toml
├─ package.json
├─ package-lock.json
└─ .env.example
```

## 앱 구조

### Frontend

`apps/exhibition-search/index.html`

전시 검색 UI를 담당합니다.

주요 역할:

- 전시명 키워드 입력
- 검색 기간 선택
- Cloudflare Worker의 `/search` API 호출
- 검색 결과 카드 렌더링
- `노션에 추가` 버튼 클릭 시 `/add` API 호출

Worker URL은 `WORKER_BASE` 값으로 설정합니다.

```js
const WORKER_BASE = "https://notion-exhibition-automation-new.codud9028.workers.dev";
```

### Worker

`workers/exhibition-automation/src/index.js`

Cloudflare Worker에서 전시 검색과 Notion 저장을 처리합니다.

주요 API:

```text
GET /search
POST /add
```

## API

### `GET /search`

전시 정보를 검색합니다.

요청 예시:

```text
/search?q=모네&from=20250101&to=20261231
```

| 파라미터 | 설명 |
| --- | --- |
| `q` | 검색 키워드 |
| `from` | 검색 시작일, `YYYYMMDD` 형식 |
| `to` | 검색 종료일, `YYYYMMDD` 형식 |

응답 예시:

```json
{
  "items": [
    {
      "title": "전시명",
      "place": "전시장",
      "startDate": "20250101",
      "endDate": "20250331",
      "imageUrl": "https://..."
    }
  ]
}
```

### `POST /add`

검색 결과에서 선택한 전시를 Notion 전시 데이터베이스에 추가합니다.

요청 body는 `/search`에서 받은 전시 item 정보를 전달합니다.

```json
{
  "title": "전시명",
  "place": "전시장",
  "startDate": "20250101",
  "endDate": "20250331",
  "imageUrl": "https://..."
}
```

## Notion 저장 항목

Worker는 전시 정보를 Notion 전시 데이터베이스에 저장합니다.

| Notion 속성 | 저장 내용 |
| --- | --- |
| `전시명` | 전시 제목 |
| `장소` | 전시장 또는 개최 장소 |
| `기간` 또는 `감상일` | 전시 기간 또는 감상일 |
| `이미지` | 전시 이미지 URL |
| `관련URL` | 전시 상세 URL, 있는 경우 |

사용 중인 Notion 데이터베이스의 실제 속성명에 따라 Worker 코드에서 매핑됩니다.

## 환경변수

Cloudflare Worker의 Variables and Secrets에 아래 값을 등록해야 합니다.

```env
NOTION_API_KEY=
CULTURE_API_KEY=
NOTION_DB_ID=
```

| 변수 | 설명 |
| --- | --- |
| `NOTION_API_KEY` | Notion Integration API Key |
| `CULTURE_API_KEY` | 전시 정보를 조회하는 문화 API Key |
| `NOTION_DB_ID` | 전시 정보를 저장할 Notion 데이터베이스 ID |

실제 값은 GitHub에 커밋하지 않습니다.

## 배포

전시 Worker 폴더에서 배포합니다.

```powershell
cd workers/exhibition-automation
npm install
npx wrangler deploy
```

`wrangler.toml`의 Worker 이름:

```toml
name = "notion-exhibition-automation-new"
main = "src/index.js"
compatibility_date = "2026-04-30"
workers_dev = true
```

배포 후 Worker URL:

```text
https://notion-exhibition-automation-new.codud9028.workers.dev
```

## 동작 흐름

```text
사용자 검색어와 기간 입력
        ↓
apps/exhibition-search/index.html
        ↓
GET /search?q=...&from=...&to=...
        ↓
Cloudflare Worker
        ↓
전시 API 조회
        ↓
검색 결과 반환
        ↓
사용자가 "노션에 추가" 클릭
        ↓
POST /add
        ↓
Cloudflare Worker
        ↓
Notion API로 페이지 생성
        ↓
Notion 전시 데이터베이스에 저장
```