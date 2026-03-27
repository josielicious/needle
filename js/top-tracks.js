const list = document.getElementById("top-tracks-list");

function getTopTrackName(track) {
  if (typeof track === "string") return track;
  if (track && typeof track.name === "string") return track.name;
  return "Unknown Track";
}

function getTopTrackDuration(track) {
  if (!track || typeof track === "string" || !track.durationMs) return "";

  const totalSeconds = Math.round(track.durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes + ":" + String(seconds).padStart(2, "0");
}

function renderTopTracks() {
  if (!list) return;

  const allTracks = [];

  albums.forEach(album => {
    album.discs.forEach((disc, discIndex) => {
      disc.tracks.forEach((track, trackIndex) => {
        const key = `track_${album.id}_${discIndex}_${trackIndex}`;

        if (typeof isInterlude === "function" && isInterlude(key)) return;

        const rating = typeof getRating === "function" ? getRating(key) : null;
        if (!rating) return;

        allTracks.push({
          name: getTopTrackName(track),
          album: album.title,
          artist: album.artist,
          score: rating,
          duration: getTopTrackDuration(track)
        });
            });
        });
    });

  allTracks.sort((a, b) => b.score - a.score);

  if (allTracks.length === 0) {
    list.innerHTML = `<p style="opacity:.6">No rated tracks yet.</p>`;
  } else {
    list.innerHTML = allTracks.slice(0, 100).map((track, i) => `
    <div class="chart-item" style="--fade-index:${i % 20};">
      <div class="chart-left">
        <div class="rank">#${i + 1}</div>
        <div>
          <div class="track-name">${track.name}</div>
          <div class="track-meta">${track.artist} — ${track.album}${track.duration ? ` • ${track.duration}` : ""}</div>
        </div>
      </div>

      ${generateStars(`top_album_${i}`, track.score, true)}
    </div>
  `).join("");
    }
}

if (window.needleData && window.needleData.ready) {
  window.needleData.ready.then(renderTopTracks);
} else {
    renderTopTracks();
}