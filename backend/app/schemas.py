from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ListingOut(BaseModel):
    id: int
    source: str
    source_listing_id: str
    listing_title: str
    sold_price: float
    currency: str
    sold_date: datetime
    listing_url: Optional[str] = None
    image_url: Optional[str] = None
    search_query: str
    sale_type: Optional[str] = "unknown"       # "auction" | "buy_it_now" | "unknown"
    card_condition: Optional[str] = "unknown"  # "raw" | "graded" | "unknown"

    model_config = {"from_attributes": True}


class SearchResult(BaseModel):
    query: str
    listings: list[ListingOut]
    total: int
    avg_price: float
    median_price: float
    min_price: float
    max_price: float
    from_cache: bool


class PricePoint(BaseModel):
    date: datetime
    price: float
    title: str
    listing_url: Optional[str] = None
    sale_type: Optional[str] = "unknown"
    card_condition: Optional[str] = "unknown"


class PriceHistory(BaseModel):
    query: str
    data_points: list[PricePoint]
    avg_price: float
    median_price: float
    min_price: float
    max_price: float
    count: int


class CollectionItemCreate(BaseModel):
    card_name: str
    search_query: Optional[str] = None
    purchase_price: float
    purchase_date: datetime
    quantity: int = 1
    grade: Optional[str] = None
    sport: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None


class CollectionItemUpdate(BaseModel):
    card_name: Optional[str] = None
    search_query: Optional[str] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[datetime] = None
    quantity: Optional[int] = None
    grade: Optional[str] = None
    sport: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None


class CollectionItemOut(BaseModel):
    id: int
    card_name: str
    search_query: Optional[str] = None
    purchase_price: float
    purchase_date: datetime
    quantity: int
    grade: Optional[str] = None
    sport: Optional[str] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime
    current_median_price: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None

    model_config = {"from_attributes": True}
