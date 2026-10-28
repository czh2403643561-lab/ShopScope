import { canonicalizeUrl, cleanText } from './shared/normalize';
import { startSourcingSearch, toggleSourcingPanel, type SourcingProduct } from './sourcing-panel';

const BUTTON_ID = 'shopscope-temu-image-search-button';
const IMAGE_PATH = /(?:^|\/)(?:product|goods|product_image|product-detail|local-goods-img)\//i;
const IMAGE_ATTRIBUTES = ['src', 'srcset', 'data-src', 'data-original', 'data-lazy-src', 'poster', 'data-poster'];
const CARD_SELECTORS = [
  '[data-goods-id]', '[data-product-id]', '[class*="product-item"]', '[class*="goods-item"]',
  '[class*="goods-container"]', '[class*="product-card"]', '._6q6qVUF5', '._3nm8E1o6', '.ueQ3rCYG',
].join(',');

type ProductMedia = HTMLImageElement | HTMLVideoElement;
interface ProductCandidate { media: ProductMedia; imageUrl: string; card: HTMLElement; }

let host: HTMLElement | undefined;
let activeCandidate: ProductCandidate | undefined;
let pointerX = 0;
let pointerY = 0;
let refreshScheduled = false;
const pageMedia = new Set<ProductMedia>();

function isProductMedia(element: Element): element is ProductMedia {
  return element instanceof HTMLImageElement || element instanceof HTMLVideoElement;
}

function updateMediaTree(node: Node, add: boolean): void {
  if (!(node instanceof Element)) return;
  const update = (element: Element): void => {
    if (!isProductMedia(element)) return;
    if (add) pageMedia.add(element);
    else pageMedia.delete(element);
  };
  update(node);
  node.querySelectorAll('img,video').forEach(update);
}

function updateMediaRegistry(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type !== 'childList') continue;
    record.addedNodes.forEach((node) => updateMediaTree(node, true));
    record.removedNodes.forEach((node) => updateMediaTree(node, false));
  }
}

function validImageUrl(candidate?: string | null): string {
  if (!candidate) return '';
  try {
    const url = new URL(candidate, location.href);
    return url.protocol === 'https:' && /(^|\.)kwcdn\.com$/i.test(url.hostname) && IMAGE_PATH.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

function imageUrl(image: HTMLImageElement): string {
  const candidates = [image.currentSrc, image.getAttribute('src'), image.getAttribute('data-src'), image.getAttribute('data-original'), image.getAttribute('data-lazy-src')];
  return candidates.map(validImageUrl).find(Boolean) ?? '';
}

function mediaUrl(media: ProductMedia): string {
  if (media instanceof HTMLImageElement) return imageUrl(media);
  // Temu may render product art as a video; only use its static poster, never src/currentSrc.
  return validImageUrl(media.poster || media.getAttribute('data-poster'));
}

function cardFor(element: Element): HTMLElement {
  const card = element.closest<HTMLElement>(CARD_SELECTORS);
  if (card) return card;
  const productLink = element.closest<HTMLElement>('a[href*="-g-"]');
  if (productLink) return productLink;
  let current: HTMLElement | null = element instanceof HTMLElement ? element : element.parentElement;
  for (let depth = 0; current && depth < 5; depth++, current = current.parentElement) {
    if (current.querySelector('img,video')) return current;
  }
  return element.parentElement ?? element as HTMLElement;
}

function coversPoint(element: Element, x: number, y: number): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= 70 && rect.height >= 70 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function candidateFor(media: ProductMedia, card: HTMLElement): ProductCandidate | undefined {
  const image = mediaUrl(media);
  return image && media.isConnected ? { media, imageUrl: image, card } : undefined;
}

function candidateAtPoint(x: number, y: number): ProductCandidate | undefined {
  const hitOrder = new Map<Element, number>();
  document.elementsFromPoint(x, y).forEach((element, index) => {
    if (isProductMedia(element)) hitOrder.set(element, index);
  });

  const candidates: Array<{ candidate: ProductCandidate; hitOrder: number; area: number }> = [];
  for (const media of pageMedia) {
    if (!media.isConnected) {
      pageMedia.delete(media);
      continue;
    }
    if (!mediaUrl(media)) continue;
    if (!coversPoint(media, x, y)) continue;
    const style = getComputedStyle(media);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const candidate = candidateFor(media, cardFor(media));
    if (!candidate) continue;
    const rect = media.getBoundingClientRect();
    candidates.push({ candidate, hitOrder: hitOrder.get(media) ?? Number.MAX_SAFE_INTEGER, area: rect.width * rect.height });
  }

  candidates.sort((a, b) => a.hitOrder - b.hitOrder || a.area - b.area);
  return candidates[0]?.candidate;
}

function resolveCandidate(target: Element | null, x: number, y: number): ProductCandidate | undefined {
  if (!target || host?.contains(target)) return undefined;
  const card = cardFor(target);
  if ((target instanceof HTMLImageElement || target instanceof HTMLVideoElement) && coversPoint(target, x, y)) {
    const direct = candidateFor(target, card);
    if (direct) return direct;
  }

  // Handle transparent overlays and wrappers only within the product tile under the pointer.
  const media = [...card.querySelectorAll('img,video')].filter((item): item is ProductMedia =>
    (item instanceof HTMLImageElement || item instanceof HTMLVideoElement) && coversPoint(item, x, y));
  const ranked = media.map((item) => candidateFor(item, card)).filter((item): item is ProductCandidate => Boolean(item));
  ranked.sort((a, b) => Number(b.media instanceof HTMLVideoElement) - Number(a.media instanceof HTMLVideoElement));
  return ranked[0] ?? candidateAtPoint(x, y);
}

function productId(candidate: ProductCandidate): string {
  const links = [candidate.media.closest('a'), ...candidate.card.querySelectorAll('a')];
  for (const anchor of links) {
    if (!anchor?.href) continue;
    try {
      const url = new URL(anchor.href, location.href);
      for (const key of ['goods_id', 'goodsId', 'product_id', 'productId', 'item_id', 'itemId']) {
        const value = url.searchParams.get(key);
        if (value) return value.slice(0, 120);
      }
      const match = url.pathname.match(/(?:goods|product)[^\d]*(\d{6,})/i) || url.pathname.match(/-g-(\d+)/i);
      if (match) return match[1];
    } catch { /* Ignore malformed links. */ }
  }
  const image = candidate.media instanceof HTMLImageElement ? candidate.media : undefined;
  return image?.dataset.goodsId || image?.dataset.productId || candidate.imageUrl.slice(-80) || `temu-${Date.now()}`;
}

function productSnapshot(candidate: ProductCandidate): SourcingProduct | undefined {
  const canonicalImageUrl = canonicalizeUrl(candidate.imageUrl);
  if (!canonicalImageUrl || !candidate.media.isConnected) return undefined;
  const image = candidate.media instanceof HTMLImageElement ? candidate.media : undefined;
  const alt = cleanText(image?.alt || candidate.media.getAttribute('aria-label'));
  const title = alt && alt.toLowerCase() !== 'image'
    ? alt
    : cleanText(candidate.media.getAttribute('title') || candidate.card.querySelector('[title]')?.getAttribute('title') || candidate.card.textContent).slice(0, 180) || 'Temu商品';
  return { product_id: productId(candidate), title, image_url: canonicalImageUrl };
}

function buttonWidth(): number { return host?.shadowRoot?.querySelector('button')?.getBoundingClientRect().width || 112; }

function positionButton(candidate: ProductCandidate): void {
  if (!host) return;
  const rect = candidate.media.getBoundingClientRect();
  if (rect.width < 70 || rect.height < 70 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) { hideButton(); return; }
  const width = buttonWidth();
  host.style.display = 'block';
  host.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, rect.right - width - 6))}px`;
  host.style.top = `${Math.max(4, rect.top + 6)}px`;
}

function isButtonTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node) || !host) return false;
  return target === host || host.contains(target) || target.getRootNode() === host.shadowRoot;
}

function hideButton(): void {
  if (host && !host.matches(':focus-within')) host.style.display = 'none';
  activeCandidate = undefined;
}

function showCandidate(candidate?: ProductCandidate): void {
  if (!candidate) { hideButton(); return; }
  activeCandidate = candidate;
  positionButton(candidate);
}

function refreshUnderPointer(): void {
  refreshScheduled = false;
  const target = document.elementFromPoint(pointerX, pointerY);
  if (isButtonTarget(target)) return;
  showCandidate(resolveCandidate(target, pointerX, pointerY));
}

function schedulePointerRefresh(): void {
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(refreshUnderPointer);
}

function installButton(): void {
  if (host?.isConnected) return;
  host = document.createElement('span');
  host.id = BUTTON_ID;
  host.style.cssText = 'position:fixed;z-index:2147483645;display:none;pointer-events:auto;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `button{display:flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 8px;border:1px solid rgba(0,0,0,.18);border-radius:16px;background:#fff;color:#146b55;box-shadow:0 2px 8px rgba(0,0,0,.24);cursor:pointer;font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;white-space:nowrap}button:hover{background:#e9f5f0}svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2}`;
  const button = document.createElement('button');
  button.type = 'button'; button.title = '用此商品图片搜索1688货源'; button.setAttribute('aria-label', '1688找同款');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><span>1688找同款</span>';
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    const product = activeCandidate && productSnapshot(activeCandidate);
    if (product) void startSourcingSearch(product);
  });
  shadow.append(style, button);
  document.documentElement.appendChild(host);
}

function updatePointer(event: PointerEvent): void { pointerX = event.clientX; pointerY = event.clientY; }
function onPointerOver(event: PointerEvent): void { updatePointer(event); if (isButtonTarget(event.target)) return; showCandidate(resolveCandidate(event.target instanceof Element ? event.target : null, pointerX, pointerY)); }
function onPointerMove(event: PointerEvent): void { updatePointer(event); if (isButtonTarget(event.target)) return; schedulePointerRefresh(); }
function onPointerOut(event: PointerEvent): void {
  updatePointer(event);
  if (isButtonTarget(event.relatedTarget)) return;
  schedulePointerRefresh();
}
function onFocusIn(event: FocusEvent): void {
  if (event.target instanceof Element) showCandidate(resolveCandidate(event.target, pointerX, pointerY));
}

function onTogglePanel(message: unknown): boolean {
  if ((message as { type?: string } | undefined)?.type !== 'TOGGLE_SHOP_SCOPE_PANEL') return false;
  toggleSourcingPanel(); return true;
}

export function installTemuProductSearch(): void {
  installButton();
  updateMediaTree(document.documentElement, true);
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('scroll', schedulePointerRefresh, true);
  window.addEventListener('resize', schedulePointerRefresh);
  const observer = new MutationObserver((records) => {
    updateMediaRegistry(records);
    if (records.some((record) => record.type === 'childList' || IMAGE_ATTRIBUTES.includes(record.attributeName ?? ''))) schedulePointerRefresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: IMAGE_ATTRIBUTES });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (onTogglePanel(message)) { sendResponse({ ok: true }); return false; }
    return undefined;
  });
}
