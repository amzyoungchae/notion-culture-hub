# 영화 DB 자동 입력

KMDB 영화 검색 API를 사용해 영화 정보를 검색하고, 선택한 영화를 Notion 영화 데이터베이스에 저장하는 자동화 앱입니다.

정적 검색 화면은 Netlify에서 제공하고, 영화 검색 및 Notion 저장 로직은 Cloudflare Worker에서 처리합니다.

## 동작 화면

![영화 DB 자동 입력 데모](../../assets/2.%20movie_db_save.gif)

## 주요 기능

- 영화명, 감독명, 배우명 기반 영화 검색
- KMDB API를 통한 영화 상세 정보 조회
- 영화 포스터, 감독, 출연진, 개봉일, 장르 정보 표시
- 검색 결과에서 선택한 영화를 Notion 데이터베이스에 추가
- Notion 페이지에 영화명, 감독명, 배우명, 줄거리, 키워드, 개봉일, 제작국가, 장르, 관람등급, 관련 URL, 포스터 이미지 저장
- KMDB 응답에 포함될 수 있는 `!HS`, `!HE` 검색 강조 태그 제거

## 관련 경로

```text
apps/movie-search/
└─ index.html

workers/movie-automation/
├─ src/
│  └─ index.js
├─ wrangler.toml
├─ package.json
├─ package-lock.json
└─ .env.example
```

## 앱 구조

### Frontend

`apps/movie-search/index.html`

영화 검색 UI를 담당합니다.

주요 역할:

- 검색어 입력
- Cloudflare Worker의 `/search` API 호출
- 검색 결과 카드 렌더링
- `노션에 추가` 버튼 클릭 시 `/add` API 호출

Worker URL은 `WORKER_BASE` 값으로 설정합니다.

```js
const WORKER_BASE = "https://notion-movie-automation-new.codud9028.workers.dev";
```

### Worker

`workers/movie-automation/src/index.js`

Cloudflare Worker에서 영화 검색과 Notion 저장을 처리합니다.

주요 API:

```text
GET /search
POST /add
```

## API

### `GET /search`

KMDB API에서 영화 정보를 검색합니다.

요청 예시:

```text
/search?q=기생충
```

응답 예시:

```json
{
  "items": [
    {
      "title": "기생충",
      "director": "봉준호",
      "actors": "송강호, 이선균, 조여정",
      "releaseDate": "20190530",
      "nation": "대한민국",
      "plot": "...",
      "rating": "15세관람가",
      "genre": "드라마",
      "kmdbUrl": "...",
      "keywords": "...",
      "poster": "..."
    }
  ]
}
```

### `POST /add`

검색 결과에서 선택한 영화를 Notion 영화 데이터베이스에 추가합니다.

요청 body는 `/search`에서 받은 영화 item 객체를 그대로 전달합니다.

```json
{
  "title": "기생충",
  "director": "봉준호",
  "actors": "송강호, 이선균, 조여정",
  "releaseDate": "20190530",
  "nation": "대한민국",
  "plot": "...",
  "rating": "15세관람가",
  "genre": "드라마",
  "kmdbUrl": "...",
  "keywords": "...",
  "poster": "..."
}
```

## Notion 저장 항목

Worker는 영화 정보를 아래 Notion 속성에 저장합니다.

| Notion 속성 | 저장 내용 |
| --- | --- |
| `영화명` | 영화 제목 |
| `감독명` | 감독 이름 |
| `배우명` | 주요 출연진 |
| `줄거리` | 영화 줄거리 |
| `키워드` | KMDB 키워드 |
| `개봉일` | 개봉일 |
| `제작국가` | 제작 국가 |
| `장르` | 영화 장르 |
| `대표관람등급` | 관람 등급 |
| `관련URL` | KMDB 관련 URL |
| `포스터이미지` | 포스터 이미지 URL |

포스터 이미지가 있는 경우 Notion 페이지 커버에도 동일한 이미지를 설정합니다.

## 환경변수

Cloudflare Worker의 Variables and Secrets에 아래 값을 등록해야 합니다.

```env
NOTION_MOVIE_DB_ID=
NOTION_API_KEY=
KMDB_API_KEY=
```

| 변수 | 설명 |
| --- | --- |
| `NOTION_MOVIE_DB_ID` | 영화 정보를 저장할 Notion 데이터베이스 ID |
| `NOTION_API_KEY` | Notion Integration API Key |
| `KMDB_API_KEY` | KMDB API Service Key |

실제 값은 GitHub에 커밋하지 않습니다.

## 배포

영화 Worker 폴더에서 배포합니다.

```powershell
cd workers/movie-automation
npm install
npx wrangler deploy
```

`wrangler.toml`의 Worker 이름:

```toml
name = "notion-movie-automation-new"
main = "src/index.js"
compatibility_date = "2026-04-30"
workers_dev = true
```

배포 후 Worker URL:

```text
https://notion-movie-automation-new.codud9028.workers.dev
```

## 동작 흐름

```text
사용자 검색어 입력
        ↓
apps/movie-search/index.html
        ↓
GET /search
        ↓
Cloudflare Worker
        ↓
KMDB API 조회
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
Notion 영화 데이터베이스에 저장
```