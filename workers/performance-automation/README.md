# 공연 DB 자동 입력

공연 정보를 검색하고, 선택한 공연을 Notion 공연 데이터베이스에 저장하는 자동화 앱입니다.

정적 검색 화면은 Netlify에서 제공하고, 공연 검색 및 Notion 저장 로직은 Cloudflare Worker에서 처리합니다.

## 동작 화면

![공연 DB 자동 입력 데모](../../assets/3.%20performance_db_save.gif)

## 주요 기능

- 공연명 키워드 기반 검색
- 기간 범위를 지정한 공연 검색
- 공연명, 공연장, 공연 기간, 장르, 포스터 정보 표시
- 검색 결과에서 선택한 공연을 Notion 데이터베이스에 추가
- 공연 상세 정보를 다시 조회한 뒤 Notion에 저장
- Notion 페이지에 공연명, 장소, 기간, 장르, 이미지, 출연진, 가격 등 저장

## 관련 경로

```text
apps/performance-search/
└─ index.html

workers/performance-automation/
├─ src/
│  └─ index.js
├─ wrangler.toml
├─ package.json
├─ package-lock.json
└─ .env.example
```

## 앱 구조

### Frontend

`apps/performance-search/index.html`

공연 검색 UI를 담당합니다.

주요 역할:

- 공연명 키워드 입력
- 검색 기간 선택
- Cloudflare Worker의 `/search` API 호출
- 검색 결과 카드 렌더링
- `노션에 추가` 버튼 클릭 시 `/add` API 호출

Worker URL은 `WORKER_BASE` 값으로 설정합니다.

```js
const WORKER_BASE = "https://your-worker-name.your-subdomain.workers.dev";
```

### Worker

`workers/performance-automation/src/index.js`

Cloudflare Worker에서 공연 검색과 Notion 저장을 처리합니다.

주요 API:

```text
GET /search
POST /add
```

## API

### `GET /search`

공연 정보를 검색합니다.

요청 예시:

```text
/search?q=레미제라블&from=20250101&to=20261231
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
      "mt20id": "PF000000",
      "title": "공연명",
      "place": "공연장",
      "startDate": "20250101",
      "endDate": "20250331",
      "genre": "뮤지컬",
      "poster": "https://..."
    }
  ]
}
```

### `POST /add`

검색 결과에서 선택한 공연을 Notion 공연 데이터베이스에 추가합니다.

공연 목록 응답에는 상세 정보가 부족할 수 있으므로, `/add` 요청에서는 공연 ID인 `mt20id`를 전달합니다. Worker는 이 ID로 공연 상세 정보를 다시 조회한 뒤 Notion에 저장합니다.

요청 예시:

```json
{
  "mt20id": "PF000000"
}
```

## Notion 저장 항목

Worker는 공연 정보를 Notion 공연 데이터베이스에 저장합니다.

| Notion 속성 | 저장 내용 |
| --- | --- |
| `공연명` | 공연 제목 |
| `공연 장르` | 연극, 서양음악(클래식), 뮤지컬, 대중음악, 복합, 서커스/마술 |
| `공연 장소` | 공연장 명|
| `공연 기간` | 공연 기간|
| `공연 가격` | 티켓 가격 정보, 있는 경우 |
| `공연 출연진` | 출연진 정보, 있는 경우 |
| `이미지` | 포스터 이미지 URL |

사용 중인 Notion 데이터베이스의 실제 속성명에 따라 Worker 코드에서 매핑됩니다.

## 환경변수

Cloudflare Worker의 Variables and Secrets에 아래 값을 등록해야 합니다.

```env
CULTURE_API_KEY=
NOTION_API_KEY=
NOTION_DB_ID=
ADMIN_TOKEN=
```

| 변수 | 설명 |
| --- | --- |
| `CULTURE_API_KEY` | 공연 정보를 조회하는 문화 API Key |
| `NOTION_API_KEY` | Notion Integration API Key |
| `NOTION_DB_ID` | 공연 정보를 저장할 Notion 데이터베이스 ID |
|`ADMIN_TOKEN`|Notion 데이터베이스에 항목을 추가할 때 사용하는 관리자 인증 토큰|

실제 값은 GitHub에 커밋하지 않습니다.

## 배포

공연 Worker 폴더에서 배포합니다.

```powershell
cd workers/performance-automation
npm install
npx wrangler deploy
```

`wrangler.toml`의 Worker 이름:

```toml
name = "notion-performance-automation-new"
main = "src/index.js"
compatibility_date = "2026-04-30"
workers_dev = true
```

배포 후 Worker URL:

```text
https://your-worker-name.your-subdomain.workers.dev
```

## 동작 흐름

```text
사용자 검색어와 기간 입력
        ↓
apps/performance-search/index.html
        ↓
GET /search?q=...&from=...&to=...
        ↓
Cloudflare Worker
        ↓
공연 API 목록 검색
        ↓
검색 결과 반환
        ↓
사용자가 "노션에 추가" 클릭
        ↓
POST /add
        ↓
Cloudflare Worker
        ↓
공연 상세 정보 조회
        ↓
Notion API로 페이지 생성
        ↓
Notion 공연 데이터베이스에 저장
```