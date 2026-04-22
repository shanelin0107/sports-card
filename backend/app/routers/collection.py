import asyncio
import re
import statistics
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CollectionItem, RawListing
from ..schemas import CollectionItemCreate, CollectionItemOut, CollectionItemUpdate

router = APIRouter(prefix="/collection", tags=["collection"])

# Minimum number of image-hash comps required before we trust the image-based median
_IMAGE_COMP_MIN = 3


def _grade_to_condition(grade: Optional[str]) -> Optional[str]:
    """Map collection item grade to card_condition filter value."""
    if not grade:
        return None
    g = grade.strip().lower()
    if g == "raw":
        return "raw"
    # Any grading company label → graded
    if any(k in g for k in ("psa", "bgs", "sgc", "csg", "cgc", "hga", "gma", "bvg")):
        return "graded"
    return None  # unknown grade string — no filter


def _ebay_image_hash(image_url: Optional[str]) -> Optional[str]:
    """Extract the eBay image hash from a URL like …/images/g/HASH/s-l500.webp"""
    if not image_url:
        return None
    m = re.search(r"/images/g/([^/]+)/", image_url)
    return m.group(1) if m else None


def _compute_current_price(
    search_query: Optional[str],
    grade: Optional[str],
    db: Session,
    image_url: Optional[str] = None,
) -> Optional[float]:
    """Return median price from the best available comp set.

    Priority:
    1. Image-hash comps — if the stored image URL yields >= _IMAGE_COMP_MIN
       raw_listings matches, use those (most specific: same card photo).
    2. search_query + condition comps — the 20 most recent matching listings
       (original broad fallback).
    """
    # ── 1. Image-hash path ────────────────────────────────────────────────────
    img_hash = _ebay_image_hash(image_url)
    if img_hash:
        pattern = f"%/images/g/{img_hash}/%"
        image_comps = (
            db.query(RawListing)
            .filter(RawListing.image_url.like(pattern))
            .order_by(RawListing.sold_date.desc())
            .limit(40)
            .all()
        )
        if len(image_comps) >= _IMAGE_COMP_MIN:
            prices = [r.sold_price for r in image_comps]
            return round(statistics.median(prices), 2)

    # ── 2. search_query + condition fallback ──────────────────────────────────
    if not search_query:
        return None
    q = db.query(RawListing).filter(RawListing.search_query == search_query)
    condition = _grade_to_condition(grade)
    if condition:
        q = q.filter(RawListing.card_condition == condition)
    recent = q.order_by(RawListing.sold_date.desc()).limit(20).all()
    if not recent:
        return None
    prices = [r.sold_price for r in recent]
    return round(statistics.median(prices), 2)


def _compute_last_sale_price(
    search_query: Optional[str],
    grade: Optional[str],
    db: Session,
    image_url: Optional[str] = None,
) -> Optional[float]:
    img_hash = _ebay_image_hash(image_url)
    if img_hash:
        pattern = f"%/images/g/{img_hash}/%"
        count = db.query(RawListing).filter(RawListing.image_url.like(pattern)).count()
        if count >= _IMAGE_COMP_MIN:
            row = (
                db.query(RawListing)
                .filter(RawListing.image_url.like(pattern))
                .order_by(RawListing.sold_date.desc())
                .first()
            )
            return row.sold_price if row else None
    if not search_query:
        return None
    q = db.query(RawListing).filter(RawListing.search_query == search_query)
    condition = _grade_to_condition(grade)
    if condition:
        q = q.filter(RawListing.card_condition == condition)
    row = q.order_by(RawListing.sold_date.desc()).first()
    return row.sold_price if row else None


def _enrich(item: CollectionItem, db: Session) -> CollectionItemOut:
    out = CollectionItemOut.model_validate(item)
    current = _compute_current_price(item.search_query, item.grade, db, item.image_url)
    out.current_median_price = current
    if current is not None and item.purchase_price:
        pnl = (current - item.purchase_price) * item.quantity
        pnl_pct = (current / item.purchase_price - 1) * 100
        out.unrealized_pnl = round(pnl, 2)
        out.unrealized_pnl_pct = round(pnl_pct, 2)
    out.last_sale_price = _compute_last_sale_price(item.search_query, item.grade, db, item.image_url)
    # Auto-backfill image_url from raw_listings when collection item has none
    if not out.image_url and item.search_query:
        listing = (
            db.query(RawListing)
            .filter(
                RawListing.search_query == item.search_query,
                RawListing.image_url.isnot(None),
                RawListing.image_url != "",
            )
            .order_by(RawListing.sold_date.desc())
            .first()
        )
        if listing:
            out.image_url = listing.image_url
    return out


@router.get("/", response_model=list[CollectionItemOut])
def list_collection(db: Session = Depends(get_db)):
    items = db.query(CollectionItem).order_by(CollectionItem.created_at.desc()).all()
    return [_enrich(item, db) for item in items]


@router.post("/", response_model=CollectionItemOut, status_code=201)
def add_collection_item(payload: CollectionItemCreate, db: Session = Depends(get_db)):
    item = CollectionItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich(item, db)


@router.get("/{item_id}", response_model=CollectionItemOut)
def get_collection_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(CollectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _enrich(item, db)


@router.put("/{item_id}", response_model=CollectionItemOut)
def update_collection_item(
    item_id: int, payload: CollectionItemUpdate, db: Session = Depends(get_db)
):
    item = db.query(CollectionItem).filter(CollectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, val)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _enrich(item, db)


@router.delete("/{item_id}", status_code=204)
def delete_collection_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CollectionItem).filter(CollectionItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()


_REFRESH_TTL_MINUTES = 60
_SCRAPE_CONCURRENCY = 5  # max parallel eBay requests


def _is_refresh_fresh(db: Session, query: str) -> bool:
    cutoff = datetime.utcnow() - timedelta(minutes=_REFRESH_TTL_MINUTES)
    return (
        db.query(RawListing)
        .filter(RawListing.search_query == query, RawListing.fetched_at > cutoff)
        .first()
        is not None
    )


@router.post("/refresh-prices")
async def refresh_collection_prices(
    force: bool = False,
    db: Session = Depends(get_db),
):
    """Re-scrape eBay for every unique search_query linked to collection items.

    Queries scraped within the last hour are skipped unless force=True.
    All eligible queries are scraped concurrently (up to _SCRAPE_CONCURRENCY
    at once) so the total time is roughly one scrape duration, not N × one.
    """
    from ..services.ebay_scraper import scrape_completed_listings

    queries = [
        q for (q,) in (
            db.query(CollectionItem.search_query)
            .filter(CollectionItem.search_query.isnot(None), CollectionItem.search_query != "")
            .distinct()
            .all()
        )
    ]

    # Split into stale vs. fresh so we never hit the scraper for cached queries
    stale = [q for q in queries if force or not _is_refresh_fresh(db, q)]
    skipped = len(queries) - len(stale)

    if not stale:
        return {"refreshed": 0, "skipped": skipped, "total": len(queries)}

    # ── Concurrent scrape phase ───────────────────────────────────────────────
    sem = asyncio.Semaphore(_SCRAPE_CONCURRENCY)

    async def _scrape_one(query: str):
        async with sem:
            return query, await scrape_completed_listings(query)

    results = await asyncio.gather(
        *[_scrape_one(q) for q in stale],
        return_exceptions=True,
    )

    # ── Sequential DB-write phase ─────────────────────────────────────────────
    refreshed = 0
    for result in results:
        if isinstance(result, Exception):
            continue
        query, listings = result
        try:
            existing_ids = {
                row[0]
                for row in db.query(RawListing.source_listing_id)
                .filter(RawListing.search_query == query)
                .all()
            }
            for item in listings:
                if item["source_listing_id"] not in existing_ids:
                    db.add(RawListing(**item, search_query=query))
            db.query(RawListing).filter(RawListing.search_query == query).update(
                {"fetched_at": datetime.utcnow()}, synchronize_session=False
            )
            db.commit()
            refreshed += 1
        except Exception:
            db.rollback()

    return {"refreshed": refreshed, "skipped": skipped, "total": len(queries)}
