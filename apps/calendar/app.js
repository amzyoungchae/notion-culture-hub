const API_BASE = window.APP_CONFIG.API_BASE;

const calendarEl = document.getElementById("calendar");
const statusEl = document.getElementById("status");

const reloadBtn = document.getElementById("reloadBtn");
const yearSelectEl = document.getElementById("yearSelect");
const monthSelectEl = document.getElementById("monthSelect");
const goToMonthBtn = document.getElementById("goToMonthBtn");
const calendarToolbarExtrasEl = document.getElementById("calendarToolbarExtras");

const detailPanelEl = document.getElementById("detailPanel");
const detailContentEl = document.getElementById("detailContent");
const sourceFilterBarEl = document.getElementById("sourceFilterBar");

let activeSources = new Set(["영화", "도서", "공연", "전시", "방탈출"]);

let calendar;
let currentDisplayMode = "text"; // text | image | list
let currentMonthItems = [];

async function init() {
  populateYearMonthOptions();

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "ko",
    height: "auto",
    customButtons: {
      monthView: {
        text: "월",
        click: () => {
          switchToTextMode();
        },
      },
      imageView: {
        text: "이미지",
        click: () => {
          switchToImageMode();
        },
      },
    },
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "monthView imageView listMonth",
    },
    buttonText: {
      today: "오늘",
      month: "월",
      list: "목록",
    },
    datesSet: handleDatesSet,
    events: loadEvents,
    eventClick: handleEventClick,
    eventDisplay: "block",
  });

  calendar.render();
  bindEvents();

  updateViewButtons();
}

function populateYearMonthOptions() {
  const startYear = 2017;
  const endYear = 2035;

  yearSelectEl.innerHTML = "";
  for (let year = startYear; year <= endYear; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}년`;
    yearSelectEl.appendChild(option);
  }

  monthSelectEl.innerHTML = "";
  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement("option");
    option.value = String(month).padStart(2, "0");
    option.textContent = `${month}월`;
    monthSelectEl.appendChild(option);
  }

  const now = new Date();
  yearSelectEl.value = String(now.getFullYear());
  monthSelectEl.value = String(now.getMonth() + 1).padStart(2, "0");
}

function attachToolbarExtras() {
  const leftChunk = calendarEl.querySelector(".fc-header-toolbar .fc-toolbar-chunk");
  if (!leftChunk || !calendarToolbarExtrasEl) return;

  const todayButton = leftChunk.querySelector(".fc-today-button");

  if (todayButton) {
    todayButton.insertAdjacentElement("afterend", calendarToolbarExtrasEl);
  } else {
    leftChunk.appendChild(calendarToolbarExtrasEl);
  }

  calendarToolbarExtrasEl.classList.remove("hidden-toolbar-extras");
}

function bindEvents() {
  reloadBtn.addEventListener("click", () => {
    calendar.refetchEvents();
  });

  goToMonthBtn.addEventListener("click", () => {
    const year = yearSelectEl.value;
    const month = monthSelectEl.value;
    calendar.gotoDate(`${year}-${month}-01`);
  });

  sourceFilterBarEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".source-filter-btn");
    if (!btn) return;

    const source = btn.dataset.source;

    if (activeSources.has(source)) {
      activeSources.delete(source);
      btn.classList.remove("active");
    } else {
      activeSources.add(source);
      btn.classList.add("active");
    }

    calendar.refetchEvents();
  });
}

function handleDatesSet(dateInfo) {
  syncYearMonthSelectors(dateInfo);

  if (calendar.view.type === "listMonth") {
    currentDisplayMode = "list";
  } else if (calendar.view.type === "dayGridMonth" && currentDisplayMode !== "image") {
    currentDisplayMode = "text";
  }

  updateViewButtons();

  setTimeout(() => {
    renderImageCardsForCurrentMonth(currentMonthItems);
  }, 0);
}

function syncYearMonthSelectors(dateInfo) {
  const viewStart = new Date(dateInfo.view.currentStart);
  yearSelectEl.value = String(viewStart.getFullYear());
  monthSelectEl.value = String(viewStart.getMonth() + 1).padStart(2, "0");
}

function switchToTextMode() {
  currentDisplayMode = "text";

  if (calendar.view.type !== "dayGridMonth") {
    calendar.changeView("dayGridMonth");
  }

  updateViewButtons();

  // 이미지 카드 제거
  calendarEl.querySelectorAll(".image-day-card").forEach((el) => el.remove());

  // 텍스트 이벤트 다시 표시
  const eventEls = calendarEl.querySelectorAll(".fc-daygrid-event-harness");
  eventEls.forEach((el) => {
    el.style.display = "";
  });

  calendarEl.classList.remove("image-mode");
}

function switchToImageMode() {
  currentDisplayMode = "image";

  if (calendar.view.type !== "dayGridMonth") {
    calendar.changeView("dayGridMonth");
  }

  updateViewButtons();

  setTimeout(() => {
    renderImageCardsForCurrentMonth(currentMonthItems);
  }, 0);
}

function updateSourceFilterButtons(counts = {}) {
  const buttons = sourceFilterBarEl.querySelectorAll(".source-filter-btn");

  buttons.forEach((btn) => {
    const source = btn.dataset.source;
    const count = counts[source] ?? 0;
    btn.textContent = `${source}: ${count}건`;
    btn.classList.toggle("active", activeSources.has(source));
  });
}

function updateViewButtons() {
  const monthBtn = calendarEl.querySelector(".fc-monthView-button");
  const imageBtn = calendarEl.querySelector(".fc-imageView-button");
  const listBtn = calendarEl.querySelector(".fc-listMonth-button");

  if (monthBtn) {
    monthBtn.classList.toggle("fc-button-active", currentDisplayMode === "text");
  }

  if (imageBtn) {
    imageBtn.classList.toggle("fc-button-active", currentDisplayMode === "image");
  }

  if (listBtn) {
    listBtn.classList.toggle("fc-button-active", currentDisplayMode === "list");
  }

  calendarEl.classList.toggle("image-mode", currentDisplayMode === "image");
}

async function loadEvents(fetchInfo, successCallback, failureCallback) {
  try {
    statusEl.textContent = "데이터를 불러오는 중입니다...";

    const start = fetchInfo.startStr.slice(0, 10);
    const end = fetchInfo.endStr.slice(0, 10);

    const url = `${API_BASE}/api/calendar?start=${start}&end=${end}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API 요청 실패: ${res.status} ${text}`);
    }

    const allItems = await res.json();

    const monthItems = allItems.filter((item) => isInCurrentViewMonth(item.date));

    const counts = {
      전체: monthItems.length,
      영화: monthItems.filter((item) => item.source === "영화").length,
      도서: monthItems.filter((item) => item.source === "도서").length,
      공연: monthItems.filter((item) => item.source === "공연").length,
      전시: monthItems.filter((item) => item.source === "전시").length,
      방탈출: monthItems.filter((item) => item.source === "방탈출").length,
    };

    updateSourceFilterButtons(counts);

    const visibleItems = monthItems.filter((item) => activeSources.has(item.source));
    const visibleCount = visibleItems.length;

    currentMonthItems = visibleItems;

    const events = visibleItems.map((item) => ({
      id: item.id,
      title: `[${item.source}] ${item.title}`,
      start: item.date,
      allDay: true,
      backgroundColor: item.color,
      extendedProps: {
        source: item.source,
        rawTitle: item.title,
        title: item.title,
        url: item.url,
        date: item.date,
        imageUrl: item.imageUrl || "",
      },
    }));

    statusEl.innerHTML = `<div class="status-summary"><div class="status-main">전체 <strong>${visibleCount}</strong>건을 불러왔습니다.</div></div>`;
    successCallback(events);

    setTimeout(() => {
      renderImageCardsForCurrentMonth(currentMonthItems);
    }, 0);
  } catch (error) {
    console.error(error);
    statusEl.textContent = "데이터를 불러오지 못했습니다.";
    failureCallback(error);
  }
}

function isInCurrentViewMonth(dateStr) {
  const eventDate = new Date(`${dateStr}T00:00:00`);
  const currentStart = calendar.view.currentStart;
  const currentEnd = calendar.view.currentEnd;

  return eventDate >= currentStart && eventDate < currentEnd;
}

function buildStatusHtml(visibleCount, counts = {}) {
  return `
    <div class="status-summary">
      <div class="status-main">전체 <strong>${visibleCount}</strong>건을 불러왔습니다.</div>
    </div>
  `;
}

function handleEventClick(info) {
  openDetailFromItem(info.event.extendedProps);
}

function openDetailFromItem(data) {
  const imageHtml = data.imageUrl
    ? `
      <div class="detail-image-wrap">
        <img
          src="${escapeHtml(data.imageUrl)}"
          alt="${escapeHtml(data.rawTitle || data.title)}"
          class="detail-image"
        />
      </div>
    `
    : `
      <div class="detail-image-wrap detail-image-placeholder">
        이미지 없음
      </div>
    `;

  detailContentEl.innerHTML = `
    <div class="detail-layout">
      ${imageHtml}
      <div class="detail-info">
        <h2 class="detail-title">${escapeHtml(data.rawTitle || data.title)}</h2>
        <div class="detail-meta"><strong>구분</strong><span>${escapeHtml(data.source)}</span></div>
        <div class="detail-meta"><strong>날짜</strong><span>${escapeHtml(data.date)}</span></div>
        <a class="open-link" href="${data.url}" target="_blank" rel="noopener noreferrer">
          노션 원본 페이지 열기
        </a>
      </div>
    </div>
  `;

  detailPanelEl.classList.remove("hidden-detail");
}

function groupItemsByDate(items) {
  const grouped = {};

  for (const item of items) {
    if (!grouped[item.date]) grouped[item.date] = [];
    grouped[item.date].push(item);
  }

  return grouped;
}

function getRepresentativeItem(items) {
  if (!items || !items.length) return null;
  return items[0];
}

function renderImageCardsForCurrentMonth(items) {
  // 기존 이미지 카드 제거
  calendarEl.querySelectorAll(".image-day-card").forEach((el) => el.remove());

  // list view에서는 이미지 카드 렌더링 안 함
  if (!calendar || calendar.view.type !== "dayGridMonth") return;

  // 기본 텍스트 이벤트 표시/숨김
  const eventEls = calendarEl.querySelectorAll(".fc-daygrid-event-harness");
  eventEls.forEach((el) => {
    el.style.display = currentDisplayMode === "image" ? "none" : "";
  });

  if (currentDisplayMode !== "image") return;

  const grouped = groupItemsByDate(items);
  const dayCells = calendarEl.querySelectorAll(".fc-daygrid-day[data-date]");

  dayCells.forEach((cell) => {
    const date = cell.getAttribute("data-date");
    const itemsForDay = grouped[date];

    if (!itemsForDay || !itemsForDay.length) return;

    const rep = getRepresentativeItem(itemsForDay);
    if (!rep) return;

    const frame = cell.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;

    const card = document.createElement("div");
    card.className = "image-day-card";

    const imageHtml = rep.imageUrl
      ? `<img class="image-day-card-img" src="${escapeHtml(rep.imageUrl)}" alt="${escapeHtml(rep.title)}" />`
      : `<div class="image-day-card-placeholder">${escapeHtml(rep.source)}</div>`;

    const countBadge =
      itemsForDay.length > 1
        ? `<div class="image-day-card-count">+${itemsForDay.length - 1}</div>`
        : "";

    card.innerHTML = `
      <div class="image-day-card-inner" data-date="${date}">
        ${imageHtml}
        ${countBadge}
      </div>
    `;

    frame.appendChild(card);

    card.addEventListener("click", () => {
      openDetailFromItem(rep);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
