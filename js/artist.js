(function () {
  const LASTFM_API_KEY = '';

  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || d.innerText || '';
  }

  function truncate(text, max) {
    if (!text) return '';
    return text.length > max ? text.slice(0, max).trim() + '…' : text;
  }

  async function fetchLastFmArtist(artist) {
    if (!artist || !LASTFM_API_KEY) return null;
    const url = 'https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=' + encodeURIComponent(artist) + '&api_key=' + LASTFM_API_KEY + '&format=json';
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.artist ? json.artist : null;
    } catch (e) {
      return null;
    }
  }

  function pickArtistImage(artistObj) {
    if (!artistObj || !Array.isArray(artistObj.image)) return '';
    const images = artistObj.image || [];
    const mega = images.find((i) => i && i.size === 'mega' && i['#text']);
    const extra = images.find((i) => i && i.size === 'extralarge' && i['#text']);
    const fallback = images.slice().reverse().find((i) => i && i['#text']);
    return (mega && mega['#text']) || (extra && extra['#text']) || (fallback && fallback['#text']) || '';
  }

  async function main() {
    const container = document.getElementById('artist-page');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const artistName = (params.get('name') || '').trim();
    if (!artistName) {
      container.innerHTML = '<p style="opacity:.7">No artist specified.</p>';
      return;
    }

    container.innerHTML = '<p style="opacity:.7">Loading artist…</p>';

    if (window.needleData && window.needleData.ready) {
      try { await window.needleData.ready; } catch (e) { /* ignore */ }
    }

    const [lastfmInfo, albumsRes, songsRes] = await Promise.all([
      fetchLastFmArtist(artistName),
      (window.needleData && typeof window.needleData.searchAlbums === 'function') ? window.needleData.searchAlbums(artistName).catch(() => []) : [],
      (window.needleData && typeof window.needleData.searchSongs === 'function') ? window.needleData.searchSongs(artistName, { page: 1, pageSize: 200 }).catch(() => ({ items: [] })) : { items: [] }
    ]);

    const albumCandidates = Array.isArray(albumsRes) ? albumsRes : [];
    const normalized = artistName.toLowerCase();

    const artistAlbums = albumCandidates.filter((a) => a && String(a.artist || '').toLowerCase().includes(normalized));
    const uniqueAlbumsMap = new Map();
    artistAlbums.forEach((a) => {
      const key = a.collectionId || a.id || a.title;
      if (!key) return;
      if (!uniqueAlbumsMap.has(key)) uniqueAlbumsMap.set(key, a);
    });

    // fallback: query iTunes lookup by artistId via needleData if available
    if (window.needleData && typeof window.needleData.fetchAlbumsForArtistName === 'function') {
      try {
        const fallback = await window.needleData.fetchAlbumsForArtistName(artistName, 200);
        (Array.isArray(fallback) ? fallback : []).forEach((a) => {
          const key = a.collectionId || a.id || a.title;
          if (!key) return;
          if (!uniqueAlbumsMap.has(key)) uniqueAlbumsMap.set(key, a);
        });
      } catch (e) {
        // ignore fallback errors
      }
    }

    const uniqueAlbums = Array.from(uniqueAlbumsMap.values()).slice(0, 12);

    const songItems = Array.isArray(songsRes.items) ? songsRes.items : (Array.isArray(songsRes) ? songsRes : []);
    const artistSongs = [];
    const seen = new Set();
    songItems.forEach((s) => {
      if (!s || !s.artist) return;
      const artistMatch = String(s.artist).toLowerCase();
      if (!artistMatch.includes(normalized)) return;
      const id = s.trackId || s.id || s.name;
      if (seen.has(id)) return;
      seen.add(id);
      artistSongs.push(s);
    });

    artistSongs.sort((a, b) => (b.rank || 0) - (a.rank || 0));

    const image = pickArtistImage(lastfmInfo) || (uniqueAlbums[0] ? uniqueAlbums[0].cover : '');
    const bio = lastfmInfo && lastfmInfo.bio ? stripHtml(lastfmInfo.bio.summary || lastfmInfo.bio.content || '') : '';
    // build artist page using existing album-view/layout styles for consistency
    const externalArtistUrl = (uniqueAlbums[0] && (uniqueAlbums[0].artistUrl || uniqueAlbums[0].collectionUrl)) || '';
    const artistLinks = [];
    if (externalArtistUrl) {
      artistLinks.push(`<a class="meta-link" href="${externalArtistUrl}" target="_blank" rel="noreferrer">Open in iTunes</a>`);
    }
    artistLinks.push(`<a class="meta-link secondary" href="https://www.last.fm/music/${encodeURIComponent(artistName)}" target="_blank" rel="noreferrer">Open on Last.fm</a>`);

    let html = '';
    html += `<div class="album-view">
      <div class="album-hero">
        <img src="${escapeAttribute(image)}" alt="${escapeAttribute(artistName)}">

        <div class="album-right">
          <div class="album-kicker">Artist</div>
          <div class="album-meta">
            <h2>${escapeAttribute(artistName)}</h2>
            <p>${uniqueAlbums.length ? escapeAttribute(uniqueAlbums[0].artist) : ''}</p>
            <div class="album-meta-row">
              <span class="meta-chip">${uniqueAlbums.length} albums</span>
              ${artistSongs.length ? `<span class="meta-chip">${artistSongs.length} tracks</span>` : ''}
            </div>
            <div class="album-links">${artistLinks.join('')}</div>
            ${bio ? `<p class="artist-bio">${escapeAttribute(truncate(bio, 800))}</p>` : ''}
          </div>
        </div>
      </div>

      ${artistSongs.length ? `<h3>Top Tracks</h3><div class="tracklist">` : ''}
    `;

    if (artistSongs.length) {
      artistSongs.slice(0, 10).forEach((track, i) => {
        const trackName = getTrackName(track);
        const previewUrl = getTrackPreviewUrl(track);
        const duration = formatDuration(getTrackDuration(track));
        const key = `artist_${i}_${track.trackId || track.id || trackName}`;
        const explicit = isTrackExplicit(track);

        html += `
          <div class="track" style="--fade-index:${i % 20};">
            <div class="track-main">
              <div class="track-line">
                <span class="track-number">${i + 1}</span>
                ${getTruncatedTrackHtml(trackName)}
                ${explicit ? '<span class="track-pill">E</span>' : ''}
              </div>
              <div class="track-subline">${duration ? duration : ''}</div>
            </div>
            <div class="track-actions">
              ${previewUrl ? `<button class="preview-btn" data-track-key="${escapeAttribute(key)}" data-preview-url="${escapeAttribute(previewUrl)}" data-track-name="${escapeAttribute(trackName)}" data-track-artist="${escapeAttribute(track.artist || artistName)}" data-track-album="${escapeAttribute(track.album || '')}" data-track-cover="${escapeAttribute(track.cover || '')}" onclick="openTrackPreview('${escapeAttribute(key)}', this)"><i class="fa-solid fa-play"></i></button>` : (track.trackUrl ? `<a class="meta-link" href="${escapeAttribute(track.trackUrl)}" target="_blank" rel="noreferrer">Open Track</a>` : '')}
            </div>
          </div>`;
      });

      html += `</div>`;
    }

    if (uniqueAlbums.length) {
      html += `<h3>Albums</h3><div class="album-grid">`;
      uniqueAlbums.forEach((a) => {
        const href = a.collectionId || a.id ? `album.html?id=${a.collectionId || a.id}` : '#';
        html += `<a class="album-card small" href="${href}">
          <div class="album-art-wrap"><img src="${escapeAttribute(a.cover)}" alt="${escapeAttribute(a.title || '')} cover"></div>
          <div class="album-card-body">
            <div class="album-card-copy">
              <h4>${escapeAttribute(a.title || '')}</h4>
              <p>${escapeAttribute(a.artist || '')}</p>
            </div>
          </div>
        </a>`;
      });
      html += `</div>`;
    }

    html += `</div>`; // close album-view

    container.innerHTML = html;

    if (typeof syncPreviewButtons === 'function') syncPreviewButtons();
  }

  document.addEventListener('DOMContentLoaded', main);
})();
