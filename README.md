# notion-culture-hub
**Frontend** <br>
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![FullCalendar](https://img.shields.io/badge/FullCalendar-4285F4?style=for-the-badge&logo=googlecalendar&logoColor=white)

**Backend & Deploy** <br>
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Netlify](https://img.shields.io/badge/netlify-%23000000.svg?style=for-the-badge&logo=netlify&logoColor=#00C7B7)

Notion에 흩어져 있는 영화, 도서, 공연, 전시, 방탈출 기록을 한 곳에서 관리하기 위한 개인용 문화생활 허브입니다.

이 프로젝트는 두 가지 흐름을 함께 다룹니다.

1. 외부 API에서 영화, 도서, 공연, 전시 정보를 검색하고 Notion 데이터베이스에 저장합니다.
2. 여러 Notion 데이터베이스의 기록을 통합해서 하나의 캘린더에서 확인합니다.

프론트엔드는 정적 HTML/CSS/JavaScript로 구성되어 Netlify에 배포하고, API와 Notion 저장 로직은 Cloudflare Workers에서 실행합니다.

![통합 캘린더 데모](./assets/1.%20notion-link-origin-page.gif)

## 주요 기능

- 영화 검색 및 Notion 영화 데이터베이스 저장
- 도서 검색 및 Notion 도서 데이터베이스 저장
- 공연 검색 및 Notion 공연 데이터베이스 저장
- 전시 검색 및 Notion 전시 데이터베이스 저장
- 영화, 도서, 공연, 전시, 방탈출 기록 통합 캘린더 조회
- 월별 캘린더 보기, 이미지 보기, 목록 보기 지원
- 카테고리별 필터링
- 캘린더 항목 클릭 시 Notion 원본 페이지로 이동

## 프로젝트 구조

```text
notion-culture-hub/
├─ apps/
│  ├─ calendar/
│  │  ├─ index.html
│  │  ├─ app.js
│  │  └─ style.css
│  ├─ book-search/
│  │  └─ index.html
│  ├─ movie-search/
│  │  └─ index.html
│  ├─ exhibition-search/
│  │  └─ index.html
│  └─ performance-search/
│     └─ index.html
│
├─ workers/
│  ├─ calendar-api/
│  │  ├─ src/index.js
│  │  ├─ wrangler.toml
│  │  └─ .env.example
│  ├─ book-automation/
│  │  ├─ src/index.js
│  │  ├─ wrangler.toml
│  │  └─ .env.example
│  ├─ movie-automation/
│  │  ├─ src/index.js
│  │  ├─ wrangler.toml
│  │  └─ .env.example
│  ├─ exhibition-automation/
│  │  ├─ src/index.js
│  │  ├─ wrangler.toml
│  │  └─ .env.example
│  └─ performance-automation/
│     ├─ src/index.js
│     ├─ wrangler.toml
│     └─ .env.example
│
├─ netlify.toml
├─ .gitignore
└─ README.md 
```

## 앱 구성

### `apps/calendar`

여러 Notion 데이터 소스를 조회해서 하나의 FullCalendar 화면에 보여주는 통합 캘린더입니다.

사용하는 Worker:

```text
notion-calendar-api-new
```

주요 API:

```text
GET /api/calendar
GET /api/health
```

### `apps/book-search`

도서 정보를 검색하고 선택한 책을 Notion 도서 데이터베이스에 추가하는 화면입니다.

사용하는 Worker:

```text
notion-book-automation-new
```

주요 API:

```text
GET /search
POST /add
```

### `apps/movie-search`

KMDB 영화 정보를 검색하고 선택한 영화를 Notion 영화 데이터베이스에 추가하는 화면입니다.

사용하는 Worker:

```text
notion-movie-automation-new
```

주요 API:

```text
GET /search
POST /add
```

### `apps/exhibition-search`

전시 정보를 검색하고 선택한 전시를 Notion 전시 데이터베이스에 추가하는 화면입니다.

사용하는 Worker:

```text
notion-exhibition-automation-new
```

주요 API:

```text
GET /search
POST /add
```

### `apps/performance-search`

공연 정보를 검색하고 선택한 공연을 Notion 공연 데이터베이스에 추가하는 화면입니다.

사용하는 Worker:

```text
notion-performance-automation-new
```

주요 API:

```text
GET /search
POST /add
```

## Workers

각 Worker는 Cloudflare Workers로 배포됩니다.

| 폴더 | Worker 이름 | 역할 |
| --- | --- | --- |
| `workers/calendar-api` | `notion-calendar-api-new` | Notion 데이터 소스들을 통합 조회 |
| `workers/book-automation` | `notion-book-automation-new` | 도서 검색 및 Notion 저장 |
| `workers/movie-automation` | `notion-movie-automation-new` | 영화 검색 및 Notion 저장 |
| `workers/exhibition-automation` | `notion-exhibition-automation-new` | 전시 검색 및 Notion 저장 |
| `workers/performance-automation` | `notion-performance-automation-new` | 공연 검색 및 Notion 저장 |

## 환경변수

실제 API key와 Notion token은 GitHub에 커밋하지 않고 Cloudflare Workers의 Variables and Secrets에 등록합니다.

각 Worker 폴더의 `.env.example`은 필요한 변수 이름을 기록하기 위한 예시 파일입니다.

### Calendar API

```env
BOOK_DATA_SOURCE_ID=
ESCAPE_ROOM_DATA_SOURCE_ID=
EXHIBITION_DATA_SOURCE_ID=
MOVIE_DATA_SOURCE_ID=
PERFORMANCE_DATA_SOURCE_ID=
NOTION_TOKEN=
NOTION_VERSION=
```

### Book Automation

```env
DATA4LIB_KEY=
NOTION_TOKEN=
NOTION_DB_ID=
```

### Movie Automation

```env
NOTION_MOVIE_DB_ID=
NOTION_API_KEY=
KMDB_API_KEY=
```

### Exhibition Automation

```env
NOTION_API_KEY=
CULTURE_API_KEY=
NOTION_DB_ID=
```

### Performance Automation

```env
CULTURE_API_KEY=
NOTION_API_KEY=
NOTION_DB_ID=
```

## 배포

### Netlify

정적 프론트엔드는 Netlify에 배포합니다.

`netlify.toml`:

```toml
[build]
  publish = "apps"

[[redirects]]
  from = "/"
  to = "/calendar/"
  status = 302

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "ALLOWALL"
```

배포 후 주요 경로:

```text
/calendar/
/book-search/
/movie-search/
/exhibition-search/
/performance-search/
```

### Cloudflare Workers

각 Worker 폴더에서 배포합니다.

예시:

```powershell
cd workers/movie-automation
npm install
npx wrangler deploy
```

다른 Worker도 같은 방식으로 각 폴더에서 실행합니다.

```powershell
cd workers/calendar-api
npx wrangler deploy

cd workers/book-automation
npx wrangler deploy

cd workers/exhibition-automation
npx wrangler deploy

cd workers/performance-automation
npx wrangler deploy
```