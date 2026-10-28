import { canonicalizeUrl, cleanText } from './shared/normalize';
import { startSourcingSearch, toggleSourcingPanel, type SourcingProduct } from './sourcing-panel';

const BUTTON_ID = 'shopscope-temu-image-search-button';
const PRODUCT_PATH = /(?:^|\/)(?:product|goods|product_image|product-detail)\//i;
const CARD_SELECTORS = [
  '[data-goods-id]', '[data-product-id]', '[class*="product-item"]', '[class*="goods-item"]',
  '._3nm8E1o6', '.ueQ3rCYG',
].join(',');

let host: HTMLElement | undefined;
let activeImage: HTMLImageElement | undefined;

function productImage(image: HTMLImageElement): boolean {
  if (!image.isConnected) return false;
  const raw = image.currentSrc || image.getAttribute('src') || image.getAttribute('data-src') || '';
  if (!raw) return false;
  try {
    const url = new URL(raw, location.href);
    return /(^|\.)kwcdn\.com$/i.test(url.hostname) && PRODUCT_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

function productCard(image: HTMLImageElement): HTMLElement {
  return image.closest<HTMLElement>(CARD_SELECTORS) ?? image.parentElement ?? image;
}

function productId(image: HTMLImageElement, card: HTMLElement): string {
  for (const anchor of [image.closest('a'), ...card.querySelectorAll('a')]) {
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
  return image.dataset.goodsId || image.dataset.productId || image.currentSrc.slice(-80) || `temu-${Date.now()}`;
}

function productSnapshot(image: HTMLImageElement): SourcingProduct | undefined {
  if (!productImage(image)) return undefined;
  const card = productCard(image);
  const imageUrl = canonicalizeUrl(image.currentSrc || image.getAttribute('src') || image.getAttribute('data-src') || '');
  if (!imageUrl) return undefined;
  const alt = cleanText(image.alt);
  const title = alt && alt.toLowerCase() !== 'image'
    ? alt
    : cleanText(image.getAttribute('title') || card.querySelector('[title]')?.getAttribute('title') || card.textContent).slice(0, 180) || 'Temu商品';
  return { product_id: productId(image, card), title, image_url: imageUrl };
}

function positionButton(image: HTMLImageElement): void {
  if (!host) return;
  const rect = image.getBoundingClientRect();
  if (rect.width < 70 || rect.height < 70 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) {
    hideButton();
    return;
  }
  host.style.display = 'block';
  host.style.left = `${Math.min(innerWidth - 40, Math.max(4, rect.right - 38))}px`;
  host.style.top = `${Math.max(4, rect.top + 6)}px`;
}

function hideButton(): void {
  if (host && !host.matches(':focus-within')) host.style.display = 'none';
  activeImage = undefined;
}

function installButton(): void {
  if (host?.isConnected) return;
  host = document.createElement('span');
  host.id = BUTTON_ID;
  host.style.cssText = 'position:fixed;z-index:2147483645;display:none;pointer-events:auto;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(0,0,0,.18);border-radius:50%;background:#fff;color:#146b55;box-shadow:0 2px 8px rgba(0,0,0,.24);cursor:pointer}button:hover{background:#e9f5f0}svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.title = '用此商品图片搜索1688货源';
  button.setAttribute('aria-label', button.title);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>';
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const product = activeImage && productSnapshot(activeImage);
    if (product) void startSourcingSearch(product);
  });
  host.addEventListener('pointerleave', hideButton);
  shadow.append(style, button);
  document.documentElement.appendChild(host);
}

function onPointerOver(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !productImage(target)) return;
  activeImage = target;
  positionButton(target);
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLImageElement) || !productImage(target)) return;
  activeImage = target;
  positionButton(target);
}

function onTogglePanel(message: unknown): boolean {
  if ((message as { type?: string } | undefined)?.type !== 'TOGGLE_SHOP_SCOPE_PANEL') return false;
  toggleSourcingPanel();
  return true;
}

export function installTemuProductSearch(): void {
  installButton();
  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', (event) => {
    const target = event.target;
    if (target === activeImage && event.relatedTarget !== host) hideButton();
  }, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', (event) => {
    if (event.target === activeImage && event.relatedTarget !== host) hideButton();
  }, true);
  window.addEventListener('scroll', () => activeImage && positionButton(activeImage), true);
  window.addEventListener('resize', () => activeImage && positionButton(activeImage));
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (onTogglePanel(message)) {
      sendResponse({ ok: true });
      return true;
    }
    return undefined;
  });
}
