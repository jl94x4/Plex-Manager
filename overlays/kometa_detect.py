"""Kometa-parity overlay detection.

Ports the exact variant ladders from Kometa's defaults/overlays/*.yml:

- resolution.yml — resolution/edition variants, weights, and detection
  (native Plex resolution/hdr filters, DOVIPresent stream check, filepath regexes)
- audio_codec.yml — regex ladder over audio track titles OR filepaths
- video_format.yml — regex ladder over filepaths

Winner resolution matches Kometa's compile_overlays(): within one group only
the single highest-weight variant survives per item.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

ProgressFn = Callable[[str], None]


# ---------------------------------------------------------------------------
# Variant tables (verbatim from Kometa defaults)
# ---------------------------------------------------------------------------

# resolution.yml `res` conditional — regex matched against Plex resolution
# filter choices (Kometa validate_attribute applies these client-side).
RESOLUTION_RES_REGEX: dict[str, str] = {
    "4k": r"(?i)2160|4k",
    "1080p": r"(?i)1080|2k",
    "720p": r"(?i)720|hd",
    "576p": r"(?i)576",
    "480p": r"(?i)480|sd",
}

# resolution.yml `regex` conditional — matched against the file path only.
RESOLUTION_ALT_REGEX: dict[str, str] = {
    "hlg": r"(?i)\bhlg\b",
    "plus": r"(?i)\bhdr10(\+|p(lus)?\b)",
    "dvhdr": r"(?i)\bdv(.hdr10?\b)",
    "dvhdrplus": r"(?i)\bdv.HDR10(\+|P(lus)?\b)",
}

# (name, res_key, alt, weight) — standard (non-dovetail) ladder, weight order
# is Kometa's group-resolution precedence. res_key "" == plex_all (no res).
RESOLUTION_VARIANTS: list[tuple[str, str, str, int]] = [
    ("4K-DV-HDR-Plus", "4k", "dvhdrplus", 159),
    ("4K-DV-HDR", "4k", "dvhdr", 158),
    ("4K-Plus", "4k", "plus", 155),
    ("4K-DV", "4k", "dv", 150),
    ("4K-HLG", "4k", "hlg", 141),
    ("4K-HDR", "4k", "hdr", 140),
    ("4K", "4k", "", 130),
    ("1080P-DV-HDR-Plus", "1080p", "dvhdrplus", 129),
    ("1080P-DV-HDR", "1080p", "dvhdr", 128),
    ("1080P-Plus", "1080p", "plus", 125),
    ("1080P-DV", "1080p", "dv", 120),
    ("1080P-HLG", "1080p", "hlg", 111),
    ("1080P-HDR", "1080p", "hdr", 110),
    ("1080P", "1080p", "", 100),
    ("720P-DV-HDR-Plus", "720p", "dvhdrplus", 99),
    ("720P-DV-HDR", "720p", "dvhdr", 98),
    ("720P-Plus", "720p", "plus", 95),
    ("720P-DV", "720p", "dv", 90),
    ("720P-HLG", "720p", "hlg", 81),
    ("720P-HDR", "720p", "hdr", 80),
    ("720P", "720p", "", 70),
    ("576P-DV-HDR-Plus", "576p", "dvhdrplus", 69),
    ("576P-DV-HDR", "576p", "dvhdr", 68),
    ("576P-Plus", "576p", "plus", 65),
    ("576P-DV", "576p", "dv", 60),
    ("576P-HDR", "576p", "hdr", 50),
    ("576P", "576p", "", 40),
    ("480P-DV-HDR-Plus", "480p", "dvhdrplus", 39),
    ("480P-DV-HDR", "480p", "dvhdr", 38),
    ("480P-Plus", "480p", "plus", 35),
    ("480P-DV", "480p", "dv", 30),
    ("480P-HDR", "480p", "hdr", 20),
    ("480P", "480p", "", 10),
    ("DV-HDR-Plus", "", "dvhdrplus", 9),
    ("DV-HDR", "", "dvhdr", 8),
    ("Plus", "", "plus", 7),
    ("DV", "", "dv", 5),
    ("HLG", "", "hlg", 2),
    ("HDR", "", "hdr", 1),
]

# Editions (movies only). (name, key, weight, search_term)
EDITION_VARIANTS: list[tuple[str, str, int, str]] = [
    ("Extended-Edition", "extended", 190, "Extend"),
    ("Uncut-Edition", "uncut", 180, "Uncut"),
    ("Unrated-Edition", "unrated", 170, "Unrated"),
    ("Special-Edition", "special", 160, "Special"),
    ("Anniversary-Edition", "anniversary", 150, "Anniversary"),
    ("Collectors-Edition", "collector", 140, "Collector"),
    ("Diamond-Edition", "diamond", 130, "Diamond"),
    ("Platinum-Edition", "platinum", 120, "Platinum"),
    ("Directors-Cut", "directors", 110, "Director"),
    ("Final-Cut", "final", 100, "Final"),
    ("International-Cut", "international", 90, "International"),
    ("Theatrical-Cut", "theatrical", 80, "Theatrical"),
    ("Ultimate-Cut", "ultimate", 70, "Ultimate"),
    ("Alternate-Cut", "alternate", 60, "Alternate"),
    ("Coda-Cut", "coda", 50, "Coda"),
    ("IMAX-Enhanced", "enhanced", 40, "IMAX Enhanced"),
    ("IMAX", "imax", 30, "IMAX"),
    ("Remastered", "remastered", 20, "Remaster"),
    ("Criterion", "criterion", 10, "Criterion"),
    ("Richard-Donner", "richarddonner", 9, "Rich"),
    ("Black-And-Chrome", "blackchrome", 8, "Black"),
    ("Definitive", "definitive", 7, "Definitive"),
    ("Open-Matte", "openmatte", 6, "Open Matte"),
    ("Ulysses", "ulysses", 5, "Ulysses"),
    ("Producers-Cut", "producers", 4, "Producer"),
]

# Edition keys with bespoke regexes in resolution.yml (others use TRaSH naming).
EDITION_SPECIAL_REGEX: dict[str, str] = {
    "enhanced": (
        r"(?i)\bIMAX Enhanced\b|^(?=.*(DSNP|Disney\+|CORE(?=[ ._-]web[ ._-]?(dl|rip)\b)"
        r"|\bBC(?=[ ._-]web[ ._-]?(dl|rip)\b)|IMAX[- .]Enhanced)\b)(?=.*\b(IMAX|IMAX[- .]Enhanced)\b).*"
    ),
    "imax": r"(?i)\bIMAX\b",
    "criterion": r"(?i)Criterion|\[CC\]",
    "openmatte": r"(?i)\b(Open[ ._-]?Matte)\b",
}

# audio_codec.yml — (name, key, weight, regex). Matched against audio stream
# extendedDisplayTitle OR filepath (Kometa ORs the two filters).
AUDIO_CODEC_VARIANTS: list[tuple[str, str, int, str]] = [
    ("Dolby-TrueHD-Atmos", "truehd_atmos", 160, r"(?i)^(?=.*\btrue[ ._-]?hd(\b|\d))(?=.*\batmos(\b|\d))"),
    ("DTS-X", "dtsx", 150, r"(?i)\b(dts[-_. ]?x7?)\b(?![-_. ]?(26[456]))"),
    ("Dolby-Digital-Plus-Atmos", "plus_atmos", 140, r"(?i)^(?=.*\b((dd[p+])|(dolby[ ._-]digital[ ._-]plus)|(e[ ._-]?ac3)\b))(?=.*\batmos(\b|\d))"),
    ("Dolby-Atmos", "atmos", 130, r"(?i)\batmos(\b|\d)"),
    ("Dolby-TrueHD", "truehd", 120, r"(?i)\btrue[ ._-]?hd(\b|\d)"),
    ("DTS-HD-MA", "ma", 110, r"(?i)\bdts[ ._-]?(hd[ ._-])?(ma|xll|hd)(\b|\d)(?![ ._-]hra)"),
    ("FLAC", "flac", 100, r"(?i)\bflac(\b|\d)"),
    ("PCM", "pcm", 90, r"(?i)\bl?pcm(\b|\d)"),
    ("DTS-HD-HRA", "hra", 80, r"(?i)\bdts[ ._-]?(hd[ ._-])?(hr|hra|hi|ra)(\b|\d)"),
    ("Dolby-Digital-Plus", "plus", 70, r"(?i)\b(dd[p+])|(dolby[ ._-]digital[ ._-]plus)|(e[ ._-]?ac3)\b"),
    ("DTS-ES", "dtses", 60, r"(?i)\bdts[ ._-]?es(\b|\d)"),
    ("DTS", "dts", 50, r"(?i)\bdts(\b|\d)"),
    ("Dolby-Digital", "digital", 40, r"(?i)\b(dd)|(ac3)|(dolby)(\b|\d)"),
    ("AAC", "aac", 30, r"(?i)\b(aac|stereo|2\.0)\b"),
    ("MP3", "mp3", 20, r"(?i)\bmp3(\b|\d)"),
    ("Opus", "opus", 10, r"(?i)\b(?<!-)OPUS(\b|\d)"),
]

# status.yml — text overlays for shows. AIRING uses Plex episode_air_date (14d),
# the rest use TMDB series status. (name, key, weight)
STATUS_VARIANTS: list[tuple[str, str, int]] = [
    ("AIRING", "airing", 40),
    ("RETURNING", "returning", 30),
    ("CANCELED", "canceled", 20),
    ("ENDED", "ended", 10),
]
STATUS_AIRING_LAST_DAYS = 14

# streaming.yml — (overlay_name, key, tmdb provider ids, weight, show_only, region_rule)
# region_rule: None = all, "GB"/"ES"/"CA" = only that region, "!CA" = all except CA.
STREAMING_VARIANTS: list[tuple[str, str, tuple[int, ...], int, bool, str | None]] = [
    ("Netflix", "netflix", (8, 175), 160, False, None),
    ("Prime Video", "amazon", (9,), 150, False, None),  # provider 119 outside AT/DE/GB/JP/US
    ("Disney", "disney", (337, 508), 140, False, None),
    ("HBO-Max", "hbomax", (1899,), 130, False, "!CA"),
    ("Crunchyroll", "crunchyroll", (283,), 120, True, None),
    ("Movistar Plus+", "movistar", (149, 339, 2241), 115, False, "ES"),
    ("Atres Player", "atresplayer", (62, 2162), 113, False, "ES"),
    ("YouTube", "youtube", (188, 508, 235), 110, False, None),
    ("Hulu", "hulu", (15,), 100, False, None),
    ("Paramount+", "paramount", (531, 1770), 90, False, None),
    ("AMC+", "amc", (528, 1854), 85, False, None),
    ("AppleTV", "appletv", (350,), 80, False, None),
    ("Peacock", "peacock", (386, 387), 70, False, None),
    ("discovery+", "discovery", (524, 584), 58, True, None),
    ("Crave", "crave", (230,), 55, False, "CA"),
    ("NOW", "now", (39,), 50, False, "GB"),
    ("Channel 4", "channel4", (103,), 40, False, "GB"),
    ("ITVX", "itvx", (41, 2300), 30, False, "GB"),
    ("BET+", "bet", (1759,), 20, False, None),
    ("hayu", "hayu", (223,), 10, True, None),
    ("tubi", "tubi", (73,), 5, False, None),
    ("Filmin", "filmin", (63,), 5, False, "ES"),
]

# Regions where Prime Video keeps provider id 9 (elsewhere Kometa swaps to 119).
PRIME_NATIVE_REGIONS = {"AT", "DE", "GB", "JP", "US"}

# video_format.yml — (name, key, weight, regex). Filepath only; text overlays.
VIDEO_FORMAT_VARIANTS: list[tuple[str, str, int, str]] = [
    ("REMUX", "remux", 60, r"(?i)\bremux\b"),
    ("BLU-RAY", "bluray", 50, r"(?i)\b(blu[ ._-]?ray|bd|br|hd[ ._-]?dvd)\b"),
    ("WEB", "web", 40, r"(?i)web[ ._-]?(dl|rip)"),
    ("HDTV", "hdtv", 30, r"(?i)\bhd[ ._-]?tv\b"),
    ("DVD", "dvd", 20, r"(?i)\bdvd\b"),
    ("SDTV", "sdtv", 10, r"(?i)\bsd[ ._-]?tv\b"),
    ("TELESYNC", "telesync", 9, r"(?i)\b(TS|HDTS|TELESYNC)\b"),
    ("CAM", "cam", 8, r"(?i)\b(HQ|HD)?CAM\b"),
]

# aspect.yml — text overlays keyed off media aspectRatio (movies).
ASPECT_VARIANTS: list[tuple[str, float, int]] = [
    ("1.33", 1.33, 10),
    ("1.65", 1.65, 20),
    ("1.66", 1.66, 30),
    ("1.78", 1.78, 40),
    ("1.85", 1.85, 50),
    ("2.2", 2.20, 60),
    ("2.35", 2.35, 70),
    ("2.77", 2.77, 80),
]

# content_rating_*.yml — Plex contentRating value → cr/ image basename.
CONTENT_RATING_TABLES: dict[str, dict[str, str]] = {
    "us_movie": {
        "g": "usg", "pg": "uspg", "pg-13": "uspg-13", "r": "usr",
        "nc-17": "usnc-17", "nr": "usnr", "not rated": "usnr", "unrated": "usnr",
    },
    "us_show": {
        "tv-y": "ustv-y", "tv-g": "ustv-g", "tv-pg": "ustv-pg",
        "tv-14": "ustv-14", "tv-ma": "ustv-ma", "nr": "usnr", "not rated": "usnr",
    },
    "uk": {
        "u": "uku", "pg": "ukpg", "12": "uk12", "12a": "uk12a",
        "15": "uk15", "18": "uk18", "r18": "ukr18", "nr": "uknr", "not rated": "uknr",
    },
    "de": {
        "0": "de0", "6": "de6", "12": "de12", "16": "de16", "18": "de18",
        "bpjm": "debpjm", "nr": "denr", "not rated": "denr",
    },
    "au": {
        "g": "au_g", "pg": "au_pg", "m": "au_m", "ma15+": "au_ma", "ma": "au_ma",
        "r18+": "au_r", "r": "au_r", "x18+": "au_x", "x": "au_x",
        "nr": "au_nr", "not rated": "au_nr",
    },
    "nz": {
        "g": "nz_g", "pg": "nz_pg", "m": "nz_m", "r": "nz_r",
        "r13": "nz_r13", "r15": "nz_r15", "r16": "nz_r16", "r18": "nz_r18",
        "rp13": "nz_rp13", "rp16": "nz_rp16", "rp18": "nz_rp18",
        "nr": "nz_nr", "not rated": "nz_nr",
    },
}

# languages.yml — audio language (ISO 639-1) → flag country image code.
LANGUAGE_FLAG_MAP: dict[str, str] = {
    "en": "us", "de": "de", "es": "es", "fr": "fr", "it": "it", "pt": "pt",
    "ja": "jp", "ko": "kr", "zh": "cn", "ru": "ru", "hi": "in", "ar": "sa",
    "nl": "nl", "sv": "se", "no": "no", "da": "dk", "fi": "fi", "pl": "pl",
    "tr": "tr", "th": "th", "cs": "cz", "el": "gr", "he": "il", "hu": "hu",
    "id": "id", "uk": "ua", "vi": "vn", "ro": "ro", "bg": "bg", "hr": "hr",
    "sk": "sk", "sl": "si", "sr": "rs", "fa": "ir", "ur": "pk", "ms": "my",
    "tl": "ph", "is": "is", "et": "ee", "lv": "lv", "lt": "lt", "sq": "al",
    "mk": "mk", "ka": "ge", "hy": "am", "az": "az", "kk": "kz", "uz": "uz",
    "mn": "mn", "ne": "np", "si": "lk", "my": "mm", "km": "kh", "lo": "la",
    "sw": "ke", "af": "za", "zu": "za", "ga": "ie", "cy": "gb", "mt": "mt",
    "lb": "lu", "be": "by", "ta": "in", "te": "in", "ml": "in", "bn": "bd",
    "ca": "es", "eu": "es", "gl": "es",
}

# ISO 639-2 (Plex stream languageCode) → ISO 639-1.
_ISO_639_2_TO_1: dict[str, str] = {
    "eng": "en", "fra": "fr", "fre": "fr", "deu": "de", "ger": "de",
    "spa": "es", "ita": "it", "por": "pt", "jpn": "ja", "kor": "ko",
    "zho": "zh", "chi": "zh", "rus": "ru", "hin": "hi", "ara": "ar",
    "nld": "nl", "dut": "nl", "swe": "sv", "nor": "no", "dan": "da",
    "fin": "fi", "pol": "pl", "tur": "tr", "tha": "th", "ces": "cs",
    "cze": "cs", "ell": "el", "gre": "el", "heb": "he", "hun": "hu",
    "ind": "id", "ukr": "uk", "vie": "vi", "ron": "ro", "rum": "ro",
    "bul": "bg", "hrv": "hr", "slk": "sk", "slo": "sk", "slv": "sl",
    "srp": "sr", "fas": "fa", "per": "fa", "urd": "ur", "msa": "ms",
    "may": "ms", "tgl": "tl", "fil": "tl", "isl": "is", "ice": "is",
    "est": "et", "lav": "lv", "lit": "lt", "sqi": "sq", "alb": "sq",
    "mkd": "mk", "mac": "mk", "kat": "ka", "geo": "ka", "hye": "hy",
    "arm": "hy", "aze": "az", "kaz": "kk", "uzb": "uz", "mon": "mn",
    "nep": "ne", "sin": "si", "mya": "my", "bur": "my", "khm": "km",
    "lao": "lo", "swa": "sw", "afr": "af", "zul": "zu", "gle": "ga",
    "cym": "cy", "wel": "cy", "mlt": "mt", "ltz": "lb", "bel": "be",
    "tam": "ta", "tel": "te", "mal": "ml", "ben": "bn", "cat": "ca",
    "eus": "eu", "baq": "eu", "glg": "gl",
}

# ribbon.yml — (name, key, weight, movie_only, source).
# source: ("award", event_id, award_filters, category_filters)
#         ("chart", chart_key) | ("mdblist", list_key)
RIBBON_VARIANTS: list[tuple[str, str, int, bool, tuple]] = [
    ("Academy Awards Best Picture Winner", "oscars", 190, True,
     ("award", "ev0000003", None, ["best picture", "best motion picture of the year"])),
    ("Academy Awards Best Director Winner", "oscars_director", 180, True,
     ("award", "ev0000003", None, [
         "best achievement in directing", "best director",
         "best director, comedy picture", "best director, dramatic picture",
     ])),
    ("Golden Globe Best Picture/Show Winner", "golden", 170, False,
     ("award", "ev0000292", None, [
         "best motion picture - drama", "best motion picture - musical or comedy",
         "best motion picture, drama", "best motion picture, musical or comedy",
         "best television series - drama", "best television series - musical or comedy",
         "best television series, drama", "best television series, musical or comedy",
         "best picture", "best film",
     ])),
    ("Golden Globe Best Director Winner", "golden_director", 160, True,
     ("award", "ev0000292", None, ["best director", "best director - motion picture"])),
    ("BAFTA Best Film Winner", "bafta", 150, True,
     ("award", "ev0000123", None, ["best film"])),
    ("Cannes Palme d'Or Winner", "cannes", 140, True,
     ("award", "ev0000147", ["palme d'or"], None)),
    ("Berlinale Best Film Winner", "berlinale", 130, True,
     ("award", "ev0000091", ["golden bear", "golden berlin bear"], None)),
    ("Venice Golden Lion Winner", "venice", 120, True,
     ("award", "ev0000681", ["golden lion"], None)),
    ("Sundance Grand Jury Prize Winner", "sundance", 110, True,
     ("award", "ev0000631", ["grand jury prize"], None)),
    ("Emmys Best Show Winner", "emmys", 100, False,
     ("award", "ev0000223", None, [
         "outstanding comedy series", "outstanding drama series",
         "outstanding limited series", "outstanding limited or anthology series",
     ])),
    ("Critic's Choice Best Picture Winner", "choice", 90, True,
     ("award", "ev0000133", None, ["best picture"])),
    ("Independent Spirit Best Feature Winner", "spirit", 80, True,
     ("award", "ev0000349", None, ["best feature"])),
    ("Cesar Best Film Winner", "cesar", 70, True,
     ("award", "ev0000157", None, ["best film", "meilleur film"])),
    ("IMDb Top 250", "imdb", 60, False, ("chart", "top")),
    ("Rotten Tomatoes Verified Hot", "rottenverified", 45, True, ("mdblist", "verifiedhot")),
    ("Rotten Tomatoes Certified Fresh", "rotten", 40, False, ("mdblist", "certifiedfresh")),
    ("Metacritic Must See", "metacritic", 30, True, ("mdblist", "metacriticmustsee")),
    ("Common Sense Selection", "common", 20, False, ("mdblist", "cssfamilies")),
    ("Razzies Worst Picture Winner", "razzie", 10, True,
     ("award", "ev0000558", None, ["worst picture"])),
]

# ratings.yml — source → rating/ image basename ((fresh, rotten) pairs split at 6.0).
RATING_SOURCE_IMAGES: dict[str, tuple[str, str]] = {
    "audience": ("AudienceFresh", "AudienceRotten"),
    "critic": ("CriticFresh", "CriticRotten"),
    "user": ("UserFresh", "UserRotten"),
    "rt": ("RT-Aud-Fresh", "RT-Aud-Rotten"),
    "rt_critic": ("RT-Crit-Fresh", "RT-Crit-Rotten"),
    "imdb": ("IMDb", "IMDb"),
    "tmdb": ("TMDb", "TMDb"),
}


@dataclass
class Winner:
    family: str
    name: str
    key: str
    alt: str = ""
    weight: int = 0
    text: str | None = None
    image_rel: str | None = None
    extra: dict | None = None  # family-specific render payload (ratings slots, flag list)

    def as_log(self) -> dict:
        out = {"name": self.name, "weight": self.weight}
        if self.text:
            out["text"] = self.text
        if self.image_rel:
            out["image"] = self.image_rel
        if self.extra:
            out["extra"] = self.extra
        return out


def _compile(pattern: str) -> re.Pattern:
    return re.compile(pattern)


_RESOLUTION_RES_RE = {k: _compile(v) for k, v in RESOLUTION_RES_REGEX.items()}
_RESOLUTION_ALT_RE = {k: _compile(v) for k, v in RESOLUTION_ALT_REGEX.items()}
_AUDIO_RE = [(name, key, weight, _compile(rx)) for name, key, weight, rx in AUDIO_CODEC_VARIANTS]
_VIDEO_RE = [(name, key, weight, _compile(rx)) for name, key, weight, rx in VIDEO_FORMAT_VARIANTS]


def _edition_regexes(key: str, search: str) -> list[re.Pattern]:
    out: list[re.Pattern] = []
    special = EDITION_SPECIAL_REGEX.get(key)
    if special:
        out.append(_compile(special))
    esc = re.escape(search)
    # New TRaSH naming + original TRaSH naming (verbatim from resolution.yml).
    out.append(_compile(rf"(?i)edition-\b(4k )?{esc}(s|ed)?\b"))
    out.append(_compile(rf"(?i)(?<=[0-9]{{4}}[)}}>\]]\s)\b(4k )?{esc}(s|ed)?\b"))
    return out


_EDITION_RE = {key: _edition_regexes(key, search) for _, key, _, search in EDITION_VARIANTS}


# ---------------------------------------------------------------------------
# Per-section native Plex filter index (exactly Kometa's plex_search usage)
# ---------------------------------------------------------------------------


def _section_numeric_id(section) -> str:
    return str(getattr(section, "key", "") or "").rstrip("/").split("/")[-1]


def _query_rating_keys(plex, path: str) -> set[str]:
    keys: set[str] = set()
    data = plex.query(path)
    if data is None:
        return keys
    for el in data:
        rk = el.attrib.get("ratingKey")
        if rk:
            keys.add(str(rk))
    return keys


def _query_attrib_values(plex, path: str, attrib: str) -> set[str]:
    values: set[str] = set()
    data = plex.query(path)
    if data is None:
        return values
    for el in data:
        val = el.attrib.get(attrib)
        if val:
            values.add(str(val))
    return values


def _resolution_choices(plex, section) -> list[tuple[str, str]]:
    """(key, title) pairs from the library's resolution filter choices."""
    sid = _section_numeric_id(section)
    stype = str(getattr(section, "type", "") or "").lower()
    qtype = 1 if stype == "movie" else 4  # movies filter on movie, shows on episode values
    choices: list[tuple[str, str]] = []
    try:
        data = plex.query(f"/library/sections/{sid}/resolution?type={qtype}")
        for el in data or []:
            key = str(el.attrib.get("key") or "")
            title = str(el.attrib.get("title") or "")
            if key or title:
                choices.append((key, title))
    except Exception:
        pass
    return choices


@dataclass
class SectionIndex:
    """Membership sets built from native Plex advanced filters (one query each)."""

    section_id: str
    is_show: bool
    resolution_members: dict[str, set[str]] = field(default_factory=dict)
    hdr_members: set[str] = field(default_factory=set)
    dovi_members: set[str] | None = None  # None → native dovi filter unavailable

    @classmethod
    def build(cls, plex, section, *, need_resolution: bool, need_hdr: bool, need_dovi: bool, progress: ProgressFn | None = None) -> "SectionIndex":
        sid = _section_numeric_id(section)
        stype = str(getattr(section, "type", "") or "").lower()
        is_show = stype == "show"
        qtype = 2 if is_show else 1
        prefix = "episode." if is_show else ""
        idx = cls(section_id=sid, is_show=is_show)

        if need_resolution:
            choices = _resolution_choices(plex, section)
            for res_key, rx in _RESOLUTION_RES_RE.items():
                matched = [c for c, title in choices if rx.search(c) or rx.search(title)]
                members: set[str] = set()
                for choice in matched:
                    try:
                        members |= _query_rating_keys(
                            plex,
                            f"/library/sections/{sid}/all?type={qtype}&{prefix}resolution={choice}",
                        )
                    except Exception:
                        continue
                idx.resolution_members[res_key] = members

        if need_hdr:
            try:
                idx.hdr_members = _query_rating_keys(
                    plex, f"/library/sections/{sid}/all?type={qtype}&{prefix}hdr=1"
                )
            except Exception:
                idx.hdr_members = set()

        if need_dovi:
            try:
                idx.dovi_members = _query_rating_keys(
                    plex, f"/library/sections/{sid}/all?type={qtype}&{prefix}dovi=1"
                )
            except Exception:
                # Older PMS without the native dovi filter — fall back to
                # per-item DOVIPresent stream checks (Kometa's has_dolby_vision).
                idx.dovi_members = None
                if progress:
                    progress(f"Section {sid}: native dovi filter unavailable, using stream checks")
        return idx


# ---------------------------------------------------------------------------
# Per-item data extraction
# ---------------------------------------------------------------------------


def item_filepaths(item) -> list[str]:
    """Kometa filepath semantics: movie/episode = part files, show = folder locations."""
    stype = str(getattr(item, "type", "") or "").lower()
    if stype == "show":
        try:
            return [str(x) for x in (getattr(item, "locations", None) or []) if x]
        except Exception:
            return []
    paths: list[str] = []
    try:
        for media in getattr(item, "media", None) or []:
            for part in getattr(media, "parts", None) or []:
                f = getattr(part, "file", None)
                if f:
                    paths.append(str(f))
    except Exception:
        pass
    return paths


def item_audio_titles(item) -> list[str]:
    """Audio stream extendedDisplayTitle values (movies; shows have no streams)."""
    titles: list[str] = []
    try:
        for media in getattr(item, "media", None) or []:
            for part in getattr(media, "parts", None) or []:
                for stream in getattr(part, "streams", None) or []:
                    stype = getattr(stream, "streamType", None)
                    if stype in (2, "2") or str(getattr(stream, "type", "")).lower() == "audio":
                        for attr in ("extendedDisplayTitle", "displayTitle", "title"):
                            val = getattr(stream, attr, None)
                            if val:
                                titles.append(str(val))
    except Exception:
        pass
    return titles


def item_audio_languages(item) -> list[str]:
    """Ordered distinct ISO 639-1 audio languages across all parts (movies)."""
    seen: list[str] = []
    try:
        for media in getattr(item, "media", None) or []:
            for part in getattr(media, "parts", None) or []:
                for stream in getattr(part, "streams", None) or []:
                    stype = getattr(stream, "streamType", None)
                    if stype not in (2, "2") and str(getattr(stream, "type", "")).lower() != "audio":
                        continue
                    code = str(getattr(stream, "languageCode", "") or "").strip().lower()
                    lang = _ISO_639_2_TO_1.get(code, code if len(code) == 2 else "")
                    if lang and lang not in seen:
                        seen.append(lang)
    except Exception:
        pass
    return seen


def item_has_dovi_streams(item, *, reload: bool = True) -> bool:
    """Kometa's has_dolby_vision: DOVIPresent on any video stream (movies)."""
    try:
        if reload:
            item.reload()
    except Exception:
        pass
    try:
        for media in getattr(item, "media", None) or []:
            for part in getattr(media, "parts", None) or []:
                for stream in getattr(part, "streams", None) or []:
                    stype = getattr(stream, "streamType", None)
                    if stype in (1, "1") or str(getattr(stream, "type", "")).lower() == "video":
                        if str(getattr(stream, "DOVIPresent", "") or "").lower() in {"1", "true"}:
                            return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Family detection (first match in weight-desc table == group max weight)
# ---------------------------------------------------------------------------


class KometaDetector:
    """Holds per-section indexes + per-item caches for one run."""

    def __init__(self, plex, *, progress: ProgressFn | None = None):
        self.plex = plex
        self.progress = progress
        self._indexes: dict[str, SectionIndex] = {}
        self._dovi_cache: dict[str, bool] = {}
        self._airing_cache: dict[str, set[str]] = {}
        self._dup_show_cache: dict[str, set[str]] = {}

    def index_for(self, section, *, need_resolution: bool, need_hdr: bool, need_dovi: bool) -> SectionIndex:
        sid = _section_numeric_id(section)
        cached = self._indexes.get(sid)
        if cached is not None:
            return cached
        idx = SectionIndex.build(
            self.plex,
            section,
            need_resolution=need_resolution,
            need_hdr=need_hdr,
            need_dovi=need_dovi,
            progress=self.progress,
        )
        self._indexes[sid] = idx
        return idx

    def _is_dv(self, item, idx: SectionIndex) -> bool:
        key = str(getattr(item, "ratingKey", "") or "")
        if idx.dovi_members is not None:
            return key in idx.dovi_members
        if key in self._dovi_cache:
            return self._dovi_cache[key]
        if idx.is_show:
            # Shows have no media streams; without the native filter DV is undetectable
            # at show level (parity: Kometa's has_dolby_vision finds nothing either).
            self._dovi_cache[key] = False
            return False
        result = item_has_dovi_streams(item)
        self._dovi_cache[key] = result
        return result

    def detect_resolution(
        self,
        item,
        section,
        variant_allowed: Callable[[str, str], bool] | None = None,
    ) -> Winner | None:
        idx = self.index_for(section, need_resolution=True, need_hdr=True, need_dovi=True)
        key = str(getattr(item, "ratingKey", "") or "")
        paths = item_filepaths(item)
        for name, res_key, alt, weight in RESOLUTION_VARIANTS:
            if variant_allowed is not None and not variant_allowed(res_key, alt):
                continue
            if res_key:
                members = idx.resolution_members.get(res_key) or set()
                if key not in members:
                    continue
            if alt == "":
                pass
            elif alt == "hdr":
                if key not in idx.hdr_members:
                    continue
            elif alt == "dv":
                if not self._is_dv(item, idx):
                    continue
            else:  # hlg / plus / dvhdr / dvhdrplus — filepath regex only
                rx = _RESOLUTION_ALT_RE[alt]
                if not paths or not any(rx.search(p) for p in paths):
                    continue
            image_key = f"{res_key}{alt}" if res_key else alt
            return Winner(
                family="resolution",
                name=name,
                key=res_key,
                alt=alt,
                weight=weight,
                image_rel=f"resolution/{image_key}.png",
            )
        return None

    def detect_edition(self, item, section) -> Winner | None:
        stype = str(getattr(section, "type", "") or "").lower()
        if stype != "movie":
            return None  # allowed_libraries: movie
        edition = str(getattr(item, "editionTitle", "") or "").strip()
        paths = item_filepaths(item)
        for name, key, weight, search in EDITION_VARIANTS:
            matched = False
            if edition and search.lower() in edition.lower():
                matched = True
            if not matched and paths:
                for rx in _EDITION_RE[key]:
                    if any(rx.search(p) for p in paths):
                        matched = True
                        break
            if matched:
                return Winner(
                    family="edition",
                    name=name,
                    key=key,
                    weight=weight,
                    image_rel=f"edition/{key}.png",
                )
        return None

    def detect_audio_codec(self, item, section) -> Winner | None:
        paths = item_filepaths(item)
        titles: list[str] | None = None  # lazy — stream titles need item data
        for name, key, weight, rx in _AUDIO_RE:
            if paths and any(rx.search(p) for p in paths):
                return self._audio_winner(name, key, weight)
            if titles is None:
                titles = item_audio_titles(item)
            if titles and any(rx.search(t) for t in titles):
                return self._audio_winner(name, key, weight)
        return None

    @staticmethod
    def _audio_winner(name: str, key: str, weight: int) -> Winner:
        return Winner(
            family="audio_codec",
            name=name,
            key=key,
            weight=weight,
            image_rel=None,  # style resolved at render time (compact/standard)
        )

    def detect_video_format(self, item, section) -> Winner | None:
        paths = item_filepaths(item)
        if not paths:
            return None
        for name, key, weight, rx in _VIDEO_RE:
            if any(rx.search(p) for p in paths):
                return Winner(family="video_format", name=name, key=key, weight=weight, text=name)
        return None

    # -- status (Plex airing search + TMDB series status) -------------------

    def airing_members(self, section, days: int = STATUS_AIRING_LAST_DAYS) -> set[str]:
        """Shows with an episode aired in the last N days (Kometa's episode_air_date)."""
        sid = _section_numeric_id(section)
        cache_key = f"{sid}:{days}"
        cached = self._airing_cache.get(cache_key)
        if cached is not None:
            return cached
        members: set[str] = set()
        try:
            members = _query_rating_keys(
                self.plex,
                f"/library/sections/{sid}/all?type=2&episode.originallyAvailableAt%3E%3E=-{int(days)}d",
            )
        except Exception:
            members = set()
        self._airing_cache[cache_key] = members
        return members

    def detect_status(self, item, section, *, tmdb=None, airing_days: int = STATUS_AIRING_LAST_DAYS) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "show":
            return None
        key = str(getattr(item, "ratingKey", "") or "")
        for name, skey, weight in STATUS_VARIANTS:
            if skey == "airing":
                if key in self.airing_members(section, airing_days):
                    return Winner(family="status", name=name, key=skey, weight=weight, text=name)
                continue
            status = None
            if tmdb is not None and getattr(tmdb, "enabled", False):
                status = tmdb.show_status(item)
            else:
                # No TMDB key — degrade to Plex's own status field.
                raw = str(getattr(item, "status", "") or "").strip().lower()
                if "cancel" in raw:
                    status = "canceled"
                elif "end" in raw:
                    status = "ended"
                elif "continu" in raw or "return" in raw:
                    status = "returning"
            if status == skey:
                return Winner(family="status", name=name, key=skey, weight=weight, text=name)
        return None

    # -- streaming (TMDB watch providers per region) -------------------------

    def detect_streaming(self, item, section, *, tmdb, region: str = "US") -> Winner | None:
        if tmdb is None or not getattr(tmdb, "enabled", False):
            return None
        region = str(region or "US").strip().upper() or "US"
        is_show = str(getattr(item, "type", "") or "").lower() == "show"
        providers = tmdb.watch_provider_ids(item, is_movie=not is_show, region=region)
        if not providers:
            return None
        for name, key, tmdb_ids, weight, show_only, region_rule in sorted(
            STREAMING_VARIANTS, key=lambda v: -v[3]
        ):
            if show_only and not is_show:
                continue
            if region_rule:
                if region_rule.startswith("!"):
                    if region == region_rule[1:]:
                        continue
                elif region != region_rule:
                    continue
            wanted = set(tmdb_ids)
            if key == "amazon" and region not in PRIME_NATIVE_REGIONS:
                wanted = {119}
            if providers & wanted:
                return Winner(
                    family="streaming",
                    name=name,
                    key=key,
                    weight=weight,
                    image_rel=f"streaming/color/{name}.png",
                )
        return None

    # -- aspect ratio (aspect.yml — text overlays, movies) --------------------

    def detect_aspect(self, item, section) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "movie":
            return None
        ratio = None
        try:
            for media in getattr(item, "media", None) or []:
                raw = getattr(media, "aspectRatio", None)
                if raw is not None:
                    ratio = float(raw)
                    break
        except (TypeError, ValueError):
            ratio = None
        if ratio is None:
            return None
        best = None
        for name, value, weight in ASPECT_VARIANTS:
            if abs(ratio - value) <= 0.05 and (best is None or weight > best[2]):
                best = (name, value, weight)
        if best is None:
            return None
        return Winner(family="aspect", name=best[0], key=best[0], weight=best[2], text=best[0])

    # -- versions (versions.yml — multi-version count) -------------------------

    def _duplicate_show_members(self, section) -> set[str]:
        """Shows containing at least one episode with multiple versions."""
        sid = _section_numeric_id(section)
        cached = self._dup_show_cache.get(sid)
        if cached is not None:
            return cached
        members: set[str] = set()
        try:
            members = _query_attrib_values(
                self.plex,
                f"/library/sections/{sid}/all?type=4&duplicate=1",
                "grandparentRatingKey",
            )
        except Exception:
            members = set()
        self._dup_show_cache[sid] = members
        return members

    def detect_versions(self, item, section) -> Winner | None:
        stype = str(getattr(item, "type", "") or "").lower()
        count = 0
        if stype == "movie":
            try:
                count = len(getattr(item, "media", None) or [])
            except Exception:
                count = 0
            if count < 2:
                return None
        elif stype == "show":
            key = str(getattr(item, "ratingKey", "") or "")
            if key not in self._duplicate_show_members(section):
                return None
            count = 2
        else:
            return None
        return Winner(
            family="versions",
            name=f"{count} Versions",
            key="versions",
            weight=count,
            image_rel="versions.png",
        )

    # -- language count (language_count.yml — dual/multi audio, movies) --------

    def detect_language_count(self, item, section) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "movie":
            return None
        langs = item_audio_languages(item)
        if len(langs) > 2:
            return Winner(family="language_count", name="Multi-Audio", key="multi",
                          weight=20, image_rel="multi_audio.png")
        if len(langs) == 2:
            return Winner(family="language_count", name="Dual-Audio", key="dual",
                          weight=10, image_rel="dual_audio.png")
        return None

    # -- languages (languages.yml — flag badges, movies) -----------------------

    def detect_languages(self, item, section, *, wanted: list[str], max_flags: int = 4) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "movie":
            return None
        langs = item_audio_languages(item)
        if not langs:
            return None
        wanted_set = [w.strip().lower() for w in wanted if str(w).strip()]
        if wanted_set:
            langs = [l for l in langs if l in wanted_set]
        flags = []
        for lang in langs[: max(1, int(max_flags))]:
            country = LANGUAGE_FLAG_MAP.get(lang)
            if country:
                flags.append({"lang": lang, "country": country})
        if not flags:
            return None
        return Winner(
            family="languages",
            name="+".join(f["lang"].upper() for f in flags),
            key="languages",
            weight=len(flags),
            extra={"flags": flags},
        )

    # -- runtimes (runtimes.yml — text, movies/shows) ---------------------------

    def detect_runtimes(self, item, section) -> Winner | None:
        duration = getattr(item, "duration", None)
        try:
            total_min = int(round(float(duration) / 60000))
        except (TypeError, ValueError):
            return None
        if total_min <= 0:
            return None
        hours, minutes = divmod(total_min, 60)
        text = f"Runtime: {hours}h {minutes}m" if hours else f"Runtime: {minutes}m"
        return Winner(family="runtimes", name=text, key="runtimes", weight=total_min, text=text)

    # -- episode info (episode_info.yml — S##E## text on episode art) -----------

    def detect_episode_info(self, item, section) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "episode":
            return None
        try:
            season = int(getattr(item, "parentIndex", None) or getattr(item, "seasonNumber", None) or 0)
            episode = int(getattr(item, "index", None) or getattr(item, "episodeNumber", None) or 0)
        except (TypeError, ValueError):
            return None
        if season <= 0 or episode <= 0:
            return None
        text = f"S{season:02d}E{episode:02d}"
        return Winner(family="episode_info", name=text, key="episode_info", weight=10, text=text)

    # -- direct play (direct_play.yml — 4K items likely to transcode) -----------

    def detect_direct_play(self, item, section) -> Winner | None:
        idx = self.index_for(section, need_resolution=True, need_hdr=True, need_dovi=True)
        key = str(getattr(item, "ratingKey", "") or "")
        if key not in (idx.resolution_members.get("4k") or set()):
            return None
        return Winner(
            family="direct_play",
            name="Direct Play Only",
            key="direct_play",
            weight=10,
            image_rel="Direct-Play.png",
        )

    # -- content ratings (content_rating_*.yml + commonsense.yml) ---------------

    @staticmethod
    def _content_rating_value(item) -> str:
        raw = str(getattr(item, "contentRating", "") or "").strip()
        # Plex prefixes regional agents: "gb/12A", "de/16", "nz/M"
        if "/" in raw:
            raw = raw.rsplit("/", 1)[-1]
        return raw.strip()

    def detect_content_rating(self, item, section, *, scheme: str) -> Winner | None:
        scheme = str(scheme or "").strip().lower()
        if scheme in {"", "none", "off"}:
            return None
        value = self._content_rating_value(item)
        stype = str(getattr(item, "type", "") or "").lower()
        if scheme == "commonsense":
            digits = re.sub(r"[^0-9]", "", value)
            if not digits:
                return None
            age = max(1, min(18, int(digits)))
            return Winner(
                family="content_rating",
                name=f"{age}+",
                key=f"cs{age}",
                weight=age,
                text=f"{age}+",
                extra={"addon": "Commonsense.png"},
            )
        table_key = scheme
        if scheme == "us":
            table_key = "us_show" if stype == "show" else "us_movie"
        table = CONTENT_RATING_TABLES.get(table_key)
        if not table:
            return None
        image = table.get(value.lower()) or table.get("nr")
        if not image:
            return None
        return Winner(
            family="content_rating",
            name=value or "NR",
            key=image,
            weight=10,
            image_rel=f"cr/{image}.png",
        )

    # -- mediastinger (mediastinger.yml — TMDB credits-scene keywords) -----------

    def detect_mediastinger(self, item, section, *, tmdb) -> Winner | None:
        if str(getattr(item, "type", "") or "").lower() != "movie":
            return None
        if tmdb is None or not getattr(tmdb, "enabled", False):
            return None
        if not tmdb.has_stinger(item):
            return None
        return Winner(
            family="mediastinger",
            name="MediaStinger",
            key="mediastinger",
            weight=10,
            image_rel="Mediastinger.png",
        )

    # -- ribbon (ribbon.yml — awards/charts/list badges) --------------------------

    def detect_ribbon(self, item, section, *, lists, tmdb, style: str = "yellow") -> Winner | None:
        if lists is None:
            return None
        from kometa_lists import extract_imdb_id

        is_show = str(getattr(item, "type", "") or "").lower() == "show"
        imdb_id = extract_imdb_id(item)
        tmdb_id = None
        style = str(style or "yellow").strip().lower()
        if style not in {"yellow", "red", "black", "gray"}:
            style = "yellow"
        for name, key, weight, movie_only, source in RIBBON_VARIANTS:
            if movie_only and is_show:
                continue
            matched = False
            kind = source[0]
            if kind == "award":
                if imdb_id:
                    _, event_id, award_filters, category_filters = source
                    matched = imdb_id in lists.imdb_award_winners(
                        event_id, award_filter=award_filters, category_filter=category_filters
                    )
            elif kind == "chart":
                if imdb_id:
                    chart = "top_shows" if is_show else "top_movies"
                    matched = imdb_id in lists.imdb_chart(chart)
            elif kind == "mdblist":
                imdb_ids, tmdb_ids = lists.mdblist_ids(source[1])
                if imdb_id and imdb_id in imdb_ids:
                    matched = True
                elif tmdb_ids and tmdb is not None and getattr(tmdb, "enabled", False):
                    if tmdb_id is None:
                        tmdb_id = tmdb.tmdb_id_for(item, is_movie=not is_show)
                    matched = tmdb_id is not None and tmdb_id in tmdb_ids
            if matched:
                return Winner(
                    family="ribbon",
                    name=name,
                    key=key,
                    weight=weight,
                    image_rel=f"ribbon/{style}/{key}.png",
                )
        return None
