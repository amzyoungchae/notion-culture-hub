addEventListener("fetch", (event) => {
  event.respondWith(handle(event.request));
});

async function handle(req) {
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

    // -----------------------
    // 3) 검색: /search?keyword=...  또는  /search?isbn13=...
    // -----------------------
    if (url.pathname === "/search") {
      // 1) isbn13 파라미터 우선
      let isbn13 = (url.searchParams.get("isbn13") ?? "");
      isbn13 = isbn13.replace(/\+/g, "").replace(/[\s-]+/g, "").trim();

      // 2) keyword(제목) 파라미터
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
      const apiUrl = isbn13
        ? `${base}&isbn13=${encodeURIComponent(isbn13)}`
        : `${base}&title=${encodeURIComponent(keyword)}`;

      let usedKeyword = isbn13 ? `isbn13:${isbn13}` : keyword;

      let xml = await (await fetch(apiUrl)).text();
      let docBlocks = xml.match(/<doc>[\s\S]*?<\/doc>/g) || [];

      // title 검색인데 결과 0이고 공백 있으면 공백 제거로 fallback (isbn13 제외)
      if (!isbn13 && docBlocks.length === 0 && /\s/.test(keyword)) {
        const noSpace = keyword.replace(/\s/g, "");
        usedKeyword = noSpace;
        xml = await (await fetch(`${base}&title=${encodeURIComponent(noSpace)}`)).text();
        docBlocks = xml.match(/<doc>[\s\S]*?<\/doc>/g) || [];
      }

      const items = docBlocks.map((blk) => {
        const bookBlk = blk.match(/<book>[\s\S]*?<\/book>/)?.[0] || blk;

        const title = pick(bookBlk, "bookname") || pick(bookBlk, "bookName") || pick(bookBlk, "title");
        const author = pick(bookBlk, "authors") || pick(bookBlk, "author");
        const publisher = pick(bookBlk, "publisher");
        const kdc = pick(bookBlk, "class_no") || pick(bookBlk, "classNo") || pick(bookBlk, "kdc");
        const isbn13Out = pick(bookBlk, "isbn13");

        let coverUrl = pick(bookBlk, "bookImageURL") || pick(bookBlk, "bookImageUrl") || "";
        coverUrl = coverUrl.trim();
        if (coverUrl.startsWith("http://")) coverUrl = coverUrl.replace(/^http:\/\//, "https://");

        return { title, author, publisher, kdc, isbn13: isbn13Out, coverUrl };
      });

      return new Response(JSON.stringify({ items, usedKeyword }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }



    // =======================
    // 4) 추가: /add (POST) - 노션 API 연동 + usageAnalysisList(8)
    // =======================
    if (url.pathname === "/add" && req.method === "POST") {
    const adminToken = req.headers.get("X-Admin-Token");

    if (!env.ADMIN_TOKEN || adminToken !== env.ADMIN_TOKEN) {
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
