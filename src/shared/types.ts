export type ImageSearchState =
  | 'idle'
  | 'preparing-image'
  | 'uploading'
  | 'searching'
  | 'ready'
  | 'needs-auth'
  | 'failed'
  | 'cancelled';

export type ImageSearchAuthIssue = 'login' | 'session' | 'challenge';
export type ImageSearchEnrichmentState = 'running' | 'complete' | 'partial';

export interface SourcingPrice {
  display: string;
  min?: number;
  max?: number;
  kind: 'page-quote';
}

export interface SourcingResult {
  offer_id: string;
  title: string;
  image_url: string;
  detail_url: string;
  price?: SourcingPrice;
  sales?: string;
  sales_value?: number;
  minimum_order?: string;
  repurchase_rate?: string;
  repurchase_rate_value?: number;
  shipping_time?: string;
  supplier_years?: string;
  listed_at?: string;
  supplier_name?: string;
  badges: string[];
}

export interface SourcingDiagnostics {
  raw_offer_count: number;
  normalized_count: number;
  dropped_count: number;
  dropped_missing_identity: number;
  missing_image_count: number;
  complete_card_count: number;
  dom_fallback_used?: boolean;
  dom_offer_count?: number;
  dom_added_count?: number;
}

export interface ImageSearchJob {
  id: string;
  source_product_id: string;
  source_title: string;
  source_image_url: string;
  query_image_data_url: string;
  source_tab_id?: number;
  state: ImageSearchState;
  results: SourcingResult[];
  official_session?: { image_id: string; request_id?: string; session_id?: string };
  next_page: number;
  has_more: boolean;
  diagnostics?: SourcingDiagnostics;
  login_window_id?: number;
  login_tab_id?: number;
  auth_issue?: ImageSearchAuthIssue;
  fallback_tab_id?: number;
  error?: string;
  enrichment_state?: ImageSearchEnrichmentState;
  enrichment_error?: string;
  official_search_url: string;
  created_at: string;
  updated_at: string;
}
