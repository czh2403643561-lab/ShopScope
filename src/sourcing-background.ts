import { hasOfficial1688Session, normalizeOfficial1688Offer, searchOfficial1688, uploadImageToOfficial1688 } from './sourcing-api';
import type { ImageSearchAuthIssue, ImageSearchJob, SourcingResult } from './shared/types';
import { readOfficialImageSearchCards } from './sourcing-dom';
import { mergeOfficialResultsInOrder } from './sourcing-order';

const OFFICIAL_SEARCH_URL = 'https://air.1688.com/kapp/1688-search/pc-image-search/?tab=imageSearch';
const SESSION_KEY = 'shopscope-active-1688-image-search-v1';
const SOURCING_MESSAGES = new Set([
  'START_1688_IMAGE_SEARCH', 'CANCEL_1688_IMAGE_SEARCH', 'GET_1688_IMAGE_SEARCH_JOB',
  'OPEN_1688_LOGIN', 'OPEN_1688_OFFICIAL_SEARCH',
  'OPEN_1688_OFFER', 'PREPARE_SOURCE_IMAGE', 'RECHECK_1688_LOGIN', 'REOPEN_1688_LOGIN',
]);

interface SourcingProductInput { product_id?: string; title?: string; image_url?: string; }

let currentJob: ImageSearchJob | undefined;
let generation = 0;
let authResumeInFlight = false;
const recoveryPromise = restoreSourcingSession();

chrome.cookies.onChanged.addListener((change) => {
  if (change.cookie.name === '_m_h5_tk' && /(^|\.)1688\.com$/i.test(change.cookie.domain)) void resumeAfterAuthentication();
});

export function isSourcingMessage(message: unknown): boolean {
  return SOURCING_MESSAGES.has(String((message as { type?: unknown } | undefined)?.type ?? ''));
}

export async function handleSourcingMessage(message: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await recoveryPromise;
  if (message.type === 'START_1688_IMAGE_SEARCH') return startImageSearch(message.product, message.query_image_data_url, sender.tab?.id, message.request_id);
  if (message.type === 'CANCEL_1688_IMAGE_SEARCH') { await cancelCurrentJob(); return { ok: true }; }
  if (message.type === 'GET_1688_IMAGE_SEARCH_JOB') return { ok: true, job: currentJob && (!sender.tab?.id || currentJob.source_tab_id === sender.tab.id) ? currentJob : undefined };
  if (message.type === 'OPEN_1688_LOGIN') {
    await openLoginWindow();
    return { ok: true };
  }
  if (message.type === 'REOPEN_1688_LOGIN') { await openLoginWindow(); return { ok: true }; }
  if (message.type === 'RECHECK_1688_LOGIN') {
    const connected = await resumeAfterAuthentication();
    return { ok: connected, connected, error: connected ? undefined : '尚未检测到1688登录状态，请在连接窗口完成验证后再试。' };
  }
  if (message.type === 'OPEN_1688_OFFICIAL_SEARCH') {
    const url = new URL(OFFICIAL_SEARCH_URL);
    const imageId = currentJob?.official_session?.image_id;
    if (imageId) { url.searchParams.set('imageId', imageId); url.searchParams.set('imageIdList', imageId); }
    await chrome.tabs.create({ url: url.href, active: true });
    return { ok: true };
  }
  if (message.type === 'OPEN_1688_OFFER') {
    const offerId = String(message.offer_id ?? '');
    if (!/^\d{8,}$/.test(offerId)) return { ok: false, error: '1688 商品 ID 无效。' };
    await chrome.tabs.create({ url: `https://detail.1688.com/offer/${offerId}.html`, active: true });
    return { ok: true };
  }
  if (message.type === 'PREPARE_SOURCE_IMAGE') {
    try { return { ok: true, data_url: await prepareImageDataUrl(String(message.image_url ?? '')) }; }
    catch (error) { return { ok: false, error: errorMessage(error, '图片读取失败。') }; }
  }
  return { ok: false, error: '未知的1688图搜请求。' };
}

export function handleSourcingTabRemoved(tabId: number): void {
  if (currentJob?.source_tab_id === tabId) void cancelCurrentJob();
  if (currentJob?.fallback_tab_id === tabId) {
    currentJob.fallback_tab_id = undefined;
    if (currentJob.enrichment_state === 'running') {
      currentJob.enrichment_state = 'partial';
      currentJob.enrichment_error = '官方结果补充页已关闭，已保留当前可用结果。';
      void broadcastJob();
    }
  }
  if (currentJob?.login_tab_id === tabId) {
    currentJob.login_tab_id = undefined;
    void broadcastJob();
  }
}

export function handleSourcingWindowRemoved(windowId: number): void {
  if (currentJob?.login_window_id === windowId) {
    currentJob.login_window_id = undefined;
    void broadcastJob();
  }
}

async function startImageSearch(rawProduct: SourcingProductInput | undefined, rawDataUrl: unknown, sourceTabId?: number, rawRequestId?: unknown): Promise<{ ok: boolean; job?: ImageSearchJob; error?: string }> {
  const productId = String(rawProduct?.product_id ?? '').slice(0, 160) || `temu-${Date.now()}`;
  const imageUrl = String(rawProduct?.image_url ?? '');
  if (!imageUrl || !isTemuImageUrl(imageUrl)) return { ok: false, error: 'Temu 商品图片地址无效或暂不支持。' };
  await cancelCurrentJob();
  const token = ++generation;
  const timestamp = now();
  const requestId = typeof rawRequestId === 'string' && rawRequestId.length <= 100 ? rawRequestId : undefined;
  currentJob = {
    id: requestId || `${productId}-${Date.now()}`, client_request_id: requestId, source_product_id: productId, source_title: String(rawProduct?.title ?? 'Temu商品'),
    source_image_url: imageUrl,
    query_image_data_url: typeof rawDataUrl === 'string' && rawDataUrl.startsWith('data:image/') ? rawDataUrl : '',
    source_tab_id: sourceTabId, state: 'preparing-image', results: [], next_page: 1, has_more: false,
    official_search_url: OFFICIAL_SEARCH_URL, created_at: timestamp, updated_at: timestamp,
  };
  await broadcastJob();
  void runImageSearch(token);
  return { ok: true, job: currentJob };
}

async function runImageSearch(token: number): Promise<void> {
  try {
    const job = assertCurrent(token);
    if (!job.query_image_data_url) job.query_image_data_url = await prepareImageDataUrl(job.source_image_url);
    updateState(token, 'uploading');
    await broadcastJob();
    const session = await uploadImageToOfficial1688(job.query_image_data_url);
    job.official_session = session;
    updateState(token, 'searching');
    await broadcastJob();
    const page = await searchOfficial1688(session, 1, 20);
    const current = assertCurrent(token);
    current.official_session = page.session;
    current.results = page.results;
    current.next_page = 2;
    current.diagnostics = page.diagnostics;
    current.auth_issue = undefined;
    const parserRejectedAll = page.diagnostics.raw_offer_count > 0 && page.results.length === 0;
    current.has_more = parserRejectedAll ? false : page.has_more;
    current.state = parserRejectedAll ? 'failed' : 'ready';
    current.enrichment_state = parserRejectedAll ? 'partial' : page.results.length ? 'running' : 'complete';
    current.enrichment_error = undefined;
    current.error = parserRejectedAll
      ? `1688返回了 ${page.diagnostics.raw_offer_count} 条候选货源，但插件未能识别商品编号。请使用官方搜图入口，并把此提示反馈给开发者。`
      : page.results.length ? undefined : '1688本次确实没有返回相似货源，可框选商品主体后重搜。';
    current.updated_at = now();
    await broadcastJob();
    if (!parserRejectedAll && page.results.length) void enrichFromOfficialPage(token);
  } catch (error) {
    if (token !== generation || !currentJob) return;
    const message = errorMessage(error, '1688官方图搜失败。');
    currentJob.state = message.startsWith('NEEDS_AUTH:') ? 'needs-auth' : 'failed';
    currentJob.auth_issue = message.startsWith('NEEDS_AUTH:') ? authIssueFromMessage(message) : undefined;
    currentJob.error = cleanAuthMessage(message);
    currentJob.updated_at = now();
    await broadcastJob();
  }
}

function officialSearchUrl(job: ImageSearchJob): string {
  const url = new URL(OFFICIAL_SEARCH_URL);
  const imageId = job.official_session?.image_id;
  if (imageId) { url.searchParams.set('imageId', imageId); url.searchParams.set('imageIdList', imageId); }
  return url.href;
}

async function enrichFromOfficialPage(token: number): Promise<void> {
  const job = assertCurrent(token);
  if (!job.official_session || job.fallback_tab_id !== undefined) return;
  job.enrichment_state = 'running';
  job.enrichment_error = undefined;
  job.updated_at = now();
  await broadcastJob();
  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url: officialSearchUrl(job), active: false });
    tabId = tab.id;
    if (tabId === undefined) throw new Error('无法创建1688官方结果页。');
    job.fallback_tab_id = tabId;
    await broadcastJob();
    let domOffers: unknown[] = [];
    for (let attempt = 0; attempt < 8 && token === generation; attempt += 1) {
      await wait(900);
      const injected = await chrome.scripting.executeScript({ target: { tabId }, func: readOfficialImageSearchCards }).catch(() => []);
      const found = injected[0]?.result;
      if (Array.isArray(found) && found.length) { domOffers = found; break; }
    }
    const current = assertCurrent(token);
    const domResults = domOffers.map(normalizeOfficial1688Offer).filter((item): item is SourcingResult => Boolean(item));
    if (domResults.length) current.results = mergeOfficialResultsInOrder(current.results, domResults);
    if (current.diagnostics) {
      current.diagnostics.complete_card_count = current.results.filter(isCompleteCard).length;
      current.diagnostics.missing_image_count = current.results.filter((item) => !item.image_url).length;
      current.diagnostics.dom_fallback_used = true;
      current.diagnostics.dom_offer_count = domResults.length;
      current.diagnostics.dom_added_count = Math.max(0, domResults.length - Math.min(domResults.length, current.diagnostics.raw_offer_count));
    }
    if (!domResults.length) {
      await appendRemainingApiResults(token);
    } else {
      current.has_more = false;
      current.enrichment_state = 'complete';
      current.enrichment_error = undefined;
    }
    current.updated_at = now();
    await broadcastJob();
  } catch (error) {
    if (token === generation && currentJob) {
      currentJob.fallback_tab_id = undefined;
      await appendRemainingApiResults(token).catch(() => undefined);
      if (currentJob.enrichment_state === 'running') {
        currentJob.enrichment_state = 'partial';
        currentJob.enrichment_error = `已保留前 ${currentJob.results.length} 条结果，更多官方资料暂不可用。`;
      }
      currentJob.updated_at = now();
      await broadcastJob();
    }
  } finally {
    if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => undefined);
    const job = currentJob;
    if (token === generation && job && job.fallback_tab_id === tabId) {
      job.fallback_tab_id = undefined;
      if (job.enrichment_state === 'running') {
        job.enrichment_state = 'partial';
        job.enrichment_error = job.enrichment_error || '官方结果补充未完成，已保留当前可用结果。';
      }
      job.updated_at = now();
      await broadcastJob();
    }
  }
}

async function appendRemainingApiResults(token: number): Promise<void> {
  const job = assertCurrent(token);
  if (!job.official_session) throw new Error('缺少1688官方搜索会话。');
  let pages = 0;
  try {
    while (job.has_more && pages < 4 && token === generation) {
      const page = await searchOfficial1688(job.official_session, job.next_page, 20);
      const current = assertCurrent(token);
      const byId = new Set(current.results.map((item) => item.offer_id));
      current.results = current.results.concat(page.results.filter((item) => !byId.has(item.offer_id)));
      current.official_session = page.session;
      current.next_page += 1;
      current.has_more = page.has_more;
      const previousDiagnostics = current.diagnostics;
      current.diagnostics = {
        ...page.diagnostics,
        raw_offer_count: (previousDiagnostics?.raw_offer_count ?? 0) + page.diagnostics.raw_offer_count,
        normalized_count: (previousDiagnostics?.normalized_count ?? 0) + page.diagnostics.normalized_count,
        dropped_count: (previousDiagnostics?.dropped_count ?? 0) + page.diagnostics.dropped_count,
        dropped_missing_identity: (previousDiagnostics?.dropped_missing_identity ?? 0) + page.diagnostics.dropped_missing_identity,
        missing_image_count: current.results.filter((item) => !item.image_url).length,
        complete_card_count: current.results.filter(isCompleteCard).length,
        dom_fallback_used: previousDiagnostics?.dom_fallback_used,
        dom_offer_count: previousDiagnostics?.dom_offer_count,
        dom_added_count: previousDiagnostics?.dom_added_count,
      };
      current.updated_at = now();
      await broadcastJob();
      pages += 1;
    }
    const current = assertCurrent(token);
    current.enrichment_state = current.has_more ? 'partial' : 'complete';
    current.enrichment_error = current.has_more ? '已显示当前可用结果，更多结果暂不可用。' : undefined;
  } catch (error) {
    const current = currentJob;
    if (token === generation && current) {
      current.enrichment_state = 'partial';
      current.enrichment_error = '已显示当前可用结果，更多结果暂不可用。';
    }
  }
}

function isCompleteCard(item: SourcingResult): boolean {
  return Boolean(item.image_url && !item.title.startsWith('1688 商品 ') && item.price);
}

async function openLoginWindow(): Promise<void> {
  if (!currentJob) return;
  if (currentJob.login_tab_id !== undefined) {
    const existing = await chrome.tabs.get(currentJob.login_tab_id).catch(() => undefined);
    if (existing?.id !== undefined) {
      if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => undefined);
      await chrome.tabs.update(existing.id, { active: true }).catch(() => undefined);
      return;
    }
    currentJob.login_tab_id = undefined;
  }
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const existing1688 = tabs
    .filter((tab) => tab.id !== undefined && /^https?:\/\/(?:[^/]+\.)?1688\.com\//i.test(tab.url || ''))
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))[0];
  const tab = existing1688?.id !== undefined
    ? await chrome.tabs.update(existing1688.id, { active: true })
    : await chrome.tabs.create({ url: `https://login.1688.com/member/signin.htm?Done=${encodeURIComponent('https://www.1688.com/')}`, active: true });
  if (!tab || tab.id === undefined) return;
  if (currentJob) {
    currentJob.login_tab_id = tab.id;
    currentJob.updated_at = now();
    await broadcastJob();
  }
}

async function closeLoginWindow(): Promise<void> {
  const windowId = currentJob?.login_window_id;
  if (windowId !== undefined) await chrome.windows.remove(windowId).catch(() => undefined);
  if (currentJob) { currentJob.login_window_id = undefined; currentJob.login_tab_id = undefined; }
}

async function resumeAfterAuthentication(): Promise<boolean> {
  if (!currentJob || currentJob.state !== 'needs-auth' || authResumeInFlight || !(await hasOfficial1688Session())) return false;
  authResumeInFlight = true;
  try {
    const token = ++generation;
    currentJob.state = 'preparing-image';
    currentJob.error = undefined;
    currentJob.auth_issue = undefined;
    currentJob.updated_at = now();
    await closeLoginWindow();
    await broadcastJob();
    void runImageSearch(token);
    return true;
  } finally { authResumeInFlight = false; }
}

async function cancelCurrentJob(): Promise<void> {
  generation += 1;
  if (!currentJob) { await chrome.storage.session.remove(SESSION_KEY).catch(() => undefined); return; }
  await closeLoginWindow();
  if (currentJob.fallback_tab_id !== undefined) await chrome.tabs.remove(currentJob.fallback_tab_id).catch(() => undefined);
  currentJob.state = 'cancelled'; currentJob.updated_at = now();
  await broadcastJob();
  currentJob = undefined;
  await chrome.storage.session.remove(SESSION_KEY).catch(() => undefined);
}

async function broadcastJob(): Promise<void> {
  if (!currentJob) return;
  const job = structuredClone(currentJob);
  await chrome.storage.session.set({ [SESSION_KEY]: job }).catch(() => undefined);
  if (job.source_tab_id !== undefined) void chrome.tabs.sendMessage(job.source_tab_id, { type: 'SOURCING_JOB_UPDATED', job }).catch(() => undefined);
}

async function restoreSourcingSession(): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_KEY).catch(() => ({} as Record<string, unknown>));
  const restored = stored[SESSION_KEY] as ImageSearchJob | undefined;
  if (!restored?.id) return;
  currentJob = restored;
  for (const result of restored.results) delete (result as unknown as Record<string, unknown>).shipping_origin;
  delete (restored as unknown as Record<string, unknown>).shipping_origin_progress;
  const token = ++generation;
  if (['preparing-image', 'uploading', 'searching'].includes(restored.state)) {
    restored.state = 'preparing-image'; restored.error = undefined; restored.results = [];
    restored.next_page = 1; restored.has_more = false; restored.official_session = undefined; restored.diagnostics = undefined; restored.updated_at = now();
    await broadcastJob();
    void runImageSearch(token);
    return;
  }
  if (restored.state === 'ready' && restored.enrichment_state === 'running') {
    restored.enrichment_state = 'partial';
    restored.enrichment_error = '扩展重新启动，已保留当前可用结果。';
    restored.fallback_tab_id = undefined;
  }
  await broadcastJob();
}

function assertCurrent(token: number): ImageSearchJob {
  if (token !== generation || !currentJob) throw new Error('图搜任务已被新搜索替代。');
  return currentJob;
}

function updateState(token: number, state: ImageSearchJob['state']): void {
  const job = assertCurrent(token); job.state = state; job.updated_at = now();
}

async function prepareImageDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== 'https:' || !isTemuImageUrl(parsed.href)) throw new Error('商品图片地址无效或暂不支持。');
  const response = await fetch(parsed.href, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error(`商品图片下载失败（HTTP ${response.status}）。`);
  const source = await response.blob();
  if (!source.type.startsWith('image/')) throw new Error('下载内容不是有效图片。');
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(100, Math.round(bitmap.width * scale));
    const height = Math.max(100, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片转换画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: .88 }));
  } catch {
    if (/image\/(?:jpeg|png)/i.test(source.type)) return blobToDataUrl(source);
    throw new Error('图片格式转换失败，请尝试框选商品主体。');
  }
}

function isTemuImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && /(^|\.)kwcdn\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = ''; const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

function now(): string { return new Date().toISOString(); }
function wait(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function authIssueFromMessage(message: string): ImageSearchAuthIssue {
  const match = message.match(/\[issue=(login|session|challenge)\]/i);
  if (match) return match[1].toLowerCase() as ImageSearchAuthIssue;
  return /验证|验证码|安全|拒绝|punish|captcha/i.test(message) ? 'challenge' : 'login';
}
function cleanAuthMessage(message: string): string {
  return message.replace(/^NEEDS_AUTH:/, '').replace(/\s*\[issue=(?:login|session|challenge)\]\s*$/i, '').trim();
}
