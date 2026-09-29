(function () {
  "use strict";

  const WORKER_URL = "https://notion-book-automation-new.codud9028.workers.dev";
  const auth = createAdminAuth({
    mountId: "auth",
    storageKey: "NOTION_ADMIN_TOKEN",
    legacyKeys: ["BOOK_ADMIN_TOKEN"]
  });

  const elements = {
    cameraInput: document.getElementById("cameraInput"),
    galleryInput: document.getElementById("galleryInput"),
    imageEditor: document.getElementById("imageEditor"),
    sourceImage: document.getElementById("sourceImage"),
    rotateLeft: document.getElementById("rotateLeft"),
    rotateRight: document.getElementById("rotateRight"),
    resetCrop: document.getElementById("resetCrop"),
    runOcr: document.getElementById("runOcr"),
    ocrProgress: document.getElementById("ocrProgress"),
    ocrStatus: document.getElementById("ocrStatus"),
    ocrPercent: document.getElementById("ocrPercent"),
    ocrProgressBar: document.getElementById("ocrProgressBar"),
    highlightText: document.getElementById("highlightText"),
    charCount: document.getElementById("charCount"),
    bookSearch: document.getElementById("bookSearch"),
    bookSpinner: document.getElementById("bookSpinner"),
    bookResults: document.getElementById("bookResults"),
    selectedBook: document.getElementById("selectedBook"),
    clearBook: document.getElementById("clearBook"),
    pageNumber: document.getElementById("pageNumber"),
    tags: document.getElementById("tags"),
    memo: document.getElementById("memo"),
    message: document.getElementById("message"),
    saveHighlight: document.getElementById("saveHighlight"),
    openNotion: document.getElementById("openNotion")
  };

  let cropper = null;
  let imageObjectUrl = "";
  let processedImage = null;
  let selectedBook = null;
  let searchController = null;
  let searchTimer = null;

  if (window.lucide) window.lucide.createIcons();

  function setMessage(message, isError) {
    elements.message.textContent = message || "";
    elements.message.classList.toggle("error", Boolean(isError));
  }

  function requireToken() {
    const token = auth.getToken();
    if (token) return token;
    auth.showStatus("먼저 관리자 토큰을 입력하고 인증 저장을 눌러 주세요.", true);
    document.querySelector(".auth-token").focus();
    return "";
  }

  function updateCharacterCount() {
    elements.charCount.textContent = String(elements.highlightText.value.length);
  }

  function cleanOcrText(value) {
    return String(value || "")
      .replace(/-\s*\n\s*/g, "")
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function setOcrProgress(status, progress) {
    const safeProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    elements.ocrProgress.hidden = false;
    elements.ocrStatus.textContent = status || "문장 인식 중";
    elements.ocrPercent.textContent = `${Math.round(safeProgress * 100)}%`;
    elements.ocrProgressBar.value = safeProgress;
  }

  function loadImage(file) {
    if (!file || !file.type.startsWith("image/")) {
      setMessage("이미지 파일을 선택해 주세요.", true);
      return;
    }

    setMessage("");
    processedImage = null;
    if (cropper) cropper.destroy();
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = URL.createObjectURL(file);
    elements.sourceImage.src = imageObjectUrl;
    elements.imageEditor.hidden = false;

    elements.sourceImage.onload = () => {
      cropper = new Cropper(elements.sourceImage, {
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 0.88,
        background: false,
        responsive: true,
        restore: false,
        guides: true
      });
      elements.imageEditor.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("사진을 처리하지 못했습니다.")), "image/jpeg", 0.86);
    });
  }

  async function getProcessedImage() {
    if (!cropper) throw new Error("먼저 사진을 촬영하거나 선택해 주세요.");
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 1800,
      maxHeight: 1800,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      fillColor: "#ffffff"
    });
    if (!canvas) throw new Error("선택한 사진 영역을 읽지 못했습니다.");
    return canvasToBlob(canvas);
  }

  async function runOcr() {
    const token = requireToken();
    if (!token) return;
    elements.runOcr.disabled = true;
    setMessage("");
    setOcrProgress("사진 준비 중", 0.12);

    try {
      processedImage = await getProcessedImage();
      setOcrProgress("AI가 문장을 읽는 중", 0.55);
      const form = new FormData();
      form.append("image", processedImage, `ocr-${Date.now()}.jpg`);
      const response = await fetch(`${WORKER_URL}/highlights/ocr`, {
        method: "POST",
        headers: { "X-Admin-Token": token },
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        auth.forget("인증이 만료되었거나 토큰이 올바르지 않습니다. 다시 저장해 주세요.");
        throw new Error("인증 정보를 확인해 주세요.");
      }
      if (!response.ok) throw new Error(data.error || "문장 추출에 실패했습니다.");
      const text = cleanOcrText(data.text);
      if (!text) throw new Error("문장을 찾지 못했습니다. 문장 부분을 더 크게 잘라 다시 시도해 주세요.");
      elements.highlightText.value = text.slice(0, 2000);
      updateCharacterCount();
      setOcrProgress("추출 완료", 1);
      elements.highlightText.focus();
      elements.highlightText.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      setMessage(error.message || "문장 추출에 실패했습니다.", true);
      elements.ocrProgress.hidden = true;
    } finally {
      elements.runOcr.disabled = false;
    }
  }

  function renderBookResults(books) {
    elements.bookResults.replaceChildren();
    elements.bookResults.hidden = false;

    if (!books.length) {
      const empty = document.createElement("div");
      empty.className = "empty-results";
      empty.textContent = "일치하는 책이 없습니다.";
      elements.bookResults.append(empty);
      return;
    }

    books.forEach(book => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "book-option";
      option.setAttribute("role", "option");
      option.textContent = book.title;
      if (book.author) {
        const author = document.createElement("small");
        author.textContent = book.author;
        option.append(author);
      }
      option.addEventListener("click", () => selectBook(book));
      elements.bookResults.append(option);
    });
  }

  async function searchBooks() {
    const token = requireToken();
    if (!token) return;
    if (searchController) searchController.abort();
    searchController = new AbortController();
    elements.bookSpinner.hidden = false;

    try {
      const query = elements.bookSearch.value.trim();
      const response = await fetch(`${WORKER_URL}/highlights/books?q=${encodeURIComponent(query)}`, {
        headers: { "X-Admin-Token": token },
        signal: searchController.signal
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        auth.forget("인증이 만료되었거나 토큰이 올바르지 않습니다. 다시 저장해 주세요.");
        throw new Error("인증 정보를 확인해 주세요.");
      }
      if (!response.ok) throw new Error(data.error || "책 목록을 불러오지 못했습니다.");
      renderBookResults(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      if (error.name !== "AbortError") setMessage(error.message, true);
    } finally {
      elements.bookSpinner.hidden = true;
    }
  }

  function selectBook(book) {
    selectedBook = book;
    elements.selectedBook.querySelector("span").textContent = book.author ? `${book.title} · ${book.author}` : book.title;
    elements.selectedBook.hidden = false;
    elements.bookResults.hidden = true;
    elements.bookSearch.value = book.title;
    setMessage("");
  }

  function clearBook() {
    selectedBook = null;
    elements.selectedBook.hidden = true;
    elements.bookSearch.value = "";
    elements.bookResults.hidden = true;
    elements.bookSearch.focus();
  }

  async function saveHighlight() {
    const token = requireToken();
    if (!token) return;
    const text = elements.highlightText.value.trim();
    if (!text) return setMessage("저장할 하이라이트 문장을 입력해 주세요.", true);
    if (!selectedBook) return setMessage("연결할 책을 선택해 주세요.", true);

    const page = elements.pageNumber.value.trim();
    if (page && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
      return setMessage("페이지는 1 이상의 숫자로 입력해 주세요.", true);
    }

    elements.saveHighlight.disabled = true;
    elements.saveHighlight.innerHTML = '<span class="spinner" aria-hidden="true"></span> 저장 중';
    elements.openNotion.hidden = true;
    setMessage("Notion에 하이라이트를 저장하고 있습니다.");

    try {
      if (cropper && !processedImage) processedImage = await getProcessedImage();
      const form = new FormData();
      form.append("text", text);
      form.append("bookId", selectedBook.id);
      form.append("page", page);
      form.append("memo", elements.memo.value.trim());
      form.append("tags", elements.tags.value.trim());
      if (processedImage) form.append("image", processedImage, `highlight-${Date.now()}.jpg`);

      const response = await fetch(`${WORKER_URL}/highlights`, {
        method: "POST",
        headers: { "X-Admin-Token": token },
        body: form
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        auth.forget("인증이 만료되었거나 토큰이 올바르지 않습니다. 다시 저장해 주세요.");
        throw new Error("인증 정보를 확인해 주세요.");
      }
      if (!response.ok) throw new Error(data.error || "Notion 저장에 실패했습니다.");

      setMessage(data.imageWarning ? `문장은 저장했지만 사진 첨부에 실패했습니다: ${data.imageWarning}` : "하이라이트를 저장했습니다.", Boolean(data.imageWarning));
      if (data.url) {
        elements.openNotion.href = data.url;
        elements.openNotion.hidden = false;
      }
      elements.highlightText.value = "";
      elements.memo.value = "";
      elements.pageNumber.value = "";
      updateCharacterCount();
    } catch (error) {
      setMessage(error.message || "Notion 저장에 실패했습니다.", true);
    } finally {
      elements.saveHighlight.disabled = false;
      elements.saveHighlight.innerHTML = '<i data-lucide="send"></i> Notion에 저장';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  [elements.cameraInput, elements.galleryInput].forEach(input => {
    input.addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (file) loadImage(file);
      event.target.value = "";
    });
  });
  elements.rotateLeft.addEventListener("click", () => cropper && cropper.rotate(-90));
  elements.rotateRight.addEventListener("click", () => cropper && cropper.rotate(90));
  elements.resetCrop.addEventListener("click", () => cropper && cropper.reset());
  elements.runOcr.addEventListener("click", runOcr);
  elements.highlightText.addEventListener("input", updateCharacterCount);
  elements.bookSearch.addEventListener("focus", () => { if (!selectedBook) searchBooks(); });
  elements.bookSearch.addEventListener("input", () => {
    selectedBook = null;
    elements.selectedBook.hidden = true;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchBooks, 350);
  });
  elements.clearBook.addEventListener("click", clearBook);
  elements.saveHighlight.addEventListener("click", saveHighlight);
})();
