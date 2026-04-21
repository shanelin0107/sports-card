export interface Listing {
  id: number;
  source: string;
  source_listing_id: string;
  listing_title: string;
  sold_price: number;
  currency: string;
  sold_date: string;
  listing_url?: string;
  image_url?: string;
  search_query: string;
  sale_type?: string;       // "auction" | "buy_it_now" | "unknown"
  card_condition?: string;  // "raw" | "graded" | "unknown"
}

export interface SearchResult {
  query: string;
  listings: Listing[];
  total: number;
  avg_price: number;
  median_price: number;
  min_price: number;
  max_price: number;
  from_cache: boolean;
}

export interface PricePoint {
  date: string;
  price: number;
  title: string;
  listing_url?: string;
  sale_type?: string;
  card_condition?: string;
}

export interface PriceHistory {
  query: string;
  data_points: PricePoint[];
  avg_price: number;
  median_price: number;
  min_price: number;
  max_price: number;
  count: number;
}

export interface CollectionItem {
  id: number;
  card_name: string;
  search_query?: string;
  purchase_price: number;
  purchase_date: string;
  quantity: number;
  grade?: string;
  sport?: string;
  notes?: string;
  image_url?: string;
  created_at: string;
  current_median_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
}

export interface CollectionItemCreate {
  card_name: string;
  search_query?: string;
  purchase_price: number;
  purchase_date: string;
  quantity: number;
  grade?: string;
  sport?: string;
  notes?: string;
  image_url?: string;
}
