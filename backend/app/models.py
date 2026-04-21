from sqlalchemy import Column, Integer, String, Float, DateTime, Text, UniqueConstraint
from datetime import datetime
from .database import Base


class RawListing(Base):
    __tablename__ = "raw_listings"
    __table_args__ = (
        UniqueConstraint("source_listing_id", "search_query", name="uq_listing_query"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, default="ebay")
    source_listing_id = Column(String, index=True)
    listing_title = Column(String, nullable=False)
    sold_price = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    sold_date = Column(DateTime, nullable=False)
    listing_url = Column(String)
    image_url = Column(String)
    search_query = Column(String, index=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    # New fields
    sale_type = Column(String, default="unknown")       # "auction" | "buy_it_now" | "unknown"
    card_condition = Column(String, default="unknown")  # "raw" | "graded" | "unknown"


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id = Column(Integer, primary_key=True, index=True)
    card_name = Column(String, nullable=False)
    search_query = Column(String)
    purchase_price = Column(Float, nullable=False)
    purchase_date = Column(DateTime, nullable=False)
    quantity = Column(Integer, default=1)
    grade = Column(String)   # "Raw" | "PSA 10" | "BGS 9.5" | etc.
    sport = Column(String)   # "NBA" | "MLB" | "NFL" | "Tennis" | "Other"
    notes = Column(Text)
    image_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
