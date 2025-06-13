let currentPlaylist = null;
let currentSongIndex = null;

// DOM Elements
const createPlaylistForm = document.getElementById('createPlaylistForm');
const addSongForm = document.getElementById('addSongForm');
const playlistsList = document.getElementById('playlistsList');
const songsList = document.getElementById('songsList');
const playlistHeader = document.getElementById('playlistHeader');
const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
const errorMessage = document.getElementById('error-message');


let playerManager = null;


document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    createPlaylistForm.addEventListener('submit', handleCreatePlaylist);
    addSongForm.addEventListener('submit', handleAddSong);
    deletePlaylistBtn.addEventListener('click', handleDeletePlaylist);
});


async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        if (!response.ok) {
            window.location.href = '/auth.html';
            return;
        }
        const user = await response.json();
        document.getElementById('user-info').textContent = `Welcome, ${user.username}! (${user.role})`;

        // Show/hide admin controls based on role
        const adminControls = document.querySelectorAll('.admin-only');
        adminControls.forEach(control => {
            control.style.display = user.role === 'admin' ? 'block' : 'none';
        });

        loadPlaylists();
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/auth.html';
    }
}


async function loadPlaylists() {
    try {
        const response = await fetch('/api/playlists');
        if (!response.ok) throw new Error('Failed to load playlists');
        const playlists = await response.json();
        displayPlaylists(playlists);
    } catch (error) {
        showError('Failed to load playlists: ' + error.message);
    }
}


function displayPlaylists(playlists) {
    playlistsList.innerHTML = '';
    playlists.forEach(playlist => {
        const item = document.createElement('button');
        item.className = 'list-group-item list-group-item-action';
        item.textContent = playlist.name;
        item.onclick = () => loadPlaylistSongs(playlist.id, playlist.name);
        playlistsList.appendChild(item);
    });
}


async function loadPlaylistSongs(playlistId, playlistName) {
    try {
        currentPlaylist = playlistId;
        playlistHeader.textContent = `Playlist: ${playlistName}`;
        addSongForm.style.display = 'block';
        deletePlaylistBtn.style.display = 'block';

        const response = await fetch(`/api/playlists/${playlistId}/songs`);
        if (!response.ok) throw new Error('Failed to load songs');
        const songs = await response.json();
        displaySongs(songs);
    } catch (error) {
        showError('Failed to load songs: ' + error.message);
    }
}

function displaySongs(songs) {
    songsList.innerHTML = '';
    songs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <div>
                <h6 class="mb-0">${song.title}</h6>
                <small class="text-muted">${song.artist}</small>
            </div>
            <div>
                <button class="btn btn-sm btn-primary me-2" onclick="playSong('${song.youtube_url}', ${index})">Play</button>
                <button class="btn btn-sm btn-danger" onclick="removeSong(${song.id})">Remove</button>
            </div>
        `;
        songsList.appendChild(item);
    });
}


async function handleCreatePlaylist(event) {
    event.preventDefault();
    const name = document.getElementById('playlistName').value;
    try {
        const response = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error('Failed to create playlist');
        const playlist = await response.json();
        document.getElementById('playlistName').value = '';
        loadPlaylists();
        loadPlaylistSongs(playlist.id, playlist.name);
    } catch (error) {
        showError('Failed to create playlist: ' + error.message);
    }
}


async function handleAddSong(event) {
    event.preventDefault();
    if (!currentPlaylist) {
        showError('Please select a playlist first');
        return;
    }

    const youtubeUrl = document.getElementById('youtubeUrl').value;
    try {

        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (!response.ok) {
            throw new Error('Failed to get video information');
        }

        const videoInfo = await response.json();
        const songData = {
            title: videoInfo.title,
            author_name: videoInfo.author_name,
            youtube_url: youtubeUrl
        };

        // Add song to playlist
        const addResponse = await fetch(`/api/playlists/${currentPlaylist}/songs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(songData)
        });

        if (!addResponse.ok) throw new Error('Failed to add song');
        const song = await addResponse.json();
        document.getElementById('youtubeUrl').value = '';
        loadPlaylistSongs(currentPlaylist, playlistHeader.textContent.replace('Playlist: ', ''));
    } catch (error) {
        showError('Failed to add song: ' + error.message);
    }
}

async function removeSong(songId) {
    if (!currentPlaylist) return;
    try {
        const response = await fetch(`/api/playlists/${currentPlaylist}/songs/${songId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to remove song');
        loadPlaylistSongs(currentPlaylist, playlistHeader.textContent.replace('Playlist: ', ''));
    } catch (error) {
        showError('Failed to remove song: ' + error.message);
    }
}


async function handleDeletePlaylist() {
    if (!currentPlaylist) return;
    if (!confirm('Are you sure you want to delete this playlist?')) return;

    try {
        const response = await fetch(`/api/playlists/${currentPlaylist}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete playlist');
        currentPlaylist = null;
        playlistHeader.textContent = 'Select a Playlist';
        addSongForm.style.display = 'none';
        deletePlaylistBtn.style.display = 'none';
        songsList.innerHTML = '';
        loadPlaylists();
    } catch (error) {
        showError('Failed to delete playlist: ' + error.message);
    }
}


function playSong(youtubeUrl, index) {
    if (!window.playerManager) {
        showError('Player is not initialized yet. Please wait a moment and try again.');
        return;
    }
    currentSongIndex = index;
    window.playerManager.playSong(youtubeUrl, index);
}


function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}


function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        if (response.ok) {
            window.location.href = '/auth.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}