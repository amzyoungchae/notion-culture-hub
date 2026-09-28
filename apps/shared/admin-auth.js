(function () {
  window.createAdminAuth = function createAdminAuth(options) {
    const mount = document.getElementById(options.mountId);
    const storageKey = options.storageKey;
    const sessionKey = storageKey + "_SESSION";

    mount.innerHTML = `
      <div class="auth-box">
        <div class="auth-title">🔐 노션 추가 인증</div>
        <div class="auth-row">
          <input class="auth-token" type="password" autocomplete="current-password" placeholder="관리자 토큰을 입력하세요" />
          <button class="auth-save" type="button">인증 저장</button>
          <button class="auth-clear secondary" type="button">인증 삭제</button>
        </div>
        <label class="remember"><input class="auth-remember" type="checkbox" checked /> 이 기기에서 기억하기 (개인 기기에서만 사용)</label>
        <div class="auth-status" aria-live="polite"></div>
      </div>`;

    const input = mount.querySelector(".auth-token");
    const remember = mount.querySelector(".auth-remember");
    const status = mount.querySelector(".auth-status");

    function read(storage, key) {
      try { return storage.getItem(key) || ""; } catch (_) { return ""; }
    }

    function remove(storage, key) {
      try { storage.removeItem(key); } catch (_) { /* Storage may be blocked in an embed. */ }
    }

    function showStatus(message, isError) {
      status.textContent = message || "";
      status.classList.toggle("error", Boolean(isError));
    }

    function save() {
      const token = input.value.trim();
      if (!token) {
        showStatus("토큰을 입력해 주세요.", true);
        return false;
      }

      remove(localStorage, storageKey);
      remove(sessionStorage, sessionKey);
      try {
        (remember.checked ? localStorage : sessionStorage).setItem(remember.checked ? storageKey : sessionKey, token);
        showStatus(remember.checked ? "이 기기에 인증 정보를 저장했습니다." : "현재 탭에만 인증 정보를 저장했습니다.");
      } catch (_) {
        try {
          sessionStorage.setItem(sessionKey, token);
          remember.checked = false;
          showStatus("브라우저 제한으로 현재 탭에만 인증 정보를 저장했습니다.");
        } catch (_) {
          showStatus("브라우저가 저장을 차단했습니다. 이 페이지를 새 탭으로 열어 주세요.", true);
          return false;
        }
      }
      return true;
    }

    function forget(message) {
      remove(localStorage, storageKey);
      remove(sessionStorage, sessionKey);
      input.value = "";
      showStatus(message || "저장된 인증 정보를 삭제했습니다.", Boolean(message));
    }

    const persisted = read(localStorage, storageKey);
    const temporary = read(sessionStorage, sessionKey);
    input.value = persisted || temporary;
    remember.checked = Boolean(persisted) || !temporary;
    if (input.value) showStatus(persisted ? "이 기기에 저장된 인증 정보를 사용합니다." : "현재 탭의 인증 정보를 사용합니다.");

    mount.querySelector(".auth-save").addEventListener("click", save);
    mount.querySelector(".auth-clear").addEventListener("click", () => forget());
    input.addEventListener("keydown", event => { if (event.key === "Enter") save(); });

    return {
      getToken: () => input.value.trim(),
      forget,
      showStatus
    };
  };
})();
