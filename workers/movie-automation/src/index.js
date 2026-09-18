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

    // ==========================================
    // 1. KMDB 영화 검색 API
    // ==========================================
    if (url.pathname === "/search" && request.method === "GET") {
      const q = url.searchParams.get("q");
      if (!q) return new Response("Missing query", { status: 400, headers: CORS_HEADERS });

      // KMDB API 엔드포인트 (JSON 형식 요청)
      const apiUrl = `http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp?collection=kmdb_new2&detail=Y&ServiceKey=${env.KMDB_API_KEY}&query=${encodeURIComponent(q)}&listCount=50`;
      
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        function cleanKmdbText(value) {
          return String(value || "")
            .replace(/!HS/g, "")
            .replace(/!HE/g, "")
            .replace(/<\/?[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim();
        }

        const items = [];
        
        // 검색 결과가 있는 경우
        if (data.Data && data.Data[0] && data.Data[0].Result) {
          data.Data[0].Result.forEach(movie => {
            // 1. 영화 제목 정제 (!HS, !HE 태그 제거)
            const title = cleanKmdbText(movie.title);

            // 2. 포스터 URL (여러 개일 경우 | 로 구분됨. 첫 번째 것만 사용)
            let poster = "";
            if (movie.posters) {
              poster = movie.posters.split("|")[0];
              // HTTPS 페이지에서 HTTP 포스터를 직접 불러올 때 발생하는 Mixed Content 경고 방지
              poster = poster.replace(/^http:\/\//i, "https://");
            }

            // 3. 감독명 추출
            let director = "";
            if (movie.directors && movie.directors.director && movie.directors.director.length > 0) {
              director = cleanKmdbText(movie.directors.director[0].directorNm);
            }

            // 4. 배우명 추출 (최대 5명까지만 콤마로 연결)
            let actors = "";
            if (movie.actors && movie.actors.actor) {
              actors = movie.actors.actor
                .slice(0, 5)
                .map(a => cleanKmdbText(a.actorNm))
                .filter(Boolean)
                .join(", ");
            }

            // 5. 기타 정보 추출
            const releaseDate = movie.repRlsDate || ""; // 개봉일 (YYYYMMDD)
            const nation = movie.nation || "";
            const rating = movie.rating || ""; // 관람등급
            const kmdbUrl = movie.kmdbUrl || "";
            const plot = cleanKmdbText(
              movie.plots && movie.plots.plot && movie.plots.plot.length > 0
                ? movie.plots.plot[0].plotText
                : ""
            );
            const genre = cleanKmdbText(movie.genre);
            const keywords = cleanKmdbText(movie.keywords);

            items.push({
              title, director, actors, releaseDate, nation, plot, rating, genre, kmdbUrl, keywords, poster
            });
          });
        }

        return new Response(JSON.stringify({ items }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(`Search API Error: ${e.message}`, { status: 500, headers: CORS_HEADERS });
      }
    }

    // ==========================================
    // 2. 노션 데이터베이스 추가 API
    // ==========================================
    if (url.pathname === "/add" && request.method === "POST") {
      const adminToken = request.headers.get("X-Admin-Token");

      if (!env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: "ADMIN_TOKEN is not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      if (adminToken !== env.ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
      try {
        const movie = await request.json();

        // 긴 텍스트 자르기 (노션 텍스트는 최대 2000자 제한)
        let cleanPlot = movie.plot.replace(/<[^>]*>?/gm, ''); 
        if (cleanPlot.length > 2000) {
          cleanPlot = cleanPlot.substring(0, 1995) + "...";
        }

        // 다중 선택(Multi-select) 태그 배열 만들기 함수 (콤마 기준 분리)
        const makeMultiSelect = (str) => {
          if (!str) return [];
          return str.split(",").map(s => ({ name: s.trim().substring(0, 100) })).filter(obj => obj.name !== "");
        };

        // 노션 API 페이로드 기본 구조 조립
        const notionPayload = {
          parent: { database_id: env.NOTION_MOVIE_DB_ID },
          properties: {
            "영화명": { title: [{ text: { content: movie.title || "제목 없음" } }] },
            "감독명": { rich_text: [{ text: { content: movie.director || "" } }] },
            "배우명": { rich_text: [{ text: { content: movie.actors || "" } }] },
            "줄거리": { rich_text: [{ text: { content: cleanPlot || "" } }] },
            "키워드": { rich_text: [{ text: { content: movie.keywords || "" } }] }
          }
        };

        // 1. 개봉일 (Date 유형): YYYYMMDD -> YYYY-MM-DD 포맷 변환 후 삽입
        if (movie.releaseDate && movie.releaseDate.length === 8) {
          const yyyy = movie.releaseDate.substring(0, 4);
          const mm = movie.releaseDate.substring(4, 6);
          const dd = movie.releaseDate.substring(6, 8);
          // 날짜가 00인 데이터(예: 19990000) 방어 로직
          if (mm !== "00" && dd !== "00") {
            notionPayload.properties["개봉일"] = { date: { start: `${yyyy}-${mm}-${dd}` } };
          }
        }

        // 2. 제작국가 & 장르 (Multi-select 유형)
        const nationTags = makeMultiSelect(movie.nation);
        if (nationTags.length > 0) notionPayload.properties["제작국가"] = { multi_select: nationTags };

        const genreTags = makeMultiSelect(movie.genre);
        if (genreTags.length > 0) notionPayload.properties["장르"] = { multi_select: genreTags };

        // 3. 대표관람등급 (Select 유형)
        if (movie.rating) {
          notionPayload.properties["대표관람등급"] = { select: { name: movie.rating.substring(0, 100) } };
        }

        // 4. 관련 URL (URL 유형)
        if (movie.kmdbUrl && movie.kmdbUrl.startsWith("http")) {
          notionPayload.properties["관련URL"] = { url: movie.kmdbUrl };
        }

        // 5. 포스터 이미지 (페이지 커버 & URL 속성 동시 적용)
        if (movie.poster && movie.poster.startsWith("http")) {
          // 커버 씌우기
          notionPayload.cover = { type: "external", external: { url: movie.poster } };
          // 속성에 URL 넣기
          notionPayload.properties["포스터이미지"] = { url: movie.poster };
        }

        // 노션 API 전송
        const notionRes = await fetch("https://api.api.com/v1/pages".replace("api.api", "api.notion"), {
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
