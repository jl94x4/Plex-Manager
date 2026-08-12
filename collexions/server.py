import os
import sys
import subprocess
import json
import time
import re
import logging
import jwt
from functools import wraps
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import requests
import random
import threading
from contextlib import contextmanager
from flask import Flask, request, jsonify, send_from_directory, Response, abort
from flask_cors import CORS
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# Configure logging for the API
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

# Patch plexapi BEFORE any PlexServer() so Docker hostname is never the device name.
try:
    from plex_identity import configure_plex_identity, plex_request_headers
    configure_plex_identity()
except ImportError as e:
    logging.error('plex_identity module missing (%s) — Collexions will start but Plex may see Docker hostname as a device', e)

    def configure_plex_identity(force=False):
        return ''

    def plex_request_headers(token='', extra=None):
        headers = {'Accept': 'application/json'}
        if token:
            headers['X-Plex-Token'] = str(token)
        if extra:
            headers.update(extra)
        return headers

app = Flask(__name__)
CORS(app)

# --- Configuration ---
SCRIPT_NAME = "ColleXions.py"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Portal embeds the worker and sets COLLEXIONS_DATA_DIR to persist under the portal config volume.
_DATA_ROOT = os.environ.get('COLLEXIONS_DATA_DIR', '').strip() or BASE_DIR
CONFIG_FILE = os.path.join(_DATA_ROOT, "config", "config.json")
HISTORY_FILE = os.path.join(_DATA_ROOT, "config", "history.json")
MANAGED_COLLECTIONS_FILE = os.path.join(_DATA_ROOT, "config", "managed_collections.json")
LOGS_DIR = os.path.join(_DATA_ROOT, "logs")
LOG_FILE = os.path.join(LOGS_DIR, "collexions.log")
DATA_DIR = os.path.join(_DATA_ROOT, "data")
STATUS_FILE = os.path.join(DATA_DIR, "status.json")
DIST_DIR = os.path.join(BASE_DIR, "dist")  # Built frontend (production only)

# Ensure config and logs directories exist
os.makedirs(os.path.join(_DATA_ROOT, "config"), exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
# Stores the subprocess object of the running script
process = None

# --- Security ---
import secrets as _secrets_mod
import hmac as _hmac

_WEAK_SECRETS = {
    '',
    'dev-secret-key-replace-me-in-production',
    'portal-collexions',
}
_raw_secret = (os.environ.get('COLLEXIONS_SECRET_KEY') or '').strip()
if _raw_secret in _WEAK_SECRETS:
    SECRET_KEY = _secrets_mod.token_hex(32)
    logging.warning(
        'COLLEXIONS_SECRET_KEY missing or weak — generated ephemeral secret for this process. '
        'Set a strong COLLEXIONS_SECRET_KEY (or JWT_SECRET via the portal embedder) in production.'
    )
else:
    SECRET_KEY = _raw_secret

SERVICE_KEY = os.environ.get('COLLEXIONS_SERVICE_KEY', '').strip()
TRUE_ENV_VALUES = {'1', 'true', 'yes', 'on'}
PORTAL_MODE = os.environ.get('COLLEXIONS_PORTAL_MODE', '').strip().lower() in TRUE_ENV_VALUES
# Homelab Plex often uses self-signed TLS — set COLLEXIONS_PLEX_VERIFY_SSL=false to disable.
_plex_verify_raw = os.environ.get('COLLEXIONS_PLEX_VERIFY_SSL', 'true').strip().lower()
PLEX_SSL_VERIFY = _plex_verify_raw not in ('0', 'false', 'no', 'off')

if PORTAL_MODE and not SERVICE_KEY:
    logging.error('COLLEXIONS_SERVICE_KEY is required when COLLEXIONS_PORTAL_MODE=true')

def _service_key_ok():
    """Accept portal BFF service-key auth (no end-user Collexions password)."""
    if not SERVICE_KEY:
        return False
    header = (request.headers.get('X-Collexions-Service-Key') or '').strip()
    return bool(header) and _hmac.compare_digest(header, SERVICE_KEY)

def _jwt_token_ok(token):
    if not token:
        return False
    try:
        jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return True
    except Exception:
        return False

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if _service_key_ok():
            return f(*args, **kwargs)

        # Embedded/portal mode: only the portal service key is accepted (no JWT bootstrap).
        if PORTAL_MODE:
            return jsonify({'error': 'Authentication required'}), 401

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Authentication required'}), 401

        token = auth_header.split(' ', 1)[1]
        if not _jwt_token_ok(token):
            return jsonify({'error': 'Invalid or expired token'}), 401

        return f(*args, **kwargs)
    return decorated

def require_auth_or_query_token(f):
    """Like require_auth, but also accepts ?access_token= for <img src> (Bearer cannot be set)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if _service_key_ok():
            return f(*args, **kwargs)

        if PORTAL_MODE:
            return jsonify({'error': 'Authentication required'}), 401

        auth_header = request.headers.get('Authorization')
        token = None
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
        else:
            token = (request.args.get('access_token') or request.args.get('token') or '').strip() or None

        if not _jwt_token_ok(token):
            return jsonify({'error': 'Authentication required'}), 401

        return f(*args, **kwargs)
    return decorated

def is_safe_plex_media_path(raw_path):
    """Block SSRF/path tricks — mirror portal isSafePlexMediaPath."""
    thumb_path = str(raw_path or '')
    if not thumb_path.startswith('/') or thumb_path.startswith('//'):
        return False
    if '://' in thumb_path or '\\' in thumb_path:
        return False
    if '..' in thumb_path:
        return False
    if re.search(r'[\s\x00-\x1f\x7f]', thumb_path):
        return False
    return True

# --- Cache System ---
# version bumped by list_collections (3=light, 4=full pin resolve)
GALLERY_CACHE = {
    'data': None,
    'timestamp': 0,
    'ttl': 300, # 5 minutes
    'version': 2,  # bump when thumb shape/fallback changes
}
# Background refresh for stale-while-revalidate gallery lists (avoids Cloudflare 524).
_GALLERY_REFRESH_LOCK = threading.Lock()
_GALLERY_REFRESH_RUNNING = set()  # cache_version ints currently refreshing
PRESETS_CACHE = {
    'data': None,
    'timestamp': 0,
    'ttl': 21600,  # 6 hours
    'version': 3,  # bump when preset catalog changes
}
IMAGE_CACHE = {} # Cache for proxied posters: { thumb_path: { 'data': binary, 'mimetype': type } }
SUMMARY_CACHE = {
    'data': None,
    'timestamp': 0,
    'ttl': 120,  # seconds — home widget pinned count
}
TMDB_POSTER_CACHE = {} # Cache for TMDB IDs to poster paths


# --- Helpers ---
def ensure_dir_exists(file_path):
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        logging.info(f"Created directory: {directory}")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"Error loading config: {e}")
            return {}
    return {}

def save_config(new_data, merge=True):
    """
    Saves the configuration atomically.
    If merge is True, it merges new_data into the existing config.
    """
    try:
        config = load_config() if merge else {}
        if merge:
            config.update(new_data)
        else:
            config = new_data

        # Drop pin-limit entries for libraries that are no longer managed.
        libs = config.get('library_names')
        pins = config.get('number_of_collections_to_pin')
        if isinstance(libs, list) and isinstance(pins, dict):
            managed = {str(x).strip() for x in libs if str(x).strip()}
            config['number_of_collections_to_pin'] = {
                k: v for k, v in pins.items() if k in managed
            }
            
        ensure_dir_exists(CONFIG_FILE)
        
        # Atomic write using a temporary file
        import tempfile
        import shutil
        
        fd, temp_path = tempfile.mkstemp(dir=os.path.dirname(CONFIG_FILE) or ".", prefix="config_tmp_")
        try:
            with os.fdopen(fd, 'w') as f:
                json.dump(config, f, indent=4)
            # os.replace is atomic and works on Windows
            os.replace(temp_path, CONFIG_FILE)
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e
            
        return True
    except Exception as e:
        logging.error(f"Failed to save config: {e}")
        return False

def env_flag_enabled(name):
    return os.environ.get(name, '').strip().lower() in TRUE_ENV_VALUES

def config_ready_for_background_process():
    """Avoid noisy autostart failures before onboarding has saved Plex details."""
    config = load_config()
    missing = [key for key in ('plex_url', 'plex_token') if not config.get(key)]
    if missing:
        logging.info(
            "Background service autostart skipped; missing config fields: %s",
            ", ".join(missing)
        )
        return False
    return True

def load_managed_collections():
    if os.path.exists(MANAGED_COLLECTIONS_FILE):
        try:
            with open(MANAGED_COLLECTIONS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_managed_collections(data):
    try:
        ensure_dir_exists(MANAGED_COLLECTIONS_FILE)
        with open(MANAGED_COLLECTIONS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        logging.error(f"Failed to save managed collections: {e}")

# Legacy trending-tab preset ids → fetch_source_items source_type (older jobs)
TRENDING_PRESET_SOURCE_TYPES = {
    'tmdb_movie_week': 'tmdb_trending_movie',
    'tmdb_tv_week': 'tmdb_trending_tv',
    'tmdb_tv_popular': 'tmdb_tv_popular',
    'tmdb_movie_top': 'tmdb_movie_top',
    'tmdb_kids': 'tmdb_kids',
    'tmdb_horror': 'tmdb_horror',
    'tmdb_docs': 'tmdb_docs',
    'tmdb_scifi': 'tmdb_scifi',
    'trakt_movie_trending': 'trakt_trending_movie',
    'trakt_show_trending': 'trakt_trending_show',
    'trakt_movie_anticipated': 'trakt_anticipated_movie',
    'trakt_show_anticipated': 'trakt_anticipated_show',
}

def _preset_recipe(kind, media, **extra):
    recipe = {'kind': kind, 'media': 'tv' if media in ('tv', 'show') else 'movie'}
    recipe.update(extra)
    return recipe


# Declarative Trending-tab catalog. source_type is always trending_preset;
# source_id is the JSON recipe used by fetch_source_items for auto-sync.
TRENDING_PRESET_CATALOG = [
    # --- Movies: charts ---
    {'id': 'tmdb_movie_top10_week', 'name': 'Top 10 Movies This Week', 'description': 'The hottest 10 movies on TMDb right now.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_trending', 'movie', window='week', limit=10)},
    {'id': 'tmdb_movie_top25_week', 'name': 'Top 25 Movies This Week', 'description': 'This week\'s top 25 trending movies.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_trending', 'movie', window='week', limit=25)},
    {'id': 'tmdb_movie_week', 'name': 'TMDb Weekly Trending Movies', 'description': 'The most popular movies on TMDb this week.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_trending', 'movie', window='week', limit=30)},
    {'id': 'tmdb_movie_day', 'name': 'Trending Movies Today', 'description': 'Movies spiking in popularity today.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_trending', 'movie', window='day', limit=30)},
    {'id': 'tmdb_movie_popular', 'name': 'Popular Movies', 'description': 'What TMDb users are watching most right now.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_endpoint', 'movie', path='movie/popular', limit=50)},
    {'id': 'tmdb_movie_top', 'name': 'Top Rated Movies', 'description': 'All-time highest rated movies on TMDb.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_endpoint', 'movie', path='movie/top_rated', limit=100)},
    {'id': 'tmdb_movie_now_playing', 'name': 'Now Playing in Theatres', 'description': 'Movies currently in cinemas.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_endpoint', 'movie', path='movie/now_playing', limit=40)},
    {'id': 'tmdb_movie_upcoming', 'name': 'Upcoming Movies', 'description': 'Coming soon to theatres.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_endpoint', 'movie', path='movie/upcoming', limit=40)},
    {'id': 'tmdb_movie_hidden_gems', 'name': 'Hidden Gem Movies', 'description': 'Highly rated films with fewer votes — quality over hype.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=50, params={
         'sort_by': 'vote_average.desc', 'vote_average.gte': '7.5',
         'vote_count.gte': '50', 'vote_count.lte': '1500',
     })},
    # --- Movies: genres ---
    {'id': 'tmdb_kids', 'name': 'Kids & Family Hits', 'description': 'Top animated and family-friendly movies.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '10751,16', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_horror', 'name': 'Horror Hits', 'description': 'Top trending horror movies for spooky season.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '27', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_docs', 'name': 'Top Documentaries', 'description': 'Highly rated and popular documentaries.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '99', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_scifi', 'name': 'Sci-Fi Classics', 'description': 'Out-of-this-world science fiction favorites.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '878', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_action', 'name': 'Action Blockbusters', 'description': 'High-octane action movies.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '28', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_comedy', 'name': 'Comedy Hits', 'description': 'Popular comedies worth a laugh.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '35', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_drama', 'name': 'Drama Essentials', 'description': 'Powerful dramatic films.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '18', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_thriller', 'name': 'Thriller Night', 'description': 'Suspenseful thrillers to keep you guessing.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '53', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_romance', 'name': 'Romance Favourites', 'description': 'Popular romantic movies.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '10749', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_animation', 'name': 'Animation Showcase', 'description': 'Top animated movies for all ages.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '16', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_crime', 'name': 'Crime Movies', 'description': 'Heists, detectives, and underworld drama.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '80', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_adventure', 'name': 'Adventure Epics', 'description': 'Epic adventures and journeys.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '12', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_fantasy', 'name': 'Fantasy Worlds', 'description': 'Magic, myths, and fantasy epics.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=100, params={'with_genres': '14', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_war', 'name': 'War Movies', 'description': 'War and battlefield dramas.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=80, params={'with_genres': '10752', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_western', 'name': 'Westerns', 'description': 'Classic and modern westerns.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=60, params={'with_genres': '37', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_mystery', 'name': 'Mystery Movies', 'description': 'Whodunits and mysterious plots.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=80, params={'with_genres': '9648', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_music', 'name': 'Music & Musicals', 'description': 'Music-driven films and musicals.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=60, params={'with_genres': '10402', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_history', 'name': 'History Films', 'description': 'Historical dramas and period pieces.', 'source': 'TMDb', 'media': 'movie',
     'recipe': _preset_recipe('tmdb_discover', 'movie', limit=80, params={'with_genres': '36', 'sort_by': 'popularity.desc'})},
    # --- TV: charts ---
    {'id': 'tmdb_tv_top10_week', 'name': 'Top 10 Shows This Week', 'description': 'The hottest 10 TV shows on TMDb this week.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_trending', 'tv', window='week', limit=10)},
    {'id': 'tmdb_tv_top25_week', 'name': 'Top 25 Shows This Week', 'description': 'This week\'s top 25 trending TV shows.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_trending', 'tv', window='week', limit=25)},
    {'id': 'tmdb_tv_week', 'name': 'TMDb Weekly Trending Shows', 'description': 'The most watched TV series on TMDb this week.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_trending', 'tv', window='week', limit=30)},
    {'id': 'tmdb_tv_day', 'name': 'Trending Shows Today', 'description': 'TV shows spiking in popularity today.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_trending', 'tv', window='day', limit=30)},
    {'id': 'tmdb_tv_popular', 'name': 'Popular TV Shows', 'description': 'The most popular TV shows on TMDb right now.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_endpoint', 'tv', path='tv/popular', limit=50)},
    {'id': 'tmdb_tv_top', 'name': 'Top Rated TV Shows', 'description': 'All-time highest rated series on TMDb.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_endpoint', 'tv', path='tv/top_rated', limit=100)},
    {'id': 'tmdb_tv_airing_today', 'name': 'Airing Today', 'description': 'TV episodes airing today.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_endpoint', 'tv', path='tv/airing_today', limit=40)},
    {'id': 'tmdb_tv_on_the_air', 'name': 'Currently On The Air', 'description': 'Series currently broadcasting new episodes.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_endpoint', 'tv', path='tv/on_the_air', limit=40)},
    {'id': 'tmdb_tv_hidden_gems', 'name': 'Hidden Gem Shows', 'description': 'Highly rated series with fewer votes.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=50, params={
         'sort_by': 'vote_average.desc', 'vote_average.gte': '7.5',
         'vote_count.gte': '50', 'vote_count.lte': '1500',
     })},
    # --- TV: genres ---
    {'id': 'tmdb_tv_family', 'name': 'Family TV', 'description': 'Family-friendly television.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=80, params={'with_genres': '10751', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_kids', 'name': 'Kids TV', 'description': 'Shows made for kids.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=80, params={'with_genres': '10762', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_comedy', 'name': 'Comedy Series', 'description': 'Popular TV comedies.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '35', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_drama', 'name': 'Drama Series', 'description': 'Must-watch TV dramas.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '18', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_scifi', 'name': 'Sci-Fi & Fantasy TV', 'description': 'Sci-fi and fantasy television.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '10765', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_crime', 'name': 'Crime TV', 'description': 'Crime dramas and procedurals.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '80', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_mystery', 'name': 'Mystery TV', 'description': 'Mystery and detective series.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=80, params={'with_genres': '9648', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_animation', 'name': 'Animated Series', 'description': 'Popular animated TV shows.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '16', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_docs', 'name': 'Documentary Series', 'description': 'Non-fiction TV worth bingeing.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=80, params={'with_genres': '99', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_action', 'name': 'Action & Adventure TV', 'description': 'Action-packed television.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=100, params={'with_genres': '10759', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_reality', 'name': 'Reality TV', 'description': 'Popular reality television.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=60, params={'with_genres': '10764', 'sort_by': 'popularity.desc'})},
    {'id': 'tmdb_tv_war', 'name': 'War & Politics TV', 'description': 'War and political dramas.', 'source': 'TMDb', 'media': 'tv',
     'recipe': _preset_recipe('tmdb_discover', 'tv', limit=60, params={'with_genres': '10768', 'sort_by': 'popularity.desc'})},
    # --- Trakt ---
    {'id': 'trakt_movie_trending', 'name': 'Trakt Trending Movies', 'description': 'Movies being watched right now across the Trakt community.', 'source': 'Trakt', 'media': 'movie',
     'recipe': _preset_recipe('trakt', 'movie', path='movies/trending', limit=30)},
    {'id': 'trakt_show_trending', 'name': 'Trakt Trending Shows', 'description': 'Most watched TV shows right now.', 'source': 'Trakt', 'media': 'tv',
     'recipe': _preset_recipe('trakt', 'tv', path='shows/trending', limit=30)},
    {'id': 'trakt_movie_popular', 'name': 'Trakt Popular Movies', 'description': 'Most popular movies on Trakt.', 'source': 'Trakt', 'media': 'movie',
     'recipe': _preset_recipe('trakt', 'movie', path='movies/popular', limit=50)},
    {'id': 'trakt_show_popular', 'name': 'Trakt Popular Shows', 'description': 'Most popular shows on Trakt.', 'source': 'Trakt', 'media': 'tv',
     'recipe': _preset_recipe('trakt', 'tv', path='shows/popular', limit=50)},
    {'id': 'trakt_movie_anticipated', 'name': 'Trakt Most Anticipated Movies', 'description': 'Movies people are most looking forward to.', 'source': 'Trakt', 'media': 'movie',
     'recipe': _preset_recipe('trakt', 'movie', path='movies/anticipated', limit=100)},
    {'id': 'trakt_show_anticipated', 'name': 'Most Anticipated Shows', 'description': 'Upcoming TV shows with the most hype.', 'source': 'Trakt', 'media': 'tv',
     'recipe': _preset_recipe('trakt', 'tv', path='shows/anticipated', limit=100)},
    {'id': 'trakt_movie_recommended', 'name': 'Trakt Recommended Movies', 'description': 'Weekly Trakt movie recommendations.', 'source': 'Trakt', 'media': 'movie',
     'recipe': _preset_recipe('trakt', 'movie', path='movies/recommended/weekly', limit=50)},
    {'id': 'trakt_show_recommended', 'name': 'Trakt Recommended Shows', 'description': 'Weekly Trakt TV recommendations.', 'source': 'Trakt', 'media': 'tv',
     'recipe': _preset_recipe('trakt', 'tv', path='shows/recommended/weekly', limit=50)},
]


def _parse_preset_recipe(source_id):
    if isinstance(source_id, dict):
        return source_id
    raw = str(source_id or '').strip()
    if not raw:
        return None
    if raw.startswith('{'):
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
        except Exception:
            return None
    # Legacy bare preset id → look up catalog recipe
    for entry in TRENDING_PRESET_CATALOG:
        if entry['id'] == raw:
            return dict(entry['recipe'])
    return None


def fetch_trending_preset_recipe(recipe, config, include_posters=False):
    """Fetch titles for a trending_preset recipe (preview + auto-sync)."""
    recipe = recipe or {}
    kind = recipe.get('kind')
    media = 'tv' if recipe.get('media') in ('tv', 'show') else 'movie'
    item_type = 'show' if media == 'tv' else 'movie'
    title_key = 'name' if media == 'tv' else 'title'
    date_key = 'first_air_date' if media == 'tv' else 'release_date'
    limit = int(recipe.get('limit') or 50)
    tmdb_key = config.get('tmdb_api_key')
    trakt_id = config.get('trakt_client_id')
    items = []

    def attach_poster(entry, m=None):
        if not include_posters:
            return entry
        if m and m.get('poster_path'):
            entry['poster'] = f"https://image.tmdb.org/t/p/w200{m.get('poster_path')}"
        return entry

    try:
        if kind == 'tmdb_trending' and tmdb_key:
            window = recipe.get('window') or 'week'
            pages_needed = max(1, min(5, (limit + 19) // 20))
            for page in range(1, pages_needed + 1):
                url = f"https://api.themoviedb.org/3/trending/{media}/{window}?api_key={tmdb_key}&page={page}"
                resp = requests.get(url, timeout=8)
                if resp.status_code != 200:
                    break
                results = resp.json().get('results') or []
                if not results:
                    break
                for m in results:
                    tid = m.get('id')
                    entry = {
                        'title': m.get(title_key),
                        'id': tid,
                        'tmdb_id': tid,
                        'year': (m.get(date_key) or '')[:4],
                        'type': item_type,
                    }
                    items.append(attach_poster(entry, m))
                if len(items) >= limit:
                    break
            items = items[:limit]

        elif kind == 'tmdb_endpoint' and tmdb_key:
            path = str(recipe.get('path') or '').lstrip('/')
            if path:
                pages_needed = max(1, min(8, (limit + 19) // 20))
                for page in range(1, pages_needed + 1):
                    url = f"https://api.themoviedb.org/3/{path}?api_key={tmdb_key}&page={page}"
                    resp = requests.get(url, timeout=8)
                    if resp.status_code != 200:
                        break
                    results = resp.json().get('results') or []
                    if not results:
                        break
                    for m in results:
                        tid = m.get('id')
                        entry = {
                            'title': m.get(title_key) or m.get('title') or m.get('name'),
                            'id': tid,
                            'tmdb_id': tid,
                            'year': (m.get(date_key) or m.get('release_date') or m.get('first_air_date') or '')[:4],
                            'type': item_type,
                        }
                        items.append(attach_poster(entry, m))
                    if len(items) >= limit:
                        break
                items = items[:limit]

        elif kind == 'tmdb_discover' and tmdb_key:
            params = {'api_key': tmdb_key, 'language': 'en-US', **(recipe.get('params') or {})}
            pages_needed = max(1, min(10, (limit + 19) // 20))
            for page in range(1, pages_needed + 1):
                params['page'] = page
                url = f"https://api.themoviedb.org/3/discover/{media}"
                resp = requests.get(url, params=params, timeout=8)
                if resp.status_code != 200:
                    break
                results = resp.json().get('results') or []
                if not results:
                    break
                for m in results:
                    tid = m.get('id')
                    entry = {
                        'title': m.get(title_key),
                        'id': tid,
                        'tmdb_id': tid,
                        'year': (m.get(date_key) or '')[:4],
                        'type': item_type,
                    }
                    items.append(attach_poster(entry, m))
                if len(items) >= limit:
                    break
            items = items[:limit]

        elif kind == 'trakt' and trakt_id:
            path = str(recipe.get('path') or '').lstrip('/')
            headers = {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': trakt_id,
            }
            url = f"https://api.trakt.tv/{path}?limit={limit}"
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code == 200:
                for idx, row in enumerate(resp.json() or []):
                    node = row.get('movie') or row.get('show') or row
                    ids = (node.get('ids') or {}) if isinstance(node, dict) else {}
                    tid = ids.get('tmdb')
                    entry = {
                        'title': node.get('title'),
                        'year': node.get('year'),
                        'id': tid,
                        'tmdb_id': tid,
                        'type': item_type,
                    }
                    # Limit poster lookups — Trakt rows have no poster paths.
                    if include_posters and tid and idx < 5:
                        entry['poster'] = get_tmdb_poster(tid, 'tv' if media == 'tv' else 'movie')
                    items.append(entry)
                items = items[:limit]
    except Exception as e:
        logging.error(f"trending preset fetch error ({kind}/{media}): {e}")

    return [it for it in items if it.get('title')]


def normalize_source_type(source_type, source_id=''):
    """Fix legacy jobs that stored tmdb_trending_undefined when preset.type was missing."""
    st = (source_type or '').strip()
    sid = (source_id or '').strip()
    if st == 'trending_preset' or (sid.startswith('{') and '"kind"' in sid):
        return 'trending_preset'
    if ('undefined' in st or not st) and sid in TRENDING_PRESET_SOURCE_TYPES:
        return TRENDING_PRESET_SOURCE_TYPES[sid]
    if st in TRENDING_PRESET_SOURCE_TYPES:
        return TRENDING_PRESET_SOURCE_TYPES[st]
    # Catalog id used as source_type/source_id
    if sid in {e['id'] for e in TRENDING_PRESET_CATALOG} or st in {e['id'] for e in TRENDING_PRESET_CATALOG}:
        return 'trending_preset'
    return st

def heal_managed_job_sources(managed):
    """Persist corrected source_type for jobs created with the trending undefined bug."""
    changed = False
    for job in managed.values():
        if not isinstance(job, dict):
            continue
        fixed = normalize_source_type(job.get('source_type'), job.get('source_id'))
        if fixed and fixed != job.get('source_type'):
            job['source_type'] = fixed
            changed = True
    if changed:
        save_managed_collections(managed)
    return managed

# Expected Plex library type ('movie' | 'show') for known source_types.
SOURCE_TYPE_MEDIA = {
    'tmdb_trending_movie': 'movie',
    'tmdb_trending_tv': 'show',
    'tmdb_tv_popular': 'show',
    'tmdb_movie_top': 'movie',
    'tmdb_movie_top_rated': 'movie',
    'tmdb_kids': 'movie',
    'tmdb_horror': 'movie',
    'tmdb_docs': 'movie',
    'tmdb_scifi': 'movie',
    'tmdb_genre': 'movie',
    'tmdb_tv_genre': 'show',
    'tmdb_collection': 'movie',
    'trakt_trending_movie': 'movie',
    'trakt_trending_show': 'show',
    'trakt_anticipated_movie': 'movie',
    'trakt_anticipated_show': 'show',
    'trakt_recommended_movie': 'movie',
    'trakt_recommended_show': 'show',
}

def normalize_media_kind(value):
    v = str(value or '').strip().lower()
    if v in ('movie', 'movies', 'film', 'films'):
        return 'movie'
    if v in ('show', 'shows', 'tv', 'television', 'series'):
        return 'show'
    return None

def infer_media_from_items(items):
    kinds = set()
    for it in items or []:
        kind = normalize_media_kind((it or {}).get('type'))
        if kind:
            kinds.add(kind)
    if len(kinds) == 1:
        return next(iter(kinds))
    return None

def expected_media_for_source(source_type, source_id='', items=None):
    """Return 'movie' or 'show' when we can tell what media a source targets."""
    st = normalize_source_type(source_type, source_id)
    if st in SOURCE_TYPE_MEDIA:
        return SOURCE_TYPE_MEDIA[st]
    if st == 'trending_preset':
        recipe = _parse_preset_recipe(source_id)
        if recipe:
            return normalize_media_kind(recipe.get('media', 'movie')) or 'movie'
        return 'movie'
    if st == 'tmdb_discover':
        try:
            params = json.loads(source_id or '{}')
            return normalize_media_kind(params.get('type', 'movie')) or 'movie'
        except Exception:
            return 'movie'
    st_l = (st or '').lower()
    if 'show' in st_l or st_l.endswith('_tv') or '_tv_' in st_l or st_l.startswith('tmdb_tv'):
        return 'show'
    if 'movie' in st_l:
        return 'movie'
    return infer_media_from_items(items)

def library_media_mismatch_error(library, source_type, source_id='', items=None):
    """Human-readable error when target library type doesn't match source media."""
    lib_type = normalize_media_kind(getattr(library, 'type', None))
    expected = expected_media_for_source(source_type, source_id, items)
    if not lib_type or not expected or lib_type == expected:
        return None
    lib_label = 'Movies' if lib_type == 'movie' else 'TV Shows'
    want_label = 'Movies' if expected == 'movie' else 'TV Shows'
    title = getattr(library, 'title', None) or 'That library'
    return (
        f'"{title}" is a {lib_label} library, but this collection is for {want_label}. '
        f'Select a matching Target Library.'
    )

def _normalize_mdblist_item(itm, default_type='movie'):
    """Map one MDBList item dict into ColleXions external-item shape."""
    if not isinstance(itm, dict):
        return None
    ids = itm.get('ids') if isinstance(itm.get('ids'), dict) else {}
    tmdb_id = (
        itm.get('tmdb_id')
        or itm.get('tmdbid')
        or ids.get('tmdb')
        or ids.get('tmdbid')
        or itm.get('id')
    )
    media = str(itm.get('mediatype') or itm.get('media_type') or default_type or 'movie').lower()
    if media in ('tv', 'show', 'shows'):
        media = 'show'
    else:
        media = 'movie'
    title = itm.get('title') or itm.get('name')
    if not title:
        return None
    year = itm.get('year') or itm.get('release_year') or ''
    return {
        'title': title,
        'year': str(year) if year is not None else '',
        'id': tmdb_id,
        'tmdb_id': tmdb_id,
        'type': media,
    }


def parse_mdblist_items_payload(data):
    """
    MDBList /lists/.../items used to return a flat array; current API returns
    {"movies": [...], "shows": [...]}. Support both.
    """
    items = []
    if isinstance(data, list):
        for itm in data:
            parsed = _normalize_mdblist_item(itm)
            if parsed:
                items.append(parsed)
        return items
    if isinstance(data, dict):
        # Prefer explicit buckets when present.
        movies = data.get('movies')
        shows = data.get('shows')
        if isinstance(movies, list) or isinstance(shows, list):
            for itm in movies or []:
                parsed = _normalize_mdblist_item(itm, 'movie')
                if parsed:
                    items.append(parsed)
            for itm in shows or []:
                parsed = _normalize_mdblist_item(itm, 'show')
                if parsed:
                    items.append(parsed)
            return items
        # Some endpoints wrap as {"items": [...]} or {"results": [...]}
        nested = data.get('items') or data.get('results')
        if isinstance(nested, list):
            return parse_mdblist_items_payload(nested)
    return items


def fetch_source_items(source_type, source_id, config):
    """Fetches the latest items for a specific source."""
    source_type = normalize_source_type(source_type, source_id)
    tmdb_key = config.get('tmdb_api_key')
    trakt_id = config.get('trakt_client_id')
    headers = {'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': trakt_id}
    
    items = []
    try:
        if source_type == 'trending_preset':
            recipe = _parse_preset_recipe(source_id)
            if recipe:
                items = fetch_trending_preset_recipe(recipe, config, include_posters=False)
        elif source_type == 'tmdb_trending_movie':
            # Trending weekly - User wants cap of 30
            for page in range(1, 3): # 2 pages = 40 items total, we slice at 30
                url = f"https://api.themoviedb.org/3/trending/movie/week?api_key={tmdb_key}&page={page}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json().get('results', [])
                    if not data: break
                    items.extend([{'title': m.get('title'), 'tmdb_id': m.get('id'), 'type': 'movie'} for m in data])
                else: break
            items = items[:30]
        elif source_type == 'tmdb_trending_tv':
            # Trending weekly - User wants cap of 30
            for page in range(1, 3): 
                url = f"https://api.themoviedb.org/3/trending/tv/week?api_key={tmdb_key}&page={page}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json().get('results', [])
                    if not data: break
                    items.extend([{'title': m.get('name'), 'tmdb_id': m.get('id'), 'type': 'show'} for m in data])
                else: break
            items = items[:30]
        elif source_type == 'tmdb_discover':
            # User wants cap of 500 for "others"
            try:
                params_dict = json.loads(source_id)
                media_type, discover_params = build_tmdb_discover_params(
                    params_dict.get('type', 'movie'),
                    params_dict,
                    tmdb_key,
                )
                params_dict = {**discover_params, 'api_key': tmdb_key}
                url = f"https://api.themoviedb.org/3/discover/{media_type}"
                for page in range(1, 26): # 25 pages = 500 items
                    params_dict['page'] = page
                    resp = requests.get(url, params=params_dict, timeout=10)
                    if resp.status_code == 200:
                        data = resp.json()
                        results = data.get('results', [])
                        if not results: break
                        for m in results:
                            items.append({
                                'title': m.get('title') or m.get('name'), 
                                'tmdb_id': m.get('id'), 
                                'type': 'movie' if media_type == 'movie' else 'show'
                            })
                        if page >= data.get('total_pages', 1): break
                    else: break
            except Exception as e:
                logging.error(f"Error parse/fetch tmdb_discover: {e}")
            items = items[:500]
        elif source_type == 'tmdb_tv_popular':
            # Popular - User wants 50
            for page in range(1, 4): 
                url = f"https://api.themoviedb.org/3/tv/popular?api_key={tmdb_key}&page={page}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json().get('results', [])
                    if not data: break
                    items.extend([{'title': m.get('name'), 'tmdb_id': m.get('id'), 'type': 'show'} for m in data])
                else: break
            items = items[:50]
        elif source_type == 'tmdb_movie_top' or source_type == 'tmdb_movie_top_rated':
            # Top Rated - User wants 100
            for page in range(1, 6): 
                url = f"https://api.themoviedb.org/3/movie/top_rated?api_key={tmdb_key}&page={page}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json().get('results', [])
                    if not data: break
                    items.extend([{'title': m.get('title'), 'tmdb_id': m.get('id'), 'type': 'movie'} for m in data])
                else: break
            items = items[:100]
        elif source_type in ('tmdb_kids', 'tmdb_horror', 'tmdb_docs', 'tmdb_scifi', 'tmdb_genre', 'tmdb_tv_genre'):
            # Genre discover — up to 500 popular titles
            legacy_genres = {
                'tmdb_kids': ('movie', '10751,35'),
                'tmdb_horror': ('movie', '27'),
                'tmdb_docs': ('movie', '99'),
                'tmdb_scifi': ('movie', '878'),
            }
            if source_type in legacy_genres:
                media_type, genre_ids = legacy_genres[source_type]
            else:
                media_type = 'tv' if source_type == 'tmdb_tv_genre' else 'movie'
                genre_ids = str(source_id or '').strip()
            if genre_ids:
                item_type = 'show' if media_type == 'tv' else 'movie'
                title_key = 'name' if media_type == 'tv' else 'title'
                for page in range(1, 26):  # 500 items
                    url = (
                        f"https://api.themoviedb.org/3/discover/{media_type}"
                        f"?api_key={tmdb_key}&with_genres={genre_ids}&sort_by=popularity.desc&page={page}"
                    )
                    resp = requests.get(url, timeout=5)
                    if resp.status_code == 200:
                        data = resp.json().get('results', [])
                        if not data:
                            break
                        items.extend([
                            {'title': m.get(title_key), 'tmdb_id': m.get('id'), 'type': item_type}
                            for m in data
                        ])
                    else:
                        break
                items = items[:500]
        elif source_type == 'trakt_trending_movie':
            # Trending - User wants 30
            resp = requests.get("https://api.trakt.tv/movies/trending?limit=30", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['movie']['title'], 'tmdb_id': itm['movie']['ids']['tmdb'], 'type': 'movie'} for itm in resp.json()]
        elif source_type == 'trakt_trending_show':
            # Trending - User wants 30
            resp = requests.get("https://api.trakt.tv/shows/trending?limit=30", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['show']['title'], 'tmdb_id': itm['show']['ids']['tmdb'], 'type': 'show'} for itm in resp.json()]
        elif source_type == 'trakt_anticipated_movie':
            # Other - User wants 500
            resp = requests.get("https://api.trakt.tv/movies/anticipated?limit=500", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['movie']['title'], 'tmdb_id': itm['movie']['ids']['tmdb'], 'type': 'movie'} for itm in resp.json()]
        elif source_type == 'trakt_anticipated_show':
            # Other - User wants 500
            resp = requests.get("https://api.trakt.tv/shows/anticipated?limit=500", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['show']['title'], 'tmdb_id': itm['show']['ids']['tmdb'], 'type': 'show'} for itm in resp.json()]
        elif source_type == 'trakt_recommended_movie':
            # Other - User wants 500
            resp = requests.get("https://api.trakt.tv/movies/recommended/weekly?limit=500", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['movie']['title'], 'tmdb_id': itm['movie']['ids']['tmdb'], 'type': 'movie'} for itm in resp.json()]
        elif source_type == 'trakt_recommended_show':
            # Other - User wants 500
            resp = requests.get("https://api.trakt.tv/shows/recommended/weekly?limit=500", headers=headers, timeout=5)
            if resp.status_code == 200:
                items = [{'title': itm['show']['title'], 'tmdb_id': itm['show']['ids']['tmdb'], 'type': 'show'} for itm in resp.json()]
        elif source_type == 'trakt_list':
            username, slug = _parse_trakt_list_url(source_id)
            if not username or not slug:
                # Allow bare "user/lists/slug" paths too
                parts = [p for p in str(source_id or '').strip().split('/') if p]
                if len(parts) >= 3 and parts[-2] == 'lists':
                    username, slug = parts[-3], parts[-1]
            if username and slug and trakt_id:
                for itm in _fetch_trakt_list_items(trakt_id, username, slug):
                    items.append({
                        'title': itm.get('title'),
                        'tmdb_id': itm.get('tmdb_id') or itm.get('id'),
                        'type': itm.get('type') or 'movie',
                        'year': itm.get('year'),
                    })
        elif source_type == 'mdblist':
            try:
                api_key = config.get('mdblist_api_key')
                if api_key:
                    parts = [p for p in source_id.strip().split('/') if p]
                    if 'mdblist.com' in source_id.lower() and 'lists' in parts:
                        lists_idx = parts.index('lists')
                        username = parts[lists_idx + 1]
                        list_slug = parts[lists_idx + 2] if len(parts) > lists_idx + 2 else ""
                        if list_slug:
                            api_url = f"https://api.mdblist.com/lists/{username}/{list_slug}/items/?apikey={api_key}"
                            resp = requests.get(api_url, timeout=10)
                            if resp.status_code == 200:
                                items.extend(parse_mdblist_items_payload(resp.json()))
            except Exception as e:
                logging.error(f"Error parse/fetch mdblist: {e}")
        elif source_type == 'tmdb_collection':
            # Franchise / TMDB collection parts (movies only).
            collection_id = str(source_id or '').strip()
            if tmdb_key and collection_id:
                url = f"https://api.themoviedb.org/3/collection/{collection_id}?api_key={tmdb_key}"
                resp = requests.get(url, timeout=10)
                if resp.status_code == 200:
                    for part in resp.json().get('parts') or []:
                        if not part.get('id'):
                            continue
                        items.append({
                            'title': part.get('title') or part.get('name'),
                            'tmdb_id': part.get('id'),
                            'type': 'movie',
                            'year': (part.get('release_date') or '')[:4],
                        })
                else:
                    logging.warning(f"TMDB collection {collection_id} returned HTTP {resp.status_code}")
    except Exception as e:
        logging.error(f"Error fetching source items for {source_type}: {e}")
            
    return items


# Curated one-click templates (Creator → Templates). source_type must exist in fetch_source_items.
JOB_TEMPLATES = [
    # Trending
    {"id": "tmdb_trending_movies", "name": "Trending Movies", "description": "What's hot on TMDB this week.", "category": "trending", "media": "movie", "source_type": "tmdb_trending_movie", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_trending_tv", "name": "Trending TV", "description": "What's hot on TMDB this week.", "category": "trending", "media": "tv", "source_type": "tmdb_trending_tv", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "trakt_trending_movies", "name": "Trending Movies (Trakt)", "description": "Trakt community trending movies.", "category": "trending", "media": "movie", "source_type": "trakt_trending_movie", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    {"id": "trakt_trending_tv", "name": "Trending TV (Trakt)", "description": "Trakt community trending shows.", "category": "trending", "media": "tv", "source_type": "trakt_trending_show", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    {"id": "trakt_anticipated_movies", "name": "Most Anticipated Movies", "description": "Upcoming movies people are waiting for.", "category": "trending", "media": "movie", "source_type": "trakt_anticipated_movie", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    {"id": "trakt_anticipated_tv", "name": "Most Anticipated TV", "description": "Upcoming shows people are waiting for.", "category": "trending", "media": "tv", "source_type": "trakt_anticipated_show", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    {"id": "trakt_recommended_movies", "name": "Recommended Movies", "description": "Weekly Trakt recommendations.", "category": "trending", "media": "movie", "source_type": "trakt_recommended_movie", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    {"id": "trakt_recommended_tv", "name": "Recommended TV", "description": "Weekly Trakt recommendations.", "category": "trending", "media": "tv", "source_type": "trakt_recommended_show", "source_id": "", "default_sort": "custom", "requires": ["trakt"]},
    # Quality / awards-style
    {"id": "tmdb_top_rated_movies", "name": "Top Rated Movies", "description": "Highest-rated movies on TMDB.", "category": "quality", "media": "movie", "source_type": "tmdb_movie_top_rated", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_popular_tv", "name": "Popular TV", "description": "Currently popular TV on TMDB.", "category": "quality", "media": "tv", "source_type": "tmdb_tv_popular", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    # Genre — movies (TMDB discover)
    {"id": "tmdb_genre_action", "name": "Action Movies", "description": "Popular action from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "28", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_adventure", "name": "Adventure Movies", "description": "Popular adventure from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "12", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_animation", "name": "Animation Movies", "description": "Popular animation from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "16", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_comedy", "name": "Comedy Movies", "description": "Popular comedy from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "35", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_crime", "name": "Crime Movies", "description": "Popular crime from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "80", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_docs", "name": "Documentaries", "description": "Popular documentaries from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_docs", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_drama", "name": "Drama Movies", "description": "Popular drama from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "18", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_kids", "name": "Family & Kids", "description": "Family-friendly movies from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_kids", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_family", "name": "Family Movies", "description": "Popular family films from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "10751", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_fantasy", "name": "Fantasy Movies", "description": "Popular fantasy from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "14", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_history", "name": "History Movies", "description": "Popular history from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "36", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_horror", "name": "Horror Movies", "description": "Popular horror from TMDB discover.", "category": "genre", "media": "movie", "source_type": "tmdb_horror", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_music", "name": "Music Movies", "description": "Popular music films from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "10402", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_mystery", "name": "Mystery Movies", "description": "Popular mystery from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "9648", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_romance", "name": "Romance Movies", "description": "Popular romance from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "10749", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_scifi", "name": "Sci-Fi Movies", "description": "Popular science fiction from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_scifi", "source_id": "", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_thriller", "name": "Thriller Movies", "description": "Popular thrillers from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "53", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_war", "name": "War Movies", "description": "Popular war films from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "10752", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_genre_western", "name": "Western Movies", "description": "Popular westerns from TMDB.", "category": "genre", "media": "movie", "source_type": "tmdb_genre", "source_id": "37", "default_sort": "custom", "requires": ["tmdb"]},
    # Genre — TV (TMDB discover)
    {"id": "tmdb_tv_genre_action", "name": "Action & Adventure TV", "description": "Popular action & adventure shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10759", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_animation", "name": "Animation TV", "description": "Popular animated shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "16", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_comedy", "name": "Comedy TV", "description": "Popular comedy shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "35", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_crime", "name": "Crime TV", "description": "Popular crime shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "80", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_docs", "name": "Documentary TV", "description": "Popular documentary series from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "99", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_drama", "name": "Drama TV", "description": "Popular drama shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "18", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_family", "name": "Family TV", "description": "Popular family shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10751", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_kids", "name": "Kids TV", "description": "Popular kids shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10762", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_mystery", "name": "Mystery TV", "description": "Popular mystery shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "9648", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_reality", "name": "Reality TV", "description": "Popular reality shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10764", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_scifi", "name": "Sci-Fi & Fantasy TV", "description": "Popular sci-fi & fantasy shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10765", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_soap", "name": "Soap TV", "description": "Popular soap operas from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10766", "default_sort": "custom", "requires": ["tmdb"]},
    {"id": "tmdb_tv_genre_war", "name": "War & Politics TV", "description": "Popular war & politics shows from TMDB.", "category": "genre", "media": "tv", "source_type": "tmdb_tv_genre", "source_id": "10768", "default_sort": "custom", "requires": ["tmdb"]},
    # Franchises (TMDB collection IDs)
    {"id": "franchise_star_wars", "name": "Star Wars", "description": "The Star Wars saga collection.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "10", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_harry_potter", "name": "Harry Potter", "description": "Wizarding World films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "1241", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_lotr", "name": "The Lord of the Rings", "description": "Middle-earth trilogy.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "119", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_hobbit", "name": "The Hobbit", "description": "The Hobbit trilogy.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "121938", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_jurassic", "name": "Jurassic Park", "description": "Jurassic Park / World films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "328", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_fast", "name": "Fast & Furious", "description": "The Fast Saga.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "9485", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_bond", "name": "James Bond", "description": "007 collection.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "645", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_indiana_jones", "name": "Indiana Jones", "description": "Indy adventure films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "84", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_mission_impossible", "name": "Mission: Impossible", "description": "Ethan Hunt films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "87359", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_john_wick", "name": "John Wick", "description": "John Wick films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "404609", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_alien", "name": "Alien", "description": "Alien saga.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "8091", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_terminator", "name": "Terminator", "description": "Terminator films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "528", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_toy_story", "name": "Toy Story", "description": "Toy Story films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "10194", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_shrek", "name": "Shrek", "description": "Shrek films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "2150", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_avengers", "name": "The Avengers", "description": "Avengers team-up films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "86311", "default_sort": "release", "requires": ["tmdb"]},
    {"id": "franchise_pirates", "name": "Pirates of the Caribbean", "description": "PotC films.", "category": "franchise", "media": "movie", "source_type": "tmdb_collection", "source_id": "295", "default_sort": "release", "requires": ["tmdb"]},
]


def get_template_by_id(template_id):
    tid = str(template_id or '').strip()
    for tpl in JOB_TEMPLATES:
        if tpl['id'] == tid:
            return dict(tpl)
    return None


def franchise_collection_title(name):
    """Normalize franchise names to 'The X Collection' when TMDB/template omits it."""
    title = str(name or '').strip()
    if not title:
        return title
    # TMDB often already returns "Shrek Collection" / "The Dark Knight Collection"
    if re.search(r'\bcollections?\b', title, re.I):
        return title
    if re.match(r'^the\s+', title, re.I):
        return f'{title} Collection'
    return f'The {title} Collection'


def _build_library_tmdb_cache(library):
    """Map tmdb id string → Plex item for fast matching (full library scan — expensive)."""
    cache = {}
    for item in library.all():
        try:
            for guid in getattr(item, 'guids', []) or []:
                gid = getattr(guid, 'id', '') or ''
                if 'tmdb' in gid:
                    tid = gid.split('tmdb://')[-1]
                    if tid:
                        cache[str(tid)] = item
        except Exception:
            pass
    return cache


def _plex_item_tmdb_ids(item):
    ids = set()
    try:
        for guid in getattr(item, 'guids', []) or []:
            gid = getattr(guid, 'id', '') or ''
            if 'tmdb://' in gid:
                ids.add(gid.split('tmdb://')[-1])
    except Exception:
        pass
    return ids


def _match_external_to_plex(library, external_items, tmdb_cache=None):
    """Match external {tmdb_id/id, title} items to local Plex items.

    For small lists (franchises / trending), prefer per-title search so we don't
    scan the entire library (which often exceeds the portal proxy timeout).
    """
    items = list(external_items or [])
    if not items:
        return []

    matched = []
    seen_keys = set()

    # Fast path: title search (+ TMDB guid verify) for modest lists.
    if tmdb_cache is None and len(items) <= 80:
        logging.info(f"Matching {len(items)} items via title search (fast path)")
        for ext in items:
            tmdb_id = str(ext.get('tmdb_id') or ext.get('id') or '').strip()
            title = str(ext.get('title') or '').strip()
            libtype = 'movie' if str(ext.get('type') or 'movie') == 'movie' else 'show'
            if not title and not tmdb_id:
                continue
            pick = None
            try:
                results = library.search(title=title, libtype=libtype) if title else []
            except Exception as e:
                logging.debug(f"Search failed for '{title}': {e}")
                results = []
            if tmdb_id and results:
                for r in results[:20]:
                    if tmdb_id in _plex_item_tmdb_ids(r):
                        pick = r
                        break
            if pick is None and title and results:
                for r in results[:10]:
                    if (getattr(r, 'title', '') or '').casefold() == title.casefold():
                        pick = r
                        break
            if pick is None and results:
                pick = results[0]
            if pick is not None:
                key = getattr(pick, 'ratingKey', None)
                if key not in seen_keys:
                    seen_keys.add(key)
                    matched.append(pick)
        return matched

    if tmdb_cache is None:
        logging.info(f"Building full TMDB cache for {len(items)} items (slow path)")
        tmdb_cache = _build_library_tmdb_cache(library)

    for ext in items:
        tmdb_id_val = ext.get('tmdb_id') or ext.get('id')
        if not tmdb_id_val:
            continue
        local_item = tmdb_cache.get(str(tmdb_id_val))
        if not local_item:
            continue
        key = getattr(local_item, 'ratingKey', None)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        matched.append(local_item)
    return matched


def _managed_job_id(library_name, title):
    """Stable unique id — avoid space-collapse collisions (Movies+'Top Rated' vs 'Movies Top'+'Rated')."""
    lib = str(library_name or '').strip()
    name = str(title or '').strip()
    return f"{lib}::{name}".lower()


def _register_managed_job(library_name, title, source_type, source_id, sort_order='custom', auto_sync=True):
    managed = load_managed_collections()
    job_id = _managed_job_id(library_name, title)
    # Drop legacy colliding ids that match this library+title under the old format.
    legacy_id = f"{library_name}_{title}".replace(' ', '_').lower()
    for jid, job in list(managed.items()):
        if not isinstance(job, dict):
            continue
        if jid == job_id:
            continue
        if job.get('library') == library_name and job.get('name') == title:
            del managed[jid]
        elif jid == legacy_id:
            del managed[jid]
    managed[job_id] = {
        "name": title,
        "library": library_name,
        "source_type": source_type,
        "source_id": source_id or '',
        "sort_order": sort_order,
        "auto_sync": bool(auto_sync),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "last_run": "Never",
        "next_run": (datetime.now() + timedelta(hours=6)).strftime("%Y-%m-%d %H:%M:%S"),
    }
    save_managed_collections(managed)
    log_action(f"Registered Auto-Sync job for '{title}' (Source: {source_type})")
    return job_id


def _unregister_jobs_for_collection(library_name, title):
    """Remove any Auto-Sync jobs tied to this library + collection title."""
    managed = load_managed_collections()
    removed = []
    for jid, job in list(managed.items()):
        if not isinstance(job, dict):
            continue
        if job.get('library') == library_name and job.get('name') == title:
            del managed[jid]
            removed.append(jid)
    if removed:
        save_managed_collections(managed)
        log_action(f"Removed {len(removed)} Auto-Sync job(s) for '{title}' in '{library_name}'.")
    return removed


_collection_create_locks = {}
_collection_create_locks_guard = threading.Lock()


def _normalize_collection_title(title):
    return str(title or '').strip()


@contextmanager
def _collection_create_lock(library_name, title):
    """Serialize create/update for the same library + title to prevent duplicate Plex collections."""
    key = _managed_job_id(library_name, title)
    with _collection_create_locks_guard:
        lock = _collection_create_locks.setdefault(key, threading.Lock())
    if not lock.acquire(timeout=180):
        raise RuntimeError(f"Collection '{title}' is already being created or updated.")
    try:
        yield
    finally:
        lock.release()


def _find_collections_by_title(library, title):
    """Return every Plex collection in this library whose title matches (case-insensitive)."""
    title = _normalize_collection_title(title)
    if not title:
        return []
    norm = title.lower()
    matches = []
    seen_keys = set()
    try:
        filtered = library.collections(title=title)
        for coll in filtered or []:
            rk = getattr(coll, 'ratingKey', None)
            if rk is not None and rk not in seen_keys:
                matches.append(coll)
                seen_keys.add(rk)
    except Exception as e:
        logging.warning(f"Title-filtered collection lookup failed for '{title}': {e}")
    try:
        for coll in library.collections():
            rk = getattr(coll, 'ratingKey', None)
            if rk is None or rk in seen_keys:
                continue
            if str(coll.title or '').strip().lower() == norm:
                matches.append(coll)
                seen_keys.add(rk)
    except Exception as e:
        logging.warning(f"Collection scan failed for '{title}': {e}")
    return matches


def _collection_item_count(coll, allow_fetch=False):
    """Best-effort item count. Gallery list must pass allow_fetch=False (never coll.items())."""
    try:
        child_count = getattr(coll, 'childCount', None)
        if child_count is not None:
            return int(child_count)
        if not allow_fetch:
            return 0
        if getattr(coll, 'smart', False):
            return len(coll.items())
        return len(coll.items())
    except Exception:
        return 0


def _collection_item_count_light(coll):
    """Gallery-safe count — childCount only, never fetches items (CF 524 hotspot)."""
    return _collection_item_count(coll, allow_fetch=False)


def _pick_primary_collection(collections):
    """Keep the collection with the most items; tie-break on highest ratingKey."""
    if not collections:
        return None
    return max(
        collections,
        key=lambda coll: (_collection_item_count(coll, allow_fetch=True), int(getattr(coll, 'ratingKey', 0) or 0)),
    )


def _delete_duplicate_collections(library, title, keep_rating_key=None):
    """Delete same-title duplicates, optionally keeping one ratingKey."""
    keep = str(keep_rating_key) if keep_rating_key is not None else None
    removed = 0
    for coll in _find_collections_by_title(library, title):
        rk = str(getattr(coll, 'ratingKey', ''))
        if keep and rk == keep:
            continue
        try:
            coll.delete()
            removed += 1
            log_action(f"Removed duplicate collection '{coll.title}' (key {rk}).")
        except Exception as e:
            logging.warning(f"Failed to delete duplicate collection '{coll.title}': {e}")
    return removed


def _update_collection_items_in_place(coll, matched_items, label):
    current_items = coll.items()
    current_titles = {i.title for i in current_items}
    target_titles = {i.title for i in matched_items}
    to_add = [i for i in matched_items if i.title not in current_titles]
    to_remove = [i for i in current_items if i.title not in target_titles]
    if to_add:
        coll.addItems(to_add)
    if to_remove:
        try:
            coll.removeItems(to_remove)
        except Exception as e:
            logging.warning(f"Failed to remove old items from '{coll.title}': {e}")
    try:
        coll.addLabel(label)
    except Exception:
        pass


def _upsert_plex_collection(library, title, matched_items, sort_order='custom', label='Collexions'):
    """
    Create or update exactly one Plex collection for title.
    Merges duplicates by keeping the fullest collection and deleting extras.
    Returns (collection, created_fresh).
    """
    title = _normalize_collection_title(title)
    if not title:
        raise ValueError("Collection title is required")
    if not matched_items:
        raise ValueError("No matched items to add")

    existing_all = _find_collections_by_title(library, title)
    if existing_all:
        coll = _pick_primary_collection(existing_all)
        keep_key = getattr(coll, 'ratingKey', None)
        removed = _delete_duplicate_collections(library, title, keep_rating_key=keep_key)
        if removed:
            log_action(f"Removed {removed} duplicate collection(s) named '{title}'.")

        is_smart = getattr(coll, 'smart', False)
        if is_smart or sort_order == 'random':
            try:
                coll.delete()
            except Exception as e:
                logging.error(f"Failed to delete collection '{title}' before recreate: {e}")
                raise RuntimeError(f"Could not replace existing collection '{title}'") from e
            coll = _create_plex_collection(library, title, matched_items, sort_order=sort_order, label=label)
            return coll, True

        _update_collection_items_in_place(coll, matched_items, label)
        if sort_order == 'release':
            try:
                coll.sortUpdate('release')
            except Exception as e:
                logging.warning(f"Failed to set release sort: {e}")
        return coll, False

    coll = _create_plex_collection(library, title, matched_items, sort_order=sort_order, label=label)
    return coll, True


def _delete_plex_collection(library_name, title=None, rating_key=None):
    """
    Permanently delete Plex collection(s) and drop matching managed jobs when none remain.
    With rating_key, deletes only that collection. With title, deletes all same-title copies.
    Returns (ok: bool, error: str|None, removed_jobs: list).
    """
    plex = get_plex_instance()
    if not plex:
        return False, "Plex connection failed", []
    if not library_name or (not title and not rating_key):
        return False, "Missing title/library", []
    try:
        library = plex.library.section(library_name)
        deleted_title = _normalize_collection_title(title)
        if rating_key:
            try:
                coll = library.fetchItem(int(rating_key))
                deleted_title = deleted_title or _normalize_collection_title(getattr(coll, 'title', ''))
                coll.delete()
                log_action(f"Deleted collection '{deleted_title}' (key {rating_key}) from '{library_name}'.")
            except Exception as e:
                return False, str(e), []
            remaining = _find_collections_by_title(library, deleted_title) if deleted_title else []
            removed_jobs = _unregister_jobs_for_collection(library_name, deleted_title) if not remaining else []
            return True, None, removed_jobs

        deleted_title = _normalize_collection_title(title)
        matches = _find_collections_by_title(library, deleted_title)
        if not matches:
            return False, "Collection not found", []
        for coll in matches:
            coll.delete()
        removed_jobs = _unregister_jobs_for_collection(library_name, deleted_title)
        log_action(f"Deleted {len(matches)} collection(s) named '{deleted_title}' from '{library_name}'.")
        return True, None, removed_jobs
    except Exception as e:
        return False, str(e), []


def _resolve_collection(library, title=None, rating_key=None):
    """Fetch a single collection by ratingKey, or the primary match for title."""
    if rating_key:
        try:
            return library.fetchItem(int(rating_key))
        except Exception:
            return None
    if title:
        matches = _find_collections_by_title(library, title)
        return _pick_primary_collection(matches) if matches else None
    return None


def _create_plex_collection(library, title, matched_items, sort_order='custom', label='Collexions'):
    """Create a Plex collection from matched items. Returns the collection object."""
    if sort_order == 'random':
        collection = library.createCollection(
            title=title,
            smart=True,
            sort='random',
            filters={'id': [itm.ratingKey for itm in matched_items]},
        )
    else:
        collection = library.createCollection(title, items=matched_items)
        if sort_order == 'release':
            try:
                collection.sortUpdate('release')
            except Exception as e:
                logging.warning(f"Failed to set release sort: {e}")
    try:
        collection.addLabel(label)
    except Exception as e:
        logging.warning(f"Failed to set label: {e}")
    return collection


def get_tmdb_poster(tmdb_id, media_type='movie'):
    """Resolves a TMDB ID to a full poster URL by fetching the poster_path."""
    if not tmdb_id:
        return None

    cache_key = f"{media_type}_{tmdb_id}"
    if cache_key in TMDB_POSTER_CACHE:
        return TMDB_POSTER_CACHE[cache_key]

    config = load_config()
    api_key = config.get('tmdb_api_key')
    if not api_key:
        return None

    try:
        url = f"https://api.themoviedb.org/3/{media_type}/{tmdb_id}?api_key={api_key}"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            poster_path = data.get('poster_path')
            if poster_path:
                full_url = f"https://image.tmdb.org/t/p/w500{poster_path}"
                TMDB_POSTER_CACHE[cache_key] = full_url
                return full_url
    except Exception as e:
        logging.error(f"Error resolving TMDB poster: {e}")

    return None


def _tmdb_collection_poster_url(collection_id, config=None):
    """TMDB franchise/collection poster (best choice for franchise Jobs)."""
    config = config or load_config()
    tmdb_key = config.get('tmdb_api_key')
    cid = str(collection_id or '').strip()
    if not tmdb_key or not cid:
        return None
    try:
        url = f"https://api.themoviedb.org/3/collection/{cid}?api_key={tmdb_key}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            path = resp.json().get('poster_path')
            if path:
                return f"https://image.tmdb.org/t/p/w780{path}"
    except Exception as e:
        logging.warning(f"TMDB collection poster lookup failed for {cid}: {e}")
    return None


def _resolve_franchise_poster_url(source_type='', source_id='', config=None):
    """TMDB franchise/collection poster when the source is a TMDB collection."""
    config = config or load_config()
    st = normalize_source_type(source_type, source_id)
    if st == 'tmdb_collection' and source_id:
        return _tmdb_collection_poster_url(source_id, config)
    return None


def _item_poster_url(item, plex=None):
    """Best poster URL for a Plex media item."""
    try:
        url = getattr(item, 'posterUrl', None)
        if url:
            return url
        thumb = getattr(item, 'thumb', None)
        if thumb and plex:
            return plex.url(thumb, includeToken=True)
    except Exception:
        pass
    return None


def _collect_mosaic_poster_urls(matched_items=None, external_items=None, plex=None, config=None, limit=4):
    """
    Gather up to `limit` distinct poster URLs for a 2x2 mosaic.
    Prefers local Plex artwork, then TMDB posters from external source items.
    """
    config = config or load_config()
    urls = []
    seen = set()

    def _add(url):
        if not url or not isinstance(url, str):
            return
        key = url.split('?')[0]
        if key in seen:
            return
        seen.add(key)
        urls.append(url)

    for item in matched_items or []:
        if len(urls) >= limit:
            break
        _add(_item_poster_url(item, plex=plex))

    for it in external_items or []:
        if len(urls) >= limit:
            break
        tid = it.get('tmdb_id') or it.get('id')
        if not tid:
            continue
        try:
            tid_int = int(tid)
        except Exception:
            continue
        media = 'tv' if str(it.get('type') or '') in ('show', 'tv', 'series') else 'movie'
        url = get_tmdb_poster(tid_int, media)
        if url:
            _add(url.replace('/w500', '/w780') if '/w500' in url else url)

    return urls[:limit]


def _download_poster_image(url, timeout=12):
    """Download image bytes from a poster URL. Returns PIL Image or None."""
    try:
        from PIL import Image
        import io
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content))
        return img.convert('RGB')
    except Exception as e:
        logging.debug(f"Failed to download poster image: {e}")
        return None


def _build_poster_mosaic(poster_urls, cell_w=500, cell_h=750):
    """
    Build a 2x2 poster collage from up to 4 image URLs.
    Empty cells stay a dark fill. Returns JPEG BytesIO or None.
    """
    if not poster_urls:
        return None
    try:
        from PIL import Image
        import io
        from concurrent.futures import ThreadPoolExecutor, as_completed
    except ImportError:
        logging.warning('Pillow is required to build mosaic collection posters.')
        return None

    urls = list(poster_urls[:4])
    images_by_url = {}
    with ThreadPoolExecutor(max_workers=min(4, len(urls))) as pool:
        futures = {pool.submit(_download_poster_image, url): url for url in urls}
        for fut in as_completed(futures):
            url = futures[fut]
            try:
                img = fut.result()
            except Exception:
                img = None
            if img is not None:
                images_by_url[url] = img

    images = [images_by_url[u] for u in urls if u in images_by_url]
    if not images:
        return None

    canvas = Image.new('RGB', (cell_w * 2, cell_h * 2), (18, 18, 22))
    positions = [(0, 0), (cell_w, 0), (0, cell_h), (cell_w, cell_h)]
    resample = getattr(getattr(Image, 'Resampling', Image), 'LANCZOS', Image.LANCZOS)

    for img, (x, y) in zip(images, positions):
        try:
            src_w, src_h = img.size
            if src_w <= 0 or src_h <= 0:
                continue
            scale = max(cell_w / src_w, cell_h / src_h)
            new_w = max(1, int(src_w * scale))
            new_h = max(1, int(src_h * scale))
            resized = img.resize((new_w, new_h), resample)
            left = max(0, (new_w - cell_w) // 2)
            top = max(0, (new_h - cell_h) // 2)
            cropped = resized.crop((left, top, left + cell_w, top + cell_h))
            canvas.paste(cropped, (x, y))
        except Exception as e:
            logging.debug(f"Mosaic cell compose failed: {e}")

    buf = io.BytesIO()
    canvas.save(buf, format='JPEG', quality=90, optimize=True)
    buf.seek(0)
    return buf


def _collection_has_custom_poster(coll):
    """True if a user/tool-uploaded poster is currently selected."""
    try:
        for poster in coll.posters() or []:
            rk = str(getattr(poster, 'ratingKey', '') or '')
            if getattr(poster, 'selected', False) and rk.startswith('upload://'):
                return True
    except Exception:
        pass
    return False


def _ensure_collection_art(coll, source_type='', source_id='', external_items=None, matched_items=None, config=None, force=False):
    """
    Upload a poster when the collection has no custom art (or force=True).
    Prefer TMDB franchise art; otherwise build a 2x2 mosaic from up to 4 titles.
    Returns True if a poster was uploaded.
    """
    if coll is None:
        return False
    config = config or load_config()
    try:
        coll.reload()
    except Exception:
        pass

    if not force and _collection_has_custom_poster(coll):
        return False

    plex = getattr(coll, '_server', None) or get_plex_instance()
    if not matched_items:
        try:
            # Mosaic only needs a handful of posters — cap the Plex fetch.
            key = getattr(coll, 'key', None) or f'/library/metadata/{coll.ratingKey}'
            matched_items = coll.fetchItems(f'{key}/children', maxresults=24)
        except Exception:
            try:
                matched_items = list(coll.items())[:24]
            except Exception:
                matched_items = []

    title = getattr(coll, 'title', '?')

    # 1) Official franchise / TMDB collection poster
    franchise_url = _resolve_franchise_poster_url(source_type, source_id, config=config)
    if franchise_url:
        try:
            coll.uploadPoster(url=franchise_url)
            try:
                coll.lockPoster()
            except Exception:
                pass
            log_action(f"Set franchise poster for collection '{title}'.")
            return True
        except Exception as e:
            logging.warning(f"Failed to upload franchise poster for '{title}': {e}")

    # 2) 2x2 mosaic from up to 4 item posters (no single-title fallback)
    mosaic_urls = _collect_mosaic_poster_urls(
        matched_items=matched_items,
        external_items=external_items,
        plex=plex,
        config=config,
        limit=4,
    )
    mosaic = _build_poster_mosaic(mosaic_urls)
    if mosaic is not None:
        try:
            coll.uploadPoster(filepath=mosaic)
            try:
                coll.lockPoster()
            except Exception:
                pass
            log_action(f"Set 2x2 mosaic poster for collection '{title}' ({len(mosaic_urls)} titles).")
            return True
        except Exception as e:
            logging.warning(f"Failed to upload mosaic poster for '{title}': {e}")

    logging.info(f"No poster source found for collection '{title}'")
    return False


def create_collection_from_source(library_name, title, source_type, source_id='', sort_order='custom', auto_sync=True, external_items=None):
    """
    Fetch source (or use provided items), match to Plex, create collection, optionally register Job.
    Returns dict: success, matched, total, job_id, title, error?
    """
    title = _normalize_collection_title(title)
    library_name = str(library_name or '').strip()
    config = load_config()
    label = config.get('collexions_label', 'Collexions')
    plex = get_plex_instance()
    if not plex:
        return {"success": False, "error": "Plex connection failed"}

    # Prefer caller-provided items (Preview already loaded them). Only fetch when
    # empty — and never replace a good payload with a failed/empty re-fetch.
    items = [it for it in (external_items or []) if isinstance(it, dict)]
    fetch_error = None
    if source_type and not items:
        try:
            items = fetch_source_items(source_type, source_id, config) or []
        except Exception as e:
            fetch_error = str(e)
            logging.error(f"Failed to fetch upstream source items: {e}")
    elif source_type and items:
        try:
            full_items = fetch_source_items(source_type, source_id, config) or []
            if full_items:
                items = full_items
        except Exception as e:
            logging.warning(f"Upstream re-fetch failed; using provided items: {e}")

    if not items:
        err = "No items found for this source"
        if fetch_error:
            err = f"Could not load titles from source ({fetch_error})"
        return {"success": False, "error": err}

    try:
        with _collection_create_lock(library_name, title):
            library = plex.library.section(library_name)
            mismatch = library_media_mismatch_error(library, source_type, source_id, items)
            if mismatch:
                return {"success": False, "error": mismatch, "matched": 0, "total": len(items)}
            logging.info(f"Matching {len(items)} source items against library '{library_name}'...")
            matched_items = _match_external_to_plex(library, items)
            if not matched_items:
                return {"success": False, "error": "No items matched your local library", "matched": 0, "total": len(items)}

            coll, created_fresh = _upsert_plex_collection(
                library,
                title,
                matched_items,
                sort_order=sort_order,
                label=label,
            )

            art_set = _ensure_collection_art(
                coll,
                source_type=source_type,
                source_id=source_id,
                external_items=items,
                matched_items=matched_items,
                config=config,
                force=created_fresh,
            )

            job_id = None
            if auto_sync and source_type:
                job_id = _register_managed_job(library_name, title, source_type, source_id, sort_order, auto_sync=True)

            GALLERY_CACHE['data'] = None
            log_action(f"Created/updated collection '{title}' with {len(matched_items)}/{len(items)} items matched.")
            return {
                "success": True,
                "matched": len(matched_items),
                "total": len(items),
                "job_id": job_id,
                "title": title,
                "art_set": bool(art_set),
            }
    except RuntimeError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logging.error(f"create_collection_from_source error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def run_sync_job(job_id=None):
    """Refreshes managed collections. If job_id is provided, only syncs that specific job."""
    managed = load_managed_collections()
    if not managed:
        return
        
    config = load_config()
    plex_url = config.get('plex_url')
    plex_token = config.get('plex_token')
    
    if not plex_url or not plex_token:
        log_action("Sync failed: Plex URL or Token missing.")
        return

    from plexapi.server import PlexServer
    try:
        configure_plex_identity()
        plex = PlexServer(plex_url, plex_token)
    except Exception as e:
        log_action(f"Sync failed: Plex connection error: {e}")
        return

    jobs_to_run = [job_id] if job_id else list(managed.keys())
    
    for mid in jobs_to_run:
        job = managed.get(mid)
        if not job or (not job_id and not job.get('auto_sync', True)):
            continue
            
        coll_name = job.get('name')
        lib_name = job.get('library')
        source_id = job.get('source_id')
        source_type = normalize_source_type(job.get('source_type'), source_id)
        if source_type and source_type != job.get('source_type'):
            job['source_type'] = source_type
        sort_order = job.get('sort_order', 'custom')
        
        # Respect schedule if not run manually
        if not job_id:
            next_run_str = job.get('next_run')
            if next_run_str:
                try:
                    next_run_dt = datetime.strptime(next_run_str, "%Y-%m-%d %H:%M:%S")
                    if datetime.now() < next_run_dt:
                        continue # Skip, not time yet
                except Exception:
                    pass # Invalid or missing format, proceed to run
            
        log_action(f"Auto-Sync: Syncing items for '{coll_name}'...")
        
        # Update run stats immediately so they persist even if we exit early
        job['last_run'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        job['next_run'] = (datetime.now() + timedelta(hours=6)).strftime("%Y-%m-%d %H:%M:%S")

        # 1. Fetch latest items
        items = fetch_source_items(source_type, source_id, config)
        if not items:
            log_action(f"Auto-Sync: No items found for '{coll_name}'. Skipping.")
            continue
            
        # 2. Update Plex Collection (recreate if missing)
        try:
            library = plex.library.section(lib_name)
            mismatch = library_media_mismatch_error(library, source_type, source_id, items)
            if mismatch:
                log_action(f"Auto-Sync: Skipping '{coll_name}' — {mismatch}")
                continue
            label = config.get('collexions_label', 'Collexions')
            tmdb_cache = _build_library_tmdb_cache(library)
            plex_items = _match_external_to_plex(library, items, tmdb_cache=tmdb_cache)

            # Fallback: title search for items without TMDB guid match
            if len(plex_items) < max(1, len(items) // 4):
                matched_keys = {getattr(i, 'ratingKey', None) for i in plex_items}
                for itm in items:
                    search_type = 'movie' if itm.get('type') == 'movie' else 'show'
                    results = library.search(title=itm.get('title'), libtype=search_type)
                    if results and results[0].ratingKey not in matched_keys:
                        plex_items.append(results[0])
                        matched_keys.add(results[0].ratingKey)

            if not plex_items:
                log_action(f"Auto-Sync: No matching Plex items found for '{coll_name}'.")
                continue

            try:
                with _collection_create_lock(lib_name, coll_name):
                    coll, recreated = _upsert_plex_collection(
                        library,
                        coll_name,
                        plex_items,
                        sort_order=sort_order,
                        label=label,
                    )
                    _ensure_collection_art(
                        coll,
                        source_type=source_type,
                        source_id=source_id,
                        external_items=items,
                        matched_items=plex_items,
                        config=config,
                        force=recreated,
                    )
                    if recreated:
                        log_action(f"Auto-Sync: Recreated '{coll_name}' with {len(plex_items)} items.")
                    else:
                        log_action(f"Auto-Sync: Updated '{coll_name}'.")
            except RuntimeError as e:
                log_action(f"Auto-Sync: Skipping '{coll_name}' — {e}")
            except Exception as e:
                log_action(f"Auto-Sync error for '{coll_name}': {e}")

        except Exception as e:
            log_action(f"Auto-Sync error for '{coll_name}': {e}")

    save_managed_collections(managed)
    GALLERY_CACHE['data'] = None

def background_sync_loop():
    """Background thread that checks for due jobs every 10 minutes."""
    while True:
        try:
            run_sync_job()
        except Exception as e:
            logging.error(f"Background Sync Loop error: {e}")
        time.sleep(600) # Check every 10 minutes

# Start the background thread
threading.Thread(target=background_sync_loop, daemon=True).start()

def log_action(message):
    """Logs a message to collexions.log in the standard format."""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"{timestamp} - INFO - [WEBUI] {message}\n"
    try:
        with open(LOG_FILE, 'a') as f:
            f.write(log_entry)
        logging.info(f"[WEBUI] {message}")
    except Exception as e:
        logging.error(f"Failed to write to log file: {e}")

def is_script_already_running():
    """Check via psutil if ColleXions.py is running in a process the server didn't start."""
    if not PSUTIL_AVAILABLE:
        return False
    try:
        for proc in psutil.process_iter(['pid', 'cmdline']):
            try:
                cmdline = proc.info.get('cmdline') or []
                if any(SCRIPT_NAME in (arg or '') for arg in cmdline):
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return False

def _check_plex_quick(config, timeout=3):
    """Lightweight Plex reachability check (identity endpoint)."""
    url = str(config.get('plex_url') or '').rstrip('/')
    token = str(config.get('plex_token') or '').strip()
    if not url or not token:
        return False, 'Plex URL/token missing'
    try:
        resp = requests.get(
            f'{url}/identity',
            headers=plex_request_headers(token),
            timeout=timeout,
            verify=PLEX_SSL_VERIFY,
        )
        if resp.status_code == 200:
            return True, None
        return False, f'Plex returned HTTP {resp.status_code}'
    except Exception as e:
        return False, str(e)[:200]


@app.route('/api/health')
@require_auth
def health():
    """Worker health for portal diagnostics (config, script, Plex)."""
    global process
    config = load_config()
    libraries = config.get('library_names') or []
    has_url = bool(str(config.get('plex_url') or '').strip())
    has_token = bool(str(config.get('plex_token') or '').strip())

    script_status = 'stopped'
    if process is not None and process.poll() is None:
        script_status = 'running'
    elif is_script_already_running():
        script_status = 'running'

    plex_ok, plex_error = _check_plex_quick(config)
    issues = []
    if not has_url or not has_token:
        issues.append('Plex URL or token is not configured in Collexions.')
    elif not plex_ok:
        issues.append(f'Cannot reach Plex: {plex_error}')
    if not libraries:
        issues.append('No libraries selected — pinning has nothing to process.')
    if script_status == 'stopped':
        issues.append('Pinning service is stopped (Start Service or enable Auto-start).')

    return jsonify({
        'ok': plex_ok and bool(libraries),
        'worker': True,
        'portal_mode': bool(PORTAL_MODE),
        'autostart': env_flag_enabled('COLLEXIONS_AUTOSTART'),
        'config': {
            'plex_url': has_url,
            'plex_token': has_token,
            'library_count': len(libraries),
            'dry_run': bool(config.get('dry_run')),
        },
        'script': script_status,
        'plex': {'ok': plex_ok, 'error': plex_error},
        'issues': issues,
    })


def _read_status_file():
    """Read worker-written status.json (same path ColleXions.py uses under COLLEXIONS_DATA_DIR)."""
    if not os.path.exists(STATUS_FILE):
        return {}
    try:
        with open(STATUS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        logging.warning(f"Failed to read status file: {e}")
        return {}


def _next_run_from_logs():
    """Legacy fallback when status.json has no next_run_timestamp."""
    if not os.path.exists(LOG_FILE):
        return 0
    try:
        with open(LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()[-100:]
        for line in reversed(lines):
            if "Sleeping for approximately" not in line:
                continue
            match = re.search(
                r'(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}).*?Sleeping\sfor\sapproximately\s(\d+(?:\.\d+)?)',
                line,
            )
            if not match:
                continue
            log_time = time.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
            return time.mktime(log_time) + int(float(match.group(2)))
    except Exception as e:
        logging.warning(f"Status log parse error: {e}")
    return 0


@app.route('/api/status')
@require_auth
def get_status():
    global process
    process_alive = False
    if process is not None and process.poll() is None:
        process_alive = True
    elif is_script_already_running():
        process_alive = True

    file_status = _read_status_file()
    file_msg = str(file_status.get('status') or '').strip()

    # Prefer the detailed message from status.json while the pin script is alive
    # (e.g. "Sleeping (30 min)", "Processing: Movies").
    if process_alive and file_msg:
        status = file_msg
    elif process_alive:
        status = "Running"
    elif process is not None and process.poll() is not None and process.returncode not in (0, None):
        status = file_msg or "Error (Check Logs)"
    else:
        status = file_msg if file_msg and file_msg.lower() not in ('running', 'initializing') else "Idle"

    next_run_timestamp = 0
    raw_next = file_status.get('next_run_timestamp')
    try:
        if raw_next is not None:
            next_run_timestamp = float(raw_next)
    except (TypeError, ValueError):
        next_run_timestamp = 0
    if next_run_timestamp <= 0:
        next_run_timestamp = _next_run_from_logs() or 0

    last_run_at = str(file_status.get('last_run_at') or '').strip()
    last_update = last_run_at or str(file_status.get('last_update') or '').strip()
    if not last_update and os.path.exists(LOG_FILE):
        try:
            last_update = time.ctime(os.path.getmtime(LOG_FILE))
        except OSError:
            last_update = ""

    payload = {
        "status": status,
        "last_update": last_update,
        "last_run_at": last_run_at or None,
        "last_run_started_at": file_status.get('last_run_started_at'),
        "last_run_duration_seconds": file_status.get('last_run_duration_seconds'),
        "last_run_pinned": file_status.get('last_run_pinned'),
        "next_run_timestamp": next_run_timestamp,
        "pin_slots": file_status.get('pin_slots'),
        "libraries": file_status.get('libraries') if isinstance(file_status.get('libraries'), list) else [],
        "fairness": file_status.get('fairness') if isinstance(file_status.get('fairness'), dict) else {},
        "process_alive": process_alive,
        "status_source": "status.json" if file_status else ("logs" if next_run_timestamp else "none"),
    }
    return jsonify(payload)


@app.route('/api/summary')
@require_auth
def get_summary():
    """Compact status for the portal home widget (last/next run + labeled pin count)."""
    global SUMMARY_CACHE, GALLERY_CACHE

    now = time.time()
    if SUMMARY_CACHE['data'] is not None and now - SUMMARY_CACHE['timestamp'] < SUMMARY_CACHE['ttl']:
        return jsonify(SUMMARY_CACHE['data'])

    # Reuse status fields
    status_resp = get_status()
    status_payload = status_resp.get_json() if hasattr(status_resp, 'get_json') else {}
    if not isinstance(status_payload, dict):
        status_payload = {}

    config = load_config()
    pin_map = config.get('number_of_collections_to_pin') or {}
    lib_names = config.get('library_names') or []
    pin_slots = 0
    for lib_name in lib_names:
        try:
            pin_slots += max(0, int(pin_map.get(lib_name, 0) or 0))
        except (TypeError, ValueError):
            continue
    label = str(config.get('collexions_label') or 'Collexions').lower()

    pinned_count = None
    labeled_count = 0

    # Prefer a full gallery cache (pins already resolved)
    cache_data = GALLERY_CACHE.get('data')
    cache_ver = GALLERY_CACHE.get('version')
    if isinstance(cache_data, list) and cache_ver == 4:
        pinned_count = sum(1 for c in cache_data if c.get('is_pinned'))
        labeled_count = sum(1 for c in cache_data if c.get('has_label'))
    else:
        plex = get_plex_instance()
        if plex and lib_names:
            pinned = 0
            try:
                for lib_name in lib_names:
                    try:
                        library = plex.library.section(lib_name)
                        for coll in library.collections():
                            has_label = any(
                                getattr(l, 'tag', '').lower() == label
                                for l in getattr(coll, 'labels', []) or []
                            )
                            if not has_label:
                                continue
                            labeled_count += 1
                            if _collection_is_pinned(coll):
                                pinned += 1
                    except Exception as e:
                        logging.warning(f"summary library '{lib_name}' failed: {e}")
                pinned_count = pinned
            except Exception as e:
                logging.warning(f"summary pin count failed: {e}")
                pinned_count = None

    # Prefer slots from the last completed run when present; else config sum.
    status_slots = status_payload.get('pin_slots')
    try:
        status_slots = int(status_slots) if status_slots is not None else None
    except (TypeError, ValueError):
        status_slots = None

    payload = {
        **status_payload,
        "pinned_count": pinned_count,
        "labeled_count": labeled_count,
        "pin_slots": status_slots if status_slots is not None else pin_slots,
        "last_run_at": status_payload.get('last_run_at') or status_payload.get('last_update'),
    }
    SUMMARY_CACHE['data'] = payload
    SUMMARY_CACHE['timestamp'] = time.time()
    return jsonify(payload)


@app.route('/api/logs')
@require_auth
def get_logs():
    if os.path.exists(LOG_FILE):
        try:
            # Efficiently tail the log file
            # We'll return the last ~2000 lines or ~200KB of data
            max_bytes = 200 * 1024 # 200KB limit
            with open(LOG_FILE, 'rb') as f:
                f.seek(0, os.SEEK_END)
                file_size = f.tell()
                
                # Seek backwards from the end
                offset = min(file_size, max_bytes)
                f.seek(file_size - offset)
                
                content = f.read().decode('utf-8', errors='replace')
                # Optional: Split lines to ensure we don't start mid-line
                lines = content.splitlines()
                if len(lines) > 1 and not content.startswith('\n'):
                    # Discard the first (potentially partial) line
                    lines.pop(0)
                body = "\n".join(lines)
                return Response(
                    body,
                    mimetype='text/plain; charset=utf-8',
                    headers={'Cache-Control': 'no-store, no-cache, must-revalidate'},
                )
        except Exception as e:
            return f"Error reading log file: {e}"
    return "No logs found. Run the script to generate logs."

@app.route('/api/logs/clear', methods=['POST'])
@require_auth
def clear_logs():
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'w') as f:
                f.write(f"Log file cleared at {time.ctime()}\n")
            return jsonify({"success": True})
        return jsonify({"error": "Log file not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/config', methods=['GET', 'POST'])
@require_auth
def config_endpoint():
    global _plex_cache, GALLERY_CACHE, SUMMARY_CACHE
    if request.method == 'POST':
        payload = request.json or {}
        if save_config(payload, merge=True):
            # Config changes (especially plex_url/token) must not keep a stale PlexServer.
            _plex_cache = None
            GALLERY_CACHE['data'] = None
            GALLERY_CACHE['timestamp'] = 0
            SUMMARY_CACHE['data'] = None
            SUMMARY_CACHE['timestamp'] = 0
            return jsonify({"success": True})
        return jsonify({"error": "Failed to save configuration"}), 500
    
    return jsonify(load_config())


@app.route('/api/config/validate', methods=['POST'])
@require_auth
def validate_config_endpoint():
    """Validate a draft config (does not save). Checks fields + live Plex libraries."""
    data = request.json or {}
    errors = []
    warnings = []
    available = []

    url = str(data.get('plex_url') or '').strip()
    token = str(data.get('plex_token') or '').strip()
    if not url:
        errors.append('Plex URL is required.')
    elif not (url.startswith('http://') or url.startswith('https://')):
        warnings.append('Plex URL should start with http:// or https://')
    if not token:
        errors.append('Plex token is required.')

    libs_raw = data.get('library_names') or []
    if not isinstance(libs_raw, list):
        libs_raw = []
    libs = [str(x).strip() for x in libs_raw if str(x).strip()]
    if not libs:
        errors.append('Add at least one Plex library.')

    pins = data.get('number_of_collections_to_pin') or {}
    if not isinstance(pins, dict):
        pins = {}
    total_pins = 0
    for lib in libs:
        try:
            n = int(pins.get(lib, 0))
        except (TypeError, ValueError):
            errors.append(f'Pin limit for "{lib}" must be a whole number ≥ 0.')
            continue
        if n < 0:
            errors.append(f'Pin limit for "{lib}" must be ≥ 0.')
        else:
            total_pins += n
            if n == 0:
                warnings.append(f'"{lib}" has 0 pin slots — nothing will be pinned there.')
    if libs and total_pins == 0:
        warnings.append('All libraries have 0 pin slots. The service will not pin anything.')

    try:
        interval = int(data.get('pinning_interval') or 0)
        if interval < 1:
            errors.append('Check interval must be at least 1 minute.')
    except (TypeError, ValueError):
        errors.append('Check interval must be a number.')

    for pattern in (data.get('regex_exclusion_patterns') or []):
        p = str(pattern or '').strip()
        if not p:
            continue
        try:
            re.compile(p)
        except re.error:
            errors.append(f'Invalid regex exclusion: {p}')

    # Live Plex connection + library existence (draft credentials, not saved config)
    if url and token:
        try:
            configure_plex_identity()
            from plexapi.server import PlexServer
            plex = PlexServer(url, token, timeout=10)
            sections = list(plex.library.sections())
            available = [s.title for s in sections]
            available_set = set(available)
            for lib in libs:
                if lib not in available_set:
                    # Suggest close matches by case
                    lower_map = {a.lower(): a for a in available}
                    hint = lower_map.get(lib.lower())
                    if hint and hint != lib:
                        errors.append(f'Library "{lib}" not found on Plex (did you mean "{hint}"?).')
                    else:
                        errors.append(f'Library "{lib}" was not found on this Plex server.')
        except Exception as e:
            errors.append(f'Cannot connect to Plex with these credentials: {e}')

    # Dedupe while preserving order
    def _uniq(items):
        seen = set()
        out = []
        for x in items:
            if x in seen:
                continue
            seen.add(x)
            out.append(x)
        return out

    errors = _uniq(errors)
    warnings = _uniq(warnings)
    return jsonify({
        'ok': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'available_libraries': available,
    })


def sync_logs_to_history():
    """Parses LOG_FILE and appends new pin events to HISTORY_FILE."""
    if not os.path.exists(LOG_FILE):
        return
        
    logging.debug("Starting auto-sync of logs to history...")
    
    # 1. Load existing history
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)
                if not isinstance(history, list):
                    history = []
        except:
            history = []
            
    # Create lookup for deduplication
    existing_keys = set()
    for e in history:
        # Use ISO format for consistency in key
        key = f"{e.get('timestamp')}|{e.get('library')}|{e.get('collectionName')}"
        existing_keys.add(key)
        
    # 2. Parse Logs
    new_events = []
    current_library = "Unknown Library"
    
    # Regex patterns (matching frontend logic)
    lib_regex = re.compile(r'Processing Library:.*?[\'"](.+?)[\'"]')
    # Updated pin regex to be more robust
    pin_regex = re.compile(r'(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{1,2}(?:\.\d+)?).*?(?:Pinning:|Pinned|Processing for pin:)\s+[\'"](.+?)[\'"]')
    
    try:
        with open(LOG_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                # Library match
                lib_match = lib_regex.search(line)
                if lib_match:
                    current_library = lib_match.group(1)
                    continue
                    
                # Pin match
                pin_match = pin_regex.search(line)
                if pin_match:
                    raw_ts = pin_match.group(1).strip().replace(' ', 'T').replace(',', '.')
                    coll_name = pin_match.group(2)
                    
                    # Normalize timestamp for ISO
                    try:
                        # Ensure T separator
                        if 'T' not in raw_ts:
                            raw_ts = raw_ts.replace(' ', 'T')
                        
                        # Basic validation, convert to ISO if possible
                        # We just store the string for now, but ensure consistency
                        ts_key = f"{raw_ts}|{current_library}|{coll_name}"
                        
                        if ts_key not in existing_keys:
                            new_events.append({
                                "timestamp": raw_ts,
                                "collectionName": coll_name,
                                "library": current_library
                            })
                            existing_keys.add(ts_key)
                    except:
                        continue
    except Exception as e:
        logging.error(f"Error parsing logs for sync: {e}")
        return

    # 3. Save if new events found
    if new_events:
        logging.info(f"Auto-sync found {len(new_events)} new events. Archiving to history.json")
        history.extend(new_events)
        # Sort by timestamp decending? history is usually stored ascending or just appended
        # Stats page sorts them, so append is fine.
        try:
            ensure_dir_exists(HISTORY_FILE)
            with open(HISTORY_FILE, 'w') as f:
                json.dump(history, f, indent=4)
        except Exception as e:
            logging.error(f"Error saving history during sync: {e}")

# --- History Endpoint (New) ---
@app.route('/api/history', methods=['GET', 'POST'])
@require_auth
def history_endpoint():
    if request.method == 'POST':
        try:
            data = request.json
            ensure_dir_exists(HISTORY_FILE)
            with open(HISTORY_FILE, 'w') as f:
                json.dump(data, f, indent=4)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    # Auto-sync from logs before returning GET
    sync_logs_to_history()
    
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                return jsonify({"events": [], "total_count": 0, "unique_count": 0})

            total_count = len(data)
            unique_count = len(set(e.get('collectionName') for e in data if 'collectionName' in e))
                
            limit = request.args.get('limit', type=int)
            returned_events = data[-limit:] if limit else data
                
            return jsonify({
                "events": returned_events,
                "total_count": total_count,
                "unique_count": unique_count
            })
        except Exception as e:
            return jsonify({"events": [], "total_count": 0, "unique_count": 0, "error": str(e)})
    return jsonify({"events": [], "total_count": 0, "unique_count": 0})

def start_background_process():
    """Helper to start the background process."""
    global process
    
    # Don't start if already running via managed process
    if process and process.poll() is None:
        return False, "Script is already running"
    
    # Don't start if an external instance is already running (e.g. started before server)
    if is_script_already_running():
        return False, "Script is already running (external process detected)"
    
    # Check if script exists
    script_path = os.path.join(BASE_DIR, SCRIPT_NAME)
    if not os.path.exists(script_path):
        return False, f"Script {SCRIPT_NAME} not found."

    try:
        # Run with data-dir cwd so relative paths and COLLEXIONS_DATA_DIR stay aligned.
        # Script path stays absolute under BASE_DIR (code), while config/logs live in _DATA_ROOT.
        cmd = [sys.executable, "-u", script_path]
        try:
            cfg = load_config()
            if cfg.get('dry_run'):
                cmd.append('--dry-run')
        except Exception:
            pass

        child_env = os.environ.copy()
        if _DATA_ROOT:
            child_env['COLLEXIONS_DATA_DIR'] = _DATA_ROOT

        process = subprocess.Popen(
            cmd,
            cwd=_DATA_ROOT,
            env=child_env,
        )
        logging.info(f"Background process started with PID: {process.pid} (cwd={_DATA_ROOT})")
            
        return True, process.pid
    except Exception as e:
        logging.error(f"Failed to start background process: {e}")
        return False, str(e)

@app.route('/api/run', methods=['POST'])
@require_auth
def run_script():
    success, result = start_background_process()
    if not success:
        return jsonify({"error": result}), 400 if "running" in result else 404 if "not found" in result else 500
    return jsonify({"success": True, "pid": result})

def maybe_autostart_background_process():
    if not env_flag_enabled('COLLEXIONS_AUTOSTART'):
        return

    if not config_ready_for_background_process():
        return

    success, result = start_background_process()
    if success:
        logging.info(f"Background service autostarted with PID: {result}")
    else:
        logging.warning(f"Background service autostart skipped: {result}")

# --- Plex Helpers ---
_plex_cache = None

def get_plex_instance():
    global _plex_cache
    if _plex_cache:
        return _plex_cache
        
    config = load_config()
    url = config.get('plex_url')
    token = config.get('plex_token')
    if not url or not token:
        return None
    try:
        configure_plex_identity()
        from plexapi.server import PlexServer
        _plex_cache = PlexServer(url, token)
        return _plex_cache
    except Exception as e:
        logging.error(f"Plex connection error: {e}")
        return None

# --- Gallery Endpoints ---
def _collection_is_pinned(coll):
    """Resolve home-pin state via Plex hub visibility (expensive — avoid on first paint)."""
    try:
        hubs = coll.visibility()
        if not isinstance(hubs, list):
            hubs = [hubs] if hubs else []
        for h in hubs:
            if not h:
                continue
            if getattr(h, 'promotedToOwnHome', False) or getattr(h, 'promotedToSharedHome', False):
                return True
            if getattr(h, 'context', '') == 'home' and (getattr(h, 'promoted', False) or getattr(h, '_promoted', False)):
                return True
    except Exception:
        pass
    return False


def _scan_collections_list(plex, config, light=True):
    """Build the gallery collections payload (no coll.items() when light)."""
    lib_names = config.get('library_names', [])
    collexions_label = config.get('collexions_label', 'Collexions').lower()
    from urllib.parse import quote
    server_id = getattr(plex, 'machineIdentifier', None) or ''

    all_collections = []
    for lib_name in lib_names:
        try:
            library = plex.library.section(lib_name)
            for coll in library.collections():
                has_label = any(l.tag.lower() == collexions_label for l in getattr(coll, 'labels', []))

                if light:
                    is_pinned = False
                    pin_resolved = False
                else:
                    is_pinned = _collection_is_pinned(coll)
                    pin_resolved = True

                thumb = getattr(coll, 'thumb', None)
                if not thumb:
                    thumb = getattr(coll, 'composite', None) or getattr(coll, 'art', None)

                if thumb and isinstance(thumb, str) and thumb.startswith('http'):
                    from urllib.parse import urlparse
                    thumb = urlparse(thumb).path

                if not thumb and getattr(coll, 'ratingKey', None):
                    thumb = f'/library/collections/{coll.ratingKey}/composite'

                meta_key = getattr(coll, 'key', None) or f'/library/metadata/{coll.ratingKey}'
                plex_url = ''
                if server_id and meta_key:
                    plex_url = (
                        f"https://app.plex.tv/desktop/#!/server/{server_id}/details"
                        f"?key={quote(meta_key)}"
                    )

                all_collections.append({
                    "title": coll.title,
                    "library": lib_name,
                    "is_pinned": is_pinned,
                    "pin_resolved": pin_resolved,
                    "has_label": has_label,
                    "thumb": thumb,
                    "ratingKey": str(coll.ratingKey),
                    "itemCount": _collection_item_count_light(coll),
                    "key": meta_key,
                    "plexUrl": plex_url,
                })
        except Exception as e:
            print(f"Error fetching collections from {lib_name}: {e}")
    return all_collections


def _refresh_gallery_cache_bg(cache_version, light):
    """Background Plex scan so Cloudflare never waits on a full gallery rebuild."""
    global GALLERY_CACHE, _GALLERY_REFRESH_RUNNING
    try:
        plex = get_plex_instance()
        if not plex:
            return
        config = load_config()
        all_collections = _scan_collections_list(plex, config, light=light)
        GALLERY_CACHE['data'] = all_collections
        GALLERY_CACHE['timestamp'] = time.time()
        GALLERY_CACHE['version'] = cache_version
        logging.info(
            "Gallery cache refreshed in background (light=%s, count=%s)",
            light,
            len(all_collections),
        )
    except Exception as exc:
        logging.warning("Background gallery refresh failed: %s", exc)
    finally:
        with _GALLERY_REFRESH_LOCK:
            _GALLERY_REFRESH_RUNNING.discard(cache_version)


def _schedule_gallery_refresh(cache_version, light):
    with _GALLERY_REFRESH_LOCK:
        if cache_version in _GALLERY_REFRESH_RUNNING:
            return
        _GALLERY_REFRESH_RUNNING.add(cache_version)
    threading.Thread(
        target=_refresh_gallery_cache_bg,
        args=(cache_version, light),
        daemon=True,
        name=f"gallery-refresh-{cache_version}",
    ).start()


@app.route('/api/collections')
@require_auth
def list_collections():
    global GALLERY_CACHE

    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    # light=true (default): skip per-collection visibility() for fast first paint
    light = request.args.get('light', 'true').lower() != 'false'
    cache_version = 3 if light else 4

    now = time.time()
    cache_hit = (
        GALLERY_CACHE['data'] is not None
        and GALLERY_CACHE.get('version') == cache_version
    )
    cache_fresh = cache_hit and (now - GALLERY_CACHE['timestamp'] < GALLERY_CACHE['ttl'])

    # Fresh cache — serve immediately.
    if cache_fresh and not force_refresh:
        print(f"Serving collections from cache (light={light})")
        return jsonify(GALLERY_CACHE['data'])

    # Stale-while-revalidate: return last good list instantly (survives CF ~100s timeout)
    # and refresh in the background. Manual refresh also prefers this when a prior scan exists.
    if cache_hit:
        print(f"Serving stale collections cache + background refresh (light={light}, force={force_refresh})")
        _schedule_gallery_refresh(cache_version, light)
        return jsonify(GALLERY_CACHE['data'])

    plex = get_plex_instance()
    if not plex:
        return jsonify({"error": "Plex not configured"}), 400

    config = load_config()
    all_collections = _scan_collections_list(plex, config, light=light)

    GALLERY_CACHE['data'] = all_collections
    GALLERY_CACHE['timestamp'] = time.time()
    GALLERY_CACHE['version'] = cache_version

    return jsonify(all_collections)


@app.route('/api/collections/<rating_key>/items')
@require_auth
def list_collection_items(rating_key):
    """Return member ratingKeys for one Plex collection (used by overlays + tooling)."""
    plex = get_plex_instance()
    if not plex:
        return jsonify({"error": "Plex not configured"}), 400

    key = str(rating_key or '').strip()
    if not key or not key.isdigit():
        return jsonify({"error": "Invalid collection ratingKey"}), 400

    try:
        coll = plex.fetchItem(int(key))
    except Exception as exc:
        logging.warning("fetchItem collection %s failed: %s", key, exc)
        return jsonify({"error": "Collection not found"}), 404

    members = []
    seen = set()
    try:
        # Paginate — Plex container defaults truncate large collections.
        start = 0
        page_size = 100
        key_path = getattr(coll, 'key', None) or f'/library/metadata/{key}'
        while True:
            try:
                batch = coll.fetchItems(f'{key_path}/children', container_start=start, container_size=page_size)
            except TypeError:
                batch = list(coll.items() or [])
                start = -1  # signal single-shot
            except Exception:
                if start == 0:
                    batch = list(coll.items() or [])
                    start = -1
                else:
                    break
            if not batch:
                break
            for item in batch:
                rk = str(getattr(item, 'ratingKey', '') or '').strip()
                if not rk or rk in seen:
                    continue
                seen.add(rk)
                members.append({
                    "ratingKey": rk,
                    "title": getattr(item, 'title', '') or '',
                    "type": str(getattr(item, 'type', '') or ''),
                    "library": getattr(item, 'librarySectionTitle', None) or '',
                })
            if start < 0 or len(batch) < page_size:
                break
            start += page_size
    except Exception as exc:
        logging.warning("collection items %s failed: %s", key, exc)
        return jsonify({"error": f"Failed to list collection items: {exc}"}), 500

    return jsonify({
        "ratingKey": key,
        "title": getattr(coll, 'title', '') or '',
        "count": len(members),
        "items": members,
    })


@app.route('/api/collections/resolve-pins', methods=['POST'])
@require_auth
def resolve_collection_pins():
    """Enrich pin state for a batch of collections after a light gallery load."""
    plex = get_plex_instance()
    if not plex:
        return jsonify({"error": "Plex not configured"}), 400

    data = request.json or {}
    items = data.get('items') or []
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"pins": {}})

    # Cap to keep request time bounded
    items = items[:400]
    pins = {}
    by_library = {}
    for item in items:
        lib = str(item.get('library') or '').strip()
        title = str(item.get('title') or '').strip()
        if not lib or not title:
            continue
        by_library.setdefault(lib, []).append(title)

    for lib_name, titles in by_library.items():
        try:
            library = plex.library.section(lib_name)
            for title in titles:
                key = f'{lib_name}\0{title}'
                try:
                    coll = library.collection(title)
                    pins[key] = _collection_is_pinned(coll)
                except Exception:
                    pins[key] = False
        except Exception as e:
            logging.warning(f"resolve-pins library '{lib_name}' failed: {e}")
            for title in titles:
                pins[f'{lib_name}\0{title}'] = False

    return jsonify({"pins": pins})


@app.route('/api/collections/bulk', methods=['POST'])
@require_auth
def bulk_pin_collections():
    """Pin, unpin, or delete many collections in one request."""
    global GALLERY_CACHE
    plex = get_plex_instance()
    config = load_config()
    label = config.get('collexions_label', 'Collexions')
    data = request.json or {}
    action = str(data.get('action') or '').lower()
    items = data.get('items') or []

    if action not in ('pin', 'unpin', 'delete'):
        return jsonify({"success": False, "error": "action must be pin, unpin, or delete"}), 400
    if not plex or not isinstance(items, list) or not items:
        return jsonify({"success": False, "error": "Invalid request"}), 400

    items = items[:100]
    results = []
    for item in items:
        title = str(item.get('title') or '').strip()
        library_name = str(item.get('library') or '').strip()
        rating_key = str(item.get('ratingKey') or item.get('rating_key') or '').strip()
        if not library_name or (not title and not rating_key):
            results.append({"title": title, "library": library_name, "ok": False, "error": "Missing title/library"})
            continue
        if action == 'delete':
            ok, err, removed_jobs = _delete_plex_collection(
                library_name,
                title=title or None,
                rating_key=rating_key or None,
            )
            results.append({
                "title": title,
                "library": library_name,
                "ok": ok,
                "error": err,
                "removed_jobs": removed_jobs,
            })
            continue
        try:
            library = plex.library.section(library_name)
            collection = _resolve_collection(library, title=title or None, rating_key=rating_key or None)
            if not collection:
                results.append({"title": title, "library": library_name, "ok": False, "error": "Collection not found"})
                continue
            hub = collection.visibility()
            if action == 'pin':
                collection.addLabel(label)
                hub.promoteHome()
                hub.promoteShared()
                log_action(f"Pinned '{title}' successfully.")
            else:
                try:
                    collection.removeLabel(label)
                except Exception:
                    pass
                hub.demoteHome()
                hub.demoteShared()
                log_action(f"Unpinned '{title}' successfully.")
            results.append({"title": title, "library": library_name, "ok": True})
        except Exception as e:
            results.append({"title": title, "library": library_name, "ok": False, "error": str(e)})

    GALLERY_CACHE['data'] = None
    GALLERY_CACHE['timestamp'] = 0
    SUMMARY_CACHE['data'] = None
    SUMMARY_CACHE['timestamp'] = 0
    ok_count = sum(1 for r in results if r.get('ok'))
    return jsonify({"success": True, "ok_count": ok_count, "results": results})


@app.route('/api/cache/clear', methods=['POST'])
@require_auth
def clear_cache():
    """Force-clears all server-side caches so the next request re-fetches fresh data."""
    global GALLERY_CACHE, IMAGE_CACHE, SUMMARY_CACHE, _plex_cache
    GALLERY_CACHE['data'] = None
    GALLERY_CACHE['timestamp'] = 0
    SUMMARY_CACHE['data'] = None
    SUMMARY_CACHE['timestamp'] = 0
    IMAGE_CACHE = {}
    _plex_cache = None  # also reset the Plex connection so composite paths reload cleanly
    return jsonify({"success": True, "message": "Gallery, image, and Plex caches cleared."})


@app.route('/api/plex/libraries')
@require_auth
def plex_libraries():
    """Fetches all available library sections from Plex."""
    plex = get_plex_instance()
    if not plex:
        return jsonify({"error": "Plex connection failed"}), 500
        
    try:
        sections = plex.library.sections()
        libraries = []
        for s in sections:
            libraries.append({
                'name': s.title,
                'type': s.type,
                'uuid': getattr(s, 'uuid', s.key)
            })
        return jsonify(libraries)
    except Exception as e:
        logging.error(f"Failed to fetch Plex libraries: {e}")
        return jsonify({"error": str(e)}), 500


def _hub_to_dict(hub):
    identifier = getattr(hub, 'identifier', None) or ''
    return {
        'identifier': identifier,
        'title': getattr(hub, 'title', '') or identifier,
        'promoted_to_recommended': bool(getattr(hub, 'promotedToRecommended', False)),
        'promoted_to_home': bool(getattr(hub, 'promotedToOwnHome', False)),
        'promoted_to_shared': bool(getattr(hub, 'promotedToSharedHome', False)),
        'deletable': bool(getattr(hub, 'deletable', False)),
        'is_collection': str(identifier).startswith('custom.collection.'),
    }


def _find_managed_hub(library, identifier):
    for hub in library.managedHubs():
        if getattr(hub, 'identifier', None) == identifier:
            return hub
    return None


@app.route('/api/hubs', methods=['GET'])
@require_auth
def list_managed_hubs():
    """List Managed Recommendations for a library (same order as Plex Settings → Libraries)."""
    library_name = str(request.args.get('library') or '').strip()
    if not library_name:
        return jsonify({'error': 'Missing library'}), 400
    plex = get_plex_instance()
    if not plex:
        return jsonify({'error': 'Plex connection failed'}), 500
    try:
        library = plex.library.section(library_name)
        hubs = [_hub_to_dict(h) for h in library.managedHubs()]
        return jsonify({
            'library': library.title,
            'library_type': library.type,
            'section_id': library.key,
            'hubs': hubs,
        })
    except Exception as e:
        logging.error(f"list_managed_hubs error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/hubs/move', methods=['POST'])
@require_auth
def move_managed_hub():
    """Reorder a managed hub (drag-and-drop equivalent of Plex Manage Library)."""
    data = request.json or {}
    library_name = str(data.get('library') or '').strip()
    identifier = str(data.get('identifier') or '').strip()
    after = data.get('after')
    after_identifier = str(after).strip() if after else ''

    if not library_name or not identifier:
        return jsonify({'success': False, 'error': 'Missing library/identifier'}), 400

    plex = get_plex_instance()
    if not plex:
        return jsonify({'success': False, 'error': 'Plex connection failed'}), 500
    try:
        library = plex.library.section(library_name)
        hub = _find_managed_hub(library, identifier)
        if not hub:
            return jsonify({'success': False, 'error': 'Hub not found in managed list'}), 404
        after_hub = None
        if after_identifier:
            after_hub = _find_managed_hub(library, after_identifier)
            if not after_hub:
                return jsonify({'success': False, 'error': 'After hub not found'}), 404
        hub.move(after=after_hub)
        log_action(f"Moved hub '{hub.title}' in '{library_name}'.")
        hubs = [_hub_to_dict(h) for h in library.managedHubs()]
        return jsonify({'success': True, 'hubs': hubs})
    except Exception as e:
        logging.error(f"move_managed_hub error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/hubs/visibility', methods=['POST'])
@require_auth
def update_managed_hub_visibility():
    """Toggle Library Recommended / Home / Friends' Home for a managed hub."""
    data = request.json or {}
    library_name = str(data.get('library') or '').strip()
    identifier = str(data.get('identifier') or '').strip()
    if not library_name or not identifier:
        return jsonify({'success': False, 'error': 'Missing library/identifier'}), 400

    plex = get_plex_instance()
    if not plex:
        return jsonify({'success': False, 'error': 'Plex connection failed'}), 500
    try:
        library = plex.library.section(library_name)
        hub = _find_managed_hub(library, identifier)
        if not hub:
            return jsonify({'success': False, 'error': 'Hub not found in managed list'}), 404

        kwargs = {}
        if 'recommended' in data:
            kwargs['recommended'] = bool(data.get('recommended'))
        if 'home' in data:
            kwargs['home'] = bool(data.get('home'))
        if 'shared' in data:
            kwargs['shared'] = bool(data.get('shared'))
        if not kwargs:
            return jsonify({'success': False, 'error': 'Provide recommended, home, and/or shared'}), 400

        hub.updateVisibility(**kwargs)
        log_action(f"Updated hub visibility for '{hub.title}' in '{library_name}'.")
        GALLERY_CACHE['data'] = None
        GALLERY_CACHE['timestamp'] = 0
        SUMMARY_CACHE['data'] = None
        SUMMARY_CACHE['timestamp'] = 0
        refreshed = _find_managed_hub(library, identifier) or hub
        return jsonify({'success': True, 'hub': _hub_to_dict(refreshed)})
    except Exception as e:
        logging.error(f"update_managed_hub_visibility error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/trending', methods=['GET'])
@require_auth
def get_trending():
    global PRESETS_CACHE
    now = time.time()
    cache_ver = PRESETS_CACHE.get('version')
    if (
        PRESETS_CACHE['data']
        and cache_ver == 3
        and (now - PRESETS_CACHE['timestamp'] < PRESETS_CACHE['ttl'])
    ):
        logging.debug("Returning cached trending presets")
        return jsonify(PRESETS_CACHE['data'])

    logging.info("Fetching fresh trending presets from TMDb and Trakt")
    config = load_config()
    tmdb_key = config.get('tmdb_api_key')
    trakt_id = config.get('trakt_client_id')

    catalog = []
    for entry in TRENDING_PRESET_CATALOG:
        src = entry.get('source')
        if src == 'TMDb' and not tmdb_key:
            continue
        if src == 'Trakt' and not trakt_id:
            continue
        catalog.append(entry)

    presets = []

    def build_one(entry):
        recipe = dict(entry['recipe'])
        items = fetch_trending_preset_recipe(recipe, config, include_posters=True)
        if not items:
            return None
        return {
            'id': entry['id'],
            'source_type': 'trending_preset',
            'source_id': json.dumps(recipe, separators=(',', ':')),
            'name': entry['name'],
            'description': entry['description'],
            'source': entry['source'],
            'media': entry['media'],
            'items': items,
        }

    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = {pool.submit(build_one, entry): entry['id'] for entry in catalog}
            by_id = {}
            for fut in as_completed(futures):
                try:
                    result = fut.result()
                    if result:
                        by_id[result['id']] = result
                except Exception as e:
                    logging.error(f"Preset build failed for {futures[fut]}: {e}")
        # Keep catalog order
        for entry in catalog:
            if entry['id'] in by_id:
                presets.append(by_id[entry['id']])
    except Exception as e:
        logging.error(f"Trending presets parallel fetch failed, falling back: {e}")
        for entry in catalog:
            try:
                built = build_one(entry)
                if built:
                    presets.append(built)
            except Exception as inner:
                logging.error(f"Preset build failed for {entry.get('id')}: {inner}")

    PRESETS_CACHE['data'] = presets
    PRESETS_CACHE['timestamp'] = now
    PRESETS_CACHE['version'] = 3
    return jsonify(presets)

@app.route('/api/proxy/image')
@require_auth_or_query_token
def proxy_image():
    """Proxy collection artwork from Plex via photo transcode (small, cacheable)."""
    global IMAGE_CACHE
    from urllib.parse import quote

    thumb = request.args.get('thumb')
    if not thumb:
        return Response(status=404)

    try:
        width = max(40, min(800, int(request.args.get('width') or 320)))
        height = max(40, min(1200, int(request.args.get('height') or 480)))
    except (TypeError, ValueError):
        width, height = 320, 480

    # If thumb is already a full URL, extract only the path
    if thumb.startswith('http'):
        from urllib.parse import urlparse
        parsed = urlparse(thumb)
        thumb = parsed.path

    thumb_path = thumb if thumb.startswith('/') else f'/{thumb}'
    # Drop any leftover querystring for the transcode url= param
    if '?' in thumb_path:
        thumb_path = thumb_path.split('?', 1)[0]

    if not is_safe_plex_media_path(thumb_path):
        return Response(status=400)

    cache_key = f'{thumb_path}|{width}x{height}'
    if cache_key in IMAGE_CACHE:
        cached = IMAGE_CACHE[cache_key]
        if cached.get('missing'):
            return Response(status=404)
        resp = Response(cached['data'], mimetype=cached['mimetype'], status=200)
        resp.headers['Cache-Control'] = 'private, max-age=86400'
        return resp

    config = load_config()
    url = config.get('plex_url')
    token = config.get('plex_token')
    if not url or not token:
        return Response(status=404)

    plex_base = url.rstrip('/')
    # Ask Plex for a resized JPEG — much faster than full-resolution thumbs.
    plex_url = (
        f"{plex_base}/photo/:/transcode"
        f"?url={quote(thumb_path)}"
        f"&width={width}&height={height}&minSize=1&upscale=1"
        f"&X-Plex-Token={token}"
    )

    try:
        headers = plex_request_headers(token, {
            'User-Agent': 'Server Manager Portal',
            'Accept': 'image/*,*/*',
        })
        upstream = requests.get(plex_url, timeout=8, verify=PLEX_SSL_VERIFY, headers=headers)

        if upstream.status_code != 200 or not upstream.content:
            logging.warning(f"Plex image proxy miss {upstream.status_code} for: {thumb_path}")
            IMAGE_CACHE[cache_key] = {'missing': True}
            return Response(status=404)

        mimetype = upstream.headers.get('Content-Type', 'image/jpeg')
        data = upstream.content
        data_len = len(data) if data else 0

        # Bound binary poster cache — wipe-all at 400 could still hold hundreds of MB.
        IMAGE_CACHE_MAX_ENTRIES = 120
        IMAGE_CACHE_MAX_BYTES = 48 * 1024 * 1024
        total_bytes = sum(len(v.get('data') or b'') for v in IMAGE_CACHE.values() if isinstance(v, dict))
        if (
            len(IMAGE_CACHE) >= IMAGE_CACHE_MAX_ENTRIES
            or (total_bytes + data_len) > IMAGE_CACHE_MAX_BYTES
        ):
            IMAGE_CACHE = {}

        IMAGE_CACHE[cache_key] = {'data': data, 'mimetype': mimetype}
        resp = Response(data, mimetype=mimetype, status=200)
        resp.headers['Cache-Control'] = 'private, max-age=86400'
        return resp
    except Exception as e:
        logging.warning(f"Image proxy exception for {thumb_path}: {e}")
        IMAGE_CACHE[cache_key] = {'missing': True}
        return Response(status=404)

@app.route('/api/collections/pin', methods=['POST'])
@require_auth
def pin_collection():
    data = request.json
    title = data.get('title')
    library_name = data.get('library')
    
    plex = get_plex_instance()
    config = load_config()
    label = config.get('collexions_label', 'Collexions')
    
    if not plex or not title or not library_name:
        return jsonify({"success": False, "error": "Invalid request"}), 400
        
    try:
        library = plex.library.section(library_name)
        collection = library.collection(title)
        
        # Add label
        collection.addLabel(label)
        
        # Pin
        hub = collection.visibility()
        hub.promoteHome()
        hub.promoteShared()
        
        # Log to collexions.log in the same format as the main script
        log_action(f"Pinned '{title}' successfully.")
        GALLERY_CACHE['data'] = None
        GALLERY_CACHE['timestamp'] = 0
        SUMMARY_CACHE['data'] = None
        SUMMARY_CACHE['timestamp'] = 0
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/jobs', methods=['GET'])
@require_auth
def get_jobs():
    managed = heal_managed_job_sources(load_managed_collections())
    return jsonify(managed)

@app.route('/api/jobs/run', methods=['POST'])
@require_auth
def run_job_now():
    data = request.json
    job_id = data.get('id')
    if not job_id:
        return jsonify({"success": False, "error": "Missing job ID"}), 400
        
    try:
        run_sync_job(job_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/jobs/delete', methods=['POST'])
@require_auth
def delete_job():
    data = request.json
    job_id = data.get('id')
    if not job_id:
        return jsonify({"success": False, "error": "Missing job ID"}), 400
        
    managed = load_managed_collections()
    if job_id in managed:
        del managed[job_id]
        save_managed_collections(managed)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Job not found"}), 404

@app.route('/api/collections/unpin', methods=['POST'])
@require_auth
def unpin_collection():
    data = request.json
    title = data.get('title')
    library_name = data.get('library')
    
    plex = get_plex_instance()
    config = load_config()
    label = config.get('collexions_label', 'Collexions')
    
    if not plex or not title or not library_name:
        return jsonify({"success": False, "error": "Invalid request"}), 400
        
    try:
        library = plex.library.section(library_name)
        collection = library.collection(title)
        
        # Remove label
        collection.removeLabel(label)
        
        # Unpin
        hub = collection.visibility()
        hub.demoteHome()
        hub.demoteShared()
        
        # Log to collexions.log in the same format as the main script
        log_action(f"Unpinned '{title}' successfully.")
        GALLERY_CACHE['data'] = None
        GALLERY_CACHE['timestamp'] = 0
        SUMMARY_CACHE['data'] = None
        SUMMARY_CACHE['timestamp'] = 0
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/collections/delete', methods=['POST'])
@require_auth
def delete_collection():
    """Permanently delete a Plex collection (and any matching Auto-Sync job)."""
    data = request.json or {}
    title = str(data.get('title') or '').strip()
    library_name = str(data.get('library') or '').strip()
    rating_key = str(data.get('ratingKey') or data.get('rating_key') or '').strip()
    if not library_name or (not title and not rating_key):
        return jsonify({"success": False, "error": "Missing title/library"}), 400

    ok, err, removed_jobs = _delete_plex_collection(
        library_name,
        title=title or None,
        rating_key=rating_key or None,
    )
    if not ok:
        status = 500 if err == "Plex connection failed" else 400
        return jsonify({"success": False, "error": err or "Delete failed"}), status

    GALLERY_CACHE['data'] = None
    GALLERY_CACHE['timestamp'] = 0
    SUMMARY_CACHE['data'] = None
    SUMMARY_CACHE['timestamp'] = 0
    return jsonify({"success": True, "removed_jobs": removed_jobs})


@app.route('/api/collections/fix-art', methods=['POST'])
@require_auth
def fix_collection_art():
    """
    Set/replace poster for one collection, or all missing-art collections in a library.
    Body: { title?, library, force?: bool }
    If title omitted, scans the library and fills collections without a custom uploaded poster.
    """
    data = request.json or {}
    library_name = str(data.get('library') or '').strip()
    title = str(data.get('title') or '').strip()
    force = bool(data.get('force'))
    if not library_name:
        return jsonify({"success": False, "error": "Missing library"}), 400

    plex = get_plex_instance()
    if not plex:
        return jsonify({"success": False, "error": "Plex connection failed"}), 500

    config = load_config()
    managed = load_managed_collections()
    # Map library+name → job for source-aware posters
    job_by_key = {}
    for job in managed.values():
        if not isinstance(job, dict):
            continue
        job_by_key[f"{job.get('library')}\0{job.get('name')}"] = job

    try:
        library = plex.library.section(library_name)
        targets = []
        if title:
            targets = [library.collection(title)]
        else:
            targets = list(library.collections())

        results = []
        ok_count = 0
        for coll in targets[:200]:
            job = job_by_key.get(f"{library_name}\0{coll.title}") or {}
            source_type = job.get('source_type') or ''
            source_id = job.get('source_id') or ''
            # Mosaic uses local Plex artwork. Skip re-fetching Trakt/MDBList/etc.
            # (that was the main cause of gallery refresh 504 timeouts).
            changed = _ensure_collection_art(
                coll,
                source_type=source_type,
                source_id=source_id,
                external_items=None,
                matched_items=None,
                config=config,
                force=force or bool(title),
            )
            if changed:
                ok_count += 1
            results.append({"title": coll.title, "library": library_name, "ok": bool(changed)})

        GALLERY_CACHE['data'] = None
        GALLERY_CACHE['timestamp'] = 0
        try:
            IMAGE_CACHE.clear()
        except Exception:
            pass
        return jsonify({"success": True, "ok_count": ok_count, "results": results})
    except Exception as e:
        logging.error(f"fix_collection_art error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/stop', methods=['POST'])
@require_auth
def stop_script():
    global process
    if process and process.poll() is None:
        process.terminate()
        return jsonify({"success": True})
    return jsonify({"error": "Script is not running"}), 400

@app.route('/api/collections/create', methods=['POST'])
@require_auth
def create_custom_collection():
    data = request.json
    library_name = str(data.get('library') or '').strip()
    title = _normalize_collection_title(data.get('title'))
    item_keys = data.get('items', []) # List of ratingKeys
    sort_order = data.get('sort_order', 'custom') # 'custom', 'random', 'release'
    
    if not library_name or not title or not item_keys:
        return jsonify({"success": False, "error": "Missing required fields"}), 400
        
    plex = get_plex_instance()
    config = load_config()
    label = config.get('collexions_label', 'Collexions')
    
    if not plex:
        return jsonify({"success": False, "error": "Plex connection failed"}), 500
        
    try:
        with _collection_create_lock(library_name, title):
            library = plex.library.section(library_name)
            # Fetch actual items by ratingKey
            items = []
            for key in item_keys:
                try:
                    item = library.fetchItem(int(key))
                    items.append(item)
                except:
                    logging.warning(f"Could not find item with key {key} in library {library_name}")
                    
            if not items:
                return jsonify({"success": False, "error": "No matching items found in library"}), 404
                
            collection, created_fresh = _upsert_plex_collection(
                library,
                title,
                items,
                sort_order=sort_order,
                label=label,
            )

            art_set = _ensure_collection_art(
                collection,
                matched_items=items,
                config=config,
                force=created_fresh,
            )
            
            log_action(f"Created/updated collection '{title}' with {len(items)} items in {library_name} (Sort: {sort_order}).")
            
            # Clear cache since library changed
            GALLERY_CACHE['data'] = None
            
            return jsonify({"success": True, "art_set": bool(art_set)})
    except RuntimeError as e:
        return jsonify({"success": False, "error": str(e)}), 409
    except Exception as e:
        logging.error(f"Error creating collection: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/search/local')
@require_auth
def search_local():
    library_name = request.args.get('library')
    query = request.args.get('query', '')
    genre = request.args.get('genre')
    year = request.args.get('year')
    
    if not library_name:
        return jsonify([])
        
    plex = get_plex_instance()
    if not plex:
        return jsonify([])
        
    try:
        library = plex.library.section(library_name)
        
        # Build search params if filters are present
        search_params = {}
        if query: search_params['title'] = query
        if genre: search_params['genre'] = genre
        if year: search_params['year'] = year
        
        results = library.search(**search_params)
        
        items = []
        for item in results[:50]: # Increased limit for better selection
            items.append({
                'title': item.title,
                'year': item.year,
                'ratingKey': item.ratingKey,
                'thumb': item.thumb,
                'type': item.type
            })
            
        return jsonify(items)
    except Exception as e:
        logging.error(f"Local search error: {e}")
        return jsonify([])

@app.route('/api/search/external')
@require_auth
def search_external():
    config = load_config()
    tmdb_key = config.get('tmdb_api_key')
    query = request.args.get('query')
    media_type = request.args.get('type', 'movie') # 'movie' or 'tv'
    
    if not tmdb_key or not query:
        return jsonify([])
        
    try:
        url = f"https://api.themoviedb.org/3/search/{media_type}?api_key={tmdb_key}&query={query}"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            results = resp.json().get('results', [])
            return jsonify([{
                'title': r.get('title') or r.get('name'),
                'year': (r.get('release_date') or r.get('first_air_date') or "")[:4],
                'id': r.get('id'),
                'poster': f"https://image.tmdb.org/t/p/w500{r.get('poster_path')}",
                'type': media_type
            } for r in results[:15]])
    except Exception as e:
        logging.error(f"External search error: {e}")
        
    return jsonify([])

@app.route('/api/tmdb/genres')
@require_auth
def get_tmdb_genres():
    config = load_config()
    tmdb_key = config.get('tmdb_api_key')
    media_type = request.args.get('type', 'movie')
    
    if not tmdb_key:
        return jsonify([])
        
    try:
        url = f"https://api.themoviedb.org/3/genre/{media_type}/list?api_key={tmdb_key}&language=en-US"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return jsonify(resp.json().get('genres', []))
    except Exception as e:
        logging.error(f"TMDB genres error: {e}")
        
    return jsonify([])

def _resolve_tmdb_keyword_ids(tmdb_key, keywords_text, joiner='|'):
    """Resolve comma-separated keyword names/IDs to TMDB keyword IDs."""
    if not keywords_text or not tmdb_key:
        return None
    keyword_ids = []
    for raw in str(keywords_text).replace('|', ',').split(','):
        kw = raw.strip()
        if not kw:
            continue
        if kw.isdigit():
            keyword_ids.append(kw)
            continue
        kw_url = f"https://api.themoviedb.org/3/search/keyword?api_key={tmdb_key}&query={requests.utils.quote(kw)}"
        try:
            kw_resp = requests.get(kw_url, timeout=5).json()
            results = kw_resp.get('results') or []
            if results:
                keyword_ids.append(str(results[0]['id']))
        except Exception:
            pass
    if not keyword_ids:
        return None
    return joiner.join(dict.fromkeys(keyword_ids))


def build_tmdb_discover_params(media_type, raw, tmdb_key):
    """
    Normalize Creator/UI discover filters into TMDB /discover query params.
    Accepts both soft UI keys (year, year_mode, year_from/to, keyword text)
    and native TMDB keys so preview search and auto-sync jobs stay aligned.
    """
    media_type = 'tv' if str(media_type or 'movie').lower() in ('tv', 'show', 'shows') else 'movie'
    raw = dict(raw or {})

    def get(key, default=None):
        val = raw.get(key, default)
        if val is None:
            return default
        if isinstance(val, str) and not val.strip():
            return default
        return val

    params = {
        'language': get('language') or 'en-US',
        'include_adult': 'false',
    }

    date_gte_key = 'primary_release_date.gte' if media_type == 'movie' else 'first_air_date.gte'
    date_lte_key = 'primary_release_date.lte' if media_type == 'movie' else 'first_air_date.lte'
    year_exact_key = 'primary_release_year' if media_type == 'movie' else 'first_air_date_year'

    def year_only(value):
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if text[:4].isdigit():
            return text[:4]
        return None

    # Explicit range (preferred for new UI).
    y_from = year_only(get('year_from'))
    y_to = year_only(get('year_to'))
    if y_from:
        params[date_gte_key] = f"{y_from}-01-01"
    if y_to:
        params[date_lte_key] = f"{y_to}-12-31"

    # Already-normalized date bounds from older saved jobs.
    for key in (date_gte_key, date_lte_key, 'primary_release_date.gte', 'primary_release_date.lte',
                'first_air_date.gte', 'first_air_date.lte'):
        val = get(key)
        if not val:
            continue
        mapped = date_gte_key if key.endswith('.gte') else date_lte_key
        if mapped not in params:
            params[mapped] = str(val)[:10] if '-' in str(val) else (
                f"{year_only(val)}-01-01" if mapped.endswith('.gte') else f"{year_only(val)}-12-31"
            )

    # Soft year + mode (legacy UI / saved jobs).
    year = year_only(get('year'))
    year_mode = get('year_mode') or 'exact'
    if year and date_gte_key not in params and date_lte_key not in params:
        if year_mode == 'exact':
            params[year_exact_key] = year
        elif year_mode == 'before':
            params[date_lte_key] = f"{year}-12-31"
        elif year_mode == 'after':
            params[date_gte_key] = f"{year}-01-01"

    # Legacy exact year fields on older jobs.
    for key in (year_exact_key, 'primary_release_year', 'first_air_date_year'):
        val = year_only(get(key))
        if val and year_exact_key not in params and date_gte_key not in params and date_lte_key not in params:
            params[year_exact_key] = val
            break

    include_kw = get('with_keywords')
    exclude_kw = get('without_keywords')
    resolved_include = _resolve_tmdb_keyword_ids(tmdb_key, include_kw, '|')
    if resolved_include:
        params['with_keywords'] = resolved_include
    resolved_exclude = _resolve_tmdb_keyword_ids(tmdb_key, exclude_kw, '|')
    if resolved_exclude:
        params['without_keywords'] = resolved_exclude

    optional_params = [
        'with_genres', 'without_genres', 'with_networks', 'with_companies',
        'vote_average.gte', 'vote_average.lte',
        'vote_count.gte', 'vote_count.lte',
        'with_runtime.gte', 'with_runtime.lte',
        'sort_by', 'with_original_language',
        'with_status', 'certification', 'certification.lte', 'certification_country',
        'with_watch_providers', 'watch_region',
        'with_release_type', 'region',
    ]
    for param in optional_params:
        val = get(param)
        if val is not None:
            params[param] = val

    certification = params.get('certification')
    if (certification or params.get('certification.lte')) and 'certification_country' not in params:
        params['certification_country'] = get('certification_country') or 'US'
    if certification and ',' in str(certification):
        params['certification'] = str(certification).replace(',', '|')

    if params.get('with_watch_providers') and 'watch_region' not in params:
        params['watch_region'] = get('watch_region') or 'US'

    return media_type, params


@app.route('/api/search/discover')
@require_auth
def search_discover():
    config = load_config()
    tmdb_key = config.get('tmdb_api_key')
    
    if not tmdb_key:
        return jsonify([])
        
    media_type, discover_params = build_tmdb_discover_params(
        request.args.get('type', 'movie'),
        request.args.to_dict(flat=True),
        tmdb_key,
    )
    params = {
        **discover_params,
        'api_key': tmdb_key,
        'page': request.args.get('page', 1),
    }
            
    try:
        url = f"https://api.themoviedb.org/3/discover/{media_type}"
        all_items = []
        for page in range(1, 6): # Fetch up to 5 pages (100 items) for UI preview
            params['page'] = page
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get('results', [])
                for r in results:
                    all_items.append({
                        'title': r.get('title') or r.get('name'),
                        'year': (r.get('release_date') or r.get('first_air_date') or "")[:4],
                        'id': r.get('id'),
                        'poster': f"https://image.tmdb.org/t/p/w500{r.get('poster_path')}",
                        'type': media_type
                    })
                if page >= data.get('total_pages', 1): break
            else: break
            
        return jsonify(all_items)
    except Exception as e:
        logging.error(f"Discover error: {e}")
        
    return jsonify([])

@app.route('/api/collections/create-from-external', methods=['POST'])
@require_auth
def create_from_external():
    data = request.json or {}
    library_name = data.get('library')
    title = data.get('title')
    external_items = data.get('items', [])
    sort_order = data.get('sort_order', 'custom')
    auto_sync = data.get('auto_sync', False)
    source_type = data.get('source_type')
    source_id = data.get('source_id')

    if not library_name or not title or (not external_items and not source_type):
        return jsonify({"success": False, "error": "Missing fields"}), 400

    result = create_collection_from_source(
        library_name=library_name,
        title=title,
        source_type=source_type,
        source_id=source_id or '',
        sort_order=sort_order,
        auto_sync=bool(auto_sync),
        external_items=external_items,
    )
    status = 200 if result.get('success') else (404 if 'matched' in result else 500)
    if result.get('error') == 'Plex connection failed':
        status = 500
    elif result.get('error') == 'No items matched your local library':
        status = 404
    elif not result.get('success'):
        status = 400
    return jsonify(result), status


@app.route('/api/templates')
@require_auth
def list_templates():
    """Curated one-click collection templates + which API keys are available."""
    config = load_config()
    has_tmdb = bool(str(config.get('tmdb_api_key') or '').strip())
    has_trakt = bool(str(config.get('trakt_client_id') or '').strip())
    templates = []
    for tpl in JOB_TEMPLATES:
        requires = tpl.get('requires') or []
        available = True
        if 'tmdb' in requires and not has_tmdb:
            available = False
        if 'trakt' in requires and not has_trakt:
            available = False
        templates.append({**tpl, 'available': available})
    return jsonify({
        'templates': templates,
        'categories': [
            {'id': 'trending', 'label': 'Trending'},
            {'id': 'quality', 'label': 'Top & Popular'},
            {'id': 'genre', 'label': 'Genres'},
            {'id': 'franchise', 'label': 'Franchises'},
        ],
        'keys': {'tmdb': has_tmdb, 'trakt': has_trakt},
    })


@app.route('/api/templates/franchise-search')
@require_auth
def franchise_search():
    """Search TMDB collections (franchises) by name, including film counts."""
    config = load_config()
    tmdb_key = str(config.get('tmdb_api_key') or '').strip()
    query = str(request.args.get('q') or '').strip()
    if not tmdb_key:
        return jsonify({'error': 'TMDB API key required in Settings'}), 400
    if len(query) < 2:
        return jsonify([])
    try:
        resp = requests.get(
            "https://api.themoviedb.org/3/search/collection",
            params={'api_key': tmdb_key, 'query': query},
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({'error': f'TMDB returned HTTP {resp.status_code}'}), 400

        raw = (resp.json().get('results') or [])[:20]

        def _film_count(collection_id):
            try:
                detail = requests.get(
                    f"https://api.themoviedb.org/3/collection/{collection_id}",
                    params={'api_key': tmdb_key},
                    timeout=8,
                )
                if detail.status_code == 200:
                    return len(detail.json().get('parts') or [])
            except Exception:
                pass
            return None

        # Parallel detail lookups so the UI can show "N films" pills quickly.
        counts = {}
        try:
            from concurrent.futures import ThreadPoolExecutor, as_completed
            with ThreadPoolExecutor(max_workers=8) as pool:
                futures = {
                    pool.submit(_film_count, r.get('id')): r.get('id')
                    for r in raw if r.get('id')
                }
                for fut in as_completed(futures):
                    cid = futures[fut]
                    try:
                        counts[cid] = fut.result()
                    except Exception:
                        counts[cid] = None
        except Exception:
            for r in raw:
                if r.get('id'):
                    counts[r.get('id')] = _film_count(r.get('id'))

        results = []
        for r in raw:
            cid = r.get('id')
            results.append({
                'id': cid,
                'name': r.get('name'),
                'overview': (r.get('overview') or '')[:240],
                'poster': f"https://image.tmdb.org/t/p/w342{r['poster_path']}" if r.get('poster_path') else None,
                'source_type': 'tmdb_collection',
                'source_id': str(cid),
                'film_count': counts.get(cid),
            })
        return jsonify(results)
    except Exception as e:
        logging.error(f"Franchise search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/create', methods=['POST'])
@require_auth
def create_from_template():
    """One-click: create Plex collection + Job from a curated template or ad-hoc franchise."""
    data = request.json or {}
    library_name = str(data.get('library') or '').strip()
    if not library_name:
        return jsonify({'success': False, 'error': 'Select a target library first.'}), 400

    template_id = str(data.get('template_id') or '').strip()
    title = str(data.get('title') or '').strip()
    source_type = str(data.get('source_type') or '').strip()
    source_id = str(data.get('source_id') or '').strip()
    sort_order = str(data.get('sort_order') or 'custom').strip() or 'custom'
    auto_sync = data.get('auto_sync', True)

    is_franchise = False
    if template_id:
        tpl = get_template_by_id(template_id)
        if not tpl:
            return jsonify({'success': False, 'error': 'Unknown template.'}), 404
        title = title or tpl['name']
        source_type = tpl['source_type']
        source_id = tpl.get('source_id') or ''
        is_franchise = tpl.get('category') == 'franchise' or source_type == 'tmdb_collection'
        if not data.get('sort_order'):
            sort_order = tpl.get('default_sort') or 'custom'
        requires = tpl.get('requires') or []
        config = load_config()
        if 'tmdb' in requires and not str(config.get('tmdb_api_key') or '').strip():
            return jsonify({'success': False, 'error': 'TMDB API key required in Settings.'}), 400
        if 'trakt' in requires and not str(config.get('trakt_client_id') or '').strip():
            return jsonify({'success': False, 'error': 'Trakt client ID required in Settings.'}), 400
    elif source_type and title:
        # Ad-hoc (e.g. franchise search result)
        if source_type == 'tmdb_collection' and not source_id:
            return jsonify({'success': False, 'error': 'Missing franchise collection id.'}), 400
        is_franchise = source_type == 'tmdb_collection'
    else:
        return jsonify({'success': False, 'error': 'Provide template_id or source_type + title.'}), 400

    # Franchises should read as collections in Plex ("The Shrek Collection"), not bare "Shrek".
    if is_franchise:
        title = franchise_collection_title(title)

    result = create_collection_from_source(
        library_name=library_name,
        title=title,
        source_type=source_type,
        source_id=source_id,
        sort_order=sort_order,
        auto_sync=bool(auto_sync),
    )
    if result.get('success'):
        return jsonify(result)
    status = 404 if 'matched' in (result.get('error') or '').lower() or result.get('matched') == 0 else 400
    if result.get('error') == 'Plex connection failed':
        status = 500
    return jsonify(result), status

def _trakt_headers(trakt_id):
    return {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': trakt_id,
        'User-Agent': 'CollexionsManager/1.0',
    }


def _parse_trakt_list_url(url):
    """Parse https://trakt.tv/users/{user}/lists/{slug} → (username, slug)."""
    parts = [p for p in str(url or '').strip().split('/') if p]
    try:
        u_idx = parts.index('users')
        return parts[u_idx + 1], parts[u_idx + 3]
    except Exception:
        return None, None


def _fetch_trakt_list_items(trakt_id, username, slug, max_pages=20):
    """Fetch Trakt list items with pagination (up to max_pages * 100).

    Posters are intentionally omitted — resolving TMDB art per title is too slow
    for large lists and caused gateway timeouts on Preview.
    """
    headers = _trakt_headers(trakt_id)
    api_url = f"https://api.trakt.tv/users/{username}/lists/{slug}/items"
    items = []
    for page in range(1, max_pages + 1):
        resp = requests.get(
            api_url,
            headers=headers,
            params={'page': page, 'limit': 100},
            timeout=20,
        )
        if resp.status_code != 200:
            if page == 1:
                raise RuntimeError(f"Trakt API error: {resp.status_code}")
            break
        data = resp.json() or []
        if not data:
            break
        for itm in data:
            m = itm.get('movie') or itm.get('show')
            if not m:
                continue
            media_type = itm.get('type') or ('movie' if itm.get('movie') else 'show')
            tmdb_id = m.get('ids', {}).get('tmdb')
            items.append({
                'title': m.get('title'),
                'year': m.get('year'),
                'id': tmdb_id or m.get('ids', {}).get('trakt'),
                'tmdb_id': tmdb_id,
                'type': media_type,
            })
        if len(data) < 100:
            break
    return items


@app.route('/api/trakt/lists/search')
@require_auth
def search_trakt_lists():
    """Search public Trakt lists by name."""
    config = load_config()
    trakt_id = config.get('trakt_client_id')
    query = str(request.args.get('q') or '').strip()
    if not trakt_id:
        return jsonify({'error': 'Trakt client ID required in Settings.'}), 400
    if not query:
        return jsonify({'error': 'Missing search query'}), 400
    try:
        resp = requests.get(
            'https://api.trakt.tv/search/list',
            headers=_trakt_headers(trakt_id),
            params={'query': query, 'limit': 25},
            timeout=15,
        )
        if resp.status_code != 200:
            return jsonify({'error': f'Trakt API error: {resp.status_code}'}), 400
        results = []
        for row in resp.json() or []:
            lst = row.get('list') or {}
            user = lst.get('user') or row.get('user') or {}
            # Trakt list URLs must use the user slug, not the display name.
            user_ids = user.get('ids') or {}
            username = (
                user_ids.get('slug')
                or user.get('username')
                or ''
            )
            slug = (lst.get('ids') or {}).get('slug') or ''
            if not username or not slug:
                continue
            url = f"https://trakt.tv/users/{username}/lists/{slug}"
            results.append({
                'name': lst.get('name') or slug,
                'description': lst.get('description') or '',
                'username': username,
                'slug': slug,
                'url': url,
                'item_count': lst.get('item_count'),
                'likes': lst.get('likes'),
                'trakt_id': (lst.get('ids') or {}).get('trakt'),
                'score': row.get('score'),
            })
        return jsonify(results)
    except Exception as e:
        logging.error(f"Trakt list search error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/trakt/list')
@require_auth
def get_trakt_list():
    config = load_config()
    trakt_id = config.get('trakt_client_id')
    url = request.args.get('url')
    username = str(request.args.get('username') or '').strip()
    slug = str(request.args.get('slug') or '').strip()

    if not trakt_id:
        return jsonify({"error": "Missing Trakt ID"}), 400
    if not username or not slug:
        if not url:
            return jsonify({"error": "Missing Trakt list URL"}), 400
        username, slug = _parse_trakt_list_url(url)
    if not username or not slug:
        return jsonify({"error": "Invalid Trakt list URL format"}), 400

    try:
        items = _fetch_trakt_list_items(trakt_id, username, slug)
        return jsonify(items)
    except Exception as e:
        logging.error(f"Trakt list error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/mdblist/list')
@require_auth
def get_mdblist():
    config = load_config()
    api_key = config.get('mdblist_api_key')
    url = request.args.get('url')
    
    if not api_key:
        return jsonify({"error": "Missing MDBList API Key in Settings"}), 400
    if not url:
        return jsonify({"error": "Missing MDBList URL"}), 400
        
    try:
        # Example URL: https://mdblist.com/lists/mojoard_pk/super-cool-movies
        parts = [p for p in url.strip().split('/') if p]
        
        # Make sure it's a valid mdblist.com URL
        if 'mdblist.com' not in url.lower():
            return jsonify({"error": "Not a valid MDBList URL. Must be from mdblist.com"}), 400
            
        # Expecting at least 4 parts: ['https:', 'mdblist.com', 'lists', 'username']
        # The API endpoint is: api.mdblist.com/lists/[user]/[list]/items
        try:
            lists_idx = parts.index('lists')
            username = parts[lists_idx + 1]
            list_slug = parts[lists_idx + 2] if len(parts) > lists_idx + 2 else ""
        except ValueError:
            return jsonify({"error": "Could not parse username/list from URL."}), 400
            
        if not list_slug:
            return jsonify({"error": "URL seems to point to a user, not a specific list."}), 400
            
        api_url = f"https://api.mdblist.com/lists/{username}/{list_slug}/items/?apikey={api_key}"
        resp = requests.get(api_url, timeout=10)
        
        if resp.status_code == 200:
            items = parse_mdblist_items_payload(resp.json())
            return jsonify(items)
        else:
            return jsonify({"error": f"MDBList API error: {resp.status_code} - {resp.text}"}), 400
            
    except Exception as e:
        logging.error(f"MDBList fetch error: {e}")
        return jsonify({"error": str(e)}), 500



# --- Auth Endpoints ---

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Checks if any admin password is set yet and if config is complete."""
    logging.debug(f"Loading config from: {CONFIG_FILE}")
    config = load_config()
    # Portal SSO mode: never require Collexions password setup.
    is_setup = True if (PORTAL_MODE or _service_key_ok()) else bool(config.get('admin_password_hash'))
    logging.debug(f"Auth status check: is_setup={is_setup}, has_hash={bool(config.get('admin_password_hash'))}, portal_mode={PORTAL_MODE}")
    
    # Check if Plex config is missing
    plex_url = config.get('plex_url')
    plex_token = config.get('plex_token')
    needs_onboarding = not (plex_url and plex_token)
    
    logging.debug(f"Needs onboarding: {needs_onboarding} (URL: {bool(plex_url)}, Token: {bool(plex_token)})")
    
    return jsonify({
        'is_setup': is_setup,
        'needs_onboarding': needs_onboarding,
        'portal_mode': bool(PORTAL_MODE or _service_key_ok()),
        'version': '1.1.0'
    })

@app.route('/api/auth/setup', methods=['POST'])
def auth_setup():
    """Sets the initial admin password."""
    if PORTAL_MODE:
        return jsonify({'error': 'Password setup is disabled in portal mode'}), 403
    config = load_config()
    if config.get('admin_password_hash'):
        return jsonify({'error': 'System already setup'}), 400
        
    password = request.json.get('password')
    if not password or len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
        
    if save_config({'admin_password_hash': generate_password_hash(password)}, merge=True):
        logging.info("Admin password hash set successfully.")
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to save configuration'}), 500

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Verifies password and issues JWT."""
    if PORTAL_MODE:
        return jsonify({'error': 'Password login is disabled in portal mode'}), 403
    config = load_config()
    password = request.json.get('password')
    
    hash_val = config.get('admin_password_hash')
    if not hash_val:
        return jsonify({'error': 'System not setup'}), 400
        
    if check_password_hash(hash_val, password):
        token = jwt.encode({
            'user': 'admin',
            'exp': datetime.utcnow() + timedelta(days=7)
        }, SECRET_KEY, algorithm='HS256')
        
        return jsonify({
            'token': token,
            'user': {
                'username': 'Admin'
            }
        })
        
    return jsonify({'error': 'Invalid password'}), 401

@app.route('/api/auth/change-password', methods=['POST'])
@require_auth
def change_password():
    """Updates the admin password."""
    config = load_config()
    current_password = request.json.get('currentPassword')
    new_password = request.json.get('newPassword')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Missing password fields'}), 400
        
    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400
        
    hash_val = config.get('admin_password_hash')
    if not check_password_hash(hash_val, current_password):
        return jsonify({'error': 'Current password incorrect'}), 401
        
    if save_config({'admin_password_hash': generate_password_hash(new_password)}, merge=True):
        logging.info("Admin password updated successfully.")
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to save configuration'}), 500

@app.route('/api/auth/verify', methods=['GET'])
def verify_token():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'authenticated': False}), 401
    
    try:
        token = auth_header.split(' ')[1]
        jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return jsonify({'authenticated': True})
    except:
        return jsonify({'authenticated': False}), 401



maybe_autostart_background_process()

# ─────────────────────────────────────────────────────────────────────────────
# Production static file serving
# When running in Docker, the React app is pre-built into dist/.
# In dev mode (no dist/ folder) the Vite dev server handles the frontend.
# ─────────────────────────────────────────────────────────────────────────────
if os.path.isdir(DIST_DIR):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        # Let Flask serve actual static assets (JS, CSS, images)
        full_path = os.path.join(DIST_DIR, path)
        if path and os.path.isfile(full_path):
            return send_from_directory(DIST_DIR, path)
        # For everything else (client-side routes) return index.html
        return send_from_directory(DIST_DIR, 'index.html')


if __name__ == "__main__":
    print(f"Server starting...")
    print(f"Target Script: {SCRIPT_NAME}")
    print(f"Log File: {LOG_FILE}")
    print("Web UI API available at http://localhost:5000")
    
    # Create empty log file if it doesn't exist
    if not os.path.exists(LOG_FILE):
        ensure_dir_exists(LOG_FILE)
        with open(LOG_FILE, 'w') as f:
            f.write("Log file created.\n")

    # IMPORTANT: use_reloader=False prevents the server from restarting when files change
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
