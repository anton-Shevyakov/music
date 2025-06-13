// Database configuration
const DB_NAME = 'MusicPlaylistDB';
const DB_VERSION = 1;

// Store names
const STORES = {
    PLAYLISTS: 'playlists',
    SONGS: 'songs'
};

// Initialize database
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            reject('Database error: ' + event.target.error);
        };

        request.onsuccess = (event) => {
            const db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create playlists store
            if (!db.objectStoreNames.contains(STORES.PLAYLISTS)) {
                const playlistStore = db.createObjectStore(STORES.PLAYLISTS, { keyPath: 'id', autoIncrement: true });
                playlistStore.createIndex('name', 'name', { unique: false });
            }

            // Create songs store
            if (!db.objectStoreNames.contains(STORES.SONGS)) {
                const songStore = db.createObjectStore(STORES.SONGS, { keyPath: 'id', autoIncrement: true });
                songStore.createIndex('title', 'title', { unique: false });
                songStore.createIndex('artist', 'artist', { unique: false });
                songStore.createIndex('playlistId', 'playlistId', { unique: false });
            }
        };
    });
}

// Playlist operations
const PlaylistDB = {
    async getAll() {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.PLAYLISTS], 'readonly');
            const store = transaction.objectStore(STORES.PLAYLISTS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async add(playlist) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.PLAYLISTS], 'readwrite');
            const store = transaction.objectStore(STORES.PLAYLISTS);
            const request = store.add(playlist);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async update(playlist) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.PLAYLISTS], 'readwrite');
            const store = transaction.objectStore(STORES.PLAYLISTS);
            const request = store.put(playlist);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(id) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.PLAYLISTS, STORES.SONGS], 'readwrite');
            const playlistStore = transaction.objectStore(STORES.PLAYLISTS);
            const songStore = transaction.objectStore(STORES.SONGS);

            // Delete all songs in the playlist
            const songIndex = songStore.index('playlistId');
            const songRequest = songIndex.openCursor(IDBKeyRange.only(id));

            songRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    songStore.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };

            // Delete the playlist
            const request = playlistStore.delete(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// Song operations
const SongDB = {
    async getByPlaylist(playlistId) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SONGS], 'readonly');
            const store = transaction.objectStore(STORES.SONGS);
            const index = store.index('playlistId');
            const request = index.getAll(playlistId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async add(song) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SONGS], 'readwrite');
            const store = transaction.objectStore(STORES.SONGS);
            const request = store.add(song);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(id) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SONGS], 'readwrite');
            const store = transaction.objectStore(STORES.SONGS);
            const request = store.delete(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async search(query) {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORES.SONGS], 'readonly');
            const store = transaction.objectStore(STORES.SONGS);
            const request = store.getAll();

            request.onsuccess = () => {
                const songs = request.result;
                const results = songs.filter(song =>
                    song.title.toLowerCase().includes(query.toLowerCase()) ||
                    song.artist.toLowerCase().includes(query.toLowerCase())
                );
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }
};