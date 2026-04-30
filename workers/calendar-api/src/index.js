export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/api/debug-database") {
      const databaseId = url.searchParams.get("id");

      if (!databaseId) {
        return json({ ok: false, error: "database id가 없습니다." }, 400);
      }

      const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": env.NOTION_VERSION,
          "Content-Type": "application/json",
        },
      });

      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders(),
        },
      });
    }

    if (url.pathname === "/api/calendar") {
    try {
        const start = url.searchParams.get("start");
        const end = url.searchParams.get("end");

        const items = await getMergedCalendarItems(env);

        const filtered =
        start && end
            ? items.filter((item) => item.date >= start && item.date < end)
            : items;

        return json(filtered, 200);
    } catch (error) {
        return json(
        {
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
        },
        500
        );
    }
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true }, 200);
    }

    return json({ ok: false, error: "Not found" }, 404);
  },
};

async function getMergedCalendarItems(env) {
  const [moviePages, bookPages, exhibitionPages, performancePages, escapeRoomPages] = await Promise.all([
    queryAllPagesFromDataSource(env, env.MOVIE_DATA_SOURCE_ID),
    queryAllPagesFromDataSource(env, env.BOOK_DATA_SOURCE_ID),
    queryAllPagesFromDataSource(env, env.EXHIBITION_DATA_SOURCE_ID),
    queryAllPagesFromDataSource(env, env.PERFORMANCE_DATA_SOURCE_ID),
    queryAllPagesFromDataSource(env, env.ESCAPE_ROOM_DATA_SOURCE_ID),
  ]);

  const merged = [
    ...moviePages.map(normalizeMovie),
    ...bookPages.map(normalizeBook),
    ...exhibitionPages.map(normalizeExhibition),
    ...performancePages.map(normalizePerformance),
    ...escapeRoomPages.map(normalizeEscapeRoom),
  ]
    .filter((item) => item.date && item.title)
    .sort((a, b) => a.date.localeCompare(b.date));

  return merged;
}

async function queryAllPagesFromDataSource(env, dataSourceId) {
  const all = [];
  let hasMore = true;
  let nextCursor = undefined;

  while (hasMore) {
    const body = {
      page_size: 100,
    };

    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const res = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NOTION_TOKEN}`,
          "Notion-Version": env.NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    all.push(...results);

    hasMore = Boolean(data.has_more);
    nextCursor = data.next_cursor || undefined;
  }

  return all;
}

function getUrlValue(prop) {
  if (!prop) return null;
  return prop.url || null;
}

function normalizeMovie(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    source: "영화",
    title: getTitleText(props["영화명"]),
    date: getDateStart(props["감상일"]),
    url: page.url,
    color: "#3b82f6",
    imageUrl: getUrlValue(props["포스터이미지"]),
  };
}

function normalizeBook(page) {
  const props = page.properties || {};
  const date = props["감상일"]?.date;

  return {
    id: page.id,
    source: "도서",
    title: getTitleText(props["제목"]),
    date: date?.end || date?.start || null,
    url: page.url,
    color: "#22c55e",
    imageUrl: getUrlValue(props["책표지"]),
  };
}

function normalizePerformance(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    source: "공연",
    title: getTitleText(props["공연명"]),
    date: getDateStart(props["감상일"]),
    url: page.url,
    color: "#a855f7",
    imageUrl: getUrlValue(props["이미지"]),
  };
}

function normalizeExhibition(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    source: "전시",
    title: getTitleText(props["전시명"]), 
    date: getDateStart(props["감상일"]),
    url: page.url,
    color: "#ec4899",
    imageUrl: getImageUrl(props["이미지"]),
  };
}

function normalizeEscapeRoom(page) {
  const props = page.properties || {};

  return {
    id: page.id,
    source: "방탈출",
    title: getTitleText(props["테마명"]),
    date: getDateStart(props["체험일"]),
    url: page.url,
    color: "#f59e0b",
    imageUrl: getImageUrl(props["이미지"]),
  };
}

function getTitleText(prop) {
  if (!prop || prop.type !== "title") return "";
  return (prop.title || []).map((x) => x.plain_text).join("").trim();
}

function getDateStart(prop) {
  return prop?.date?.start || null;
}

function getImageUrl(prop) {
  if (!prop) return null;

  if (prop.type === "url") {
    return prop.url || null;
  }

  if (prop.type === "files") {
    const files = prop.files || [];
    if (!files.length) return null;

    const first = files[0];

    if (first.type === "external") {
      return first.external?.url || null;
    }

    if (first.type === "file") {
      return first.file?.url || null;
    }
  }

  return null;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}