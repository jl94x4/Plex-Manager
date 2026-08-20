"""PlexServer connection helpers for ColleXions.

Portal Node can reach Plex while the Python sidecar fails for two homelab cases:
- Docker: saved URL is localhost/127.0.0.1 (the container, not the host).
- HTTPS: plexapi verifies TLS; many PMS installs use a self-signed cert.

Try the configured URL first (host-network Docker still works), then a loopback
rewrite, then env overrides. Never create collections through this module.
"""
from __future__ import annotations

import logging
import os
from urllib.parse import urlparse, urlunparse

import requests

TRUE_ENV_VALUES = {'1', 'true', 'yes', 'on'}
_LOOPBACK_HOSTS = {'localhost', '127.0.0.1', '::1'}


def env_flag_enabled(name):
    return os.environ.get(name, '').strip().lower() in TRUE_ENV_VALUES


def plex_ssl_verify():
    raw = os.environ.get('COLLEXIONS_PLEX_VERIFY_SSL', 'true').strip().lower()
    return raw not in ('0', 'false', 'no', 'off')


def running_in_docker():
    return os.path.exists('/.dockerenv') or env_flag_enabled('COLLEXIONS_IN_DOCKER')


def is_loopback_host(host):
    return (host or '').strip().lower().strip('[]') in _LOOPBACK_HOSTS


def _strip_url(url):
    return str(url or '').strip().rstrip('/')


def rewrite_loopback_plex_url(url, host=None):
    """Replace localhost/127.0.0.1 with host.docker.internal (or COLLEXIONS_PLEX_HOST)."""
    raw = _strip_url(url)
    if not raw:
        return raw
    try:
        parsed = urlparse(raw)
    except Exception:
        return raw
    if not is_loopback_host(parsed.hostname):
        return raw
    replacement = (
        (host or os.environ.get('COLLEXIONS_PLEX_HOST') or 'host.docker.internal').strip()
        or 'host.docker.internal'
    )
    netloc = f'{replacement}:{parsed.port}' if parsed.port else replacement
    if parsed.username:
        auth = parsed.username
        if parsed.password:
            auth += f':{parsed.password}'
        netloc = f'{auth}@{netloc}'
    rewritten = urlunparse((
        parsed.scheme,
        netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        parsed.fragment,
    ))
    return _strip_url(rewritten)


def plex_url_candidates(url):
    """Ordered unique URLs to try. Configured first so host-network Docker keeps working."""
    seen = []

    def add(value):
        cleaned = _strip_url(value)
        if cleaned and cleaned not in seen:
            seen.append(cleaned)

    add(url)
    add(os.environ.get('COLLEXIONS_PLEX_URL'))
    add(os.environ.get('PLEX_SERVER_URL'))
    if running_in_docker() or env_flag_enabled('COLLEXIONS_REWRITE_LOOPBACK'):
        add(rewrite_loopback_plex_url(url))
    return seen


def _is_ssl_error(exc):
    try:
        from requests.exceptions import SSLError
        if isinstance(exc, SSLError):
            return True
    except Exception:
        pass
    text = str(exc or '').lower()
    return 'ssl' in text or 'certificate verify failed' in text or 'certverify' in text


def _session_for_plex(token, verify):
    try:
        from plex_identity import plex_request_headers
        headers = plex_request_headers(token)
    except Exception:
        headers = {'Accept': 'application/json'}
        if token:
            headers['X-Plex-Token'] = str(token)
    session = requests.Session()
    session.verify = verify
    session.headers.update(headers)
    return session


def connect_plex_server(url, token, timeout=12):
    """Return a live PlexServer or raise with a homelab-friendly message."""
    url = _strip_url(url)
    token = str(token or '').strip()
    if not url or not token:
        raise ValueError('Plex URL and token are required')

    try:
        from plex_identity import configure_plex_identity
        configure_plex_identity()
    except Exception:
        pass

    from plexapi.server import PlexServer

    last_err = None
    candidates = plex_url_candidates(url)
    verify_default = plex_ssl_verify()

    for candidate in candidates:
        try:
            session = _session_for_plex(token, verify_default)
            plex = PlexServer(candidate, token, session=session, timeout=timeout)
            if candidate != url:
                logging.info('Connected to Plex at %s', candidate)
            return plex
        except Exception as e:
            last_err = e
            logging.warning(
                'Plex connect failed via %s (ssl_verify=%s): %s',
                candidate,
                verify_default,
                e,
            )
            if not (verify_default and _is_ssl_error(e)):
                continue
            try:
                session = _session_for_plex(token, False)
                plex = PlexServer(candidate, token, session=session, timeout=timeout)
                logging.warning(
                    'Plex TLS verify failed for %s; connected without certificate verification',
                    candidate,
                )
                return plex
            except Exception as e2:
                last_err = e2
                logging.warning('Plex connect failed via %s (ssl_verify=false): %s', candidate, e2)

    detail = str(last_err or 'unknown error').strip()
    try:
        host = urlparse(url).hostname
    except Exception:
        host = None
    if running_in_docker() and is_loopback_host(host):
        detail += (
            '. Inside Docker, localhost is this container — set the Plex URL to your '
            'host IP or host.docker.internal in ColleXions → Config (Import from portal).'
        )
    raise RuntimeError(detail or 'Plex connection failed')
