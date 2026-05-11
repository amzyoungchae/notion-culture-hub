const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 1. 검색 API 라우트
    if (url.pathname === "/search" && request.method === "GET") {
      const q = url.searchParams.get("q");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");

      if (!q) return new Response("Missing query", { status: 400, headers: CORS_HEADERS });

      const apiUrl = `https://apis.data.go.kr/B553457/cultureinfo/period2?serviceKey=${env.CULTURE_API_KEY}&pageNo=1&numOfRows=100&from=${from}&to=${to}&keyword=${encodeURIComponent(q)}`;
      
      try {
        const response = await fetch(apiUrl);
        const xmlText = await response.text();
        
        const items = [];
        const itemRegex = /<item>(.*?)<\/item>/gs;
        let match;
        
        while ((match = itemRegex.exec(xmlText)) !== null) {
          const itemXml = match[1];
          const getTag = (tag) => {
            const m = itemXml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
            return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : "";
          };

          items.push({
            seq: getTag("seq"),
            title: getTag("title"),
            place: getTag("place"),
            startDate: getTag("startDate"),
            endDate: getTag("endDate"),
            imageUrl: getTag("thumbnail")
          });
        }

        return new Response(JSON.stringify({ items }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(`Search API Error: ${e.message}`, { status: 500, headers: CORS_HEADERS });
      }
    }

    // 2. 노션 추가 API 라우트
    if (url.pathname === "/add" && request.method === "POST") {
      const adminToken = request.headers.get("X-Admin-Token");

      if (!env.ADMIN_TOKEN || adminToken !== env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
      try {
        const data = await request.json();
        const { seq, title, place, period, imageUrl: fallbackImg } = data;

        // 상세조회 API 호출
        const detailUrl = `https://apis.data.go.kr/B553457/cultureinfo/detail2?serviceKey=${env.CULTURE_API_KEY}&seq=${seq}`;
        const detailRes = await fetch(detailUrl);
        const detailXml = await detailRes.text();
        
        // 정규식으로 태그 내용 뽑아내는 헬퍼 함수
        const getTag = (tag) => {
          const match = detailXml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
          return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : "";
        };

        let price = getTag("price") || "정보 없음";
        let imageUrl = getTag("imgUrl") || fallbackImg;
        
        // --- [새로 추가된 데이터 파싱] ---
        let realmName = getTag("realmName"); // 분류명
        let viewUrl = getTag("url");         // 관람 URL
        let contents = getTag("contents1");  // 상세 내용
        
        // 상세 내용 전처리: HTML 태그 대충 제거하고 2000자 이내로 자르기 (노션 텍스트 제한)
        let cleanContents = contents.replace(/<[^>]*>?/gm, ''); 
        if (cleanContents.length > 2000) {
          cleanContents = cleanContents.substring(0, 1995) + "...";
        }

        // Notion API 호출 페이로드 준비
        const notionPayload = {
          parent: { database_id: env.NOTION_DB_ID },
          properties: {
            "전시명": { title: [{ text: { content: title } }] },
            "전시 장소": { select: { name: (place || "미상").substring(0, 100) } },
            "전시 기간": { rich_text: [{ text: { content: period } }] },
            "전시 가격": { rich_text: [{ text: { content: price } }] },
            
            // --- [새로 추가된 노션 속성 매핑] ---
            "분류명": { select: { name: (realmName || "미분류").substring(0, 100) } },
            "상세 내용": { rich_text: [{ text: { content: cleanContents || "상세 내용 없음" } }] }
          }
        };

        // 관람 URL은 값이 있고 실제 http 주소 형식일 때만 안전하게 추가
        if (viewUrl && viewUrl.startsWith("http")) {
          notionPayload.properties["관람 URL"] = { url: viewUrl };
        }

        // 노션 페이지 커버 이미지 설정
        if (imageUrl && imageUrl.startsWith("http")) {
          notionPayload.cover = {
            type: "external",
            external: { url: imageUrl }
          };

          notionPayload.properties["이미지"] = { url: imageUrl };
        }

        const notionRes = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(notionPayload)
        });

        if (!notionRes.ok) {
          const err = await notionRes.text();
          return new Response(`Notion API Error: ${err}`, { status: notionRes.status, headers: CORS_HEADERS });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(`Add API Error: ${e.message}`, { status: 500, headers: CORS_HEADERS });
      }
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  }
};