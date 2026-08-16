import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kometa_detect import (
    _AUDIO_RE,
    _EDITION_RE,
    _RESOLUTION_ALT_RE,
    _VIDEO_RE,
    RESOLUTION_VARIANTS,
    Winner,
)

# Resolution alt regexes on typical release names
samples = {
    "plus": ["Movie.2023.2160p.HDR10Plus.WEB-DL.mkv", "Movie.HDR10+.mkv"],
    "hlg": ["Show.S01E01.2160p.HLG.mkv"],
    "dvhdr": ["Movie.2160p.DV.HDR10.REMUX.mkv", "Movie.DV-HDR10.mkv"],
    "dvhdrplus": ["Movie.2160p.DV.HDR10Plus.mkv"],
}
for alt, files in samples.items():
    rx = _RESOLUTION_ALT_RE[alt]
    for f in files:
        assert rx.search(f), f"{alt} regex failed on {f}"

assert not _RESOLUTION_ALT_RE["plus"].search("Movie.2160p.HDR.WEB-DL.mkv")

# Weight ordering is strictly descending
weights = [w for _, _, _, w in RESOLUTION_VARIANTS]
assert weights == sorted(weights, reverse=True), "resolution ladder must be weight-desc"

# Audio codec ladder: TrueHD Atmos beats plain Atmos, matched on filepath
path = r"D:\Movies\Movie (2020)\Movie.2020.TrueHD.Atmos.7.1.mkv"
first = next((name for name, _, _, rx in _AUDIO_RE if rx.search(path)), None)
assert first == "Dolby-TrueHD-Atmos", first

path2 = "Movie.2020.DDP5.1.Atmos.mkv"
first2 = next((name for name, _, _, rx in _AUDIO_RE if rx.search(path2)), None)
assert first2 == "Dolby-Digital-Plus-Atmos", first2

path3 = "Movie.2020.DTS-HD.MA.5.1.mkv"
first3 = next((name for name, _, _, rx in _AUDIO_RE if rx.search(path3)), None)
assert first3 == "DTS-HD-MA", first3

# Video format ladder
vf = next((name for name, _, _, rx in _VIDEO_RE if rx.search("Movie.2160p.BluRay.REMUX.mkv")), None)
assert vf == "REMUX", vf
vf2 = next((name for name, _, _, rx in _VIDEO_RE if rx.search("Show.S01E01.1080p.WEB-DL.mkv")), None)
assert vf2 == "WEB", vf2

# Edition regexes (TRaSH naming)
assert any(rx.search(r"D:\Movies\Blade Runner (1982) {edition-Directors Cut}\movie.mkv") is not None
           or rx.search("edition-Directors Cut") for rx in _EDITION_RE["directors"])
assert any(rx.search("Movie.2020.IMAX.2160p.mkv") for rx in _EDITION_RE["imax"])

# Renderer: backdrop + text without network
from kometa_render import _backdrop, _text_on_backdrop, compose_poster, slot_placement
from PIL import Image

plate = _backdrop()
assert plate.size == (305, 105)
# Kometa back_radius 30 — corner pixels must be transparent (rounded), center opaque
assert plate.getpixel((0, 0))[3] == 0, "backdrop corner should be rounded/transparent"
assert plate.getpixel((152, 52))[3] > 0, "backdrop center should be filled"
txt = _text_on_backdrop("REMUX", paths=None)
assert txt.size == (305, 105)
assert txt.getpixel((0, 0))[3] == 0, "text backdrop corner should be rounded"

poster = Image.new("RGB", (1000, 1500), (20, 20, 30))
winners = {
    "video_format": Winner(family="video_format", name="REMUX", key="remux", text="REMUX"),
    "status": Winner(family="status", name="AIRING", key="airing", text="AIRING"),
}
out = compose_poster(poster, winners, config={}, paths=None)
assert out.size == (1000, 1500)

# EXIF marker round-trip
from kometa_render import save_with_marker, has_overlay_marker
import tempfile, os
tmp = Path(tempfile.gettempdir()) / "kometa_marker_test.png"
save_with_marker(out, tmp)
with Image.open(tmp) as reread:
    assert has_overlay_marker(reread), "EXIF overlay marker did not survive PNG round-trip"
os.remove(tmp)

# Slot placement override merging
p = slot_placement({"placement": {"media": {"x": 0.2}}}, "resolution")
assert abs(p["x"] - 0.2) < 1e-9

# Stage 4/5 tables + renderer paths
from kometa_detect import (
    ASPECT_VARIANTS,
    CONTENT_RATING_TABLES,
    LANGUAGE_FLAG_MAP,
    RATING_SOURCE_IMAGES,
    RIBBON_VARIANTS,
)
assert ASPECT_VARIANTS[0][0] == "1.33"
assert "usg" in CONTENT_RATING_TABLES["us_movie"].values()
assert LANGUAGE_FLAG_MAP["en"] == "us"
assert RATING_SOURCE_IMAGES["tmdb"][0] == "TMDb"
assert RIBBON_VARIANTS[0][1] == "oscars"

from kometa_engine import enabled_families
assert "resolution" in enabled_families({"mediaInfoEnabled": True})
assert "ribbon" in enabled_families({"ribbonOverlayEnabled": True})
assert "content_rating" in enabled_families({"contentRatingEnabled": True})
assert "custom_collection" in enabled_families({
    "customCollectionOverlaysEnabled": True,
    "customCollectionOverlays": [{
        "id": "t",
        "collectionRatingKey": "1",
        "image": "collection-fire",
        "library": "Movies",
    }],
})
assert "custom_collection" in enabled_families({
    "customCollectionOverlaysEnabled": True,
    "customCollectionOverlays": [{
        "id": "multi",
        "collectionRatingKeys": ["10", "11"],
        "image": "collection-fire",
        "library": "Movies",
    }],
})
assert "custom_collection" in enabled_families({
    "customCollectionOverlaysEnabled": True,
    "customCollectionOverlays": [{
        "id": "multi-lib",
        "collectionRatingKeys": ["10", "20"],
        "image": "collection-fire",
        "libraries": ["Movies", "TV Shows"],
    }],
})
assert "custom_collection" not in enabled_families({
    "customCollectionOverlaysEnabled": True,
    "customCollectionOverlays": [],
})
assert enabled_families({}) == []

# Content rating + episode info helpers (no Plex)
class _Fake:
    def __init__(self, **kw):
        self.__dict__.update(kw)

from kometa_detect import KometaDetector
det = KometaDetector(plex=None)
cr = det.detect_content_rating(_Fake(type="movie", contentRating="PG-13"), _Fake(type="movie"), scheme="us")
assert cr and cr.key == "uspg-13", cr
cs = det.detect_content_rating(_Fake(type="movie", contentRating="13"), _Fake(type="movie"), scheme="commonsense")
assert cs and cs.text == "13+", cs
ep = det.detect_episode_info(_Fake(type="episode", parentIndex=1, index=5), _Fake(type="show"))
assert ep and ep.text == "S01E05", ep

from kometa_detect import item_resolution_key, _query_rating_keys


class _Media:
    def __init__(self, width=0, videoResolution=""):
        self.width = width
        self.videoResolution = videoResolution
        self.parts = []


assert item_resolution_key(_Fake(type="movie", media=[_Media(width=3840, videoResolution="4k")])) == "4k"
assert item_resolution_key(_Fake(type="movie", media=[_Media(width=1920, videoResolution="1080")])) == "1080p"
assert item_resolution_key(_Fake(type="movie", media=[_Media(width=0, videoResolution="2160")])) == "4k"


class _El:
    def __init__(self, rk):
        self.attrib = {"ratingKey": str(rk)}


class _Container(list):
    def __init__(self, items, total):
        super().__init__(items)
        self.attrib = {"totalSize": str(total), "size": str(len(items))}


class _PlexPaginate:
    def __init__(self):
        self.calls = []

    def query(self, path, headers=None):
        self.calls.append((path, dict(headers or {})))
        start = int((headers or {}).get("X-Plex-Container-Start", 0))
        size = int((headers or {}).get("X-Plex-Container-Size", 50))
        total = 120
        batch = [_El(i) for i in range(start, min(start + size, total))]
        return _Container(batch, total)


plex_page = _PlexPaginate()
got = _query_rating_keys(plex_page, "/library/sections/1/all?type=1&resolution=4k", page_size=50)
assert len(got) == 120, len(got)
assert len(plex_page.calls) >= 3, plex_page.calls

# Compose with stage-4 winners
winners2 = {
    "aspect": Winner(family="aspect", name="2.35", key="2.35", text="2.35"),
    "content_rating": Winner(family="content_rating", name="PG-13", key="uspg-13", image_rel="cr/uspg-13.png"),
    "ribbon": Winner(family="ribbon", name="Oscars", key="oscars", image_rel="ribbon/yellow/oscars.png"),
}
out2 = compose_poster(poster, winners2, config={}, paths=None)
assert out2.size == (1000, 1500)

from kometa_engine import _entry_labels_to_clear, _labels_from_families

assert _labels_from_families({"resolution": {"name": "4K", "weight": 130}}) == ["4K"]
assert sorted(_entry_labels_to_clear({
    "families": {"resolution": {"name": "4K", "weight": 130}},
    "labeled": True,
})) == ["4K", "Overlay"]
assert _entry_labels_to_clear({"hasBackup": True}) == ["Overlay"]
assert sorted(_entry_labels_to_clear({
    "overlayLabels": ["4K-HDR"],
    "families": {"resolution": {"name": "4K", "weight": 130}},
})) == ["4K", "4K-HDR", "Overlay"]

print("kometa smoke OK")
