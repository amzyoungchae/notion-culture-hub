# 도서 DB 자동 입력

도서 검색 API를 사용해 책 정보를 검색하고, 선택한 도서를 Notion 도서 데이터베이스에 저장하는 자동화 앱입니다.

정적 검색 화면은 Netlify에서 제공하고, 도서 검색 및 Notion 저장 로직은 Cloudflare Worker에서 처리합니다.

## 동작 화면

![도서 DB 자동 입력 데모](../../assets/5.%20book_db_save.gif)

## 주요 기능

- 책 제목, 작가명, ISBN 기반 도서 검색
- 도서 API를 통한 책 상세 정보 조회
- 책 표지, 제목, 저자, 출판사, KDC, ISBN 정보 표시
- 검색 결과에서 선택한 도서를 Notion 데이터베이스에 추가
- Notion 페이지에 제목, 저자, 출판사, KDC, 책 표지, 주제분야, 줄거리, 키워드 등 저장
- ISBN 입력 시 ISBN 기반 검색 요청 처리

## 관련 경로

```text
apps/book-search/
└─ index.html

workers/book-automation/
├─ src/
│  └─ index.js
├─ wrangler.toml
├─ package.json
├─ package-lock.json
└─ .env.example
```

## 앱 구조

### Frontend

`apps/book-search/index.html`

도서 검색 UI를 담당합니다.

주요 역할:

- 검색어 입력
- ISBN 형식 감지
- Cloudflare Worker의 `/search` API 호출
- 검색 결과 카드 렌더링
- `노션에 추가` 버튼 클릭 시 `/add` API 호출

Worker URL은 `WORKER_BASE` 값으로 설정합니다.

```js
const WORKER_BASE = "https://your-worker-name.your-subdomain.workers.dev";
```

### Worker

`workers/book-automation/src/index.js`

Cloudflare Worker에서 도서 검색과 Notion 저장을 처리합니다.

주요 API:

```text
GET /search
POST /add
```

## API

### `GET /search`

도서 API에서 책 정보를 검색합니다.

키워드 검색 예시:

```text
/search?keyword=해리포터
```

ISBN 검색 예시:

```text
/search?isbn13=9788950905290
```

응답 예시:

```json
{
  "items": [
    {
      "title": "책 제목",
      "author": "저자",
      "publisher": "출판사",
      "isbn13": "9780000000000",
      "kdc": "800",
      "coverUrl": "https://..."
    }
  ]
}
```

### `POST /add`

검색 결과에서 선택한 도서를 Notion 도서 데이터베이스에 추가합니다.

요청 body는 `/search`에서 받은 도서 item 객체를 전달합니다.

```json
{
  "title": "책 제목",
  "author": "저자",
  "publisher": "출판사",
  "isbn13": "9780000000000",
  "kdc": "800",
  "coverUrl": "https://..."
}
```

## Notion 저장 항목

Worker는 도서 정보를 Notion 도서 데이터베이스에 저장합니다.

| Notion 속성 | 저장 내용 |
| --- | --- |
| `제목` | 책 제목 |
| `작가` | 저자명 |
| `출판사` | 출판사 |
| `kdc` | 한국십진분류 번호 |
| `책표지` | 책 표지 이미지 URL |
| `주제분야` | 도서 주제 분야 |
| `줄거리` | 도서 설명 |
| `키워드` | 도서 관련 키워드 |

사용 중인 Notion 데이터베이스의 실제 속성명에 따라 Worker 코드에서 매핑됩니다.

## 환경변수

Cloudflare Worker의 Variables and Secrets에 아래 값을 등록해야 합니다.

```env
DATA4LIB_KEY=
NOTION_TOKEN=
NOTION_DB_ID=
ADMIN_TOKEN=
```

| 변수 | 설명 |
| --- | --- |
| `DATA4LIB_KEY` | 도서 API Key |
| `NOTION_TOKEN` | Notion Integration Token |
| `NOTION_DB_ID` | 도서 정보를 저장할 Notion 데이터베이스 ID |
| `ADMIN_TOKEN` | Notion 데이터베이스에 항목을 추가할 때 사용하는 관리자 인증 토큰 |

실제 값은 GitHub에 커밋하지 않습니다.

## 배포

도서 Worker 폴더에서 배포합니다.

```powershell
cd workers/book-automation
npm install
npx wrangler deploy
```

`wrangler.toml`의 Worker 이름:

```toml
name = "notion-book-automation-new"
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
사용자 검색어 입력
        ↓
apps/book-search/index.html
        ↓
ISBN 여부 확인
        ↓
GET /search?keyword=... 또는 /search?isbn13=...
        ↓
Cloudflare Worker
        ↓
도서 API 조회
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
Notion 도서 데이터베이스에 저장
```