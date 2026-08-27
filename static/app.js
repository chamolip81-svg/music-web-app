// ==========================================
// Auralyn App JS - Client Controller & Player
// ==========================================

// Application State
let state = {
    currentQueue: [],
    originalQueue: [], // Saves pre-shuffle state
    currentIndex: -1,
    isPlaying: false,
    isShuffle: false,
    isRepeat: 'none', // 'none', 'all', 'one'
    likedTracks: new Set(),
    activeSearchFilter: null,
    viewHistory: [],
    currentView: 'home',
    progressTimer: null
};

// YouTube IFrame Player Instance
let ytPlayer = null;

// Initialize on Window Load
window.onload = function() {
    initApp();
};

function initApp() {
    loadHomeData();
    setupEventListeners();
    updateVolumeSlider(70);
}

// 1. YouTube Player API Setup
// Called automatically by the script tag loading the iframe API
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('yt-player', {
        height: '1px',
        width: '1px',
        videoId: '',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'rel': 0,
            'showinfo': 0,
            'iv_load_policy': 3
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log("YouTube Player is ready");
    ytPlayer.setVolume(70);
}

function onPlayerStateChange(event) {
    // Event states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === YT.PlayerState.PLAYING) {
        state.isPlaying = true;
        updatePlayButtonUI(true);
        startProgressTimer();
    } else if (event.data === YT.PlayerState.PAUSED) {
        state.isPlaying = false;
        updatePlayButtonUI(false);
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        stopProgressTimer();
        handleTrackEnded();
    }
}

function onPlayerError(event) {
    console.error("YouTube Player error:", event.data);
    // Skips to next track if there is an error loading stream
    playNext();
}

// 2. Playback Functions
function playSong(track) {
    if (!track || !track.videoId) return;

    // Check if song already exists in the queue. If not, insert it
    let trackIdx = state.currentQueue.findIndex(t => t.videoId === track.videoId);
    if (trackIdx === -1) {
        state.currentQueue.push(track);
        state.originalQueue.push(track);
        trackIdx = state.currentQueue.length - 1;
        updateQueueUI();
    }
    
    state.currentIndex = trackIdx;
    updateNowPlayingUI(track);
    highlightPlayingRow(track.videoId);

    // Play via YouTube Player
    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(track.videoId);
        ytPlayer.playVideo();
    }

    // Fetch related songs and lyrics in the background to build endless queue
    fetchWatchSuggestionsAndLyrics(track.videoId);
}

function togglePlay() {
    if (!ytPlayer || state.currentIndex === -1) return;
    
    if (state.isPlaying) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
}

function playNext() {
    if (state.currentQueue.length === 0) return;
    
    if (state.isRepeat === 'one') {
        if (ytPlayer) ytPlayer.seekTo(0);
        return;
    }

    let nextIdx = state.currentIndex + 1;
    if (nextIdx >= state.currentQueue.length) {
        if (state.isRepeat === 'all') {
            nextIdx = 0;
        } else {
            return; // stop playback
        }
    }
    
    playSong(state.currentQueue[nextIdx]);
}

function playPrevious() {
    if (state.currentQueue.length === 0) return;

    // If current song is > 3 seconds, restart it
    if (ytPlayer && ytPlayer.getCurrentTime() > 3) {
        ytPlayer.seekTo(0);
        return;
    }

    let prevIdx = state.currentIndex - 1;
    if (prevIdx < 0) {
        if (state.isRepeat === 'all') {
            prevIdx = state.currentQueue.length - 1;
        } else {
            prevIdx = 0; // stay on first
        }
    }
    
    playSong(state.currentQueue[prevIdx]);
}

function handleTrackEnded() {
    playNext();
}

function seekTrack(value) {
    if (!ytPlayer || state.currentIndex === -1) return;
    let duration = ytPlayer.getDuration();
    if (!duration) return;
    let targetSeconds = (value / 100) * duration;
    ytPlayer.seekTo(targetSeconds, true);
    
    // Update fill color
    document.getElementById('progress-slider').style.setProperty('--slider-percent', `${value}%`);
    document.getElementById('progress-bar-fill').style.width = `${value}%`;
}

function changeVolume(value) {
    if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(value);
    }
    updateVolumeSlider(value);
}

function updateVolumeSlider(value) {
    const volSlider = document.getElementById('volume-slider');
    volSlider.value = value;
    volSlider.style.setProperty('--volume-percent', `${value}%`);
    document.getElementById('volume-bar-fill').style.width = `${value}%`;
    
    // Update icon
    const icon = document.getElementById('volume-icon');
    if (value == 0) {
        icon.className = 'fa-solid fa-volume-xmark';
    } else if (value < 40) {
        icon.className = 'fa-solid fa-volume-low';
    } else {
        icon.className = 'fa-solid fa-volume-high';
    }
}

function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    const btn = document.getElementById('player-shuffle');
    btn.classList.toggle('active', state.isShuffle);

    if (state.isShuffle && state.currentQueue.length > 0) {
        // Keep current song as first, shuffle the rest
        let currentSong = state.currentQueue[state.currentIndex];
        let remaining = state.currentQueue.filter((_, idx) => idx !== state.currentIndex);
        
        // Shuffle helper
        for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        
        state.currentQueue = [currentSong, ...remaining];
        state.currentIndex = 0;
    } else {
        // Restore order
        let currentSong = state.currentQueue[state.currentIndex];
        state.currentQueue = [...state.originalQueue];
        state.currentIndex = state.currentQueue.findIndex(t => t.videoId === currentSong.videoId);
    }
    
    updateQueueUI();
}

function toggleRepeat() {
    const btn = document.getElementById('player-repeat');
    if (state.isRepeat === 'none') {
        state.isRepeat = 'all';
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
    } else if (state.isRepeat === 'all') {
        state.isRepeat = 'one';
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-repeat"></i><span style="position:absolute;font-size:8px;font-weight:800;bottom:2px;">1</span>';
    } else {
        state.isRepeat = 'none';
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
    }
}

function toggleLike() {
    if (state.currentIndex === -1) return;
    let track = state.currentQueue[state.currentIndex];
    const btn = document.getElementById('player-like-btn');
    
    if (state.likedTracks.has(track.videoId)) {
        state.likedTracks.delete(track.videoId);
        btn.classList.remove('liked');
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        state.likedTracks.add(track.videoId);
        btn.classList.add('liked');
        btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
    }
}

// 3. UI Update Helpers
function updatePlayButtonUI(isPlaying) {
    const btn = document.getElementById('player-play');
    if (isPlaying) {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

function updateNowPlayingUI(track) {
    document.getElementById('player-track-title').innerText = track.title;
    
    let artistName = "";
    if (Array.isArray(track.artists)) {
        artistName = track.artists.map(a => a.name).join(', ');
    } else if (typeof track.artists === 'string') {
        artistName = track.artists;
    } else if (track.artist) {
        artistName = typeof track.artist === 'string' ? track.artist : (track.artist.name || "");
    } else {
        artistName = "Unknown Artist";
    }
    
    document.getElementById('player-track-artist').innerText = artistName;
    
    let imgUrl = "";
    if (track.thumbnails && track.thumbnails.length > 0) {
        imgUrl = track.thumbnails[track.thumbnails.length - 1].url;
    } else {
        imgUrl = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
    }
    document.getElementById('player-track-img').src = imgUrl;

    // Update tab title
    document.title = `${track.title} - Auralyn`;

    // Heart icon status
    const btn = document.getElementById('player-like-btn');
    if (state.likedTracks.has(track.videoId)) {
        btn.classList.add('liked');
        btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
    } else {
        btn.classList.remove('liked');
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
    }
}

function updateQueueUI() {
    const container = document.getElementById('sidebar-queue');
    if (state.currentQueue.length === 0) {
        container.innerHTML = '<p class="empty-queue-msg">Queue is empty. Select a song to start listening!</p>';
        return;
    }
    
    container.innerHTML = "";
    state.currentQueue.forEach((track, index) => {
        let artistName = Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : (track.artist || "Unknown");
        let imgUrl = track.thumbnails && track.thumbnails.length > 0 ? track.thumbnails[0].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
        
        let activeClass = index === state.currentIndex ? 'active' : '';
        
        let item = document.createElement('div');
        item.className = `queue-item ${activeClass}`;
        item.onclick = () => playSong(track);
        item.innerHTML = `
            <img class="queue-art" src="${imgUrl}" alt="">
            <div class="queue-info">
                <span class="queue-title">${track.title}</span>
                <span class="queue-artist">${artistName}</span>
            </div>
            <button class="queue-remove" onclick="removeQueueItem(event, ${index})">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        container.appendChild(item);
    });
}

function removeQueueItem(event, index) {
    event.stopPropagation();
    let removedSong = state.currentQueue[index];
    state.currentQueue.splice(index, 1);
    
    // Remove from original queue as well
    let origIdx = state.originalQueue.findIndex(t => t.videoId === removedSong.videoId);
    if (origIdx !== -1) {
        state.originalQueue.splice(origIdx, 1);
    }

    if (index === state.currentIndex) {
        if (state.currentQueue.length > 0) {
            let nextIndex = index >= state.currentQueue.length ? 0 : index;
            playSong(state.currentQueue[nextIndex]);
        } else {
            state.currentIndex = -1;
            state.isPlaying = false;
            updatePlayButtonUI(false);
            if (ytPlayer) ytPlayer.stopVideo();
            updateNowPlayingUI({title: 'Not Playing', artist: 'Select a song'});
        }
    } else if (index < state.currentIndex) {
        state.currentIndex--;
    }
    
    updateQueueUI();
}

function highlightPlayingRow(videoId) {
    document.querySelectorAll('.songs-list tr').forEach(row => {
        row.classList.remove('active');
        if (row.getAttribute('data-video-id') === videoId) {
            row.classList.add('active');
        }
    });
}

// 4. Progress bar interval timer
function startProgressTimer() {
    stopProgressTimer();
    state.progressTimer = setInterval(() => {
        if (!ytPlayer || !state.isPlaying) return;
        
        let currentTime = ytPlayer.getCurrentTime();
        let duration = ytPlayer.getDuration();
        
        if (duration) {
            let pct = (currentTime / duration) * 100;
            document.getElementById('progress-slider').value = pct;
            document.getElementById('progress-slider').style.setProperty('--slider-percent', `${pct}%`);
            document.getElementById('progress-bar-fill').style.width = `${pct}%`;
            document.getElementById('time-current').innerText = formatTime(currentTime);
            document.getElementById('time-duration').innerText = formatTime(duration);
        }
    }, 500);
}

function stopProgressTimer() {
    if (state.progressTimer) {
        clearInterval(state.progressTimer);
        state.progressTimer = null;
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return "0:00";
    let mins = Math.floor(seconds / 60);
    let secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// 5. API calls and data rendering
function loadHomeData() {
    fetch('/api/home')
        .then(res => res.json())
        .then(data => {
            renderHomeSections(data);
        })
        .catch(err => {
            console.error("Error loading home:", err);
            // Fallback load charts if home endpoint fails or returns empty
            loadChartsData();
        });
}

function renderHomeSections(sections) {
    const container = document.getElementById('home-sections');
    container.innerHTML = "";
    
    if (!sections || sections.length === 0) {
        container.innerHTML = `<p class="empty-queue-msg">Unable to load recommended mixes. Loading top charts instead...</p>`;
        loadChartsData();
        return;
    }

    sections.forEach(section => {
        // Check if contains content
        if (!section.contents || section.contents.length === 0) return;
        
        const row = document.createElement('div');
        row.className = 'home-row';
        
        const header = document.createElement('div');
        header.className = 'home-row-header';
        header.innerHTML = `<h3 class="home-row-title">${section.title}</h3>`;
        row.appendChild(header);
        
        const carousel = document.createElement('div');
        carousel.className = 'row-carousel';
        
        section.contents.forEach(item => {
            let title = item.title;
            let subtext = "";
            let imgUrl = item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[item.thumbnails.length - 1].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
            
            // Subtext parser
            if (item.artists) {
                subtext = item.artists.map(a => a.name).join(', ');
            } else if (item.artists_name) {
                subtext = item.artists_name;
            } else if (item.description) {
                subtext = item.description;
            } else if (item.count) {
                subtext = `${item.count} items`;
            }
            
            let card = document.createElement('div');
            card.className = 'media-card';
            
            // Click handler depending on browseId vs videoId
            if (item.videoId) {
                card.onclick = () => playSong(item);
            } else if (item.browseId) {
                if (item.browseId.startsWith('VL') || item.browseId.startsWith('PL')) {
                    card.onclick = () => loadPlaylistDetails(item.browseId);
                } else if (item.browseId.startsWith('MPREb_')) {
                    card.onclick = () => loadAlbumDetails(item.browseId);
                } else {
                    card.onclick = () => loadArtistDetails(item.browseId);
                }
            } else if (item.playlistId) {
                card.onclick = () => loadPlaylistDetails(item.playlistId);
            }

            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img class="card-img" src="${imgUrl}" alt="${title}">
                    <button class="card-play-btn"><i class="fa-solid fa-play"></i></button>
                </div>
                <div class="card-title">${title}</div>
                <div class="card-subtext">${subtext}</div>
            `;
            carousel.appendChild(card);
        });
        
        row.appendChild(carousel);
        container.appendChild(row);
    });
}

function performSearch() {
    const input = document.getElementById('search-input');
    const query = input.value.trim();
    if (!query) return;

    switchView('search');
    const container = document.getElementById('search-results-container');
    container.innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Searching Auralyn...</p>
        </div>
    `;

    document.getElementById('search-results-title').innerText = `Results for "${query}"`;

    let url = `/api/search?q=${encodeURIComponent(query)}`;
    if (state.activeSearchFilter) {
        url += `&filter=${state.activeSearchFilter}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(results => {
            renderSearchResults(results);
        })
        .catch(err => {
            console.error("Search error:", err);
            container.innerHTML = `<p class="empty-queue-msg">An error occurred while fetching search results.</p>`;
        });
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results-container');
    container.innerHTML = "";

    if (!results || results.length === 0) {
        container.innerHTML = `<p class="empty-queue-msg">No results found. Try a different query.</p>`;
        return;
    }

    results.forEach(item => {
        let title = item.title;
        let subtext = item.resultType || "track";
        let imgUrl = item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[item.thumbnails.length - 1].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
        
        if (item.artists) {
            subtext = item.artists.map(a => a.name).join(', ');
        } else if (item.artist) {
            subtext = typeof item.artist === 'string' ? item.artist : (item.artist.name || "Artist");
        } else if (item.resultType) {
            subtext = item.resultType.charAt(0).toUpperCase() + item.resultType.slice(1);
        }

        let card = document.createElement('div');
        card.className = 'media-card';
        
        // Define click handler
        if (item.videoId) {
            card.onclick = () => playSong(item);
        } else if (item.browseId) {
            if (item.browseId.startsWith('VL') || item.browseId.startsWith('PL')) {
                card.onclick = () => loadPlaylistDetails(item.browseId);
            } else if (item.browseId.startsWith('MPREb_')) {
                card.onclick = () => loadAlbumDetails(item.browseId);
            } else {
                card.onclick = () => loadArtistDetails(item.browseId);
            }
        } else if (item.playlistId) {
            card.onclick = () => loadPlaylistDetails(item.playlistId);
        }

        card.innerHTML = `
            <div class="card-img-wrapper">
                <img class="card-img" src="${imgUrl}" alt="${title}">
                <button class="card-play-btn"><i class="fa-solid fa-play"></i></button>
            </div>
            <div class="card-title">${title}</div>
            <div class="card-subtext">${subtext}</div>
        `;
        container.appendChild(card);
    });
}

// Set active search filters (songs, albums, artists, playlists)
function setSearchFilter(filterVal) {
    state.activeSearchFilter = filterVal;
    
    // Update chips active class
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
        chip.classList.remove('active');
        if (filterVal === null && chip.innerText === 'All') {
            chip.classList.add('active');
        } else if (filterVal && chip.innerText.toLowerCase() === filterVal.toLowerCase()) {
            chip.classList.add('active');
        }
    });

    // Re-run search if input has value
    const val = document.getElementById('search-input').value.trim();
    if (val) {
        performSearch();
    }
}

// 6. Detailed Views (Album, Playlist, Artist)
function loadAlbumDetails(albumId) {
    switchView('details');
    const container = document.getElementById('details-container');
    container.innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Loading album details...</p>
        </div>
    `;

    fetch(`/api/album?albumId=${encodeURIComponent(albumId)}`)
        .then(res => res.json())
        .then(album => {
            renderAlbumOrPlaylistDetails(album, 'Album');
        })
        .catch(err => {
            console.error("Error loading album:", err);
            container.innerHTML = `<p class="empty-queue-msg">Could not load album info.</p>`;
        });
}

function loadPlaylistDetails(playlistId) {
    switchView('details');
    const container = document.getElementById('details-container');
    container.innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Loading playlist details...</p>
        </div>
    `;

    fetch(`/api/playlist?playlistId=${encodeURIComponent(playlistId)}`)
        .then(res => res.json())
        .then(playlist => {
            renderAlbumOrPlaylistDetails(playlist, 'Playlist');
        })
        .catch(err => {
            console.error("Error loading playlist:", err);
            container.innerHTML = `<p class="empty-queue-msg">Could not load playlist info.</p>`;
        });
}

function renderAlbumOrPlaylistDetails(data, type) {
    const container = document.getElementById('details-container');
    
    let artistName = "";
    if (Array.isArray(data.artists)) {
        artistName = data.artists.map(a => a.name).join(', ');
    } else if (data.artist) {
        artistName = typeof data.artist === 'string' ? data.artist : (data.artist.name || "Various Artists");
    } else if (data.author) {
        artistName = typeof data.author === 'string' ? data.author : (data.author.name || "Unknown Author");
    } else {
        artistName = "Various Artists";
    }

    let imgUrl = data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[data.thumbnails.length - 1].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
    let trackCount = data.trackCount || (data.tracks ? data.tracks.length : 0);
    let tracks = data.tracks || [];

    let detailsHTML = `
        <div class="detail-banner">
            <img class="detail-art" src="${imgUrl}" alt="">
            <div class="detail-info">
                <span class="detail-type">${type}</span>
                <h1 class="detail-title">${data.title}</h1>
                <div class="detail-meta">
                    <span class="detail-artist-meta">${artistName}</span>
                    <div class="meta-divider"></div>
                    <span>${trackCount} songs</span>
                    ${data.year ? `<div class="meta-divider"></div><span>${data.year}</span>` : ''}
                    ${data.duration ? `<div class="meta-divider"></div><span>${data.duration}</span>` : ''}
                </div>
                <div class="detail-actions">
                    <button class="play-all-btn" onclick="playAllTracks(${JSON.stringify(tracks).replace(/"/g, '&quot;')})">
                        <i class="fa-solid fa-play"></i> Play All
                    </button>
                </div>
            </div>
        </div>

        <table class="songs-list">
            <thead>
                <tr>
                    <th style="width:40px; text-align:center;">#</th>
                    <th>Title</th>
                    <th>Album</th>
                    <th style="text-align:right; width:80px; padding-right:20px;">Duration</th>
                </tr>
            </thead>
            <tbody>
    `;

    tracks.forEach((track, index) => {
        let titleArtistStr = Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : (track.artist || artistName);
        let trackAlbum = track.album ? (track.album.name || track.album) : data.title;
        let trackDuration = track.duration || "0:00";
        let isExplicit = track.isExplicit ? '<span class="song-row-explicit">E</span>' : '';
        
        let rowClass = (state.currentIndex !== -1 && state.currentQueue[state.currentIndex].videoId === track.videoId) ? 'active' : '';

        // Safe JSON stringification for row clicking
        let trackDataEscaped = JSON.stringify(track).replace(/"/g, '&quot;');

        detailsHTML += `
            <tr class="${rowClass}" data-video-id="${track.videoId}">
                <td class="song-play-icon-cell">
                    <button class="song-play-row-btn" onclick="playSong(${trackDataEscaped})">
                        <i class="fa-solid fa-play"></i>
                    </button>
                </td>
                <td>
                    <div class="song-row-title-col">
                        <div class="song-row-details">
                            <span class="song-row-title">${track.title} ${isExplicit}</span>
                            <span class="song-row-artist">${titleArtistStr}</span>
                        </div>
                    </div>
                </td>
                <td><span class="song-row-album">${trackAlbum}</span></td>
                <td class="song-row-duration" style="padding-right:20px;">${trackDuration}</td>
            </tr>
        `;
    });

    detailsHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = detailsHTML;
}

function playAllTracks(tracks) {
    if (!tracks || tracks.length === 0) return;
    
    // Clear and set queue
    state.currentQueue = [...tracks];
    state.originalQueue = [...tracks];
    state.currentIndex = 0;
    
    updateQueueUI();
    playSong(state.currentQueue[0]);
}

function loadArtistDetails(channelId) {
    switchView('details');
    const container = document.getElementById('details-container');
    container.innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Loading artist profile...</p>
        </div>
    `;

    fetch(`/api/artist?channelId=${encodeURIComponent(channelId)}`)
        .then(res => res.json())
        .then(artist => {
            renderArtistDetails(artist);
        })
        .catch(err => {
            console.error("Error loading artist details:", err);
            container.innerHTML = `<p class="empty-queue-msg">Could not load artist page.</p>`;
        });
}

function renderArtistDetails(artist) {
    const container = document.getElementById('details-container');
    let imgUrl = artist.thumbnails && artist.thumbnails.length > 0 ? artist.thumbnails[artist.thumbnails.length - 1].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
    
    let subs = artist.subscribers || "N/A";
    let listeners = artist.monthlyListeners || "N/A";
    let songs = (artist.songs && artist.songs.results) ? artist.songs.results : [];
    
    let html = `
        <div class="detail-banner">
            <img class="detail-art" style="border-radius:50%;" src="${imgUrl}" alt="">
            <div class="detail-info">
                <span class="detail-type">Artist</span>
                <h1 class="detail-title">${artist.name}</h1>
                <div class="artist-stats">
                    <div class="stat-item">
                        <div class="stat-val">${subs}</div>
                        <div class="stat-lbl">Subscribers</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-val">${listeners}</div>
                        <div class="stat-lbl">Monthly Listeners</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (artist.description) {
        html += `<p class="artist-desc">${artist.description}</p>`;
    }

    if (songs.length > 0) {
        html += `
            <h2 class="section-title" style="margin-top:40px; margin-bottom:20px;">Top Songs</h2>
            <table class="songs-list">
                <thead>
                    <tr>
                        <th style="width:40px; text-align:center;">#</th>
                        <th>Title</th>
                        <th>Album</th>
                        <th style="text-align:right; width:80px; padding-right:20px;">Duration</th>
                    </tr>
                </thead>
                <tbody>
        `;

        songs.forEach((track, index) => {
            let trackAlbum = track.album ? (track.album.name || track.album) : "Single";
            let trackDuration = track.duration || "0:00";
            let trackDataEscaped = JSON.stringify(track).replace(/"/g, '&quot;');
            let rowClass = (state.currentIndex !== -1 && state.currentQueue[state.currentIndex].videoId === track.videoId) ? 'active' : '';

            html += `
                <tr class="${rowClass}" data-video-id="${track.videoId}">
                    <td class="song-play-icon-cell">
                        <button class="song-play-row-btn" onclick="playSong(${trackDataEscaped})">
                            <i class="fa-solid fa-play"></i>
                        </button>
                    </td>
                    <td>
                        <div class="song-row-title-col">
                            <div class="song-row-details">
                                <span class="song-row-title">${track.title}</span>
                                <span class="song-row-artist">${artist.name}</span>
                            </div>
                        </div>
                    </td>
                    <td><span class="song-row-album">${trackAlbum}</span></td>
                    <td class="song-row-duration" style="padding-right:20px;">${trackDuration}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
    }

    // Albums releases
    if (artist.albums && artist.albums.results && artist.albums.results.length > 0) {
        html += `
            <h2 class="section-title" style="margin-top:40px; margin-bottom:20px;">Albums & Singles</h2>
            <div class="grid-layout">
        `;
        artist.albums.results.forEach(album => {
            let title = album.title;
            let albumArt = album.thumbnails && album.thumbnails.length > 0 ? album.thumbnails[album.thumbnails.length - 1].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
            let year = album.year || "Release";

            html += `
                <div class="media-card" onclick="loadAlbumDetails('${album.browseId}')">
                    <div class="card-img-wrapper">
                        <img class="card-img" src="${albumArt}" alt="">
                        <button class="card-play-btn"><i class="fa-solid fa-play"></i></button>
                    </div>
                    <div class="card-title">${title}</div>
                    <div class="card-subtext">${year}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

// 7. Watch Suggestions and Lyrics Extraction
function fetchWatchSuggestionsAndLyrics(videoId) {
    fetch(`/api/watch?videoId=${encodeURIComponent(videoId)}`)
        .then(res => res.json())
        .then(watchData => {
            // Append upcoming/related songs to queue
            if (watchData.tracks && watchData.tracks.length > 0) {
                // Filter out songs already in the queue to avoid duplicates
                watchData.tracks.forEach(track => {
                    let exists = state.currentQueue.some(q => q.videoId === track.videoId);
                    if (!exists) {
                        state.currentQueue.push(track);
                        state.originalQueue.push(track);
                    }
                });
                updateQueueUI();
            }

            // Fetch lyrics if lyrics browseId is present
            let lyricsBrowseId = watchData.lyrics;
            if (lyricsBrowseId) {
                fetchLyrics(lyricsBrowseId);
            } else {
                document.getElementById('lyrics-content').innerHTML = `<p class="lyrics-placeholder">No lyrics found for this song.</p>`;
            }
        })
        .catch(err => {
            console.error("Error fetching watch data:", err);
        });
}

function fetchLyrics(lyricsId) {
    document.getElementById('lyrics-content').innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Gathering lyrics...</p>
        </div>
    `;

    fetch(`/api/lyrics?lyricsId=${encodeURIComponent(lyricsId)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.lyrics) {
                document.getElementById('lyrics-content').innerHTML = `
                    <div class="lyrics-body" style="white-space: pre-line;">${data.lyrics}</div>
                `;
            } else {
                document.getElementById('lyrics-content').innerHTML = `<p class="lyrics-placeholder">No lyrics available.</p>`;
            }
        })
        .catch(err => {
            console.error("Error fetching lyrics:", err);
            document.getElementById('lyrics-content').innerHTML = `<p class="lyrics-placeholder">Lyrics loading failed.</p>`;
        });
}

// 8. Charts View
function loadChartsData() {
    const container = document.getElementById('charts-container');
    container.innerHTML = `
        <div class="loader-container">
            <div class="glow-spinner"></div>
            <p>Fetching top charts...</p>
        </div>
    `;

    fetch('/api/charts')
        .then(res => res.json())
        .then(charts => {
            renderCharts(charts);
        })
        .catch(err => {
            console.error("Error loading charts:", err);
            container.innerHTML = `<p class="empty-queue-msg">Failed to load trending charts.</p>`;
        });
}

function renderCharts(charts) {
    const container = document.getElementById('charts-container');
    container.innerHTML = "";

    if (!charts) {
        container.innerHTML = `<p class="empty-queue-msg">Charts are currently unavailable.</p>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'chart-grid';

    // Parse Videos, Songs, Artists shelves
    const categories = [
        { key: 'songs', title: 'Top Trending Songs' },
        { key: 'videos', title: 'Top Videos' },
        { key: 'artists', title: 'Top Artists' }
    ];

    categories.forEach(cat => {
        let categoryData = charts[cat.key];
        if (!categoryData || !categoryData.results || categoryData.results.length === 0) return;

        const card = document.createElement('div');
        card.className = 'chart-card';
        card.innerHTML = `<h3 class="chart-card-title">${cat.title}</h3>`;

        const list = document.createElement('div');
        list.className = 'chart-list';

        categoryData.results.slice(0, 5).forEach((item, index) => {
            let title = item.title || item.artist || "Unknown";
            let artist = item.artists ? item.artists.map(a => a.name).join(', ') : (item.resultType || "");
            let imgUrl = item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[0].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=120&auto=format&fit=crop';
            let itemDataEscaped = JSON.stringify(item).replace(/"/g, '&quot;');

            let listItem = document.createElement('div');
            listItem.className = 'chart-item';
            
            // Set playback or browse triggers
            if (item.videoId) {
                listItem.onclick = () => playSong(item);
            } else if (item.browseId) {
                listItem.onclick = () => loadArtistDetails(item.browseId);
            }

            listItem.innerHTML = `
                <span class="chart-rank">${index + 1}</span>
                <img class="chart-art" src="${imgUrl}" alt="">
                <div class="chart-info">
                    <span class="chart-title">${title}</span>
                    <span class="chart-artist">${artist}</span>
                </div>
            `;
            list.appendChild(listItem);
        });

        card.appendChild(list);
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// 9. Navigation View Switches
function switchView(viewId) {
    // Save to history unless duplicate
    if (state.currentView !== viewId) {
        state.viewHistory.push(state.currentView);
    }
    state.currentView = viewId;

    // Toggle active classes on view tags
    const views = document.querySelectorAll('.content-view');
    views.forEach(v => {
        v.classList.remove('active');
        if (v.id === `view-${viewId}`) {
            v.classList.add('active');
        }
    });

    // Toggle active menu items
    const menuButtons = document.querySelectorAll('.menu-item');
    menuButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === `btn-nav-${viewId}`) {
            btn.classList.add('active');
        }
    });

    // Handle view-specific initial loads
    if (viewId === 'charts') {
        loadChartsData();
    } else if (viewId === 'home') {
        // Refresh home content gently
        if (document.getElementById('home-sections').children.length <= 1) {
            loadHomeData();
        }
    }
}

function showLyricsTab() {
    switchView('lyrics');
}

function goBack() {
    if (state.viewHistory.length > 0) {
        let prevView = state.viewHistory.pop();
        // Skip details views recursion
        state.currentView = prevView;
        
        const views = document.querySelectorAll('.content-view');
        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === `view-${prevView}`) {
                v.classList.add('active');
            }
        });
    } else {
        switchView('home');
    }
}

function handleSearchKey(event) {
    if (event.key === 'Enter') {
        performSearch();
    }
}

// Event Listeners setup
function setupEventListeners() {
    // Listen for progress slider manual input
    const progressSlider = document.getElementById('progress-slider');
    progressSlider.addEventListener('change', (e) => {
        seekTrack(e.target.value);
    });

    const volSlider = document.getElementById('volume-slider');
    volSlider.addEventListener('input', (e) => {
        changeVolume(e.target.value);
    });
}
