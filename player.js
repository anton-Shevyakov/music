// YouTube Player Manager
class YouTubePlayerManager {
    constructor() {
        this.player = null;
        this.currentVideoId = null;
        this.isReady = false;
        this.init();
    }

    init() {
        // Create player container
        const playerContainer = document.getElementById('player');
        if (!playerContainer) {
            console.error('Player container not found');
            return;
        }

        // Initialize YouTube player
        this.player = new YT.Player('youtube-player', {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'controls': 1,
                'rel': 0,
                'modestbranding': 1,
                'origin': window.location.origin
            },
            events: {
                'onReady': this.onPlayerReady.bind(this),
                'onStateChange': this.onPlayerStateChange.bind(this),
                'onError': this.onPlayerError.bind(this)
            }
        });
    }

    onPlayerReady(event) {
        console.log('Player is ready');
        this.isReady = true;
        document.getElementById('player').style.display = 'block';
        // Notify that player is ready
        window.dispatchEvent(new CustomEvent('youtubePlayerReady'));
    }

    onPlayerStateChange(event) {
        // Handle player state changes
        console.log('Player state changed:', event.data);
    }

    onPlayerError(event) {
        console.error('Player error:', event.data);
        const errorMessages = {
            2: 'Invalid parameter',
            5: 'HTML5 player error',
            100: 'Video not found',
            101: 'Video not embeddable',
            150: 'Video not embeddable'
        };
        const errorMessage = errorMessages[event.data] || 'Unknown error';
        showError(`Error playing video: ${errorMessage}. Please try another song.`);
    }

    extractVideoId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    async playSong(youtubeUrl, index) {
        if (!this.isReady) {
            showError('Player is not ready yet. Please wait a moment and try again.');
            return;
        }

        const videoId = this.extractVideoId(youtubeUrl);
        if (!videoId) {
            showError('Invalid YouTube URL');
            return;
        }

        try {
            // Check if video is available
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!response.ok) {
                throw new Error('Video is not available');
            }

            // Play the video
            this.currentVideoId = videoId;
            this.player.loadVideoById(videoId);
            document.getElementById('player').style.display = 'block';
        } catch (error) {
            console.error('Error playing video:', error);
            showError('Error playing video. Please try another song.');
        }
    }
}

// Show error message
function showError(message) {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

// Initialize player manager when YouTube API is ready
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API is ready');
    window.playerManager = new YouTubePlayerManager();
};