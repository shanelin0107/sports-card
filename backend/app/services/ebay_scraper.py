"""
eBay completed/sold listings scraper using Playwright (headless Chrome).
Only returns items that show a "Sold" date — active listings are discarded.
Restricted to Sports Trading Cards & Accessories (sacat=261328).
"""

import asyncio
import logging
import os
import re
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import quote_plus

from dateutil import parser as dateparser

logger = logging.getLogger(__name__)

SCRAPERAPI_KEY = os.environ.get("SCRAPERAPI_KEY")
EBAY_APP_ID = os.environ.get("EBAY_APP_ID")

# eBay category: Sports Trading Cards & Accessories
SPORTS_CARDS_CATEGORY = "261328"

# Matches grading company + numeric grade: "PSA 10", "BGS 9.5", "SGC-8"
_GRADING_WITH_GRADE = re.compile(
    r"\b(psa|bgs|bgr|sgc|csg|cgc|hga|gma|bvg|ace)\b[\s\-]?\d",
    re.IGNORECASE,
)
# Matches grading company alone (PSA Authentic, BGS Graded, etc.)
_GRADING_ALONE = re.compile(
    r"\b(psa|bgs|bgr|sgc|csg|cgc|hga|gma|bvg|ace)\b",
    re.IGNORECASE,
)
# Gem Mint, Gem MT — top grade language
_GEM_MINT = re.compile(r"\bgem\s*(mint|mt)\b", re.IGNORECASE)
# Explicit "graded" keyword
_GRADED_KW = re.compile(r"\bgraded\b", re.IGNORECASE)
# "Auth" or "Authentic"
_AUTHENTIC = re.compile(r"\bauth(entic)?\b", re.IGNORECASE)

# Words that don't help identify whether a title matches a query
_STOPWORDS = {
    "the", "and", "for", "with", "from", "lot", "set",
    "trading", "variation", "parallel", "insert",
    "mint", "near", "very", "fine", "good", "poor", "fair",
}

# Generic card/brand words — important context but NOT player-specific
_GENERIC_WORDS = {
    "card", "cards", "baseball", "basketball", "football", "soccer", "hockey",
    "auto", "autograph", "rookie", "refractor", "prizm", "chrome", "update",
    "topps", "panini", "upper", "deck", "fleer", "donruss", "bowman", "stadium",
    "rc", "sp", "ssp", "psa", "bgs", "sgc", "cgc",
    "black", "gold", "silver", "red", "blue", "green", "orange", "purple",
    "wave", "atomic", "xfractor", "superfractor",
}

# ── Keyword relevance ─────────────────────────────────────────────────────────

def _keywords_match(title: str, query: str) -> bool:
    """
    Require ALL 'specific' words from the query to appear in the title.
    Specific words = not a stopword, not a generic card/brand word, not a 4-digit year.
    These are typically player names and card serial IDs (e.g. "ohtani", "hmt32").

    Generic words (brand, year, card type) are NOT required — they improve
    eBay's own search ranking but we don't want to reject a card just because
    it says "Bowman" instead of "Topps" in a title variant.

    If the query has NO specific words, fall back to requiring all non-stopword
    words to be present (prevents the empty-filter edge case).
    """
    raw_words = re.split(r"[\s\+\-]+", query.strip())
    specific: list[str] = []
    generic: list[str] = []

    for w in raw_words:
        wl = w.lower().lstrip("#")
        if not wl or wl in _STOPWORDS:
            continue
        if len(wl) <= 2:
            continue
        if re.fullmatch(r"\d{4}", wl):   # 4-digit year → generic
            generic.append(wl)
            continue
        if wl in _GENERIC_WORDS:
            generic.append(wl)
        else:
            specific.append(wl)

    title_lower = title.lower()

    if specific:
        # Every specific word (player name, card ID) must appear
        return all(w in title_lower for w in specific)
    elif generic:
        # Query is all generic — require all generic words (loose fallback)
        return all(w in title_lower for w in generic)
    return True


# ── Condition detection ───────────────────────────────────────────────────────

def _detect_card_condition(title: str) -> str:
    """
    Detect graded vs raw.  Graded if:
    - Grading company + numeric grade  (PSA 10, BGS 9.5)
    - Grading company alone            (PSA Authentic)
    - Gem Mint / Gem MT
    - The word "graded"
    - "Auth" / "Authentic"
    """
    if (_GRADING_WITH_GRADE.search(title)
            or _GRADING_ALONE.search(title)
            or _GEM_MINT.search(title)
            or _GRADED_KW.search(title)
            or _AUTHENTIC.search(title)):
        return "graded"
    return "raw"


# ── Price parsing ─────────────────────────────────────────────────────────────

def _parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    # Take first price in a range  "US $10.00 to $20.00"
    for sep in (" to ", " - "):
        if sep in text.lower():
            text = text.lower().split(sep)[0]
            break
    cleaned = re.sub(r"[^\d.]", "", text)
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = parts[0] + "." + parts[1][:2]  # keep at most 2 decimal digits
    try:
        val = float(cleaned)
        return val if 0.01 <= val <= 999_999 else None
    except (ValueError, TypeError):
        return None


# ── Sold date parsing ─────────────────────────────────────────────────────────

_NOW_CACHE: Optional[datetime] = None

def _parse_sold_date(text: str) -> Optional[datetime]:
    """
    Only parse text that begins with 'Sold'.
    Rejects:
    - 'Ends ...' (active auctions)
    - Dates in the future (active BIN listings)
    """
    if not text:
        return None
    stripped = text.strip()
    if not stripped.lower().startswith("sold"):
        return None
    cleaned = re.sub(r"^sold[\s:]*", "", stripped, flags=re.IGNORECASE).strip()
    if not cleaned:
        return None
    try:
        dt = dateparser.parse(cleaned)
        if dt is None:
            return None
        now = datetime.utcnow()
        # Must be in the past (allow up to 6 hours ahead for timezone slop)
        if dt > now.replace(hour=now.hour + 6 if now.hour <= 17 else 23, minute=59):
            logger.debug(f"Rejected future date: {dt} from '{text}'")
            return None
        # Must not be implausibly old (> 5 years)
        if (now - dt).days > 365 * 5:
            logger.debug(f"Rejected ancient date: {dt} from '{text}'")
            return None
        return dt
    except Exception:
        return None


# ── HTML parser ───────────────────────────────────────────────────────────────

def _parse_items_from_html(html: str) -> List[Dict]:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    results = []

    for item in soup.select("ul.srp-results li.s-card"):
        listing_id = item.get("data-listingid", "").strip()
        if not listing_id:
            continue

        # ── Title ──────────────────────────────────────────────────────────
        # Prefer image alt (concise, clean), fall back to link text
        title = ""
        img = item.select_one("img.s-card__image")
        if img:
            title = img.get("alt", "").strip()
        if not title or title.lower() == "shop on ebay":
            link_el = item.select_one("a.s-card__link, a[href*='itm/']")
            if link_el:
                # link text often has embedded metadata — clean it up
                title = link_el.get_text(" ", strip=True)
        if not title or len(title) < 5:
            continue

        # ── Price ──────────────────────────────────────────────────────────
        price_el = item.select_one("span.s-card__price")
        sold_price = _parse_price(price_el.get_text(strip=True) if price_el else "")
        if not sold_price:
            continue

        # ── Sold date — MUST start with "Sold" ────────────────────────────
        sold_date: Optional[datetime] = None
        # Try .su-styled-text first (most common location)
        for date_el in item.select(".su-styled-text, .s-card__date, [class*='date']"):
            txt = date_el.get_text(strip=True)
            dt = _parse_sold_date(txt)
            if dt:
                sold_date = dt
                break
        # Fallback: scan all text nodes for anything starting with "Sold"
        if not sold_date:
            for el in item.find_all(string=re.compile(r"^\s*sold", re.IGNORECASE)):
                dt = _parse_sold_date(el.strip())
                if dt:
                    sold_date = dt
                    break

        if not sold_date:
            # No confirmed sold date → active listing or unrecognised format
            continue

        # ── Link ───────────────────────────────────────────────────────────
        link_el = item.select_one("a.s-card__link, a[href*='/itm/']")
        listing_url = None
        if link_el:
            href = link_el.get("href", "")
            listing_url = href.split("?")[0] if href else None

        # ── Sale type ──────────────────────────────────────────────────────
        attr_el = item.select_one(
            ".su-card-container__attributes__primary, [class*='attribute']"
        )
        attr_text = attr_el.get_text(strip=True).lower() if attr_el else ""
        if "bid" in attr_text or "auction" in attr_text:
            sale_type = "auction"
        else:
            sale_type = "buy_it_now"

        # ── Image ──────────────────────────────────────────────────────────
        image_url = None
        if img:
            image_url = img.get("src") or img.get("data-src")

        results.append({
            "source": "ebay",
            "source_listing_id": listing_id,
            "listing_title": title,
            "sold_price": sold_price,
            "currency": "USD",
            "sold_date": sold_date,
            "listing_url": listing_url,
            "image_url": image_url,
            "sale_type": sale_type,
            "card_condition": _detect_card_condition(title),
        })

    return results


# ── Main scraper ──────────────────────────────────────────────────────────────

def _build_ebay_url(query: str, page_num: int) -> str:
    encoded_query = quote_plus(query)
    params = (
        f"_nkw={encoded_query}"
        f"&LH_Sold=1&LH_Complete=1"
        f"&_sacat={SPORTS_CARDS_CATEGORY}"
        f"&_sop=13&_ipg=60"
        f"&_pgn={page_num}"
    )
    return f"https://www.ebay.com/sch/i.html?{params}"


async def _scrape_via_scraperapi(query: str, max_pages: int) -> List[Dict]:
    """Fetch eBay pages via ScraperAPI (uses residential IPs, bypasses bot detection)."""
    import httpx

    results: List[Dict] = []
    seen_ids: set = set()

    async with httpx.AsyncClient(timeout=60.0) as client:
        for page_num in range(1, max_pages + 1):
            url = _build_ebay_url(query, page_num)
            logger.info(f"ScraperAPI: fetching page {page_num}: {url}")
            try:
                resp = await client.get(
                    "https://api.scraperapi.com/",
                    params={"api_key": SCRAPERAPI_KEY, "url": url, "country_code": "us"},
                )
                resp.raise_for_status()
                html = resp.text
            except Exception as e:
                logger.warning(f"ScraperAPI page {page_num} error: {e}")
                break

            raw_items = _parse_items_from_html(html)
            logger.info(f"Page {page_num}: parsed {len(raw_items)} sold items")

            page_items = [i for i in raw_items if _keywords_match(i["listing_title"], query)]
            filtered_out = len(raw_items) - len(page_items)
            if filtered_out:
                logger.info(f"  Keyword filter removed {filtered_out} irrelevant items")

            new_items = 0
            for item in page_items:
                lid = item["source_listing_id"]
                if lid not in seen_ids:
                    seen_ids.add(lid)
                    results.append(item)
                    new_items += 1

            logger.info(f"Page {page_num}: {new_items} new items (total: {len(results)})")
            if new_items == 0:
                break

    logger.info(f"ScraperAPI scrape complete: {len(results)} sold listings for '{query}'")
    return results


async def _scrape_via_playwright(query: str, max_pages: int) -> List[Dict]:
    """Fetch eBay pages using headless Chromium (local dev only)."""
    from playwright.async_api import async_playwright

    results: List[Dict] = []
    seen_ids: set = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        await ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = await ctx.new_page()

        try:
            await page.goto("https://www.ebay.com/", wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(1.5)
        except Exception as e:
            logger.warning(f"Homepage warm-up failed: {e}")

        for page_num in range(1, max_pages + 1):
            if page_num > 1:
                await asyncio.sleep(2.0)

            url = _build_ebay_url(query, page_num)
            logger.info(f"Playwright: scraping page {page_num}: {url}")

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_selector("ul.srp-results li", timeout=12000)
            except Exception as e:
                logger.warning(f"Page {page_num} load error: {e}")
                break

            html = await page.content()
            raw_items = _parse_items_from_html(html)
            logger.info(f"Page {page_num}: parsed {len(raw_items)} sold items from HTML")

            page_items = [i for i in raw_items if _keywords_match(i["listing_title"], query)]
            filtered_out = len(raw_items) - len(page_items)
            if filtered_out:
                logger.info(f"  Keyword filter removed {filtered_out} irrelevant items")

            new_items = 0
            for item in page_items:
                lid = item["source_listing_id"]
                if lid not in seen_ids:
                    seen_ids.add(lid)
                    results.append(item)
                    new_items += 1

            logger.info(f"Page {page_num}: {new_items} new items (total: {len(results)})")
            if new_items == 0:
                break

        await browser.close()

    logger.info(f"Playwright scrape complete: {len(results)} sold listings for '{query}'")
    return results


async def _scrape_via_ebay_api(query: str, max_pages: int) -> List[Dict]:
    """Fetch eBay completed/sold listings via the official Finding API (free)."""
    import httpx

    results: List[Dict] = []
    seen_ids: set = set()

    base_url = "https://svcs.ebay.com/services/search/FindingService/v1"

    async with httpx.AsyncClient(timeout=30.0) as client:
        for page_num in range(1, max_pages + 1):
            # Build query string manually — httpx would URL-encode parentheses in
            # param names like itemFilter(0).name, which breaks eBay's Finding API.
            qs = "&".join([
                "OPERATION-NAME=findCompletedItems",
                "SERVICE-VERSION=1.0.0",
                f"SECURITY-APPNAME={EBAY_APP_ID}",
                "RESPONSE-DATA-FORMAT=JSON",
                f"keywords={quote_plus(query)}",
                f"categoryId={SPORTS_CARDS_CATEGORY}",
                "itemFilter(0).name=SoldItemsOnly",
                "itemFilter(0).value=true",
                "paginationInput.entriesPerPage=100",
                f"paginationInput.pageNumber={page_num}",
                "sortOrder=EndTimeSoonest",
            ])
            url = f"{base_url}?{qs}"

            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning(f"eBay API page {page_num} HTTP {resp.status_code}: {resp.text[:600]}")
                    break
                data = resp.json()
            except Exception as e:
                logger.warning(f"eBay API page {page_num} error: {e}")
                break

            try:
                response_wrapper = data["findCompletedItemsResponse"][0]
                ack = response_wrapper.get("ack", [""])[0]
                if ack not in ("Success", "Warning"):
                    logger.warning(f"eBay API ack={ack}, stopping")
                    break
                items = response_wrapper.get("searchResult", [{}])[0].get("item", [])
                total_pages = int(
                    response_wrapper.get("paginationOutput", [{}])[0].get("totalPages", ["1"])[0]
                )
            except (KeyError, IndexError, ValueError) as e:
                logger.warning(f"eBay API response parse error: {e}")
                break

            if not items:
                break

            new_items = 0
            for item in items:
                try:
                    listing_id = item["itemId"][0]
                    if listing_id in seen_ids:
                        continue

                    title = item["title"][0]
                    if not _keywords_match(title, query):
                        continue

                    price_val = float(item["sellingStatus"][0]["currentPrice"][0]["__value__"])
                    if not (0.01 <= price_val <= 999_999):
                        continue

                    end_time_str = item["listingInfo"][0]["endTime"][0]
                    sold_date = datetime.fromisoformat(
                        end_time_str.replace("Z", "+00:00")
                    ).replace(tzinfo=None)

                    listing_url = item.get("viewItemURL", [None])[0]
                    if listing_url:
                        listing_url = listing_url.split("?")[0]

                    image_url = item.get("galleryURL", [None])[0]

                    listing_type = item["listingInfo"][0].get("listingType", ["Unknown"])[0]
                    sale_type = "auction" if listing_type == "Auction" else "buy_it_now"

                    seen_ids.add(listing_id)
                    results.append({
                        "source": "ebay",
                        "source_listing_id": listing_id,
                        "listing_title": title,
                        "sold_price": price_val,
                        "currency": "USD",
                        "sold_date": sold_date,
                        "listing_url": listing_url,
                        "image_url": image_url,
                        "sale_type": sale_type,
                        "card_condition": _detect_card_condition(title),
                    })
                    new_items += 1

                except (KeyError, IndexError, ValueError) as e:
                    logger.debug(f"Skipping item due to parse error: {e}")
                    continue

            logger.info(f"eBay API page {page_num}: {new_items} new items (total: {len(results)})")

            if page_num >= total_pages:
                break

    logger.info(f"eBay API scrape complete: {len(results)} sold listings for '{query}'")
    return results


async def scrape_completed_listings(query: str, max_pages: int = 5) -> List[Dict]:
    """
    Fetch eBay completed/sold listings.
    Priority: eBay Finding API → ScraperAPI → Playwright (local dev fallback).
    """
    if EBAY_APP_ID:
        logger.info("Using eBay Finding API for scraping")
        return await _scrape_via_ebay_api(query, max_pages)
    elif SCRAPERAPI_KEY:
        logger.info("Using ScraperAPI for scraping")
        return await _scrape_via_scraperapi(query, max_pages)
    else:
        logger.info("Using Playwright for scraping (no API keys set)")
        return await _scrape_via_playwright(query, max_pages)
