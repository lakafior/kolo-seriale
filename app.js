(() => {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const POINTER_ANGLE = -Math.PI / 2; // góra
  const STORAGE_KEY = "koloSerialeWatched:v1";
  const FAVORITES_STORAGE_KEY = "koloSerialeFavorites:v1";
  const SKIPPED_TODAY_STORAGE_KEY = "koloSerialeSkippedToday:v1";
  const SHOWS_STORAGE_KEY = "koloSerialeShows:v1";
  const CANONICAL_GENRES = [
    "komediowe",
    "paradokument",
    "na podstawie literatury",
    "przygodowe",
    "sensacyjne",
    "fantastyczne",
    "opery mydlane",
    "obyczajowe",
  ];

  const state = {
    shows: [],
    fileShows: [],
    watched: new Set(),
    favorites: new Set(),
    skippedToday: new Set(),
    onlyUnwatched: true,
    onlyFavorites: false,
    hideSkippedToday: true,
    genreFilter: "all",
    decadeFilter: "all",
    titleQuery: "",
    spinning: false,
    currentRotation: 0,
    editorOpen: false,
  };

  const dom = {
    wheelCanvas: document.getElementById("wheelCanvas"),
    spinBtn: document.getElementById("spinBtn"),
    resetWatchedBtn: document.getElementById("resetWatchedBtn"),
    onlyUnwatchedToggle: document.getElementById("onlyUnwatchedToggle"),
    onlyFavoritesToggle: document.getElementById("onlyFavoritesToggle"),
    hideSkippedTodayToggle: document.getElementById("hideSkippedTodayToggle"),
    genreFilter: document.getElementById("genreFilter"),
    decadeFilter: document.getElementById("decadeFilter"),
    resultTitle: document.getElementById("resultTitle"),
    resultMeta: document.getElementById("resultMeta"),
    resultDesc: document.getElementById("resultDesc"),
    showsList: document.getElementById("showsList"),
    titleSearch: document.getElementById("titleSearch"),
    remainingCount: document.getElementById("remainingCount"),
    totalCount: document.getElementById("totalCount"),
    statusText: document.getElementById("statusText"),
    toggleEditorBtn: document.getElementById("toggleEditorBtn"),
    showsManager: document.getElementById("showsManager"),
    addShowForm: document.getElementById("addShowForm"),
    newShowTitle: document.getElementById("newShowTitle"),
    newShowYear: document.getElementById("newShowYear"),
    newShowWhere: document.getElementById("newShowWhere"),
    newShowGenre: document.getElementById("newShowGenre"),
    managerList: document.getElementById("managerList"),
    resetShowsBtn: document.getElementById("resetShowsBtn"),
    editorStatus: document.getElementById("editorStatus"),
  };

  const ctx = dom.wheelCanvas?.getContext("2d");

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function normalizeAngle(a) {
    let x = a % TWO_PI;
    if (x < 0) x += TWO_PI;
    return x;
  }

  function getIncludedShows() {
    return state.shows.filter((s) => {
      const id = String(s.id);
      if (state.onlyUnwatched && state.watched.has(id)) return false;
      if (state.onlyFavorites && !state.favorites.has(id)) return false;
      if (state.hideSkippedToday && state.skippedToday.has(id)) return false;
      if (state.genreFilter !== "all") {
        const genres = Array.isArray(s.genre) ? s.genre.map(String) : [];
        if (!genres.includes(state.genreFilter)) return false;
      }
      if (state.decadeFilter !== "all") {
        const year = Number(s.year);
        if (!Number.isInteger(year)) return false;
        const decade = Number(state.decadeFilter);
        if (year < decade || year > decade + 9) return false;
      }
      return true;
    });
  }

  function getListShows() {
    const query = state.titleQuery.trim().toLocaleLowerCase("pl");
    const base = getIncludedShows();
    if (!query) return base;
    return base.filter((show) =>
      String(show.title || "").toLocaleLowerCase("pl").includes(query),
    );
  }

  function getAvailableGenres() {
    return [...CANONICAL_GENRES];
  }

  function normalizeSingleGenre(show) {
    const list = Array.isArray(show.genre)
      ? show.genre.map((g) => String(g || "").trim())
      : [];
    const match = list.find((g) => CANONICAL_GENRES.includes(g));
    return match || "obyczajowe";
  }

  function getAvailableDecades() {
    const decades = new Set();
    for (const show of state.shows) {
      const year = Number(show.year);
      if (!Number.isInteger(year)) continue;
      decades.add(Math.floor(year / 10) * 10);
    }
    return [...decades].sort((a, b) => a - b);
  }

  function renderDecadeFilter() {
    if (!dom.decadeFilter) return;
    const prev = state.decadeFilter;
    const decades = getAvailableDecades();
    const valid = prev === "all" || decades.includes(Number(prev));
    state.decadeFilter = valid ? prev : "all";

    dom.decadeFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Wszystkie dekady";
    dom.decadeFilter.appendChild(allOption);

    for (const decade of decades) {
      const option = document.createElement("option");
      option.value = String(decade);
      option.textContent = `${decade}-${decade + 9}`;
      dom.decadeFilter.appendChild(option);
    }
    dom.decadeFilter.value = state.decadeFilter;
  }

  function normalizeSingleYear(show) {
    const raw = Number(show.year);
    if (Number.isInteger(raw) && raw >= 1900 && raw <= 2100) return raw;

    const text = `${show.title || ""} ${show.description || ""}`;
    const match = text.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return Number(match[1]);

    return new Date().getFullYear();
  }

  function normalizeShowsData(shows) {
    return shows.map((show) => ({
      ...show,
      genre: [normalizeSingleGenre(show)],
      year: normalizeSingleYear(show),
    }));
  }

  function renderGenreFilter() {
    if (!dom.genreFilter) return;
    const prev = state.genreFilter;
    const genres = getAvailableGenres();
    const valid = prev === "all" || genres.includes(prev);
    state.genreFilter = valid ? prev : "all";

    dom.genreFilter.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "Wszystkie kategorie";
    dom.genreFilter.appendChild(allOption);

    for (const genre of genres) {
      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      dom.genreFilter.appendChild(option);
    }
    dom.genreFilter.value = state.genreFilter;
  }

  function loadWatchedFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveWatchedToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.watched]));
    } catch {}
  }

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadFavoritesFromStorage() {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveFavoritesToStorage() {
    try {
      localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify([...state.favorites]),
      );
    } catch {}
  }

  function loadSkippedTodayFromStorage() {
    try {
      const raw = localStorage.getItem(SKIPPED_TODAY_STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object") return new Set();
      const today = getTodayKey();
      return new Set(
        Object.entries(obj)
          .filter(([, date]) => String(date) === today)
          .map(([id]) => String(id)),
      );
    } catch {
      return new Set();
    }
  }

  function saveSkippedTodayToStorage() {
    try {
      const today = getTodayKey();
      const out = {};
      for (const id of state.skippedToday) out[String(id)] = today;
      localStorage.setItem(SKIPPED_TODAY_STORAGE_KEY, JSON.stringify(out));
    } catch {}
  }

  function loadShowsFromStorage() {
    try {
      const raw = localStorage.getItem(SHOWS_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      const valid = data.filter(
        (s) => s && typeof s === "object" && s.id != null && s.title,
      );
      return valid.length ? valid : null;
    } catch {
      return null;
    }
  }

  function saveShowsToStorage(shows) {
    localStorage.setItem(SHOWS_STORAGE_KEY, JSON.stringify(shows));
  }

  function clearShowsStorage() {
    localStorage.removeItem(SHOWS_STORAGE_KEY);
  }

  function setEditorStatus(text, isError = false) {
    if (!dom.editorStatus) return;
    dom.editorStatus.textContent = text;
    dom.editorStatus.style.color = isError ? "#ff9fb2" : "";
  }

  function cloneShowsData(shows) {
    return JSON.parse(JSON.stringify(shows));
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function createUniqueShowId(title) {
    const base = slugify(title) || "serial";
    const ids = new Set(state.shows.map((s) => String(s.id)));
    if (!ids.has(base)) return base;
    let n = 2;
    while (ids.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }

  function parseWhere(value) {
    const parts = String(value || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return parts;
  }

  function pruneWatchedToExistingShows() {
    const existingIds = new Set(state.shows.map((s) => String(s.id)));
    state.watched = new Set(
      [...state.watched].filter((id) => existingIds.has(String(id))),
    );
    saveWatchedToStorage();
    state.favorites = new Set(
      [...state.favorites].filter((id) => existingIds.has(String(id))),
    );
    saveFavoritesToStorage();
    state.skippedToday = new Set(
      [...state.skippedToday].filter((id) => existingIds.has(String(id))),
    );
    saveSkippedTodayToStorage();
  }

  function refreshUIAfterShowsChange() {
    pruneWatchedToExistingShows();
    renderGenreFilter();
    renderDecadeFilter();
    renderShowsList();
    renderManagerList();
    updateCounts();
    setupCanvasForDPR();
    updateSpinButtonState();
  }

  function updateCounts() {
    const total = state.shows.length;
    const remaining = state.shows.filter(
      (s) => !state.watched.has(String(s.id)),
    ).length;

    dom.totalCount.textContent = String(total);
    dom.remainingCount.textContent = String(remaining);

    if (remaining === 0 && total > 0) {
      dom.statusText.textContent = "Wszystko obejrzane 🎉";
    } else {
      const base = state.onlyUnwatched
        ? "Losowanie tylko z nieobejrzanych"
        : "Losowanie ze wszystkich";
      const parts = [base];
      if (state.genreFilter !== "all") {
        parts.push(`kategoria: ${state.genreFilter}`);
      }
      if (state.decadeFilter !== "all") {
        const d = Number(state.decadeFilter);
        parts.push(`dekada: ${d}-${d + 9}`);
      }
      if (state.onlyFavorites) parts.push("tylko ulubione");
      if (state.hideSkippedToday) parts.push("bez pominiętych dziś");
      dom.statusText.textContent = parts.join(" • ");
    }
  }

  function setupCanvasForDPR() {
    if (!dom.wheelCanvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssSize = Math.floor(dom.wheelCanvas.clientWidth || 470);

    dom.wheelCanvas.width = Math.max(1, Math.floor(cssSize * dpr));
    dom.wheelCanvas.height = Math.max(1, Math.floor(cssSize * dpr));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cssSize, cssSize);
    drawWheel();
  }

  function drawFittedText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, 0, 0);
      return;
    }
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    ctx.fillText(`${out}…`, 0, 0);
  }

  function compactTitle(title, maxChars) {
    const clean = String(title || "")
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length <= maxChars) return clean;
    return `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }

  function drawWheel() {
    if (!ctx || !dom.wheelCanvas) return;

    const included = getIncludedShows();
    const count = included.length;

    const w = dom.wheelCanvas.clientWidth || 470;
    const h = dom.wheelCanvas.clientHeight || w;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.46;
    const innerRadius = radius * 0.08;

    ctx.clearRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(
      cx,
      cy,
      radius * 0.2,
      cx,
      cy,
      radius * 1.1,
    );
    glow.addColorStop(0, "rgba(255,255,255,0.08)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.15, 0, TWO_PI);
    ctx.fill();

    if (count === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TWO_PI);
      ctx.fillStyle = "rgba(20,23,35,0.8)";
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 16px Inter, sans-serif";
      ctx.fillText("Brak pozycji do losowania", cx, cy - 8);
      ctx.font = "500 13px Inter, sans-serif";
      ctx.fillText("Odznacz seriale lub wyłącz filtr", cx, cy + 14);
      return;
    }

    const arc = TWO_PI / count;
    const denseMode = count > 36;
    const labelEvery = Math.ceil(count / 24);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.currentRotation);

    for (let i = 0; i < count; i++) {
      const show = included[i];
      const start = i * arc;
      const end = start + arc;

      // segment
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();

      ctx.fillStyle = `hsl(${Math.round((i * 360) / count)}, 78%, 55%)`;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.stroke();

      // RADIALNY NAPIS (od środka do krawędzi), w trybie gęstym skrócone etykiety co N segmentów
      const mid = start + arc / 2;
      ctx.save();
      ctx.rotate(mid); // oś X idzie po promieniu segmentu

      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      if (denseMode) {
        if (i % labelEvery === 0) {
          const textR = radius * 0.56;
          ctx.translate(textR, 0);
          ctx.font = `700 ${clamp(14 - count * 0.03, 8, 11)}px Inter, sans-serif`;
          drawFittedText(compactTitle(show.title, 14), radius - textR - 10);
        }
      } else {
        const textR = radius * 0.28;
        ctx.translate(textR, 0);
        ctx.font = `700 ${clamp(18 - count * 0.22, 10, 16)}px Inter, sans-serif`;
        drawFittedText(show.title, radius - textR - 14);
      }
      ctx.restore();
    }

    // środek
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 2.8, 0, TWO_PI);
    ctx.fillStyle = "rgba(10,12,20,0.85)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.stroke();

    ctx.restore();
  }

  function renderShowsList() {
    dom.showsList.innerHTML = "";
    const listShows = getListShows();

    if (listShows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Brak seriali dla wybranych filtrów.";
      dom.showsList.appendChild(empty);
      return;
    }

    for (const show of listShows) {
      const id = String(show.id);
      const watched = state.watched.has(id);
      const favorite = state.favorites.has(id);
      const skippedToday = state.skippedToday.has(id);

      const row = document.createElement("div");
      row.className = `item${watched ? " done" : ""}${favorite ? " favorite" : ""}${skippedToday ? " skipped-today" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = watched;
      checkbox.setAttribute(
        "aria-label",
        `Oznacz jako obejrzane: ${show.title}`,
      );
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.watched.add(id);
        else state.watched.delete(id);

        saveWatchedToStorage();
        updateCounts();
        renderShowsList();
        drawWheel();
        updateSpinButtonState();
      });

      const main = document.createElement("div");
      main.className = "item-main";

      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = show.title;
      const where = Array.isArray(show.where)
        ? show.where.join(", ")
        : show.where || "";

      const subtitle = document.createElement("span");
      subtitle.className = "item-sub";
      subtitle.textContent = where || "brak platformy";

      const year = document.createElement("span");
      year.className = "platform";
      year.textContent = String(show.year || "—");

      const quickActions = document.createElement("div");
      quickActions.className = "quick-actions";

      const favoriteBtn = document.createElement("button");
      favoriteBtn.type = "button";
      favoriteBtn.className = `quick-action${favorite ? " active" : ""}`;
      favoriteBtn.textContent = favorite ? "★ Ulubione" : "☆ Ulubione";
      favoriteBtn.setAttribute("aria-label", `Przełącz ulubione: ${show.title}`);
      favoriteBtn.addEventListener("click", () => {
        if (state.favorites.has(id)) state.favorites.delete(id);
        else state.favorites.add(id);
        saveFavoritesToStorage();
        renderShowsList();
        updateCounts();
        drawWheel();
        updateSpinButtonState();
      });

      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = `quick-action${skippedToday ? " active" : ""}`;
      skipBtn.textContent = skippedToday ? "Przywróć" : "Pomiń dziś";
      skipBtn.setAttribute(
        "aria-label",
        `${skippedToday ? "Przywróć" : "Pomiń dziś"}: ${show.title}`,
      );
      skipBtn.addEventListener("click", () => {
        if (state.skippedToday.has(id)) state.skippedToday.delete(id);
        else state.skippedToday.add(id);
        saveSkippedTodayToStorage();
        renderShowsList();
        updateCounts();
        drawWheel();
        updateSpinButtonState();
      });

      quickActions.append(favoriteBtn, skipBtn);
      main.append(title, subtitle);
      row.append(checkbox, main, quickActions, year);
      dom.showsList.appendChild(row);
    }
  }

  function setEditorOpen(open) {
    state.editorOpen = Boolean(open);
    if (dom.showsManager) dom.showsManager.hidden = !state.editorOpen;
    if (dom.toggleEditorBtn) {
      dom.toggleEditorBtn.textContent = state.editorOpen
        ? "Zamknij edycję"
        : "Edytuj listę seriali";
    }
  }

  function renderManagerList() {
    if (!dom.managerList) return;
    dom.managerList.innerHTML = "";

    if (state.shows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Brak seriali. Dodaj pierwszy.";
      dom.managerList.appendChild(empty);
      return;
    }

    state.shows.forEach((show, index) => {
      const row = document.createElement("div");
      row.className = "manager-item";

      const info = document.createElement("div");
      info.className = "manager-info";

      const title = document.createElement("span");
      title.className = "manager-title";
      title.textContent = `${index + 1}. ${show.title || "Bez tytułu"}`;

      const where = Array.isArray(show.where)
        ? show.where.join(", ")
        : show.where || "brak platformy";
      const subtitle = document.createElement("span");
      subtitle.className = "manager-sub";
      subtitle.textContent = `${show.year || "—"} • ${where}`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn secondary manager-remove";
      removeBtn.textContent = "Usuń";
      removeBtn.addEventListener("click", () => {
        state.shows = state.shows.filter((s) => String(s.id) !== String(show.id));
        saveShowsToStorage(state.shows);
        refreshUIAfterShowsChange();
        setEditorStatus(`Usunięto: ${show.title}`);
      });

      info.append(title, subtitle);
      row.append(info, removeBtn);
      dom.managerList.appendChild(row);
    });
  }

  function showDetails(show) {
    const where = Array.isArray(show.where)
      ? show.where.join(", ")
      : show.where || "brak danych";
    const genre = Array.isArray(show.genre)
      ? show.genre.join(", ")
      : show.genre || "brak danych";

    dom.resultTitle.textContent = show.title || "—";
    dom.resultMeta.textContent = `${show.year || "—"} • ${genre} • ${where}`;
    dom.resultDesc.textContent =
      show.description || show.notes || "Brak opisu.";
  }

  function updateSpinButtonState() {
    const available = getIncludedShows().length;
    dom.spinBtn.disabled = state.spinning || available === 0;
    dom.spinBtn.textContent = state.spinning ? "Losowanie..." : "Losuj";
  }

  function spinWheel() {
    if (state.spinning) return;

    const included = getIncludedShows();
    const count = included.length;
    if (!count) return;

    state.spinning = true;
    updateSpinButtonState();

    const arc = TWO_PI / count;
    const targetIndex = Math.floor(Math.random() * count);

    const segmentCenter = targetIndex * arc + arc / 2;
    const desiredFinal = normalizeAngle(POINTER_ANGLE - segmentCenter);
    const current = normalizeAngle(state.currentRotation);
    const delta = normalizeAngle(desiredFinal - current);

    const totalDelta = (6 + Math.floor(Math.random() * 3)) * TWO_PI + delta;
    const start = state.currentRotation;
    const end = start + totalDelta;
    const duration = 4200;
    const t0 = performance.now();

    function frame(now) {
      const t = clamp((now - t0) / duration, 0, 1);
      state.currentRotation = start + (end - start) * easeOutCubic(t);
      drawWheel();

      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }

      state.currentRotation = normalizeAngle(end);
      drawWheel();
      showDetails(included[targetIndex]);

      state.spinning = false;
      updateSpinButtonState();
    }

    requestAnimationFrame(frame);
  }

  async function loadShowsFromFile() {
    const res = await fetch("shows.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Błąd HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async function loadShows() {
    const localShows = loadShowsFromStorage();
    if (localShows) {
      return { shows: localShows, source: "local" };
    }

    const fileShows = await loadShowsFromFile();
    return { shows: fileShows, source: "file" };
  }

  async function init() {
    state.watched = loadWatchedFromStorage();
    state.favorites = loadFavoritesFromStorage();
    state.skippedToday = loadSkippedTodayFromStorage();
    const loaded = await loadShows();
    state.shows = normalizeShowsData(cloneShowsData(loaded.shows));
    try {
      state.fileShows = normalizeShowsData(
        cloneShowsData(await loadShowsFromFile()),
      );
    } catch (err) {
      console.error(err);
      state.fileShows = normalizeShowsData(cloneShowsData(loaded.shows));
    }

    dom.onlyUnwatchedToggle.addEventListener("change", () => {
      state.onlyUnwatched = dom.onlyUnwatchedToggle.checked;
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });
    dom.onlyFavoritesToggle?.addEventListener("change", () => {
      state.onlyFavorites = dom.onlyFavoritesToggle.checked;
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });
    dom.hideSkippedTodayToggle?.addEventListener("change", () => {
      state.hideSkippedToday = dom.hideSkippedTodayToggle.checked;
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });
    dom.genreFilter?.addEventListener("change", () => {
      state.genreFilter = dom.genreFilter.value || "all";
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });
    dom.decadeFilter?.addEventListener("change", () => {
      state.decadeFilter = dom.decadeFilter.value || "all";
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });
    dom.titleSearch?.addEventListener("input", () => {
      state.titleQuery = dom.titleSearch.value || "";
      renderShowsList();
    });

    dom.spinBtn.addEventListener("click", spinWheel);
    dom.resetWatchedBtn.addEventListener("click", () => {
      state.watched.clear();
      saveWatchedToStorage();
      renderShowsList();
      updateCounts();
      drawWheel();
      updateSpinButtonState();
    });

    dom.toggleEditorBtn?.addEventListener("click", () => {
      setEditorOpen(!state.editorOpen);
    });

    dom.addShowForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = String(dom.newShowTitle?.value || "").trim();
      if (!title) {
        setEditorStatus("Podaj tytuł serialu.", true);
        return;
      }

      const yearRaw = String(dom.newShowYear?.value || "").trim();
      const year = yearRaw ? Number(yearRaw) : null;
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        setEditorStatus("Rok musi być liczbą z zakresu 1900-2100.", true);
        return;
      }

      const where = parseWhere(dom.newShowWhere?.value);
      const selectedGenre = String(dom.newShowGenre?.value || "").trim();
      const genre = CANONICAL_GENRES.includes(selectedGenre)
        ? selectedGenre
        : "obyczajowe";
      const newShow = {
        id: createUniqueShowId(title),
        title,
        year,
        where,
        genre: [genre],
        seasons: 1,
        episodes: 1,
        status: "ongoing",
        description: "",
        watched: false,
      };

      state.shows.push(newShow);
      saveShowsToStorage(state.shows);
      refreshUIAfterShowsChange();
      dom.addShowForm.reset();
      setEditorStatus(`Dodano: ${title}`);
    });

    dom.resetShowsBtn?.addEventListener("click", () => {
      state.shows = cloneShowsData(state.fileShows);
      clearShowsStorage();
      refreshUIAfterShowsChange();
      setEditorStatus("Przywrócono dane z shows.json.");
    });

    window.addEventListener("resize", setupCanvasForDPR);

    if (dom.onlyFavoritesToggle) {
      dom.onlyFavoritesToggle.checked = state.onlyFavorites;
    }
    if (dom.hideSkippedTodayToggle) {
      dom.hideSkippedTodayToggle.checked = state.hideSkippedToday;
    }

    setEditorOpen(false);
    refreshUIAfterShowsChange();
    if (loaded.source === "local") {
      setEditorStatus(
        "Wczytano lokalną wersję danych (nadpisanie shows.json).",
      );
    }
  }

  init().catch((err) => {
    console.error(err);
    dom.statusText.textContent = "Nie udało się wczytać danych z shows.json";
  });
})();
