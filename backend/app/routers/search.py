import statistics
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import RawListing
from ..schemas import ListingOut, PriceHistory, PricePoint, SearchResult
from ..services.ebay_scraper import scrape_completed_listings

router = APIRouter(prefix="/search", tags=["search"])

CACHE_TTL_MINUTES = 60


def _is_cache_fresh(db: Session, query: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=CACHE_TTL_MINUTES)
    return (
        db.query(RawListing)
        .filter(RawListing.search_query == query, RawListing.fetched_at > cutoff)
        .first()
        is not None
    )


async def _fetch_and_store(query: str, db: Session) -> int:
    listings = await scrape_completed_listings(query)
    new_count = 0
    for item in listings:
        exists = (
            db.query(RawListing)
            .filter(
                RawListing.source_listing_id == item["source_listing_id"],
                RawListing.search_query == query,
            )
            .first()
        )
        if not exists:
            db.add(RawListing(**item, search_query=query))
            new_count += 1

    # Always refresh fetched_at for existing records so the cache is marked fresh
    # even when the scrape returns only duplicates (common for stable queries).
    now = datetime.utcnow()
    db.query(RawListing).filter(RawListing.search_query == query).update(
        {"fetched_at": now}, synchronize_session=False
    )
    db.commit()
    return new_count


def _apply_condition_filter(query_obj, condition: Optional[str]):
    """Filter by card_condition if specified (raw/graded)."""
    if condition in ("raw", "graded"):
        query_obj = query_obj.filter(RawListing.card_condition == condition)
    return query_obj


@router.get("/suggestions", response_model=List[str])
async def get_suggestions(q: str = Query(..., min_length=2)):
    """Proxy eBay's autocomplete API. Returns up to 10 suggestions.
    eBay returns JSONP like: /**/vjo...._do({...}) — we extract the JSON manually.
    """
    import json, re as _re
    try:
        url = "https://autosug.ebay.com/autosug"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params={"kwd": q, "sId": "0"})
            text = resp.text
            # Strip JSONP wrapper: extract the {...} payload
            match = _re.search(r"\((\{.*\})\)", text, _re.DOTALL)
            if not match:
                return []
            data = json.loads(match.group(1))
            return data.get("res", {}).get("sug", [])[:10]
    except Exception:
        return []


@router.get("/", response_model=SearchResult)
async def search_cards(
    q: str = Query(..., min_length=2),
    refresh: bool = Query(False),
    condition: Optional[str] = Query(None, description="Filter by card condition: raw | graded"),
    db: Session = Depends(get_db),
):
    """Search for a card. Fetches eBay sold data on first search or when refreshed."""
    # condition filter = only query existing DB data, never trigger a new eBay fetch
    if not condition and (not _is_cache_fresh(db, q) or refresh):
        await _fetch_and_store(q, db)

    base_q = (
        db.query(RawListing)
        .filter(RawListing.search_query == q)
        .order_by(RawListing.sold_date.desc())
    )
    listings = _apply_condition_filter(base_q, condition).all()

    if not listings:
        return SearchResult(
            query=q, listings=[], total=0,
            avg_price=0, median_price=0, min_price=0, max_price=0,
            from_cache=False,
        )

    prices = [l.sold_price for l in listings]
    return SearchResult(
        query=q,
        listings=[ListingOut.model_validate(l) for l in listings],
        total=len(listings),
        avg_price=round(sum(prices) / len(prices), 2),
        median_price=round(statistics.median(prices), 2),
        min_price=round(min(prices), 2),
        max_price=round(max(prices), 2),
        from_cache=_is_cache_fresh(db, q),
    )


@router.get("/history", response_model=PriceHistory)
async def get_price_history(
    q: str = Query(..., min_length=2),
    condition: Optional[str] = Query(None, description="Filter by card condition: raw | graded"),
    db: Session = Depends(get_db),
):
    """Get full price history for a search query (used to draw charts)."""
    if not condition and not _is_cache_fresh(db, q):
        await _fetch_and_store(q, db)

    base_q = (
        db.query(RawListing)
        .filter(RawListing.search_query == q)
        .order_by(RawListing.sold_date.asc())
    )
    listings = _apply_condition_filter(base_q, condition).all()

    if not listings:
        return PriceHistory(
            query=q, data_points=[], avg_price=0,
            median_price=0, min_price=0, max_price=0, count=0,
        )

    data_points = [
        PricePoint(
            date=l.sold_date,
            price=l.sold_price,
            title=l.listing_title,
            listing_url=l.listing_url,
            sale_type=l.sale_type,
            card_condition=l.card_condition,
        )
        for l in listings
    ]
    prices = [l.sold_price for l in listings]

    return PriceHistory(
        query=q,
        data_points=data_points,
        avg_price=round(statistics.mean(prices), 2),
        median_price=round(statistics.median(prices), 2),
        min_price=round(min(prices), 2),
        max_price=round(max(prices), 2),
        count=len(prices),
    )
