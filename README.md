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

## 기능별 문서

각 기능의 상세 설명은 아래 문서에서 확인할 수 있습니다.

| 기능 | 설명 | 문서 |
| --- | --- | --- |
| 통합 캘린더 | 영화, 도서, 공연, 전시, 방탈출 기록을 한 화면에서 조회 | [Calendar README](./workers/calendar-api/README.md) |
| 영화 DB 자동 입력 | KMDB API로 영화 정보를 검색하고 Notion 영화 DB에 저장 | [Movie README](./workers/movie-automation/README.md) |
| 도서 DB 자동 입력 | 도서관 정보나루 API로 책 정보를 검색하고 Notion 도서 DB에 저장 | [Book README](./workers/book-automation/README.md) |
| 공연 DB 자동 입력 | KOPIS API로 공연 정보를 검색하고 Notion 공연 DB에 저장 | [Performance README](./workers/performance-automation/README.md) |
| 전시 DB 자동 입력 | 한눈에보는문화정보조회서비스 API로 전시 정보를 검색하고 Notion 전시 DB에 저장 | [Exhibition README](./workers/exhibition-automation/README.md) |


## 주요 기능

### 통합 캘린더

- 영화, 도서, 공연, 전시, 방탈출 기록 통합 조회
- 월별 캘린더 보기, 이미지 보기, 목록 보기 지원
- 카테고리별 필터링
- 캘린더 항목 클릭 시 Notion 원본 페이지로 이동

![통합 캘린더 데모](./assets/1.%20notion-link-origin-page.gif)

### DB 자동 입력

- 영화 정보를 검색하고 Notion 영화 데이터베이스에 저장
- 도서 정보를 검색하고 Notion 도서 데이터베이스에 저장
- 공연 정보를 검색하고 Notion 공연 데이터베이스에 저장
- 전시 정보를 검색하고 Notion 전시 데이터베이스에 저장
- 추가 요청은 관리자 토큰 인증을 통해 보호

![DB 자동입력 데모](/assets/2.%20movie_db_save.gif)

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

## 배포

- Frontend: Netlify (`apps` 디렉터리 배포)
- Backend: Cloudflare Workers (`workers/*`)
- 각 Worker의 자세한 배포 방법은 기능별 README를 참고합니다.


## 보안

`POST /add` API는 관리자 토큰 인증이 필요합니다.

Cloudflare Worker Secret에 `ADMIN_TOKEN`을 등록하고, 프론트엔드는 `노션에 추가` 요청 시 `X-Admin-Token` 헤더로 토큰을 전송합니다.

토큰이 없거나 일치하지 않으면 Worker는 `401 Unauthorized`를 반환하며 Notion 데이터베이스에 항목을 추가하지 않습니다.