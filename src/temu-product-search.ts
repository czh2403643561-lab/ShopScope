import { canonicalizeUrl, cleanText } from './shared/normalize';
import { startSourcingSearch, toggleSourcingPanel, type SourcingProduct } from './sourcing-panel';

const BUTTON_ID = 'shopscope-temu-image-search-button';
const PRODUCT_PATH = /(?:^|\/)(?:product|goods|product_image|product-detail)\//i;
const IMAGE_ATTRIBUTES = ['src', 'srcset', 'data-src', 'data-original', 'data-lazy-src'];
const CARD_SELECTORS = [
  '[data-goods-id]', '[data-product-id]', '[class*="product-item"]', '[class*="goods-item"]',
  '._3nm8E1o6', '.ueQ3rCYG',
].join(',');

let host: HTMLElement | undefined;
let activeImage: HTMLImageElement | undefined;
let hoveredImage: HTMLImageElement | undefined;
let pointerX = 0;
let pointerY = 0;
let refreshScheduled = false;

function imageUrl(image: HTMLImageElement): string {
  const candidates = [
    image.currentSrc,
    image.getAttribute('src'),
    image.getAttribute('data-src'),
    image.getAttribute('data-original'),
    image.getAttribute('data-lazy-src'),
  ];
  return candidates.find((candidate) => {
    if (!candidate) return false;
    try {
      const url = new URL(candidate, location.href);
      return url.protocol === 'https:' && /(^|\.)kwcdn\.com$/i.test(url.hostname) && PRODUCT_PATH.test(url.pathname);
    } catch {
      return false;
    }
  }) ?? '';
}

function productImage(image: HTMLImageElement): boolean {
  return image.isConnected && Boolean(imageUrl(image));
}

function productCard(image: HTMLImageElement): HTMLElement {
  return image.closest<HTMLElement>(CARD_SELECTORS) ?? image.parentElement ?? image;
}

function productId(image: HTMLImageElement, card: HTMLElement, rawImageUrl: string): string {
  const anchors = [image.closest('a'), ...card.querySelectorAll('a')];
  for (const anchor of anchors) {
    if (!anchor?.href) continue;
    try {
      const url = new URL(anchor.href, location.href);
      for (const key of ['goods_id', 'goodsId', 'product_id', 'productId', 'item_id', 'itemId']) {
        const value = url.searchParams.get(key);
        if (value) return value.slice(0, 120);
      }
      const match = url.pathname.match(/(?:goods|product)[^\d]*(\d{6,})/i);
      if (match) return match[1];
    } catch { /* Ignore malformed links. */ }
  }
  return image.dataset.goodsId || image.dataset.productId || rawImageUrl.slice(-80) || `temu-${Date.now()}`;
}

function productSnapshot(image: HTMLImageElement): SourcingProduct | undefined {
  const rawImageUrl = imageUrl(image);
  if (!image.isConnected || !rawImageUrl) return undefined;
  const card = productCard(image);
  const canonicalImageUrl = canonicalizeUrl(rawImageUrl);
  if (!canonicalImageUrl) return undefined;
  const alt = cleanText(image.alt);
  const title = alt && alt.toLowerCase() !== 'image'
    ? alt
    : cleanText(image.getAttribute('title') || card.querySelector('[title]')?.getAttribute('title') || card.textContent).slice(0, 180) || 'Temu商品';
  return { product_id: productId(image, card, canonicalImageUrl), title, image_url: canonicalImageUrl };
}

function buttonWidth(): number {
  return host?.shadowRoot?.querySelector('button')?.getBoundingClientRect().width || 112;
}

function positionButton(image: HTMLImageElement): void {
  if (!host) return;
  const rect = image.getBoundingClientRect();
  if (rect.width < 70 || rect.height < 70 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) {
    hideButton();
    return;
  }
  const width = buttonWidth();
  host.style.display = 'block';
  host.style.left = `${Math.max(4, Math.min(innerWidth - width - 4, rect.right - width - 6))}px`;
  host.style.top = `${Math.max(4, rect.top + 6)}px`;
}

function isButtonTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node) || !host) return false;
  return target === host || host.contains(target) || target.getRootNode() === host.shadowRoot;
}

function hideButton(clearHover = false): void {
  if (host && !host.matches(':focus-within')) host.style.display = 'none';
  activeImage = undefined;
  if (clearHover) hoveredImage = undefined;
}

function showForImage(image: HTMLImageElement): void {
  hoveredImage = image;
  if (!productImage(image)) {
    if (activeImage) hideButton();
    return;
  }
  activeImage = image;
  positionButton(image);
}

function refreshUnderPointer(): void {
  refreshScheduled = false;
  if (isButtonTarget(document.elementFromPoint(pointerX, pointerY))) return;
  const target = document.elementFromPoint(pointerX, pointerY);
  if (target instanceof HTMLImageElement) {
    showForImage(target);
  } else {
    hideButton(true);
  }
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
  button.type = 'button';
  button.title = '用此商品图片搜索1688货源';
  button.setAttribute('aria-label', '1688找同款');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><span>1688找同款</span>';
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const product = activeImage && productSnapshot(activeImage);
    if (product) void startSourcingSearch(product);
  });
  host.addEventListener('pointerleave', () => hideButton(true));
  shadow.append(style, button);
  document.documentElement.appendChild(host);
}

function onPointerOver(event: PointerEvent): void {
  if (event.target instanceof HTMLImageElement) showForImage(event.target);
}

function onPointerMove(event: PointerEvent): void {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (event.target instanceof HTMLImageElement) showForImage(event.target);
}

function onPointerOut(event: PointerEvent): void {
  if (event.target === hoveredImage && !isButtonTarget(event.relatedTarget)) hideButton(true);
}

function onFocusIn(event: FocusEvent): void {
  if (event.target instanceof HTMLImageElement) showForImage(event.target);
}

function onTogglePanel(message: unknown): boolean {
  if ((message as { type?: string } | undefined)?.type !== 'TOGGLE_SHOP_SCOPE_PANEL') return false;
  toggleSourcingPanel();
  return true;
}

export function installTemuProductSearch(): void {
  installButton();
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onPointerOut as EventListener, true);
  window.addEventListener('scroll', schedulePointerRefresh, true);
  window.addEventListener('resize', schedulePointerRefresh);
  const observer = new MutationObserver((records) => {
    if (hoveredImage && records.some((record) => record.target === hoveredImage && IMAGE_ATTRIBUTES.includes(record.attributeName ?? ''))) {
      showForImage(hoveredImage);
    }
    if (records.some((record) => record.type === 'childList')) schedulePointerRefresh();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: IMAGE_ATTRIBUTES });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (onTogglePanel(message)) {
      sendResponse({ ok: true });
      return false;
    }
    return undefined;
  });
}
