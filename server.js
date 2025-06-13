const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const https = require('https');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

const app = express();
const port = 3001;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using HTTPS
}));

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth.html');
    }
}

// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Admin rights required.' });
    }
}

// Route for home page
app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for auth page
app.get('/auth.html', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'auth.html'));
    }
});

// Route for admin panel
app.get('/admin.html', isAuthenticated, isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize database
const db = new sqlite3.Database(path.join(__dirname, 'music.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to the SQLite database');

        // Create users table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
            } else {
                console.log('Users table ready');
            }
        });

        // Create playlists table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) {
                console.error('Error creating playlists table:', err);
            } else {
                console.log('Playlists table ready');
            }
        });

        // Create songs table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            youtube_url TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating songs table:', err);
            } else {
                console.log('Songs table ready');
            }
        });

        // Create playlist_songs table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS playlist_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            song_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) {
                console.error('Error creating playlist_songs table:', err);
            } else {
                console.log('Playlist_songs table ready');
            }
        });

        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
                console.error('Error enabling foreign keys:', err);
            } else {
                console.log('Foreign keys enabled');
            }
        });
    }
});

// Auth Routes
app.post('/api/register', async(req, res) => {
    const { username, password, email, role } = req.body;

    if (!username || !password || !email || !role) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Invalid role' });
    }

    try {
        // Check if username or email already exists
        db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], async(err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (user) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            db.run('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)', [username, hashedPassword, email, role],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    // Create user object for session
                    const newUser = {
                        id: this.lastID,
                        username,
                        email,
                        role
                    };

                    // Set user in session
                    req.session.user = newUser;

                    res.json({
                        message: 'Registration successful',
                        user: newUser
                    });
                });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async(err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Store user in session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logout successful' });
});

app.get('/api/user', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});


function getYouTubeVideoTitle(videoId) {
    return new Promise((resolve, reject) => {
        const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const info = JSON.parse(data);
                    if (info && info.title) {
                        resolve(info.title);
                    } else {
                        resolve(`Video ${videoId}`); // Fallback if title not found
                    }
                } catch (error) {
                    console.error('Error parsing video info:', error);
                    resolve(`Video ${videoId}`); // Fallback if parsing fails
                }
            });
        }).on('error', (err) => {
            console.error('Error fetching video info:', err);
            resolve(`Video ${videoId}`); // Fallback if request fails
        });
    });
}


function extractVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

app.get('/api/playlists', isAuthenticated, (req, res) => {
    console.log('Fetching playlists for user:', req.session.user);

    // Get all playlists with owner information
    db.all(`
        SELECT p.*, u.username as owner_name 
        FROM playlists p 
        JOIN users u ON p.user_id = u.id 
        ORDER BY p.created_at DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Error fetching playlists:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Playlists fetched successfully:', rows);
        res.json(rows);
    });
});

app.post('/api/playlists', isAuthenticated, isAdmin, (req, res) => {
    const { name } = req.body;
    if (!name) {
        console.log('Error: Playlist name is missing');
        return res.status(400).json({ error: 'Playlist name is required' });
    }

    console.log('Creating playlist for user:', req.session.user);
    console.log('Playlist name:', name);

    // First check if user exists
    db.get('SELECT id FROM users WHERE id = ?', [req.session.user.id], (err, user) => {
        if (err) {
            console.error('Error checking user:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!user) {
            console.error('User not found:', req.session.user.id);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('User found:', user);

        // Create the playlist
        db.run(
            'INSERT INTO playlists (name, user_id) VALUES (?, ?)', [name, req.session.user.id],
            function(err) {
                if (err) {
                    console.error('Error creating playlist:', err);
                    return res.status(500).json({ error: err.message });
                }

                console.log('Playlist created successfully with ID:', this.lastID);

                // Return the created playlist
                res.json({
                    id: this.lastID,
                    name: name,
                    user_id: req.session.user.id,
                    created_at: new Date().toISOString()
                });
            }
        );
    });
});

app.delete('/api/playlists/:id', isAuthenticated, isAdmin, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM playlists WHERE id = ?', [id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Playlist deleted' });
    });
});

app.post('/api/songs', async(req, res) => {
    console.log('Received request to add song:', req.body);
    const { youtube_url } = req.body;

    if (!youtube_url) {
        console.log('Error: YouTube URL is missing');
        res.status(400).json({ error: 'YouTube URL is required' });
        return;
    }

    const videoId = extractVideoId(youtube_url);
    if (!videoId) {
        console.log('Error: Invalid YouTube URL:', youtube_url);
        res.status(400).json({ error: 'Invalid YouTube URL' });
        return;
    }

    try {
        console.log('Fetching video title for ID:', videoId);
        const title = await getYouTubeVideoTitle(videoId);
        console.log('Video title:', title);

        db.run('INSERT INTO songs (title, artist, youtube_url) VALUES (?, ?, ?)', [title, 'YouTube', youtube_url],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    res.status(500).json({ error: err.message });
                    return;
                }
                console.log('Song added successfully with ID:', this.lastID);
                res.json({
                    id: this.lastID,
                    title,
                    artist: 'YouTube',
                    youtube_url
                });
            });
    } catch (error) {
        console.error('Error adding song:', error);
        res.status(500).json({ error: 'Failed to add song: ' + error.message });
    }
});

app.get('/api/songs/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        res.json([]);
        return;
    }

    const searchQuery = `%${q}%`;
    db.all('SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? ORDER BY title', [searchQuery, searchQuery],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        });
});

app.get('/api/playlists/:id/songs', isAuthenticated, (req, res) => {
    const { id } = req.params;
    console.log('Getting songs for playlist:', id);
    console.log('User requesting songs:', req.session.user);

    // Get playlist with owner information
    db.get(`
        SELECT p.*, u.username as owner_name 
        FROM playlists p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.id = ?
    `, [id], (err, playlist) => {
        if (err) {
            console.error('Error checking playlist:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!playlist) {
            console.log('Playlist not found:', id);
            return res.status(404).json({ error: 'Playlist not found' });
        }

        console.log('Playlist found:', playlist);

        // Get all songs from the playlist
        db.all(`
            SELECT s.*, ps.position 
            FROM songs s
            JOIN playlist_songs ps ON s.id = ps.song_id
            WHERE ps.playlist_id = ?
            ORDER BY ps.position
        `, [id], (err, rows) => {
            if (err) {
                console.error('Error getting songs:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('Found songs:', rows);
            res.json({
                playlist: playlist,
                songs: rows
            });
        });
    });
});

// Add song to playlist
app.post('/api/playlists/:id/songs', isAuthenticated, async(req, res) => {
    try {
        console.log('Adding song to playlist. Request params:', req.params);
        console.log('Request body:', req.body);
        const playlistId = req.params.id;
        const { youtube_url } = req.body;

        if (!youtube_url) {
            console.log('Error: YouTube URL is missing');
            return res.status(400).json({ error: 'YouTube URL is required' });
        }

        // Extract video ID from YouTube URL
        const videoId = extractVideoId(youtube_url);
        if (!videoId) {
            console.log('Error: Invalid YouTube URL:', youtube_url);
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        console.log('Video ID extracted:', videoId);

        // Get video title from YouTube
        const title = await getYouTubeVideoTitle(videoId);
        console.log('Video title:', title);

        // Check if playlist exists and user has permission
        console.log('Checking playlist with ID:', playlistId);
        const playlist = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM playlists WHERE id = ?', [playlistId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!playlist) {
            console.log('Error: Playlist not found:', playlistId);
            return res.status(404).json({ error: 'Playlist not found' });
        }

        console.log('Playlist found:', playlist);

        // Check if user is admin or playlist owner
        if (req.session.user.role !== 'admin' && playlist.user_id !== req.session.user.id) {
            console.log('Error: Not authorized. User role:', req.session.user.role, 'Playlist owner:', playlist.user_id);
            return res.status(403).json({ error: 'Not authorized to add songs to this playlist' });
        }

        console.log('User authorized, proceeding with song addition');

        // First, add the song to songs table
        console.log('Adding song to songs table');
        const songResult = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO songs (title, artist, youtube_url) VALUES (?, ?, ?)', [title || 'Unknown Title', 'YouTube', youtube_url],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });

        const songId = songResult;
        console.log('Song added with ID:', songId);

        // Get the current maximum position in the playlist
        console.log('Getting current max position for playlist:', playlistId);
        const maxPosition = await new Promise((resolve, reject) => {
            db.get('SELECT MAX(position) as maxPos FROM playlist_songs WHERE playlist_id = ?', [playlistId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.maxPos : 0);
            });
        });

        const nextPosition = (maxPosition || 0) + 1;
        console.log('Next position will be:', nextPosition);

        // Then, add the song to playlist_songs table
        console.log('Adding song to playlist_songs table');
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)', [playlistId, songId, nextPosition],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log('Song successfully added to playlist');
        res.json({
            message: 'Song added successfully',
            song: {
                id: songId,
                title: title || 'Unknown Title',
                artist: 'YouTube',
                youtube_url: youtube_url
            }
        });
    } catch (error) {
        console.error('Error adding song:', error);
        res.status(500).json({ error: 'Failed to add song: ' + error.message });
    }
});

app.delete('/api/playlists/:playlistId/songs/:songId', isAuthenticated, isAdmin, (req, res) => {
    const { playlistId, songId } = req.params;
    db.run('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [playlistId, songId],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Song removed from playlist' });
        });
});

// User API Routes
app.get('/api/user/profile', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    });
});

app.put('/api/user/profile', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const { username, email } = req.body;

    if (!username || !email) {
        return res.status(400).json({ error: 'Username and email are required' });
    }

    db.run('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Profile updated successfully' });
    });
});

app.put('/api/user/password', isAuthenticated, async(req, res) => {
    const userId = req.session.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    try {
        // Get current user
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin API Routes
app.get('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
    db.all('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(users);
    });
});

app.get('/api/admin/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    });
});

app.put('/api/admin/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;
    const { username, email, role } = req.body;

    if (!username || !email || !role) {
        return res.status(400).json({ error: 'Username, email and role are required' });
    }

    if (role !== 'admin' && role !== 'user') {
        return res.status(400).json({ error: 'Invalid role' });
    }

    db.run('UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?', [username, email, role, userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'User updated successfully' });
        });
});

app.delete('/api/admin/users/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;

    // Don't allow deleting yourself
    if (userId === req.session.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'User deleted successfully' });
    });
});

app.get('/api/admin/stats', isAuthenticated, isAdmin, (req, res) => {
    Promise.all([
        // Get total users count
        new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        }),
        // Get total playlists count
        new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM playlists', [], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        }),
        // Get total songs count
        new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM songs', [], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        }),
        // Get recent users
        new Promise((resolve, reject) => {
            db.all('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }),
        // Get recent playlists
        new Promise((resolve, reject) => {
            db.all(`
                SELECT p.*, u.username as owner_name 
                FROM playlists p 
                JOIN users u ON p.user_id = u.id 
                ORDER BY p.created_at DESC LIMIT 5
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        })
    ]).then(([usersCount, playlistsCount, songsCount, recentUsers, recentPlaylists]) => {
        res.json({
            stats: {
                totalUsers: usersCount,
                totalPlaylists: playlistsCount,
                totalSongs: songsCount
            },
            recentUsers,
            recentPlaylists
        });
    }).catch(error => {
        res.status(500).json({ error: error.message });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});