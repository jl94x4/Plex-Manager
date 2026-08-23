#!/usr/bin/env python3
"""Cookie parse/apply helpers for TPDB browser-session import."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from requests import Request, Session

from core import (
    _parse_posterdb_browser_cookies,
    _posterdb_apply_cookie_rows,
    _posterdb_has_login_cookie,
)


def _cookie_header(session: Session, url: str = "https://theposterdb.com/search") -> str:
    prepared = session.prepare_request(Request("GET", url))
    return str(prepared.headers.get("Cookie") or "")


def test_netscape_httponly_and_www_domain() -> None:
    text = "\n".join([
        "# Netscape HTTP Cookie File",
        "#HttpOnly_.theposterdb.com\tTRUE\t/\tTRUE\t1999999999\tthe_poster_database_session\tabc",
        "www.theposterdb.com\tFALSE\t/\tTRUE\t1999999999\tcf_clearance\txyz",
        ".google.com\tTRUE\t/\tTRUE\t1999999999\tNID\tskip-me",
        "# HttpOnly_.theposterdb.com\tTRUE\t/\tTRUE\t1999999999\tremember_web_59ba36\ttoken",
    ])
    rows = _parse_posterdb_browser_cookies(text)
    names = {row["name"] for row in rows}
    assert "the_poster_database_session" in names
    assert "cf_clearance" in names
    assert "remember_web_59ba36" in names
    assert "NID" in names
    assert _posterdb_has_login_cookie(names)

    session = Session()
    _posterdb_apply_cookie_rows(session, rows)
    header = _cookie_header(session)
    assert "the_poster_database_session=abc" in header
    assert "cf_clearance=xyz" in header
    assert "remember_web_59ba36=token" in header
    assert "NID=" not in header
    assert _cookie_header(session, "https://www.theposterdb.com/search")  # apex cookies still apply via our normalize


def test_cookie_editor_host_field_and_bom() -> None:
    payload = [
        {
            "host": ".theposterdb.com",
            "name": "the_poster_database_session",
            "value": "sess",
            "path": "/",
            "isSecure": True,
        },
        {
            "domain": "www.theposterdb.com",
            "name": "cf_clearance",
            "value": "cf",
            "path": "/",
        },
    ]
    text = "\ufeff" + json.dumps(payload)
    rows = _parse_posterdb_browser_cookies(text)
    assert [row["name"] for row in rows] == ["the_poster_database_session", "cf_clearance"]
    session = Session()
    _posterdb_apply_cookie_rows(session, rows)
    header = _cookie_header(session)
    assert "the_poster_database_session=sess" in header
    assert "cf_clearance=cf" in header


def test_skips_expired_login_cookie() -> None:
    rows = _parse_posterdb_browser_cookies([
        {
            "name": "the_poster_database_session",
            "value": "old",
            "domain": ".theposterdb.com",
            "expires": int(time.time()) - 3600,
        },
        {
            "name": "cf_clearance",
            "value": "cf",
            "domain": ".theposterdb.com",
            "expires": int(time.time()) + 3600,
        },
    ])
    session = Session()
    _posterdb_apply_cookie_rows(session, rows)
    header = _cookie_header(session)
    assert "the_poster_database_session=" not in header
    assert "cf_clearance=cf" in header
    assert not _posterdb_has_login_cookie([])


def test_header_string_defaults_to_tpdb() -> None:
    rows = _parse_posterdb_browser_cookies(
        "the_poster_database_session=abc; cf_clearance=xyz"
    )
    names = {row["name"] for row in rows}
    assert names == {"the_poster_database_session", "cf_clearance"}
    session = Session()
    _posterdb_apply_cookie_rows(session, rows)
    header = _cookie_header(session)
    assert "the_poster_database_session=abc" in header
    assert "cf_clearance=xyz" in header


if __name__ == "__main__":
    test_netscape_httponly_and_www_domain()
    test_cookie_editor_host_field_and_bom()
    test_skips_expired_login_cookie()
    test_header_string_defaults_to_tpdb()
    print("ok")
