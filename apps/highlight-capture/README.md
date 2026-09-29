# 도서 하이라이트 캡처

실물 책에서 촬영한 문장을 AI OCR로 추출하고, 기존 도서 DB의 책과 연결해 Notion의 `도서 하이라이트` DB에 저장하는 모바일 웹앱입니다.

## 사용 흐름

1. 사진을 촬영하거나 앨범에서 선택합니다.
2. 하이라이트 문장이 보이도록 영역을 자릅니다.
3. 한국어 OCR 결과를 확인하고 수정합니다.
4. 기존 도서 DB에서 책을 검색해 선택합니다.
5. 페이지, 태그, 메모를 입력하고 Notion에 저장합니다.

OCR은 Cloudflare Workers AI의 다국어 비전 모델을 사용합니다. 잘라낸 사진은 문장 추출 시 Cloudflare Workers AI로 전송되며, 저장할 때 Notion 파일 업로드 API로 전송됩니다.

## API

기존 `book-automation` Worker에 아래 엔드포인트를 함께 둡니다.

```text
GET  /highlights/books?q=검색어
POST /highlights/ocr
POST /highlights
```

세 요청 모두 `X-Admin-Token` 헤더가 필요합니다.

`POST /highlights`는 `multipart/form-data`로 다음 필드를 받습니다.

| 필드 | 설명 |
| --- | --- |
| `text` | 하이라이트 문장 |
| `bookId` | 연결할 Notion 책 페이지 ID |
| `page` | 책 페이지 번호 |
| `memo` | 개인 메모 |
| `tags` | 쉼표로 구분한 태그 |
| `image` | 잘라내고 압축한 원본 사진 |

## Worker 설정

`workers/book-automation/wrangler.toml`에 도서 DB ID, Highlights DB ID와 Workers AI 바인딩이 설정되어 있습니다. 기존 Worker Secret은 그대로 재사용합니다.

```env
NOTION_TOKEN=
ADMIN_TOKEN=
```

Notion Integration은 도서 DB와 `도서 하이라이트` DB 모두에 연결되어 있어야 합니다.

Highlights DB에는 다음 속성이 필요합니다.

| 속성 | 유형 |
| --- | --- |
| `하이라이트` | 제목 |
| `책` | 도서 DB 관계형 |
| `페이지` | 숫자 |
| `메모` | 텍스트 |
| `원본 사진` | 파일과 미디어 |
| `기록일` | 생성 일시 |
| `태그` | 다중 선택 |
