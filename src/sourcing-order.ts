import type { SourcingResult } from './shared/types';

function mergeOfficialResult(primary: SourcingResult, fallback?: SourcingResult): SourcingResult {
  if (!fallback) return primary;
  return {
    ...primary,
    title: primary.title.startsWith('1688 商品 ') && !fallback.title.startsWith('1688 商品 ') ? fallback.title : primary.title,
    image_url: primary.image_url || fallback.image_url,
    price: primary.price || fallback.price,
    sales: primary.sales || fallback.sales,
    sales_value: primary.sales_value ?? fallback.sales_value,
    minimum_order: primary.minimum_order || fallback.minimum_order,
    repurchase_rate: primary.repurchase_rate || fallback.repurchase_rate,
    repurchase_rate_value: primary.repurchase_rate_value ?? fallback.repurchase_rate_value,
    shipping_time: primary.shipping_time || fallback.shipping_time,
    supplier_years: primary.supplier_years || fallback.supplier_years,
    listed_at: primary.listed_at || fallback.listed_at,
    supplier_name: primary.supplier_name || fallback.supplier_name,
    badges: primary.badges.length ? primary.badges : fallback.badges,
  };
}

/** Official 1688 DOM order is canonical; API-only items are appended in API order. */
export function mergeOfficialResultsInOrder(apiResults: SourcingResult[], officialResults: SourcingResult[]): SourcingResult[] {
  const apiById = new Map(apiResults.map((item) => [item.offer_id, item]));
  const officialIds = new Set(officialResults.map((item) => item.offer_id));
  return officialResults
    .map((item) => mergeOfficialResult(apiById.get(item.offer_id) ?? item, item))
    .concat(apiResults.filter((item) => !officialIds.has(item.offer_id)));
}
