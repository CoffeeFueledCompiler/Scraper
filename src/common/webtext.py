"""Lightweight text-only fetch of a webpage, for feeding AI prompts."""

import urllib.request
from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chunks = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            text = data.strip()
            if text:
                self.chunks.append(text)


def fetch_website_text(url, timeout=10, max_chars=4000):
    """Best-effort plain-text snapshot of a page's visible content. Returns "" on any failure."""
    if not url:
        return ""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode(resp.headers.get_content_charset() or "utf-8", errors="ignore")
    except Exception:
        return ""

    parser = _TextExtractor()
    parser.feed(html)
    text = " ".join(parser.chunks)
    return text[:max_chars]
