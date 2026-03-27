const list = document.getElementById("top-albums");

function renderTopAlbums() {
    if (!list) return;

    const ranked = albums
        .map(album => {
            const stats = getAlbumStats(album);
            return { album, ...stats };
        })
        .filter(a => a.count > 0)
        .sort((a, b) => b.avg - a.avg);

    list.innerHTML = ranked.map((item, i) => `
    <a href="album.html?id=${item.album.id}" class="top-album">
        <div class="top-album-left">
        <span class="top-album-rank">#${i + 1}</span>
        <img src="${item.album.cover}">
        <div class="info">
            <h3>${item.album.title}</h3>
            <p>${item.album.artist}</p>
            <div class="list-submeta">${[item.album.genre, item.album.year].filter(Boolean).join(" • ")}</div>
        </div>
        </div>

        <div class="meta">
          ${generateStars(`top_album_${item.album.id}`, item.avg, true)}
          <span>${item.count} tracks</span>
        </div>
    </a>
    `).join("");
}

if (window.needleData && window.needleData.ready) {
    window.needleData.ready.then(renderTopAlbums);
} else {
    renderTopAlbums();
}