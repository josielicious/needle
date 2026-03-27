let albums = [];
let homeTracks = [];

function centerOverlayBox(box) {
  if (!box) return;

  const centerX = window.scrollX + window.innerWidth / 2;
  const centerY = window.scrollY + window.innerHeight / 2;

  box.style.position = "absolute";
  box.style.left = centerX + "px";
  box.style.top = centerY + "px";
  box.style.transform = "translate(-50%, -50%)";
}

class DialogManager {
  constructor() {
    this.modal = document.getElementById('dialog-modal');
    this.box = this.modal ? this.modal.querySelector('.dialog-box') : null;
    this.titleEl = document.getElementById('dialog-title');
    this.messageEl = document.getElementById('dialog-message');
    this.cancelBtn = document.getElementById('dialog-cancel');
    this.confirmBtn = document.getElementById('dialog-confirm');
    this.resolve = null;
    this.handleViewportChange = () => {
      if (!this.modal || this.modal.classList.contains('hidden')) return;
      centerOverlayBox(this.box);
    };

    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => this.close(false));
    }
    if (this.confirmBtn) {
      this.confirmBtn.addEventListener('click', () => this.close(true));
    }

    const backdrop = this.modal ? document.body.querySelector('.dialog-backdrop') : null;
    if (backdrop) {
      backdrop.addEventListener('click', () => this.close(false));
    }

    window.addEventListener('scroll', this.handleViewportChange, { passive: true });
    window.addEventListener('resize', this.handleViewportChange);
  }

  show(title, message) {
    if (!this.modal || !this.titleEl || !this.messageEl || !this.confirmBtn) {
      return Promise.resolve(window.confirm(message));
    }

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.titleEl.textContent = title;
      this.messageEl.textContent = message;
      this.modal.classList.remove('hidden');
      centerOverlayBox(this.box);
      requestAnimationFrame(() => centerOverlayBox(this.box));
      this.confirmBtn.focus();
    });
  }

  close(result) {
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
    if (this.resolve) {
      this.resolve(result);
      this.resolve = null;
    }
  }
}

const dialogManager = new DialogManager();
const grid = document.getElementById("album-grid");
const page = document.getElementById("album-page");
const searchInput = document.getElementById("search");
const searchPagination = document.getElementById("search-pagination");
const toggle = document.getElementById("theme-toggle");
let activePreviewTrackKey = null;
const albumThemeCache = new Map();
const exportImageCache = new Map();
const SEARCH_RESULTS_PAGE_SIZE = 12;
const ALBUM_THEME_VARS = [
  "--accent",
  "--accent-strong",
  "--accent-soft",
  "--page-glow-a",
  "--page-glow-b",
  "--page-sheen",
  "--header-bg",
  "--card",
  "--card-strong",
  "--album-shadow"
];

class PreviewPlayer {
  constructor() {
    this.modal = document.getElementById("preview-modal");
    this.box = this.modal ? this.modal.querySelector(".preview-box") : null;
    this.audio = document.getElementById("preview-audio");
    this.cover = document.getElementById("preview-cover");
    this.titleEl = document.getElementById("preview-track-title");
    this.subtitleEl = document.getElementById("preview-track-subtitle");
    this.closeBtn = document.getElementById("preview-close");
    this.trackLink = document.getElementById("preview-track-link");
    this.handleViewportChange = () => {
      if (!this.modal || this.modal.classList.contains("hidden")) return;
      centerOverlayBox(this.box);
    };

    if (!this.modal || !this.audio) return;

    const backdrop = this.modal.querySelector(".preview-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", () => this.close());
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", () => this.close());
    }

    this.audio.addEventListener("pause", () => syncPreviewButtons());
    this.audio.addEventListener("play", () => syncPreviewButtons());
    this.audio.addEventListener("ended", () => {
      activePreviewTrackKey = null;
      syncPreviewButtons();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen()) {
        this.close();
      }
    });

    window.addEventListener("scroll", this.handleViewportChange, { passive: true });
    window.addEventListener("resize", this.handleViewportChange);
  }

  isOpen() {
    return !!this.modal && !this.modal.classList.contains("hidden");
  }

  async open(track) {
    if (!this.modal || !this.audio) return;

    this.titleEl.textContent = track.name;
    this.subtitleEl.textContent = track.artist + " • " + track.album;
    this.audio.src = track.previewUrl;
    this.audio.currentTime = 0;
    this.cover.src = track.cover || "";
    this.cover.style.display = track.cover ? "block" : "none";
    this.cover.alt = track.album ? track.album + " cover" : "Album cover";
    if (this.trackLink) {
      this.trackLink.href = track.trackUrl || "#";
      this.trackLink.style.display = track.trackUrl ? "inline-flex" : "none";
    }
    this.modal.classList.remove("hidden");
    this.modal.setAttribute("aria-hidden", "false");
    centerOverlayBox(this.box);
    requestAnimationFrame(() => centerOverlayBox(this.box));
    activePreviewTrackKey = track.key;

    try {
      await this.audio.play();
    } catch (error) {
      activePreviewTrackKey = null;
    }

    syncPreviewButtons();
  }

  close() {
    if (!this.modal || !this.audio) return;

    this.audio.pause();
    this.audio.currentTime = 0;
    if (this.trackLink) {
      this.trackLink.href = "#";
    }
    this.modal.classList.add("hidden");
    this.modal.setAttribute("aria-hidden", "true");
    activePreviewTrackKey = null;
    syncPreviewButtons();
  }

  isActiveTrack(trackKey) {
    return this.isOpen() && activePreviewTrackKey === trackKey && this.audio && !this.audio.paused;
  }
}

const previewPlayer = new PreviewPlayer();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (!delta) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const scaledHue = hue / 60;
  const x = chroma * (1 - Math.abs((scaledHue % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (scaledHue >= 0 && scaledHue < 1) {
    red = chroma;
    green = x;
  } else if (scaledHue < 2) {
    red = x;
    green = chroma;
  } else if (scaledHue < 3) {
    green = chroma;
    blue = x;
  } else if (scaledHue < 4) {
    green = x;
    blue = chroma;
  } else if (scaledHue < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255)
  };
}

function toRgbString(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function toRgbaString(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function mixColors(primary, secondary, ratio) {
  return {
    r: Math.round(primary.r * (1 - ratio) + secondary.r * ratio),
    g: Math.round(primary.g * (1 - ratio) + secondary.g * ratio),
    b: Math.round(primary.b * (1 - ratio) + secondary.b * ratio)
  };
}

function deriveAlbumThemeVars(sourceColor, dark) {
  const hsl = rgbToHsl(sourceColor.r, sourceColor.g, sourceColor.b);
  const hue = hsl.h;
  const accent = hslToRgb(hue, clamp(Math.max(hsl.s, dark ? 0.22 : 0.55), dark ? 0.22 : 0.55, dark ? 0.4 : 0.86), dark ? 0.72 : 0.52);
  const accentStrong = dark
    ? { r: 226, g: 226, b: 226 }
    : hslToRgb(hue, clamp(Math.max(hsl.s + 0.1, 0.62), 0.62, 0.92), 0.4);
  const glowColor = dark
    ? { r: 255, g: 255, b: 255 }
    : hslToRgb((hue + 28) % 360, clamp(Math.max(hsl.s * 0.88, 0.4), 0.4, 0.78), 0.62);
  const neutralBase = dark ? { r: 14, g: 14, b: 16 } : { r: 255, g: 251, b: 245 };
  const cardBase = dark ? { r: 23, g: 23, b: 26 } : { r: 255, g: 253, b: 249 };
  const card = dark ? cardBase : mixColors(cardBase, accent, 0.07);
  const cardStrong = dark ? { r: 18, g: 18, b: 20 } : mixColors(neutralBase, accent, 0.05);

  return {
    "--accent": toRgbString(accent),
    "--accent-strong": toRgbString(accentStrong),
    "--accent-soft": toRgbaString(accent, dark ? 0.1 : 0.16),
    "--page-glow-a": dark ? "rgba(255, 255, 255, 0.025)" : toRgbaString(accent, 0.2),
    "--page-glow-b": dark ? "rgba(255, 255, 255, 0.015)" : toRgbaString(glowColor, 0.16),
    "--page-sheen": dark ? "rgba(255, 255, 255, 0.015)" : "rgba(255, 255, 255, 0.16)",
    "--header-bg": dark ? "rgba(12, 12, 14, 0.94)" : "rgba(245, 239, 229, 0.74)",
    "--card": toRgbaString(card, dark ? 0.92 : 0.94),
    "--card-strong": toRgbString(cardStrong),
    "--album-shadow": dark
      ? "rgba(0, 0, 0, 0.24)"
      : `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.14)`
  };
}

function clearAlbumTheme() {
  document.body.classList.remove("album-themed");
  ALBUM_THEME_VARS.forEach((name) => document.body.style.removeProperty(name));
}

function applyAlbumThemeFromColor(color) {
  const vars = deriveAlbumThemeVars(color, document.body.classList.contains("dark"));

  Object.entries(vars).forEach(([name, value]) => {
    document.body.style.setProperty(name, value);
  });

  document.body.classList.add("album-themed");
}

function extractAlbumCoverColor(imageUrl) {
  if (!imageUrl) return Promise.resolve(null);
  if (albumThemeCache.has(imageUrl)) return albumThemeCache.get(imageUrl);

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });

        if (!context) {
          resolve(null);
          return;
        }

        const size = 28;
        canvas.width = size;
        canvas.height = size;
        context.drawImage(image, 0, 0, size, size);

        const { data } = context.getImageData(0, 0, size, size);
        let totalWeight = 0;
        let red = 0;
        let green = 0;
        let blue = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3] / 255;
          if (alpha < 0.4) continue;

          const sample = { r: data[index], g: data[index + 1], b: data[index + 2] };
          const hsl = rgbToHsl(sample.r, sample.g, sample.b);
          const luminance = 0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b;
          const luminanceWeight = 1 - Math.abs(luminance / 255 - 0.5);
          const weight = Math.max(0.08, hsl.s * 1.35 + luminanceWeight * 0.65);

          red += sample.r * weight;
          green += sample.g * weight;
          blue += sample.b * weight;
          totalWeight += weight;
        }

        if (!totalWeight) {
          resolve(null);
          return;
        }

        resolve({
          r: Math.round(red / totalWeight),
          g: Math.round(green / totalWeight),
          b: Math.round(blue / totalWeight)
        });
      } catch (error) {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });

  albumThemeCache.set(imageUrl, promise);
  return promise;
}

async function refreshAlbumTheme() {
  if (!page) {
    clearAlbumTheme();
    return;
  }

  const id = new URLSearchParams(window.location.search).get("id");
  const album = albums.find((entry) => entry.id == id);

  if (!album || !album.cover) {
    clearAlbumTheme();
    return;
  }

  const color = await extractAlbumCoverColor(album.cover);
  if (!color) {
    clearAlbumTheme();
    return;
  }

  const activeId = new URLSearchParams(window.location.search).get("id");
  if (!page || String(album.id) !== String(activeId)) return;

  applyAlbumThemeFromColor(color);
}

function setTheme(dark) {
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");

  if (toggle) {
    toggle.innerHTML = dark
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  refreshAlbumTheme();
}

const savedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
setTheme(savedTheme ? savedTheme === "dark" : prefersDark);

const mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
if (mql && !localStorage.getItem("theme")) {
  const applyPref = (e) => setTheme(e.matches);
  if (mql.addEventListener) mql.addEventListener("change", applyPref);
  else mql.addListener(applyPref);
}

if (toggle) {
  toggle.addEventListener("click", () => {
    setTheme(!document.body.classList.contains("dark"));
  });
}

let searchTimer = null;
let activeSearchRequest = 0;
const searchPaginationState = {
  query: "",
  page: 1,
  pageSize: SEARCH_RESULTS_PAGE_SIZE,
  total: 0,
  hasNext: false,
  isLoading: false
};

function setSearchPaginationState(nextState = {}) {
  searchPaginationState.query = typeof nextState.query === "string"
    ? nextState.query
    : searchPaginationState.query;
  searchPaginationState.page = Number(nextState.page) || searchPaginationState.page;
  searchPaginationState.pageSize = Number(nextState.pageSize) || searchPaginationState.pageSize;
  searchPaginationState.total = typeof nextState.total === "number"
    ? nextState.total
    : searchPaginationState.total;
  searchPaginationState.hasNext = typeof nextState.hasNext === "boolean"
    ? nextState.hasNext
    : searchPaginationState.hasNext;
  searchPaginationState.isLoading = Boolean(nextState.isLoading);
}

function clearSearchPagination() {
  if (!searchPagination) return;

  searchPaginationState.query = "";
  searchPaginationState.page = 1;
  searchPaginationState.pageSize = SEARCH_RESULTS_PAGE_SIZE;
  searchPaginationState.total = 0;
  searchPaginationState.hasNext = false;
  searchPaginationState.isLoading = false;
  searchPagination.classList.remove("is-visible");
  searchPagination.innerHTML = "";
}

function renderSearchPagination() {
  if (!searchPagination || page) return;

  const hasQuery = Boolean(searchPaginationState.query);
  const hasMultiplePages = searchPaginationState.hasNext || searchPaginationState.page > 1;

  if (!hasQuery || (!hasMultiplePages && !searchPaginationState.isLoading)) {
    searchPagination.classList.remove("is-visible");
    searchPagination.innerHTML = "";
    return;
  }

  const start = searchPaginationState.total
    ? (searchPaginationState.page - 1) * searchPaginationState.pageSize + 1
    : 0;
  const end = Math.min(searchPaginationState.page * searchPaginationState.pageSize, searchPaginationState.total);
  const summary = searchPaginationState.isLoading
    ? `Loading page ${searchPaginationState.page}...`
    : `Showing ${start}-${end} of ${searchPaginationState.total} results`;

  searchPagination.classList.add("is-visible");
  searchPagination.innerHTML = `
    <div class="pagination-summary">${summary}</div>
    <div class="pagination-controls">
      <button class="pagination-btn" type="button" data-page-action="prev" ${searchPaginationState.page === 1 || searchPaginationState.isLoading ? "disabled" : ""}>Previous</button>
      <span class="pagination-page-label">Page ${searchPaginationState.page}</span>
      <button class="pagination-btn" type="button" data-page-action="next" ${!searchPaginationState.hasNext || searchPaginationState.isLoading ? "disabled" : ""}>Next</button>
    </div>
  `;
}

async function goToSearchPage(nextPage) {
  if (!searchInput) return;

  const query = searchInput.value.trim();
  if (!query || nextPage < 1) return;

  const requestId = ++activeSearchRequest;
  await syncSearchResults(query, requestId, nextPage);

  if (grid) {
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function syncSearchResults(searchQuery, requestId, requestedPage = 1) {
  if (grid && !page && window.needleData && typeof window.needleData.searchSongs === "function") {
    const query = searchQuery.trim();

    if (!query) {
      homeTracks = Array.isArray(window.needleData.topSongs) ? window.needleData.topSongs.slice() : [];
      clearSearchPagination();
      render(searchQuery);
      return;
    }

    setSearchPaginationState({
      query,
      page: requestedPage,
      pageSize: SEARCH_RESULTS_PAGE_SIZE,
      isLoading: true
    });
    renderSearchPagination();

    if (grid && query) {
      grid.innerHTML = '<p style="opacity:.7">Searching...</p>';
    }

    const searchResult = await window.needleData.searchSongs(searchQuery, {
      page: requestedPage,
      pageSize: SEARCH_RESULTS_PAGE_SIZE
    });
    if (requestId !== activeSearchRequest) return;

    const nextTracks = searchResult && Array.isArray(searchResult.items) ? searchResult.items : [];

    await ensureHomeAlbumsLoaded(nextTracks);
    if (requestId !== activeSearchRequest) return;

    homeTracks = nextTracks;
    setSearchPaginationState({
      query,
      page: searchResult && searchResult.page ? searchResult.page : requestedPage,
      pageSize: searchResult && searchResult.pageSize ? searchResult.pageSize : SEARCH_RESULTS_PAGE_SIZE,
      total: searchResult && typeof searchResult.total === "number" ? searchResult.total : nextTracks.length,
      hasNext: Boolean(searchResult && searchResult.hasMore),
      isLoading: false
    });
    render(searchQuery);
    return;
  }

  if (!window.needleData || typeof window.needleData.searchAlbums !== "function") {
    render(searchQuery);
    return;
  }

  const query = searchQuery.trim();

  if (grid && query) {
    grid.innerHTML = '<p style="opacity:.7">Searching...</p>';
  }

  const nextAlbums = await window.needleData.searchAlbums(searchQuery);
  if (requestId !== activeSearchRequest) return;

  albums = Array.isArray(nextAlbums) ? nextAlbums : [];
  render(searchQuery);
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const value = e.target.value;
    const requestId = ++activeSearchRequest;

    if (searchTimer) {
      window.clearTimeout(searchTimer);
    }

    searchTimer = window.setTimeout(() => {
      syncSearchResults(value, requestId, 1);
    }, 250);
  });
}

if (searchPagination) {
  searchPagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-action]");
    if (!button || button.disabled) return;

    const nextPage = button.dataset.pageAction === "next"
      ? searchPaginationState.page + 1
      : searchPaginationState.page - 1;

    goToSearchPage(nextPage);
  });
}

function getRating(key) {
  return parseFloat(localStorage.getItem(key)) || 0;
}

function getTrackName(track) {
  if (typeof track === "string") return track;
  if (track && typeof track.name === "string") return track.name;
  return "Unknown Track";
}

function getTrackPreviewUrl(track) {
  if (!track || typeof track === "string") return "";
  return typeof track.previewUrl === "string" ? track.previewUrl : "";
}

function getTrackDuration(track) {
  if (!track || typeof track === "string") return 0;
  return typeof track.durationMs === "number" ? track.durationMs : 0;
}

function isTrackExplicit(track) {
  if (!track || typeof track === "string") return false;
  return track.explicit === true;
}

function getAlbumGenre(album) {
  return album && typeof album.genre === "string" ? album.genre : "";
}

function getReleaseLabel(item) {
  return item && typeof item.releaseType === "string" && item.releaseType
    ? item.releaseType
    : "Album";
}

function getAlbumTrackCount(album) {
  if (!album) return 0;
  if (typeof album.trackCount === "number" && album.trackCount > 0) return album.trackCount;

  return album.discs.reduce((total, disc) => total + disc.tracks.length, 0);
}

function formatDuration(durationMs) {
  if (!durationMs) return "";

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes + ":" + String(seconds).padStart(2, "0");
}

function getAlbumMetaChips(album) {
  return [album.year, getAlbumGenre(album), getAlbumTrackCount(album) ? getAlbumTrackCount(album) + " tracks" : ""]
    .filter(Boolean)
    .map((label) => `<span class="meta-chip">${label}</span>`)
    .join("");
}

function getAlbumByCollectionId(collectionId) {
  if (!collectionId) return null;
  return albums.find((album) => Number(album.collectionId || album.id) === Number(collectionId)) || null;
}

function getHomeTrackKey(track) {
  return `home_track_${track.collectionId || "none"}_${track.trackId || track.id || track.name}`;
}

function getHomeTrackMetaChips(track) {
  return [
    track.rank ? `#${track.rank}` : "",
    track.genre || "",
    track.durationMs ? formatDuration(track.durationMs) : "",
    track.explicit ? "Explicit" : ""
  ]
    .filter(Boolean)
    .map((label) => `<span class="meta-chip">${label}</span>`)
    .join("");
}

function getAlbumLinkButtons(album) {
  const links = [];

  if (album.collectionUrl) {
    links.push(`<a class="meta-link" href="${album.collectionUrl}" target="_blank" rel="noreferrer">Open in iTunes</a>`);
  }

  if (album.artistUrl) {
    links.push(`<a class="meta-link secondary" href="${album.artistUrl}" target="_blank" rel="noreferrer">Artist Page</a>`);
  }

  return links.join("");
}

function sanitizeFileName(value) {
  return String(value || "needle-album")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "needle-album";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function getExportImageUrl(url) {
  if (!url) return "";
  if (exportImageCache.has(url)) return exportImageCache.get(url);

  const promise = fetch(url, { mode: "cors", credentials: "omit" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Image request failed.");
      }

      return response.blob();
    })
    .then(blobToDataUrl)
    .catch(() => "");

  exportImageCache.set(url, promise);
  return promise;
}

function loadImageElement(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function fillRoundedRect(context, x, y, width, height, radius, fillStyle) {
  context.save();
  context.fillStyle = fillStyle;
  drawRoundedRect(context, x, y, width, height, radius);
  context.fill();
  context.restore();
}

function drawCoverImage(context, image, x, y, size, radius) {
  context.save();
  drawRoundedRect(context, x, y, size, size, radius);
  context.clip();

  if (image) {
    context.drawImage(image, x, y, size, size);
  } else {
    const gradient = context.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, "rgba(255,255,255,0.22)");
    gradient.addColorStop(1, "rgba(0,0,0,0.12)");
    context.fillStyle = gradient;
    context.fillRect(x, y, size, size);
  }

  context.restore();
}

function wrapCanvasText(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? currentLine + " " + word : word;
    if (context.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapCanvasText(context, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return lines.length;
}

function normalizeRatingToHalf(rating) {
  const numericRating = Number(rating) || 0;
  return Math.round(numericRating * 2) / 2;
}

function getCanvasThemeColors() {
  const styles = getComputedStyle(document.body);
  return {
    bg: styles.getPropertyValue("--bg").trim() || "#f5efe5",
    card: styles.getPropertyValue("--card").trim() || "rgba(255, 250, 243, 0.92)",
    cardStrong: styles.getPropertyValue("--card-strong").trim() || "#fffdf9",
    text: styles.getPropertyValue("--text").trim() || "#1f1b16",
    muted: styles.getPropertyValue("--muted").trim() || "#756a5d",
    accent: styles.getPropertyValue("--accent").trim() || "#de7c4a",
    accentStrong: styles.getPropertyValue("--accent-strong").trim() || "#b85d31",
    accentSoft: styles.getPropertyValue("--accent-soft").trim() || "rgba(222, 124, 74, 0.14)",
    border: styles.getPropertyValue("--border").trim() || "rgba(72, 53, 32, 0.12)"
  };
}

function drawMetaChip(context, label, x, y, colors) {
  const width = Math.ceil(context.measureText(label).width + 28);
  fillRoundedRect(context, x, y, width, 34, 17, colors.accentSoft);
  context.save();
  context.fillStyle = colors.text;
  context.fillText(label, x + 14, y + 22);
  context.restore();
  return width;
}

function getExportRows(album) {
  const rows = [];
  album.discs.forEach((disc, discIndex) => {
    if (album.discs.length > 1) {
      rows.push({ type: "disc", label: disc.name || `Disc ${discIndex + 1}` });
    }

    disc.tracks.forEach((track, trackIndex) => {
      rows.push({
        type: "track",
        number: typeof track === "string" ? trackIndex + 1 : (track.trackNumber || trackIndex + 1),
        name: getTrackName(track),
        duration: formatDuration(getTrackDuration(track)),
        explicit: isTrackExplicit(track),
        rating: getRating(`track_${album.id}_${discIndex}_${trackIndex}`),
        blocked: isInterlude(`track_${album.id}_${discIndex}_${trackIndex}`)
      });
    });
  });
  return rows;
}

function drawRatingDots(context, rating, x, y, colors) {
  const total = 5;
  for (let index = 0; index < total; index += 1) {
    const filled = rating >= index + 1;
    context.beginPath();
    context.fillStyle = filled ? colors.accentStrong : colors.border;
    context.arc(x + index * 18, y, 5, 0, Math.PI * 2);
    context.fill();
  }
}

function drawStarShape(context, centerX, centerY, outerRadius, innerRadius) {
  context.beginPath();

  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * (Math.PI / 5);
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (point === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
}

function drawCanvasStars(context, rating, x, y, size, colors) {
  const normalized = normalizeRatingToHalf(rating);
  const gap = size + 10;

  for (let index = 0; index < 5; index += 1) {
    const starX = x + index * gap;
    const starY = y;
    const fillLevel = clamp(normalized - index, 0, 1);

    context.save();
    drawStarShape(context, starX, starY, size / 2, size / 4.4);
    context.fillStyle = colors.cardStrong;
    context.strokeStyle = colors.border;
    context.lineWidth = 2;
    context.fill();
    context.stroke();
    context.restore();

    if (fillLevel > 0) {
      context.save();
      drawStarShape(context, starX, starY, size / 2, size / 4.4);
      context.clip();
      context.fillStyle = colors.accentStrong;
      context.fillRect(starX - size / 2, starY - size / 2, size * fillLevel, size);
      context.restore();
    }
  }
}

async function renderAlbumPoster(album) {
  const colors = getCanvasThemeColors();
  const coverSrc = await getExportImageUrl(album.cover);
  const coverImage = await loadImageElement(coverSrc);
  const rows = getExportRows(album);
  const width = 1600;
  const padding = 84;
  const heroHeight = 390;
  const contentHeight = rows.reduce((total, row) => total + (row.type === "disc" ? 44 : 58), 0);
  const height = Math.max(1220, padding * 2 + heroHeight + 90 + contentHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.fillStyle = colors.bg;
  context.fillRect(0, 0, width, height);

  const topGradient = context.createLinearGradient(0, 0, width, 0);
  topGradient.addColorStop(0, colors.accentSoft);
  topGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = topGradient;
  context.fillRect(0, 0, width, 220);

  fillRoundedRect(context, 48, 48, width - 96, height - 96, 34, colors.card);

  context.strokeStyle = colors.border;
  context.lineWidth = 1.5;
  drawRoundedRect(context, 48, 48, width - 96, height - 96, 34);
  context.stroke();

  const coverSize = 320;
  drawCoverImage(context, coverImage, padding, padding, coverSize, 28);

  context.fillStyle = colors.accentStrong;
  context.font = "700 24px Space Grotesk, sans-serif";
  context.fillText((getAlbumGenre(album) || getReleaseLabel(album)).toUpperCase(), padding + coverSize + 56, padding + 28);

  context.fillStyle = colors.text;
  context.font = "700 72px Space Grotesk, sans-serif";
  const titleLines = drawWrappedText(context, album.title, padding + coverSize + 56, padding + 104, width - padding * 2 - coverSize - 96, 74, 3);

  context.fillStyle = colors.muted;
  context.font = "500 32px Space Grotesk, sans-serif";
  context.fillText(album.artist, padding + coverSize + 56, padding + 100 + titleLines * 74 + 26);

  context.font = "500 24px Space Grotesk, sans-serif";
  let chipX = padding + coverSize + 56;
  const chipY = padding + 100 + titleLines * 74 + 62;
  [album.year, getAlbumGenre(album), getAlbumTrackCount(album) ? getAlbumTrackCount(album) + " tracks" : "", album.isExplicit ? "Explicit" : ""]
    .filter(Boolean)
    .forEach((label) => {
      const chipWidth = drawMetaChip(context, String(label), chipX, chipY, colors);
      chipX += chipWidth + 12;
    });

  const albumRating = normalizeRatingToHalf(getAlbumScore(album));
  context.fillStyle = colors.muted;
  context.font = "600 20px Space Grotesk, sans-serif";
  context.fillText("Rating", padding + coverSize + 56, padding + 308);
  drawCanvasStars(context, albumRating, padding + coverSize + 68, padding + 344, 24, colors);

  context.strokeStyle = colors.border;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(padding, padding + heroHeight);
  context.lineTo(width - padding, padding + heroHeight);
  context.stroke();

  context.fillStyle = colors.text;
  context.font = "700 30px Space Grotesk, sans-serif";
  context.fillText("Tracks", padding, padding + heroHeight + 48);

  let cursorY = padding + heroHeight + 94;
  rows.forEach((row) => {
    if (row.type === "disc") {
      context.fillStyle = colors.accentStrong;
      context.font = "700 20px Space Grotesk, sans-serif";
      context.fillText(row.label, padding, cursorY);
      cursorY += 34;
      return;
    }

    if (!row.blocked) {
      fillRoundedRect(context, padding, cursorY - 28, width - padding * 2, 44, 14, colors.cardStrong);
    }

    context.fillStyle = row.blocked ? colors.muted : colors.accentStrong;
    context.font = "700 17px Space Grotesk, sans-serif";
    context.fillText(String(row.number).padStart(2, "0"), padding + 18, cursorY - 2);

    context.fillStyle = colors.text;
    context.font = row.blocked ? "500 21px Space Grotesk, sans-serif" : "500 22px Space Grotesk, sans-serif";
    context.fillText(row.name, padding + 72, cursorY - 2, width - padding * 2 - 330);

    if (row.explicit) {
      fillRoundedRect(context, width - padding - 286, cursorY - 24, 32, 24, 12, colors.accentSoft);
      context.fillStyle = colors.text;
      context.font = "700 14px Space Grotesk, sans-serif";
      context.fillText("E", width - padding - 275, cursorY - 7);
    }

    context.fillStyle = colors.muted;
    context.font = "500 18px Space Grotesk, sans-serif";
    context.fillText(row.duration || "", width - padding - 210, cursorY - 2);
    drawCanvasStars(context, normalizeRatingToHalf(row.rating), width - padding - 120, cursorY - 8, 16, colors);
    cursorY += 58;
  });

  context.fillStyle = colors.muted;
  context.font = "500 18px Space Grotesk, sans-serif";
  context.fillText(album.artist + " • " + album.title, padding, height - 78);
  context.fillStyle = colors.accentStrong;
  context.font = "700 18px Space Grotesk, sans-serif";
  context.fillText("Exported from Needle", width - padding - 178, height - 78);

  return canvas;
}

async function exportAlbumAsImage(albumId, button) {
  const album = albums.find((entry) => entry.id == albumId);

  if (!album) {
    dialogManager.show("Export unavailable", "Image export is not available right now.");
    return;
  }

  const previousHtml = button ? button.innerHTML : "";
  const previousDisabled = button ? button.disabled : false;

  if (button) {
    button.disabled = true;
    button.classList.add("is-busy");
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Exporting...</span>';
  }

  try {
    const canvas = await renderAlbumPoster(album);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = sanitizeFileName(album.artist + "-" + album.title) + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    dialogManager.show("Export failed", "Could not export this album as an image.");
  } finally {
    if (button) {
      button.disabled = previousDisabled;
      button.classList.remove("is-busy");
      button.innerHTML = previousHtml;
    }
  }
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function syncPreviewButtons() {
  document.querySelectorAll(".preview-btn").forEach((button) => {
    const isPlaying = previewPlayer.isActiveTrack(button.dataset.trackKey);

    button.classList.toggle("is-playing", isPlaying);
    button.setAttribute("aria-label", isPlaying ? "Preview playing" : "Open preview player");
    button.innerHTML = isPlaying
      ? '<i class="fa-solid fa-wave-square"></i>'
      : '<i class="fa-solid fa-play"></i>';
  });
}

function pulseStar(key, value, target) {
  if (!target) return;

  const star = target.closest(".star");
  if (!star) return;

  star.classList.remove("burst");
  void star.offsetWidth;
  star.classList.add("burst");

  const rect = star.getBoundingClientRect();
  const originX = rect.left + window.scrollX + rect.width / 2;
  const originY = rect.top + window.scrollY + rect.height / 2;

  for (let index = 0; index < 7; index += 1) {
    const particle = document.createElement("span");
    const angle = (-80 + index * 26) * (Math.PI / 180);
    const distance = 24 + Math.random() * 34;
    const driftX = Math.cos(angle) * distance;
    const driftY = Math.sin(angle) * distance - 10;
    const rotation = -28 + Math.random() * 56;
    const duration = 420 + Math.round(Math.random() * 180);

    particle.className = "star-particle";
    particle.innerHTML = '<i class="fa-solid fa-star"></i>';
    particle.style.left = originX + "px";
    particle.style.top = originY + "px";
    particle.style.setProperty("--drift-x", driftX.toFixed(2) + "px");
    particle.style.setProperty("--drift-y", driftY.toFixed(2) + "px");
    particle.style.setProperty("--particle-rotate", rotation.toFixed(2) + "deg");
    particle.style.animationDuration = duration + "ms";

    document.body.appendChild(particle);
    window.setTimeout(() => particle.remove(), duration);
  }

  window.setTimeout(() => {
    star.classList.remove("burst");
  }, 420);
}

async function openTrackPreview(trackKey, button) {
  if (!button) return;

  const previewUrl = button.dataset.previewUrl;
  if (!previewUrl) return;

  await previewPlayer.open({
    key: trackKey,
    name: button.dataset.trackName || "Unknown Track",
    artist: button.dataset.trackArtist || "Unknown Artist",
    album: button.dataset.trackAlbum || "",
    cover: button.dataset.trackCover || "",
    trackUrl: button.dataset.trackUrl || "",
    previewUrl
  });
}

function saveRating(key, value) {
  localStorage.setItem(key, value);
  render();
}

function isInterlude(key) {
  return localStorage.getItem("interlude_" + key) === "true";
}

function toggleInterlude(key) {
  const current = isInterlude(key);
  localStorage.setItem("interlude_" + key, !current);
  render();
}

function getAlbumScore(album) {
  if (!album || !album.discs) return 0;

  const scores = [];
  album.discs.forEach((disc, discIndex) => {
    disc.tracks.forEach((_, trackIndex) => {
      const key = `track_${album.id}_${discIndex}_${trackIndex}`;
      if (isInterlude(key)) return;

      const rating = getRating(key);
      if (rating > 0) scores.push(rating);
    });
  });

  if (!scores.length) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function resetAlbumRating(albumId) {
  dialogManager.show('Reset Ratings', 'Reset all ratings for this album?').then((confirmed) => {
    if (!confirmed) return;

    const album = albums.find((a) => a.id == albumId);
    if (!album) return;

    album.discs.forEach((disc, d) => {
      disc.tracks.forEach((_, t) => {
        const key = `track_${albumId}_${d}_${t}`;
        localStorage.removeItem(key);
        localStorage.removeItem('interlude_' + key);
      });
    });

    render();
  });
}

function generateStars(key, rating, readonly = false) {
  const displayRating = readonly ? normalizeRatingToHalf(rating) : rating;
  const wrapperClass = `stars${readonly ? ' readonly' : ''}`;
  let html = `<div class="${wrapperClass}">`;

  for (let i = 1; i <= 5; i++) {
    const full = displayRating >= i;
    const half = displayRating >= i - 0.5 && displayRating < i;

    let icon;
    if (full) icon = '<i class="fa-solid fa-star"></i>';
    else if (half) icon = '<i class="fa-solid fa-star-half-stroke"></i>';
    else icon = '<i class="fa-regular fa-star"></i>';

    html += `<span class="star">${icon}`;

    if (!readonly) {
      html += `<button class="hit" onclick="pulseStar('${key}', ${i - 0.5}, this); saveRating('${key}', ${i - 0.5})" aria-label="rate ${i - 0.5}"></button>`;
      html += `<button class="hit right" onclick="pulseStar('${key}', ${i}, this); saveRating('${key}', ${i})" aria-label="rate ${i}"></button>`;
    }

    html += '</span>';
  }

  html += '</div>';
  return html;
}

function getAlbumStats(album) {
  let total = 0;
  let count = 0;

  album.discs.forEach((disc, d) => {
    disc.tracks.forEach((_, t) => {
      const key = `track_${album.id}_${d}_${t}`;
      if (isInterlude(key)) return;

      const rating = getRating(key);
      if (rating > 0) {
        total += rating;
        count++;
      }
    });
  });

  return { avg: count ? total / count : 0, count };
}

function highlightMatch(text, query) {
  const q = query.trim();
  if (!q) return text;

  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return text;

  return text.slice(0, index) + `<mark>${text.slice(index, index + q.length)}</mark>` + text.slice(index + q.length);
}

function getTruncatedTrackHtml(trackName) {
  const maxLength = 35;
  if (trackName.length > maxLength) {
    return `<span class="track-title truncated" data-full-title="${escapeAttribute(trackName)}">${trackName}</span>`;
  }
  return `<span class="track-title">${trackName}</span>`;
}

function render(searchQuery = searchInput ? searchInput.value : "") {
  const query = searchQuery.trim().toLowerCase();

  if (grid) {
    grid.innerHTML = "";

    const tracksToRender = Array.isArray(homeTracks) ? homeTracks : [];

    tracksToRender.forEach((track) => {
      const matchesQuery = !query
        || track.name.toLowerCase().includes(query)
        || track.artist.toLowerCase().includes(query)
        || (track.album || "").toLowerCase().includes(query)
        || (track.genre || "").toLowerCase().includes(query);

      if (!matchesQuery) return;

      const key = getHomeTrackKey(track);
      const sourceAlbum = getAlbumByCollectionId(track.collectionId);
      const albumRating = sourceAlbum ? getAlbumScore(sourceAlbum) : 0;
      const releaseLabel = getReleaseLabel(sourceAlbum || track);
      const div = document.createElement("div");
      div.className = "album-card home-track-card";
      div.innerHTML = `
    <div class="album-art-wrap">
      <img src="${track.cover}" alt="${escapeAttribute(track.album || track.name)} cover">
    </div>
    <div class="album-card-body">
      <div class="album-card-copy">
        <h3>${query ? highlightMatch(track.name, searchQuery) : track.name}</h3>
        <p>${query ? highlightMatch(track.artist, searchQuery) : track.artist}${track.album ? ` • ${query ? highlightMatch(track.album, searchQuery) : track.album}` : ""}</p>
      </div>
      <div class="album-card-meta">${getHomeTrackMetaChips(track)}</div>
      <div class="score score-row home-track-actions">
        <span class="score-label home-track-rating">${albumRating ? generateStars("album_display_" + (sourceAlbum ? sourceAlbum.id : key), albumRating, true) : "Not rated"}</span>
        <div class="home-track-buttons">
          ${track.previewUrl ? `<button class="preview-btn" data-track-key="${key}" data-preview-url="${escapeAttribute(track.previewUrl)}" data-track-name="${escapeAttribute(track.name)}" data-track-artist="${escapeAttribute(track.artist)}" data-track-album="${escapeAttribute(track.album || "")}" data-track-cover="${escapeAttribute(track.cover || "")}" data-track-url="${escapeAttribute(track.trackUrl || "")}" aria-label="Open preview player" onclick="openTrackPreview('${key}', this)"><i class="fa-solid fa-play"></i></button>` : ""}
          ${track.collectionId ? `<a class="open-btn home-icon-btn" href="album.html?id=${track.collectionId}" aria-label="Open ${escapeAttribute(releaseLabel.toLowerCase())}"><i class="fa-solid fa-record-vinyl"></i></a>` : (track.trackUrl ? `<a class="open-btn home-icon-btn" href="${track.trackUrl}" target="_blank" rel="noreferrer" aria-label="Open track"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : "")}
        </div>
      </div>
    </div>
    `;

      grid.appendChild(div);
    });

    if (!grid.children.length) {
      grid.innerHTML = `<p style="opacity:.7">No songs found.</p>`;
    }

    if (!page) {
      syncPreviewButtons();
      renderSearchPagination();
      refreshAlbumTheme();
      return;
    }

    albums.forEach((album) => {
      let matchLabel = "";

      const albumTitleMatch = album.title.toLowerCase().includes(query);
      const artistMatch = album.artist.toLowerCase().includes(query);
      const genreMatch = getAlbumGenre(album).toLowerCase().includes(query);

      if (albumTitleMatch) {
        matchLabel = `Matched ${getReleaseLabel(album).toLowerCase()} title`;
      } else if (artistMatch) {
        matchLabel = "Matched artist";
      } else if (genreMatch) {
        matchLabel = "Matched genre";
      } else {
        for (let d = 0; d < album.discs.length; d++) {
          for (let t = 0; t < album.discs[d].tracks.length; t++) {
            const track = album.discs[d].tracks[t];
            const trackName = getTrackName(track);
            const key = `track_${album.id}_${d}_${t}`;
            if (isInterlude(key)) continue;

            if (trackName.toLowerCase().includes(query)) {
              matchLabel = `Matched track: "${trackName}"`;
              break;
            }
          }
          if (matchLabel) break;
        }
      }

      if (query && !matchLabel) return;

      const rating = getAlbumScore(album);
      const div = document.createElement("div");
      div.className = "album-card";
      div.innerHTML = `
    <div class="album-art-wrap">
      <img src="${album.cover}">
    </div>
    <div class="album-card-body">
      <div class="album-card-copy">
        <h3>${query ? highlightMatch(album.title, searchQuery) : album.title}</h3>
        <p>${query ? highlightMatch(album.artist, searchQuery) : album.artist}</p>
      </div>
      <div class="album-card-meta">${getAlbumMetaChips(album)}</div>
      ${query && matchLabel ? `<div class="match-label">${matchLabel}</div>` : ""}
      <div class="score score-row">
        <span class="score-label">${rating ? generateStars("album_display_" + album.id, rating, true) : "Not rated"}</span>
      </div>
      <a class="open-btn" href="album.html?id=${album.id}">Open ${getReleaseLabel(album)}</a>
    </div>
    `;

      grid.appendChild(div);
    });
  }

  if (page) {
    const id = new URLSearchParams(window.location.search).get("id");
    const album = albums.find((a) => a.id == id);

    if (!album) {
      page.innerHTML = '<p style="opacity:.7">Album not found.</p>';
      return;
    }

    const rating = getAlbumScore(album);

    page.innerHTML = `
    <div class="album-view">
    <div class="album-hero">
      <img src="${album.cover}">

      <div class="album-right">
      <div class="album-kicker">${getAlbumGenre(album) || getReleaseLabel(album)}</div>
      <div class="album-meta">
        <h2>${album.title}</h2>
        <p>${album.artist} • ${album.year || ""}</p>
        <div class="album-meta-row">
          ${getAlbumMetaChips(album)}
          ${album.isExplicit ? '<span class="meta-chip explicit-chip">Explicit</span>' : ""}
        </div>
        <div class="album-links">${getAlbumLinkButtons(album)}<button class="meta-link secondary export-btn" onclick="exportAlbumAsImage('${album.id}', this)"><i class="fa-solid fa-image"></i><span>Export as Image</span></button></div>

        <div class="album-rating">
        <h3>Rating</h3>
        ${generateStars("album_display_" + album.id, rating, true)}

          <button class="reset-rating" onclick="resetAlbumRating('${album.id}')" aria-label="Reset ratings">
          <i class="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        </div>
      </div>
    </div>

    <h3>Tracks</h3>
    <div class="tracklist">
      ${
      album.discs.length === 1
        ? album.discs[0].tracks.map((track, trackIndex) => {
          const trackName = getTrackName(track);
          const previewUrl = getTrackPreviewUrl(track);
          const key = `track_${album.id}_0_${trackIndex}`;
          const blocked = isInterlude(key);

          return `
          <div class="track ${blocked ? "is-interlude" : ""}">
            <div class="track-main">
              <div class="track-line">
                <span class="track-number">${trackIndex + 1}</span>
                ${getTruncatedTrackHtml(trackName)}
                ${isTrackExplicit(track) ? '<span class="track-pill">E</span>' : ""}
              </div>
              <div class="track-subline">
                ${getTrackDuration(track) ? `<span>${formatDuration(getTrackDuration(track))}</span>` : ""}
              </div>
            </div>
            <div class="track-actions">
              ${blocked ? "" : generateStars(key, getRating(key))}
              ${previewUrl ? `<button class="preview-btn" data-track-key="${key}" data-preview-url="${escapeAttribute(previewUrl)}" data-track-name="${escapeAttribute(trackName)}" data-track-artist="${escapeAttribute(album.artist)}" data-track-album="${escapeAttribute(album.title)}" data-track-cover="${escapeAttribute(album.cover)}" data-track-url="${escapeAttribute(track.trackUrl || "")}" aria-label="Open preview player" onclick="openTrackPreview('${key}', this)"><i class="fa-solid fa-play"></i></button>` : ""}
              <button class="interlude-toggle" onclick="toggleInterlude('${key}')">
              <i class="fa-solid fa-ban"></i>
              </button>
            </div>
          </div>
          `;
        }).join("")
        : album.discs.map((disc, discIndex) => `
          <div class="disc">
          <h4>${disc.name}</h4>
          <div class="tracklist">
            ${disc.tracks.map((track, trackIndex) => {
            const trackName = getTrackName(track);
            const previewUrl = getTrackPreviewUrl(track);
            const key = `track_${album.id}_${discIndex}_${trackIndex}`;
            const blocked = isInterlude(key);

            return `
              <div class="track ${blocked ? "is-interlude" : ""}">
              <div class="track-main">
                <div class="track-line">
                  <span class="track-number">${track.trackNumber || trackIndex + 1}</span>
                  ${getTruncatedTrackHtml(trackName)}
                  ${isTrackExplicit(track) ? '<span class="track-pill">E</span>' : ""}
                </div>
                <div class="track-subline">
                  ${getTrackDuration(track) ? `<span>${formatDuration(getTrackDuration(track))}</span>` : ""}
                </div>
              </div>
              <div class="track-actions">
                ${blocked ? "" : generateStars(key, getRating(key))}
                ${previewUrl ? `<button class="preview-btn" data-track-key="${key}" data-preview-url="${escapeAttribute(previewUrl)}" data-track-name="${escapeAttribute(trackName)}" data-track-artist="${escapeAttribute(album.artist)}" data-track-album="${escapeAttribute(album.title)}" data-track-cover="${escapeAttribute(album.cover)}" data-track-url="${escapeAttribute(track.trackUrl || "")}" aria-label="Open preview player" onclick="openTrackPreview('${key}', this)"><i class="fa-solid fa-play"></i></button>` : ""}
                <button class="interlude-toggle" onclick="toggleInterlude('${key}')">
                  <i class="fa-solid fa-ban"></i>
                </button>
              </div>
              </div>
            `;
            }).join("")}
          </div>
          </div>
        `).join("")
      }
    </div>
    </div>
  `;
  }

  syncPreviewButtons();
  refreshAlbumTheme();
}

async function ensureAlbumsLoaded() {
  if (window.needleData && window.needleData.ready) {
    await window.needleData.ready;
    albums = Array.isArray(window.needleData.albums) ? window.needleData.albums : [];
    homeTracks = Array.isArray(window.needleData.topSongs) ? window.needleData.topSongs.slice() : [];
    await ensureHomeAlbumsLoaded(homeTracks);
    return;
  }

  albums = Array.isArray(window.albums) ? window.albums : [];
  homeTracks = Array.isArray(window.topSongs) ? window.topSongs : [];
}

async function ensureHomeAlbumsLoaded(tracks = homeTracks) {
  if (!grid || page || !window.needleData || typeof window.needleData.fetchAlbumById !== "function") {
    return;
  }

  const missingIds = Array.from(new Set(
    (Array.isArray(tracks) ? tracks : [])
      .map((track) => Number(track && track.collectionId))
      .filter((collectionId) => collectionId && !getAlbumByCollectionId(collectionId))
  ));

  if (!missingIds.length) {
    return;
  }

  await Promise.all(
    missingIds.map(async (collectionId) => {
      try {
        await window.needleData.fetchAlbumById(collectionId);
      } catch (error) {
        return null;
      }
      return null;
    })
  );

  albums = Array.isArray(window.needleData.albums) ? window.needleData.albums : albums;
}

async function ensurePageAlbumLoaded() {
  if (!page || !window.needleData || typeof window.needleData.fetchAlbumById !== "function") {
    return;
  }

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || albums.some((album) => album.id == id)) {
    return;
  }

  const album = await window.needleData.fetchAlbumById(id);
  if (!album || albums.some((existingAlbum) => existingAlbum.id === album.id)) {
    return;
  }

  albums = albums.concat(album);
}

async function initPlayr() {
  await ensureAlbumsLoaded();
  await ensurePageAlbumLoaded();
  render();
  syncPreviewButtons();
}

window.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("page-enter");
  });
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link || link.target === "_blank") return;
  if (!link.href || link.origin !== location.origin) return;

  e.preventDefault();
  document.body.classList.add("page-exit");
  setTimeout(() => {
    window.location.href = link.href;
  }, 250);
});

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initPlayr);
} else {
  initPlayr();
}