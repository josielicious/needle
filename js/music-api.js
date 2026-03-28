(function () {
  const FEED_LIMIT = 20;
  const SEARCH_LIMIT = 25;
  const SEARCH_SONG_FETCH_LIMIT = 200;
  const FEED_COUNTRY = "us";
  const COVER_SIZE_RX = /\/[0-9]+x[0-9]+bb\./;

  function toCover(url) {
    if (!url || typeof url !== "string") return "";
    return url.replace(COVER_SIZE_RX, "/600x600bb.");
  }

  function normalizeReleaseType(value, fallback = "Album") {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return fallback;
    if (text.includes("single")) return "Single";
    if (text === "ep" || text.includes("extended play") || /\bep\b/.test(text)) return "EP";
    if (text.includes("album")) return "Album";
    return fallback;
  }

  function canUseJsonp(url) {
    return /^https:\/\/itunes\.apple\.com\//.test(String(url || ""));
  }

  function appendQueryParam(url, key, value) {
    return url + (url.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(value);
  }

  function fetchJsonp(url) {
    return new Promise((resolve, reject) => {
      const callbackName = "needleJsonp_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      let settled = false;

      function cleanup() {
        settled = true;
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        if (settled) return;
        cleanup();
        reject(new Error("JSONP request failed."));
      };

      script.src = appendQueryParam(url, "callback", callbackName);
      document.head.appendChild(script);
    });
  }

  async function fetchJson(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("API request failed: " + response.status + " " + response.statusText);
      }
      return response.json();
    } catch (error) {
      if (!canUseJsonp(url)) {
        throw error;
      }

      return fetchJsonp(url);
    }
  }

  async function fetchTopAlbums(limit, country) {
    const url = "https://itunes.apple.com/" + country + "/rss/topalbums/limit=" + limit + "/json";
    const payload = await fetchJson(url);
    const entries = (payload && payload.feed && payload.feed.entry) || [];

    return entries.map((entry, index) => {
      const collectionId = entry && entry.id && entry.id.attributes ? Number(entry.id.attributes["im:id"]) : null;
      const title = entry && entry["im:name"] ? entry["im:name"].label : "Unknown Album";
      const artist = entry && entry["im:artist"] ? entry["im:artist"].label : "Unknown Artist";
      const yearLabel = entry && entry["im:releaseDate"] ? entry["im:releaseDate"].label : "";
      const year = yearLabel ? Number(String(yearLabel).slice(0, 4)) : null;
      const images = (entry && entry["im:image"]) || [];
      const cover = images.length ? toCover(images[images.length - 1].label) : "";

      return {
        id: collectionId || index,
        collectionId,
        title,
        artist,
        year,
        cover,
        releaseType: "Album",
        discs: [{ name: "Disc 1", tracks: [] }]
      };
    });
  }

  function normalizeSongResult(result, fallback = {}) {
    const trackId = result && result.trackId ? Number(result.trackId) : null;
    const collectionId = result && result.collectionId ? Number(result.collectionId) : null;

    if (!trackId) return null;

    return {
      id: trackId,
      trackId,
      collectionId,
      rank: fallback.rank || 0,
      name: result.trackName || fallback.name || "Unknown Track",
      artist: result.artistName || fallback.artist || "Unknown Artist",
      album: result.collectionName || fallback.album || "Unknown Album",
      releaseType: normalizeReleaseType(result.collectionType || fallback.releaseType, "Album"),
      cover: toCover(result.artworkUrl100 || result.artworkUrl60 || result.artworkUrl30 || fallback.cover || ""),
      genre: result.primaryGenreName || fallback.genre || "",
      previewUrl: result.previewUrl || fallback.previewUrl || "",
      durationMs: result.trackTimeMillis || fallback.durationMs || 0,
      explicit: result.trackExplicitness === "explicit",
      trackUrl: result.trackViewUrl || fallback.trackUrl || "",
      collectionUrl: result.collectionViewUrl || fallback.collectionUrl || "",
      artistUrl: result.artistViewUrl || fallback.artistUrl || "",
      year: result.releaseDate ? Number(String(result.releaseDate).slice(0, 4)) : (fallback.year || null)
    };
  }

  async function fetchTopSongs(limit, country) {
    const url = "https://itunes.apple.com/" + country + "/rss/topsongs/limit=" + limit + "/json";
    const payload = await fetchJson(url);
    const entries = (payload && payload.feed && payload.feed.entry) || [];
    const songSeeds = entries.map((entry, index) => ({
      rank: index + 1,
      trackId: entry && entry.id && entry.id.attributes ? Number(entry.id.attributes["im:id"]) : null,
      name: entry && entry["im:name"] ? entry["im:name"].label : "Unknown Track",
      artist: entry && entry["im:artist"] ? entry["im:artist"].label : "Unknown Artist",
      cover: entry && entry["im:image"] && entry["im:image"].length
        ? entry["im:image"][entry["im:image"].length - 1].label
        : "",
      genre: entry && entry.category && entry.category.attributes ? entry.category.attributes.term : ""
    })).filter((entry) => entry.trackId);

    if (!songSeeds.length) {
      return [];
    }

    const lookupUrl = "https://itunes.apple.com/lookup?id=" + songSeeds.map((entry) => entry.trackId).join(",");
    const lookupPayload = await fetchJson(lookupUrl);
    const lookupResults = (lookupPayload && lookupPayload.results) || [];
    const lookupByTrackId = new Map();

    lookupResults.forEach((item) => {
      if (item && item.wrapperType === "track" && item.kind === "song" && item.trackId) {
        lookupByTrackId.set(Number(item.trackId), item);
      }
    });

    return songSeeds
      .map((entry) => normalizeSongResult(lookupByTrackId.get(entry.trackId) || {}, entry))
      .filter(Boolean);
  }

  function mergeUniqueAlbums(baseAlbums, incomingAlbums) {
    const merged = [];
    const seen = new Set();

    baseAlbums.concat(incomingAlbums).forEach((album) => {
      if (!album || !album.id || seen.has(album.id)) return;
      seen.add(album.id);
      merged.push(album);
    });

    return merged;
  }

  function normalizeSearchAlbum(result) {
    const collectionId = result && result.collectionId ? Number(result.collectionId) : null;
    const yearLabel = result && result.releaseDate ? result.releaseDate : "";

    if (!collectionId) return null;

    return {
      id: collectionId,
      collectionId,
      title: result.collectionName || result.trackName || "Unknown Album",
      artist: result.artistName || "Unknown Artist",
      year: yearLabel ? Number(String(yearLabel).slice(0, 4)) : null,
      cover: toCover(result.artworkUrl100 || result.artworkUrl60 || result.artworkUrl30 || ""),
      releaseType: normalizeReleaseType(result.collectionType, "Album"),
      genre: result.primaryGenreName || "",
      trackCount: result.trackCount || 0,
      releaseDate: result.releaseDate || "",
      collectionUrl: result.collectionViewUrl || "",
      artistUrl: result.artistViewUrl || "",
      isExplicit: result.collectionExplicitness === "explicit",
      discs: [{ name: "Disc 1", tracks: [] }]
    };
  }

  async function fetchSearchAlbums(query, limit) {
    const term = encodeURIComponent(query);
    const albumUrl = "https://itunes.apple.com/search?media=music&entity=album&limit=" + limit + "&term=" + term;
    const songUrl = "https://itunes.apple.com/search?media=music&entity=song&limit=" + limit + "&term=" + term;

    const [albumPayload, songPayload] = await Promise.all([fetchJson(albumUrl), fetchJson(songUrl)]);
    const albumResults = (albumPayload && albumPayload.results) || [];
    const songResults = (songPayload && songPayload.results) || [];

    const uniqueAlbums = mergeUniqueAlbums(
      [],
      albumResults.concat(songResults).map(normalizeSearchAlbum).filter(Boolean)
    ).slice(0, limit);

    return Promise.all(
      uniqueAlbums.map(async (album) => {
        try {
          return await fetchTracksForAlbum(album);
        } catch (error) {
          return album;
        }
      })
    );
  }

  async function fetchSearchSongs(query, limit) {
    const term = encodeURIComponent(query);
    const songUrl = "https://itunes.apple.com/search?media=music&entity=song&limit=" + limit + "&term=" + term;
    const payload = await fetchJson(songUrl);
    const results = (payload && payload.results) || [];

    return results
      .map((result, index) => normalizeSongResult(result, { rank: index + 1 }))
      .filter(Boolean);
  }

  async function fetchTracksForAlbum(album) {
    if (!album.collectionId) return album;

    const lookupUrl = "https://itunes.apple.com/lookup?id=" + album.collectionId + "&entity=song&limit=200";
    const payload = await fetchJson(lookupUrl);
    const results = (payload && payload.results) || [];
    const collection = results.find((item) => item.wrapperType === "collection") || {};
    const yearLabel = collection.releaseDate || "";

    const tracks = results
      .filter((item) => item.wrapperType === "track" && item.kind === "song")
      .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
      .map((item) => ({
        name: item.trackName,
        previewUrl: item.previewUrl || "",
        durationMs: item.trackTimeMillis || 0,
        trackNumber: item.trackNumber || 0,
        explicit: item.trackExplicitness === "explicit",
        trackUrl: item.trackViewUrl || ""
      }))
      .filter((track) => track.name);

    return {
      id: album.id || album.collectionId,
      collectionId: album.collectionId,
      title: album.title || collection.collectionName || "Unknown Album",
      artist: album.artist || collection.artistName || "Unknown Artist",
      year: album.year || (yearLabel ? Number(String(yearLabel).slice(0, 4)) : null),
      cover: album.cover || toCover(collection.artworkUrl100 || collection.artworkUrl60 || collection.artworkUrl30 || ""),
      releaseType: album.releaseType || normalizeReleaseType(collection.collectionType, "Album"),
      genre: album.genre || collection.primaryGenreName || "",
      trackCount: album.trackCount || collection.trackCount || tracks.length,
      releaseDate: album.releaseDate || collection.releaseDate || "",
      collectionUrl: album.collectionUrl || collection.collectionViewUrl || "",
      artistUrl: album.artistUrl || collection.artistViewUrl || "",
      isExplicit: typeof album.isExplicit === "boolean" ? album.isExplicit : collection.collectionExplicitness === "explicit",
      discs: [{ name: "Disc 1", tracks }]
    };
  }

  async function fetchAlbumsForArtistName(artistName, limit = 200) {
    if (!artistName) return [];
    const term = encodeURIComponent(artistName);
    const artistSearchUrl = "https://itunes.apple.com/search?media=music&entity=musicArtist&limit=5&term=" + term;
    try {
      const artistPayload = await fetchJson(artistSearchUrl);
      const artistResults = (artistPayload && artistPayload.results) || [];
      if (!artistResults.length) return [];

      // pick the best match (case-insensitive exact name first, else first result)
      const normalized = String(artistName || "").trim().toLowerCase();
      let chosen = artistResults.find((a) => String(a.artistName || "").toLowerCase() === normalized) || artistResults[0];
      const artistId = chosen && (chosen.artistId || chosen.artistID || chosen.id);
      if (!artistId) return [];

      const lookupUrl = "https://itunes.apple.com/lookup?id=" + artistId + "&entity=album&limit=" + Math.max(1, Number(limit || 200));
      const lookupPayload = await fetchJson(lookupUrl);
      const lookupResults = (lookupPayload && lookupPayload.results) || [];

      const collections = lookupResults.filter((item) => item && item.wrapperType === "collection");
      const albums = collections.map((c) => normalizeSearchAlbum(c)).filter(Boolean);
      return albums;
    } catch (e) {
      return [];
    }
  }

  async function loadAlbumsFromApi() {
    const topAlbums = await fetchTopAlbums(FEED_LIMIT, FEED_COUNTRY);

    const withTracks = await Promise.all(
      topAlbums.map(async (album) => {
        try {
          return await fetchTracksForAlbum(album);
        } catch (error) {
          return {
            id: album.id,
            collectionId: album.collectionId,
            title: album.title,
            artist: album.artist,
            year: album.year,
            cover: album.cover,
            releaseType: album.releaseType || "Album",
            discs: [{ name: "Disc 1", tracks: [] }]
          };
        }
      })
    );

    return withTracks;
  }

  const state = {
    albums: [],
    topAlbums: [],
    topSongs: [],
    ready: null,
    error: null,
    searchCache: new Map(),
    songSearchCache: new Map(),
    searchSequence: 0
  };

  state.searchAlbums = async (query) => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const searchSequence = ++state.searchSequence;

    if (!normalizedQuery) {
      const topAlbums = state.topAlbums.slice();

      if (searchSequence === state.searchSequence) {
        state.albums = topAlbums;
        window.albums = topAlbums;
      }

      return topAlbums;
    }

    if (!state.searchCache.has(normalizedQuery)) {
      state.searchCache.set(
        normalizedQuery,
        fetchSearchAlbums(normalizedQuery, SEARCH_LIMIT).catch(() => [])
      );
    }

    const searchAlbums = await state.searchCache.get(normalizedQuery);
    const mergedAlbums = mergeUniqueAlbums(state.topAlbums, searchAlbums);

    if (searchSequence === state.searchSequence) {
      state.albums = mergedAlbums;
      window.albums = mergedAlbums;
    }

    return mergedAlbums;
  };

  state.fetchAlbumsForArtistName = async (artistName, limit) => {
    return fetchAlbumsForArtistName(artistName, limit).catch(() => []);
  };

  state.fetchAlbumById = async (albumId) => {
    const numericAlbumId = Number(albumId);
    if (!numericAlbumId) return null;

    const existingAlbum = state.albums.find((album) => album.id === numericAlbumId)
      || state.topAlbums.find((album) => album.id === numericAlbumId);

    if (existingAlbum && existingAlbum.discs && existingAlbum.discs.some((disc) => disc.tracks.length)) {
      return existingAlbum;
    }

    const fetchedAlbum = await fetchTracksForAlbum({
      id: numericAlbumId,
      collectionId: numericAlbumId,
      title: existingAlbum ? existingAlbum.title : "",
      artist: existingAlbum ? existingAlbum.artist : "",
      year: existingAlbum ? existingAlbum.year : null,
      cover: existingAlbum ? existingAlbum.cover : "",
      discs: [{ name: "Disc 1", tracks: [] }]
    });

    state.albums = mergeUniqueAlbums(state.albums, [fetchedAlbum]);
    window.albums = state.albums;

    return fetchedAlbum;
  };

  state.searchSongs = async (query, options = {}) => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Number(options.pageSize) || 12);

    if (!normalizedQuery) {
      const songs = state.topSongs.slice();

      return {
        items: songs,
        page: 1,
        pageSize,
        total: songs.length,
        hasMore: false
      };
    }

    if (!state.songSearchCache.has(normalizedQuery)) {
      state.songSearchCache.set(
        normalizedQuery,
        fetchSearchSongs(normalizedQuery, SEARCH_SONG_FETCH_LIMIT).catch(() => [])
      );
    }

    const songs = await state.songSearchCache.get(normalizedQuery);
    const allSongs = Array.isArray(songs) ? songs : [];
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: allSongs.slice(start, end),
      page,
      pageSize,
      total: allSongs.length,
      hasMore: end < allSongs.length
    };
  };

  state.ready = Promise.all([loadAlbumsFromApi(), fetchTopSongs(FEED_LIMIT, FEED_COUNTRY)])
    .then(([albums, songs]) => {
      state.topAlbums = albums;
      state.albums = albums.slice();
      state.topSongs = Array.isArray(songs) ? songs : [];
      window.albums = state.albums;
      window.topSongs = state.topSongs;
      return state.albums;
    })
    .catch((error) => {
      state.error = error;
      state.topAlbums = Array.isArray(window.albums) ? window.albums : [];
      state.albums = state.topAlbums.slice();
      state.topSongs = Array.isArray(window.topSongs) ? window.topSongs : [];
      window.topSongs = state.topSongs;
      return state.albums;
    });

  window.needleData = state;
})();
