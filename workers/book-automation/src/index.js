export default {
  fetch(request, env) {
    return handle(request, env);
  },
};

async function handle(req, env) {
  const {
    ADMIN_TOKEN,
    AI,
    DATA4LIB_KEY,
    HIGHLIGHTS_DB_ID,
    NOTION_DB_ID,
    NOTION_TOKEN,
  } = env;
  const url = new URL(req.url);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  };

  // 1) Preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 2) 루트 확인용
    if (url.pathname === "/") {
      return new Response("OK. Use /search?keyword=... or POST /add", {
        status: 200,
        headers: corsHeaders,
      });
    }

    // =======================
    // 공통 XML 유틸
    // =======================
    const stripCdata = (v) => String(v || "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();

    const pick = (s, tag) => {
      const m = String(s || "").match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      return stripCdata(decodeXml(m[1].trim()));
    };

    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

    const isAuthorized = () => {
      const token = req.headers.get("X-Admin-Token");
      return typeof ADMIN_TOKEN !== "undefined" && Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
    };

    const notionHeaders = (version = "2022-06-28", contentType = "application/json") => ({
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": version,
      ...(contentType ? { "Content-Type": contentType } : {}),
    });

    const readNotionError = async (response, fallback) => {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body);
        return parsed.message || parsed.error || fallback;
      } catch (_) {
        return body || fallback;
      }
    };

    const plainText = (property) => {
      if (!property) return "";
      const values = property.title || property.rich_text || [];
      return values.map(item => item.plain_text || item.text?.content || "").join("").trim();
    };

    const toDataUrl = async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
    };

    // 하이라이트 화면에서 기존 Notion 책을 검색한다.
    if (url.pathname === "/highlights/books" && req.method === "GET") {
      if (!isAuthorized()) return json({ error: "Unauthorized" }, 401);
      if (!NOTION_DB_ID || !NOTION_TOKEN) return json({ error: "Missing Notion Credentials" }, 500);

      const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
      const payload = { page_size: 50 };
      if (query) {
        payload.filter = {
          property: "제목",
          title: { contains: query },
        };
      }

      const notionRes = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify(payload),
      });
      if (!notionRes.ok) return json({ error: await readNotionError(notionRes, "책 목록 조회에 실패했습니다.") }, notionRes.status);

      const notionData = await notionRes.json();
      const items = (notionData.results || []).map(page => {
        const titleProperty = page.properties?.["제목"] || Object.values(page.properties || {}).find(property => property.type === "title");
        const authorProperty = page.properties?.["작가"];
        return {
          id: page.id,
          title: plainText(titleProperty) || "제목 없음",
          author: plainText(authorProperty),
        };
      }).sort((a, b) => a.title.localeCompare(b.title, "ko"));

      return json({ items });
    }

    // 문장 사진을 다국어 비전 모델로 읽는다.
    if (url.pathname === "/highlights/ocr" && req.method === "POST") {
      if (!isAuthorized()) return json({ error: "Unauthorized" }, 401);
      if (typeof AI === "undefined" || !AI) return json({ error: "OCR 서비스가 연결되지 않았습니다." }, 503);

      const form = await req.formData();
      const image = form.get("image");
      const hasImage = image && typeof image === "object" && typeof image.arrayBuffer === "function" && Number(image.size) > 0;
      if (!hasImage) return json({ error: "OCR로 읽을 사진이 없습니다." }, 400);
      if (!String(image.type || "").startsWith("image/")) return json({ error: "이미지 파일만 읽을 수 있습니다." }, 400);
      if (image.size > 8 * 1024 * 1024) return json({ error: "OCR 사진은 8MB 이하만 처리할 수 있습니다." }, 400);

      const imageDataUrl = await toDataUrl(image);
      const result = await AI.run("@cf/google/gemma-4-26b-a4b-it", {
        messages: [
          {
            role: "system",
            content: "You are a precise OCR engine for printed Korean and English book text. Never paraphrase, translate, explain, or invent missing words.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "이 책 사진에서 실제로 인쇄된 문장을 그대로 옮겨 적어라. 형광펜으로 표시된 문장이 있으면 그 부분을 우선한다. 맞춤법을 임의로 고치지 말고 원문의 문장부호와 줄바꿈을 최대한 유지한다. 결과에는 설명, 따옴표, Markdown 없이 인식한 문장만 출력한다.",
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
        chat_template_kwargs: { enable_thinking: false },
        max_completion_tokens: 500,
        temperature: 0,
      });
      const modelText = String(
        result?.response ||
        result?.choices?.[0]?.message?.content ||
        result?.result ||
        ""
      ).replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim();
      if (!modelText) return json({ error: "사진에서 문장을 찾지 못했습니다." }, 422);
      return json({ text: modelText.slice(0, 2000) });
    }

    // OCR 결과와 선택한 책을 Highlights DB에 저장한다.
    if (url.pathname === "/highlights" && req.method === "POST") {
      if (!isAuthorized()) return json({ error: "Unauthorized" }, 401);
      if (!NOTION_TOKEN || typeof HIGHLIGHTS_DB_ID === "undefined" || !HIGHLIGHTS_DB_ID) {
        return json({ error: "Missing Highlights Notion Credentials" }, 500);
      }

      const form = await req.formData();
      const text = String(form.get("text") || "").trim().slice(0, 2000);
      const bookId = String(form.get("bookId") || "").trim();
      const memo = String(form.get("memo") || "").trim().slice(0, 2000);
      const pageValue = String(form.get("page") || "").trim();
      const pageNumber = pageValue ? Number(pageValue) : null;
      const tagNames = String(form.get("tags") || "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 20);
      const image = form.get("image");
      const hasImage = image && typeof image === "object" && typeof image.arrayBuffer === "function" && Number(image.size) > 0;

      if (!text) return json({ error: "하이라이트 문장이 비어 있습니다." }, 400);
      if (!/^[0-9a-f-]{32,36}$/i.test(bookId)) return json({ error: "연결할 책 정보가 올바르지 않습니다." }, 400);
      if (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1)) {
        return json({ error: "페이지는 1 이상의 숫자여야 합니다." }, 400);
      }
      if (hasImage && image.size > 20 * 1024 * 1024) {
        return json({ error: "사진은 20MB 이하만 저장할 수 있습니다." }, 400);
      }

      const properties = {
        "하이라이트": { title: [{ text: { content: text } }] },
        "책": { relation: [{ id: bookId }] },
      };
      if (pageNumber !== null) properties["페이지"] = { number: pageNumber };
      if (memo) properties["메모"] = { rich_text: [{ text: { content: memo } }] };
      if (tagNames.length) properties["태그"] = { multi_select: tagNames.map(name => ({ name })) };

      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          parent: { database_id: HIGHLIGHTS_DB_ID },
          properties,
        }),
      });
      if (!createRes.ok) return json({ error: await readNotionError(createRes, "하이라이트 저장에 실패했습니다.") }, createRes.status);

      const createdPage = await createRes.json();
      let imageWarning = "";

      if (hasImage) {
        try {
          const fileName = String(image.name || `highlight-${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
          const contentType = image.type || "image/jpeg";
          const initRes = await fetch("https://api.notion.com/v1/file_uploads", {
            method: "POST",
            headers: notionHeaders("2026-03-11"),
            body: JSON.stringify({ mode: "single_part", filename: fileName, content_type: contentType }),
          });
          if (!initRes.ok) throw new Error(await readNotionError(initRes, "사진 업로드 준비에 실패했습니다."));
          const upload = await initRes.json();

          const uploadForm = new FormData();
          uploadForm.append("file", image, fileName);
          const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${upload.id}/send`, {
            method: "POST",
            headers: notionHeaders("2026-03-11", null),
            body: uploadForm,
          });
          if (!sendRes.ok) throw new Error(await readNotionError(sendRes, "사진 업로드에 실패했습니다."));

          const attachRes = await fetch(`https://api.notion.com/v1/pages/${createdPage.id}`, {
            method: "PATCH",
            headers: notionHeaders("2026-03-11"),
            body: JSON.stringify({
              properties: {
                "원본 사진": {
                  type: "files",
                  files: [{
                    type: "file_upload",
                    name: fileName,
                    file_upload: { id: upload.id },
                  }],
                },
              },
            }),
          });
          if (!attachRes.ok) throw new Error(await readNotionError(attachRes, "사진을 하이라이트에 연결하지 못했습니다."));
        } catch (error) {
          imageWarning = String(error?.message || error);
        }
      }

      return json({ id: createdPage.id, url: createdPage.url, imageWarning }, 201);
    }

    // -----------------------
    // 3) 검색: 일반 검색어는 제목과 저자를 함께 조회하고, ISBN은 정확히 조회한다.
    // -----------------------
    if (url.pathname === "/search") {
      // 1) isbn13 파라미터 우선
      let isbn13 = (url.searchParams.get("isbn13") ?? "");
      isbn13 = isbn13.replace(/\+/g, "").replace(/[\s-]+/g, "").trim();

      // 2) keyword(제목 또는 저자) 파라미터
      let keyword = (url.searchParams.get("keyword") ?? "");
      keyword = keyword.replace(/\+/g, " ").replace(/[\s\u00A0\u2009\u202F]+/g, " ").trim();

      if (!isbn13 && !keyword) {
        return new Response(JSON.stringify({ items: [] }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!DATA4LIB_KEY) {
        return new Response(JSON.stringify({ error: "Missing DATA4LIB_KEY" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const base = `https://data4library.kr/api/srchBooks?authKey=${DATA4LIB_KEY}&pageNo=1&pageSize=10`;
      const fetchDocs = async (field, value) => {
        const response = await fetch(`${base}&${field}=${encodeURIComponent(value)}`);
        if (!response.ok) throw new Error(`도서 검색 API 오류 (${response.status})`);
        const xml = await response.text();
        return xml.match(/<doc>[\s\S]*?<\/doc>/g) || [];
      };

      const fetchWithSpaceFallback = async (field, value) => {
        const docs = await fetchDocs(field, value);
        if (docs.length || !/\s/.test(value)) return docs;
        return fetchDocs(field, value.replace(/\s/g, ""));
      };

      const docBlocks = isbn13
        ? await fetchDocs("isbn13", isbn13)
        : (await Promise.all([
            fetchWithSpaceFallback("title", keyword),
            fetchWithSpaceFallback("author", keyword),
          ])).flat();

      const parsedItems = docBlocks.map((blk, sourceIndex) => {
        const bookBlk = blk.match(/<book>[\s\S]*?<\/book>/)?.[0] || blk;

        const title = pick(bookBlk, "bookname") || pick(bookBlk, "bookName") || pick(bookBlk, "title");
        const author = pick(bookBlk, "authors") || pick(bookBlk, "author");
        const publisher = pick(bookBlk, "publisher");
        const kdc = pick(bookBlk, "class_no") || pick(bookBlk, "classNo") || pick(bookBlk, "kdc");
        const isbn13Out = pick(bookBlk, "isbn13");

        let coverUrl = pick(bookBlk, "bookImageURL") || pick(bookBlk, "bookImageUrl") || "";
        coverUrl = coverUrl.trim();
        if (coverUrl.startsWith("http://")) coverUrl = coverUrl.replace(/^http:\/\//, "https://");

        return { title, author, publisher, kdc, isbn13: isbn13Out, coverUrl, sourceIndex };
      });

      const normalizeForMatch = (value) => String(value || "")
        .toLocaleLowerCase("ko")
        .replace(/[\s\p{P}\p{S}]+/gu, "");
      const normalizedKeyword = normalizeForMatch(keyword);
      const relevance = (book) => {
        if (isbn13) return 0;
        const title = normalizeForMatch(book.title);
        const author = normalizeForMatch(book.author);
        if (title === normalizedKeyword || author === normalizedKeyword) return 400;
        if (title.startsWith(normalizedKeyword) || author.startsWith(normalizedKeyword)) return 300;
        if (title.includes(normalizedKeyword) || author.includes(normalizedKeyword)) return 200;
        return 0;
      };

      const seen = new Set();
      const items = parsedItems
        .filter((book) => {
          const isbnKey = String(book.isbn13 || "").replace(/[\s-]/g, "");
          const fallbackKey = [book.title, book.author, book.publisher].map(normalizeForMatch).join("|");
          const key = isbnKey ? `isbn:${isbnKey}` : `book:${fallbackKey}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => relevance(b) - relevance(a) || a.sourceIndex - b.sourceIndex)
        .map(({ sourceIndex, ...book }) => book);

      return new Response(JSON.stringify({
        items,
        usedKeyword: isbn13 ? `isbn13:${isbn13}` : keyword,
        searchedFields: isbn13 ? ["isbn13"] : ["title", "author"],
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }



    // =======================
    // 4) 추가: /add (POST) - 노션 API 연동 + usageAnalysisList(8)
    // =======================
    if (url.pathname === "/add" && req.method === "POST") {
    const adminToken = req.headers.get("X-Admin-Token");

    if (typeof ADMIN_TOKEN === "undefined" || !ADMIN_TOKEN || adminToken !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
      const body = await req.json();

      if (!NOTION_DB_ID || !NOTION_TOKEN) {
        return new Response(JSON.stringify({ error: "Missing Notion Credentials" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // (8) 이용 분석을 가져오려면 authKey 필요
      if (!DATA4LIB_KEY) {
        return new Response(JSON.stringify({ error: "Missing DATA4LIB_KEY" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ---- 노션 컬럼명 (네 DB 컬럼명과 동일해야 함)
      const TITLE_PROP = body.__titleProp || "제목";
      const AUTHOR_PROP = "작가";
      const PUBLISHER_PROP = "출판사";
      const KDC_PROP = "kdc";
      const COVER_PROP = "책표지";

      // ✅ 이번에 추가할 컬럼들
      const SUBJECT_PROP = "주제분야"; // class_nm
      const DESC_PROP = "줄거리";       // description
      const KEYWORDS_PROP = "키워드";   // keywords join

      // ---- (8) 도서 이용 분석 호출 (isbn13 기반)
      async function fetchUsageAnalysis(isbn13) {
        if (!isbn13) return { description: "", classNm: "", keywords: [] };

        const apiUrl =
          `https://data4library.kr/api/usageAnalysisList?authKey=${DATA4LIB_KEY}` +
          `&isbn13=${encodeURIComponent(isbn13)}`;

        const r = await fetch(apiUrl);
        const xml = await r.text();

        // book info
        const bookBlk = xml.match(/<book>[\s\S]*?<\/book>/)?.[0] || xml;
        const description = pick(bookBlk, "description");
        const classNm = pick(bookBlk, "class_nm");

        // keywords
        const keywordBlocks = xml.match(/<keyword>[\s\S]*?<\/keyword>/g) || [];
        const keywords = keywordBlocks
          .map((k) => ({
            word: pick(k, "word"),
            weight: Number(pick(k, "weight") || 0),
          }))
          .filter((k) => k.word)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 10) // 상위 10개만 저장 (원하면 숫자 바꿔도 됨)
          .map((k) => k.word);

        return { description, classNm, keywords };
      }

      const isbn13 = String(body.isbn13 || "").trim();
      const { description, classNm, keywords } = await fetchUsageAnalysis(isbn13);

      // ---- 노션 properties 구성
      const properties = {};

      properties[TITLE_PROP] = { title: [{ text: { content: body.title ?? "" } }] };
      properties[AUTHOR_PROP] = { rich_text: [{ text: { content: body.author ?? "" } }] };

      const publisherValue = (body.publisher ?? "").trim();
      if (publisherValue) {
        properties[PUBLISHER_PROP] = { select: { name: publisherValue } };
      }

      const kdcNum = parseFloat(String(body.kdc ?? "").trim());
      if (!Number.isNaN(kdcNum)) {
        properties[KDC_PROP] = { number: kdcNum };
      }


      if (body.coverUrl) {
        properties[COVER_PROP] = { url: body.coverUrl };
      }

      // ✅ 주제분야(class_nm)
      // - DB에서 "주제분야"를 select로 만들었으면 select로 잘 들어가고
      // - 아니면 rich_text로라도 들어가게(실패 방지) 2단 시도
      if (classNm) {
        // 1차: select 시도
        properties[SUBJECT_PROP] = { select: { name: classNm } };
      }

      // ✅ 줄거리(description)
      if (description) {
        properties[DESC_PROP] = { rich_text: [{ text: { content: description } }] };
      }

      // ✅ 키워드
      if (keywords && keywords.length) {
        properties[KEYWORDS_PROP] = { rich_text: [{ text: { content: keywords.join(", ") } }] };
      }

      // ---- payload
      const notionPayload = {
        parent: { database_id: NOTION_DB_ID },
        cover: body.coverUrl ? { type: "external", external: { url: body.coverUrl } } : undefined,
        properties,
      };

      // ---- 노션 페이지 생성 요청
      let notionRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notionPayload),
      });

      // ✅ 만약 "주제분야"가 select가 아니라서 실패하는 케이스 대비:
      // 400이면서 subject(select) 때문일 확률이 높으니, subject를 rich_text로 바꿔서 1번 더 시도
      if (!notionRes.ok && classNm) {
        const resText = await notionRes.text();
        // subject 관련 오류가 흔해서, 안전하게 재시도
        const payload2 = JSON.parse(JSON.stringify(notionPayload));
        payload2.properties[SUBJECT_PROP] = { rich_text: [{ text: { content: classNm } }] };

        notionRes = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_TOKEN}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload2),
        });

        // 그래도 실패하면 원본 에러를 반환
        if (!notionRes.ok) {
          return new Response(
            JSON.stringify({
              error: "Notion create failed",
              firstAttempt: resText,
              secondAttempt: await notionRes.text(),
            }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }

      const resultText = await notionRes.text();
      return new Response(resultText, {
        status: notionRes.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e), stack: String(e?.stack || "") }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

function decodeXml(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
