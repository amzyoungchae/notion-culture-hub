// XML 텍스트에서 특정 태그의 값을 추출하는 유틸리티 함수
function getXmlNode(xml, tag) {
  const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : "";
}

// XML 텍스트에서 반복되는 태그 블록을 배열로 추출하는 함수
function getXmlNodes(xml, tag) {
  const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'gs');
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

// 💡 HTML 엔티티(&amp; 등)를 원래 특수기호로 변환해 주는 함수
function decodeHTMLEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 설정
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. 공연 검색 엔드포인트
      if (path === "/search" && request.method === "GET") {
        const q = url.searchParams.get("q");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");

        // KOPIS 공연 목록 API 호출
        const apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${env.CULTURE_API_KEY}&stdate=${from}&eddate=${to}&cpage=1&rows=20&shprfnm=${encodeURIComponent(q)}`;
        const apiRes = await fetch(apiUrl);
        const xmlText = await apiRes.text();

        const dbNodes = getXmlNodes(xmlText, "db");
        const items = dbNodes.map(node => ({
          mt20id: getXmlNode(node, "mt20id"),
          // 💡 프론트엔드 검색 목록에서도 깨지지 않게 디코딩
          title: decodeHTMLEntities(getXmlNode(node, "prfnm")),
          startDate: getXmlNode(node, "prfpdfrom"),
          endDate: getXmlNode(node, "prfpdto"),
          place: decodeHTMLEntities(getXmlNode(node, "fcltynm")),
          poster: getXmlNode(node, "poster"),
          genre: decodeHTMLEntities(getXmlNode(node, "genrenm")),
          state: getXmlNode(node, "prfstate")
        }));

        return new Response(JSON.stringify({ items }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. 노션 DB 추가 엔드포인트
      if (path === "/add" && request.method === "POST") {
        const body = await request.json();
        const mt20id = body.mt20id;

        if (!mt20id) throw new Error("공연 ID(mt20id)가 필요합니다.");

        // KOPIS 공연 상세 조회 API 호출 (출연진, 가격 등 확보)
        const detailUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr/${mt20id}?service=${env.CULTURE_API_KEY}`;
        const detailRes = await fetch(detailUrl);
        const detailXml = await detailRes.text();

        // 💡 노션에 넣을 데이터 추출 시 decodeHTMLEntities 적용
        const title = decodeHTMLEntities(getXmlNode(detailXml, "prfnm"));
        const genre = decodeHTMLEntities(getXmlNode(detailXml, "genrenm"));
        const rawPlace = decodeHTMLEntities(getXmlNode(detailXml, "fcltynm"));
        const period = `${getXmlNode(detailXml, "prfpdfrom")} ~ ${getXmlNode(detailXml, "prfpdto")}`;
        const posterUrl = getXmlNode(detailXml, "poster");
        const cast = decodeHTMLEntities(getXmlNode(detailXml, "prfcast"));
        const price = decodeHTMLEntities(getXmlNode(detailXml, "pcseguidance"));

        // 쉼표(,)를 슬래시( / )로 치환하여 노션 에러 방지 (이전 해결책 유지)
        const safePlace = rawPlace ? rawPlace.replace(/,/g, ' / ') : "미상";

        // 노션 API Payload 구성
        const notionData = {
          parent: { database_id: env.NOTION_DB_ID },
          properties: {
            "공연명": { 
              title: [{ text: { content: title || "제목 없음" } }] 
            },
            "공연 장르": { 
              select: { name: genre || "기타" } 
            },
            "공연 장소": { 
              select: { name: safePlace } 
            },
            "공연 기간": { 
              rich_text: [{ text: { content: period || "" } }] 
            },
            "공연 가격": { 
              rich_text: [{ text: { content: price || "정보 없음" } }] 
            },
            "공연 출연진": { 
              rich_text: [{ text: { content: cast || "미상" } }] 
            },
            "이미지": { 
              url: posterUrl || null
            }
          }
        };

        // 포스터 URL이 존재할 경우 페이지 커버(cover) 이미지 추가
        if (posterUrl) {
          notionData.cover = {
            type: "external",
            external: {
              url: posterUrl
            }
          };
        }

        // 노션 API 호출
        const notionRes = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(notionData)
        });

        if (!notionRes.ok) {
          const errorText = await notionRes.text();
          throw new Error(`Notion API Error: ${errorText}`);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (e) {
      return new Response(e.message, { status: 500, headers: corsHeaders });
    }
  }
};