import sys
import os

# Remove current directory from import path to avoid shadowing with local folder
current_dir = os.path.dirname(os.path.abspath(__file__))
original_path = list(sys.path)
sys.path = [p for p in sys.path if p and os.path.abspath(p) != current_dir]

from ytmusicapi import YTMusic

# Restore import path
sys.path = original_path

import logging
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='static', static_url_path='')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize ytmusicapi client (unauthenticated by default)
try:
    yt = YTMusic()
    logger.info("Successfully initialized public YTMusic client.")
except Exception as e:
    logger.error(f"Failed to initialize YTMusic client: {e}")
    yt = None

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/search')
def api_search():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    query = request.args.get('q', '')
    filter_type = request.args.get('filter', None) # songs, videos, albums, artists, playlists
    if not query:
        return jsonify([])
    
    try:
        results = yt.search(query, filter=filter_type)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error in search: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/home')
def api_home():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    limit = request.args.get('limit', 5, type=int)
    try:
        # get_home gives a nice list of home categories
        results = yt.get_home(limit=limit)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error getting home: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/artist')
def api_artist():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    channel_id = request.args.get('channelId', '')
    if not channel_id:
        return jsonify({"error": "channelId is required"}), 400
    try:
        results = yt.get_artist(channelId=channel_id)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error in artist: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/album')
def api_album():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    album_id = request.args.get('albumId', '')
    if not album_id:
        return jsonify({"error": "albumId is required"}), 400
    try:
        results = yt.get_album(albumId=album_id)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error in album: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/playlist')
def api_playlist():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    playlist_id = request.args.get('playlistId', '')
    if not playlist_id:
        return jsonify({"error": "playlistId is required"}), 400
    try:
        results = yt.get_playlist(playlistId=playlist_id)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error in playlist: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/watch')
def api_watch():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    video_id = request.args.get('videoId', '')
    if not video_id:
        return jsonify({"error": "videoId is required"}), 400
    try:
        results = yt.get_watch_playlist(videoId=video_id, limit=10)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error in watch list: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/lyrics')
def api_lyrics():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    lyrics_id = request.args.get('lyricsId', '')
    if not lyrics_id:
        return jsonify({"error": "lyricsId is required"}), 400
    try:
        results = yt.get_lyrics(browseId=lyrics_id)
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error getting lyrics: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/charts')
def api_charts():
    if not yt:
        return jsonify({"error": "YTMusic client not initialized"}), 500
    try:
        results = yt.get_charts()
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error getting charts: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
