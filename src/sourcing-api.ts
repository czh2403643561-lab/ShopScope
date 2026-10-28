import { md5 } from './shared/md5';
import { canonicalizeUrl, cleanText } from './shared/normalize';
import type { SourcingDiagnostics, SourcingPrice, SourcingResult } from './shared/types';

const MTOP_APP_KEY = '12574478';
const IMAGE_UPLOAD_API = 'mtop.1688.imageService.putImage';
const IMAGE_UPLOAD_URL = 'https://h5api.m.1688.com/h5/mtop.1688.imageservice.putimage/1.0/';
const IMAGE_SEARCH_URL = 'https://search.1688.com/service/imageSearchOfferResultViewService';

export interface OfficialImageSession {
  image_id: string;
  request_id?: string;
  session_id?: string;
}

export interface OfficialSearchPage {
  results: SourcingResult[];
  session: OfficialImageSession;
  has_more: boolean;
  diagnostics: SourcingDiagnostics;
}

function parseJsonResponse(text: string): any {
  const trimmed = text.trim();
  if (isAccessChallenge(trimmed)) {
    const issue = /login\.1688\.com|member\/signin|请登录|登录后继续/i.test(trimmed) ? 'login' : 'challenge';
    throw new Error(`NEEDS_AUTH:1688要求完成登录或安全验证，请处理后重新搜索。 [issue=${issue}]`);
  }
  try { return JSON.parse(trimmed); } catch { /* JSONP fallback below. */ }
  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start + 1, end));
  throw new Error('1688返回了无法识别的数据格式。');
}

function isAccessChallenge(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 250_000);
  const challengeMarker = /_____tmd_____|(?:\/|\b)punish(?:\/|\b)|["']action["']\s*:\s*["']captcha|x5secdata|验证码|安全验证/i;
  const authPageMarker = /login\.1688\.com|member\/signin|请登录|登录后继续/i;
  return challengeMarker.test(sample) || (/<(?:html|script)\b/i.test(sample) && authPageMarker.test(sample));
}

function responseError(data: any): string {
  const values = Array.isArray(data?.ret) ? data.ret : [data?.ret, data?.msg, data?.message];
  return values.filter(Boolean).map(String).join('；');
}

function isTokenError(data: any): boolean {
  return /TOKEN|SESSION_EXPIRED|NOT_LOGIN|登录/i.test(responseError(data));
}

function isAuthOrChallengeError(data: any): boolean {
  return isTokenError(data) || /FAIL_SYS_USER_VALIDATE|RGV587|CAPTCHA|安全|验证|PUNISH|X5SECDATA/i.test(responseError(data));
}

async function mtopToken(): Promise<string> {
  const byUrl = await chrome.cookies.getAll({ url: 'https://h5api.m.1688.com/', name: '_m_h5_tk' }).catch(() => []);
  const byDomain = await chrome.cookies.getAll({ domain: '1688.com', name: '_m_h5_tk' }).catch(() => []);
  const cookie = [...byUrl, ...byDomain].find((item) => item.value);
  return decodeURIComponent(cookie?.value ?? '').split('_')[0]?.trim() ?? '';
}

/** Only reports whether the browser already has an 1688 session. It never stores cookie values. */
export async function hasOfficial1688Session(): Promise<boolean> {
  return Boolean(await mtopToken());
}

async function rawUploadRequest(body: string, token: string): Promise<any> {
  const time = Date.now().toString();
  const url = new URL(IMAGE_UPLOAD_URL);
  const params: Record<string, string> = {
    jsv: '2.7.2', appKey: MTOP_APP_KEY, t: time,
    sign: token ? md5(`${token}&${time}&${MTOP_APP_KEY}&${body}`) : '',
    api: IMAGE_UPLOAD_API, ecode: '0', v: '1.0', type: 'originaljson', dataType: 'jsonp',
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: 'POST', credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(body)}`,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`1688图片上传请求失败（HTTP ${response.status}）。`);
  return parseJsonResponse(text);
}

function findImageSession(value: unknown, depth = 0): OfficialImageSession | undefined {
  if (!value || depth > 8) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findImageSession(item, depth + 1); if (found) return found; }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const imageId = cleanText(record.imageId ?? record.image_id ?? record.result);
  if (imageId && imageId.length >= 8) {
    return {
      image_id: imageId,
      ...(record.requestId ? { request_id: cleanText(record.requestId) } : {}),
      ...(record.sessionId ? { session_id: cleanText(record.sessionId) } : {}),
    };
  }
  for (const child of Object.values(record)) { const found = findImageSession(child, depth + 1); if (found) return found; }
  return undefined;
}

export async function uploadImageToOfficial1688(dataUrl: string): Promise<OfficialImageSession> {
  const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/i, '');
  if (!base64 || base64.length < 100) throw new Error('待搜索图片内容无效。');
  const body = JSON.stringify({ imageBase64: base64, appName: 'searchImageUpload', appKey: 'pvvljh1grxcmaay2vgpe9nb68gg9ueg2' });
  let token = await mtopToken();
  if (!token) {
    await rawUploadRequest(body, '').catch(() => undefined);
    token = await mtopToken();
  }
  if (!token) throw new Error('NEEDS_AUTH:请先在当前浏览器登录1688，再重新搜索。 [issue=login]');
  let response = await rawUploadRequest(body, token);
  if (isTokenError(response)) {
    token = await mtopToken();
    if (token) response = await rawUploadRequest(body, token);
  }
  const session = findImageSession(response);
  if (!session) {
    const reason = responseError(response);
    if (isAuthOrChallengeError(response)) {
      const issue = isTokenError(response) ? 'session' : 'challenge';
      throw new Error(`NEEDS_AUTH:${reason || '1688登录状态已失效或需要安全验证。'} [issue=${issue}]`);
    }
    throw new Error(reason || '1688没有返回图片识别编号。');
  }
  return session;
}

function pathValue(source: any, paths: string[]): unknown {
  for (const path of paths) {
    let value = source;
    for (const part of path.split('.')) value = value && typeof value === 'object' ? value[part] : undefined;
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function objectValue(source: unknown, keys: string[]): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const exact = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (exact && record[exact] !== undefined && record[exact] !== null && record[exact] !== '') return record[exact];
  }
  return undefined;
}

/**
 * Official image-search cards use several nested display wrappers. Read only
 * well-known display keys instead of converting unknown records to strings.
 */
function displayText(raw: unknown, keys: string[] = ['display', 'text', 'value', 'name', 'title', 'label'], depth = 0): string {
  if (depth > 4 || raw === null || raw === undefined) return '';
  const primitive = cleanText(raw);
  if (primitive) return primitive;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = displayText(item, keys, depth + 1);
      if (text) return text;
    }
    return '';
  }
  if (typeof raw !== 'object') return '';
  for (const key of keys) {
    const child = objectValue(raw, [key]);
    const text = displayText(child, keys, depth + 1);
    if (text) return text;
  }
  return '';
}

function textFromPaths(source: unknown, paths: string[], keys?: string[]): string {
  for (const path of paths) {
    const text = displayText(pathValue(source, [path]), keys);
    if (text) return text;
  }
  return '';
}

function imageUrlFrom(raw: unknown, depth = 0): string {
  if (depth > 4 || raw === null || raw === undefined) return '';
  const direct = cleanText(raw);
  if (direct && /^(?:https?:)?\/\//i.test(direct)) return direct;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const value = imageUrlFrom(item, depth + 1);
      if (value) return value;
    }
    return '';
  }
  if (typeof raw !== 'object') return '';
  for (const key of ['url', 'imageUrl', 'image_url', 'src', 'originUrl', 'original', 'originalUrl', 'bigImage', 'mainImage', 'productImage', 'picUrl']) {
    const value = imageUrlFrom(objectValue(raw, [key]), depth + 1);
    if (value) return value;
  }
  return '';
}

function numericValue(raw: unknown): number | undefined {
  const text = displayText(raw, ['display', 'value', 'count', 'num', 'amount', 'text']).replace(/,/g, '');
  const match = text.match(/(\d+(?:\.\d+)?)\s*([万千KkMm])?/);
  if (!match) return undefined;
  const multiplier = match[2] === '万' ? 10000 : match[2] === '千' || match[2]?.toLowerCase() === 'k' ? 1000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  const value = Number(match[1]) * multiplier;
  return Number.isFinite(value) ? value : undefined;
}

function formatPrice(raw: unknown): SourcingPrice | undefined {
  const text = displayText(raw, ['display', 'price', 'value', 'minPrice', 'min', 'text']);
  const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter(Number.isFinite);
  if (values.length === 0) return undefined;
  const min = Math.min(...values); const max = Math.max(...values);
  const money = (value: number) => `¥${value.toFixed(2).replace(/\.00$/, '')}`;
  return { display: min === max ? money(min) : `${money(min)}–${money(max)}`, min, max, kind: 'page-quote' };
}

function normalizedDisplay(raw: unknown, suffix = ''): string | undefined {
  const text = displayText(raw, ['display', 'value', 'text', 'count', 'num', 'amount', 'name', 'title']);
  return text ? `${text}${suffix && !text.includes(suffix) ? suffix : ''}` : undefined;
}

function percentDisplay(raw: unknown): { display?: string; value?: number } {
  const text = displayText(raw, ['display', 'value', 'rate', 'ratio', 'text']);
  const numeric = numericValue(raw);
  if (!text || numeric === undefined) return {};
  const value = numeric > 0 && numeric <= 1 && !text.includes('%') ? numeric * 100 : numeric;
  return { display: `${Number(value.toFixed(2))}%`, value };
}

function badgesFromOffer(offer: any): string[] {
  const raw = pathValue(offer, ['badges', 'tags', 'offerIdentities', 'sellerIdentities', 'serviceTags', 'tagList']);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => displayText(item, ['text', 'name', 'label', 'title', 'value'])).filter(Boolean).slice(0, 4);
}

function offerId(offer: any): string {
  const direct = cleanText(pathValue(offer, [
    'id', 'offerId', 'offer_id', 'productId', 'product_id', 'sku_id', 'skuId', 'itemId', 'information.id',
  ]));
  if (/^\d{8,}$/.test(direct)) return direct;
  const link = cleanText(pathValue(offer, [
    'href', 'real_url', 'realUrl', 'detailUrl', 'productUrl', 'url', 'information.productUrl',
  ]));
  return link.match(/(?:offer\/|offerId=|[?&](?:id|offer_id)=)(\d{8,})/i)?.[1] ?? '';
}

export function normalizeOfficial1688Offer(offer: any): SourcingResult | undefined {
  const id = offerId(offer);
  if (!id) return undefined;
  const imageRaw = pathValue(offer, ['picture', 'imageUrl', 'mainImage', 'picUrl', 'imgUrl', 'offerPicUrl', 'image.productImage', 'image.url', 'image', 'pictures', 'media']);
  const image = canonicalizeUrl(imageUrlFrom(imageRaw), 'https://www.1688.com/');
  const price = formatPrice(pathValue(offer, ['price', 'priceDisplay', 'tradePrice.price', 'priceInfo.price', 'showPrice', 'discountPrice', 'priceInfo', 'tradePrice']));
  const salesRaw = pathValue(offer, ['yearSales', 'yearSale', 'annualSales', 'monthSold', 'monthSales', 'saleQuantity', 'sold', 'soldCount', 'salesCount', 'tradeQuantity', 'bookedCount', 'sales']);
  const repurchaseRaw = pathValue(offer, ['repurchaseRate', 'repurchaseRatio', 'repeatPurchaseRate', 'repeatPurchaseRatio', 'returnRate']);
  const repurchase = percentDisplay(repurchaseRaw);
  const minimumRaw = pathValue(offer, ['minOrderQuantity', 'minOrder', 'tradePrice.minOrder', 'quantityBegin', 'beginAmount', 'moq']);
  const yearsRaw = pathValue(offer, ['shops.opened_year', 'shops.tpyear', 'shops.tpYear', 'supplier.supplierYear', 'supplier.tpYear', 'supplierYear', 'tpYear', 'companyYear', 'shopInfo.tpYear', 'companyInfo.tpYear']);
  const years = normalizedDisplay(yearsRaw);
  const title = textFromPaths(offer, ['title', 'subject', 'offerTitle', 'information.title', 'information', 'productInfo']);
  return {
    offer_id: id,
    title: title || `1688 商品 ${id}`,
    image_url: image || '',
    detail_url: `https://detail.1688.com/offer/${id}.html`,
    price,
    sales: normalizedDisplay(salesRaw),
    sales_value: numericValue(salesRaw),
    minimum_order: normalizedDisplay(minimumRaw, '件起批'),
    repurchase_rate: repurchase.display,
    repurchase_rate_value: repurchase.value,
    shipping_time: normalizedDisplay(pathValue(offer, ['shippingTimeGuarantee', 'shipSpeed', 'shipTime', 'deliveryTime', 'fahuoTime', 'shipWithinHours', 'deliveryPromise', 'shippingInfo'])),
    supplier_years: years ? (/年/.test(years) ? years : `入驻${years}年`) : undefined,
    listed_at: normalizedDisplay(pathValue(offer, ['createDate', 'publishTime', 'listedAt', 'onlineTime', 'addTime', 'offerCreateTime'])),
    supplier_name: normalizedDisplay(pathValue(offer, ['shops.shop_name', 'shops.company_name', 'supplier.supplierName', 'supplier.companyName', 'supplierName', 'companyName', 'shopName', 'sellerName', 'shopInfo.shopName', 'companyInfo.companyName', 'supplier', 'shops'])),
    badges: badgesFromOffer(offer),
  };
}

function findOfferPayload(value: unknown, depth = 0): { offers: any[]; pageCount?: number; requestId?: string; sessionId?: string } | undefined {
  if (!value || depth > 8) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, any>;
    const offers = record.offerList ?? record.offers;
    if (Array.isArray(offers)) return { offers, pageCount: Number(record.pageCount) || undefined, requestId: cleanText(record.requestId), sessionId: cleanText(record.sessionId) };
    for (const child of Object.values(record)) { const found = findOfferPayload(child, depth + 1); if (found) return found; }
  }
  if (Array.isArray(value)) for (const child of value) { const found = findOfferPayload(child, depth + 1); if (found) return found; }
  return undefined;
}

export async function searchOfficial1688(session: OfficialImageSession, page = 1, pageSize = 20): Promise<OfficialSearchPage> {
  const url = new URL(IMAGE_SEARCH_URL);
  const params: Record<string, string> = {
    tab: 'imageSearch', imageId: session.image_id, imageIdList: session.image_id,
    filt: 'y', beginPage: String(page), pageSize: String(pageSize), pageName: 'image',
  };
  if (session.request_id) params.requestId = session.request_id;
  if (session.session_id) params.sessionId = session.session_id;
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`1688图搜请求失败（HTTP ${response.status}）。`);
  const data = parseJsonResponse(text);
  const payload = findOfferPayload(data);
  if (!payload) {
    const reason = responseError(data);
    if (isAuthOrChallengeError(data)) {
      const issue = isTokenError(data) ? 'session' : 'challenge';
      throw new Error(`NEEDS_AUTH:${reason || '1688要求完成登录或安全验证。'} [issue=${issue}]`);
    }
    throw new Error(reason || '1688图搜结果结构暂时无法识别。');
  }
  const results = payload.offers.map(normalizeOfficial1688Offer).filter((item): item is SourcingResult => Boolean(item));
  const diagnostics: SourcingDiagnostics = {
    raw_offer_count: payload.offers.length,
    normalized_count: results.length,
    dropped_count: payload.offers.length - results.length,
    dropped_missing_identity: payload.offers.filter((offer) => !offerId(offer)).length,
    missing_image_count: results.filter((item) => !item.image_url).length,
    complete_card_count: results.filter((item) => Boolean(item.image_url && !item.title.startsWith('1688 商品 ') && item.price)).length,
  };
  return {
    results,
    session: { image_id: session.image_id, request_id: payload.requestId || session.request_id, session_id: payload.sessionId || session.session_id },
    has_more: payload.pageCount ? page < payload.pageCount : payload.offers.length >= pageSize,
    diagnostics,
  };
}
