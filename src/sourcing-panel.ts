import type { ImageSearchJob, SourcingResult } from './shared/types';

export interface SourcingProduct { product_id: string; title: string; image_url: string; }

const NOTICE_KEY = 'shopscope-1688-image-search-notice-v1';
let host: HTMLElement | undefined;
let shadow: ShadowRoot | undefined;
let currentJob: ImageSearchJob | undefined;
let cropMode = false;
let cropSource = '';
let showNotice = false;
let collapsed = true;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function stateText(job?: ImageSearchJob): string {
  if (!job) return '在Temu商品图上点击按钮开始搜货源';
  if (job.state === 'preparing-image') return '正在准备图片…';
  if (job.state === 'uploading') return '正在提交1688官方图搜…';
  if (job.enrichment_state === 'running' && job.results.length) return '正在匹配同款货源…';
  if (job.state === 'searching') return job.results.length ? '正在匹配官方结果…' : '正在匹配同款货源…';
  if (job.state === 'ready') return job.results.length ? `找到 ${job.results.length} 条1688货源` : '1688本次没有返回货源';
  if (job.state === 'needs-auth') return job.auth_issue === 'challenge' ? '1688暂时限制访问' : '需要连接1688';
  if (job.state === 'failed') return job.diagnostics?.raw_offer_count ? '1688已返回数据，但解析失败' : '搜索失败';
  return '搜索已取消';
}

function value(raw?: string, fallback = '—'): string { return escapeHtml(raw || fallback); }

function cardMarkup(result: SourcingResult, index: number): string {
  const optionalFacts = [
    result.shipping_time ? `<span>发货 <b>${value(result.shipping_time)}</b></span>` : '',
    result.supplier_years ? `<span>店龄 <b>${value(result.supplier_years)}</b></span>` : '',
  ].join('');
  return `<article class="source-card" data-offer-id="${result.offer_id}" tabindex="0" role="link">
    <div class="rank">${index + 1}</div>
    <div class="image-wrap">${result.image_url ? `<img src="${escapeHtml(result.image_url)}" alt="" loading="lazy" />` : '<span class="image-missing">图片未返回</span>'}</div>
    <h3>${escapeHtml(result.title)}</h3>
    <div class="price">${value(result.price?.display)} <small>页面参考价</small></div>
    <div class="facts">
      <span>销量 <b>${value(result.sales)}</b></span><span>起批 <b>${value(result.minimum_order)}</b></span>
      <span>回头率 <b>${value(result.repurchase_rate)}</b></span>${optionalFacts}
    </div>
    ${result.badges.length ? `<div class="badges">${result.badges.map((badge) => `<i>${escapeHtml(badge)}</i>`).join('')}</div>` : ''}
    <footer title="${value(result.supplier_name)}"><span>${value(result.supplier_name, '供应商未显示')}</span><b>↗</b></footer>
  </article>`;
}

const STYLE = `
  :host{all:initial}*{box-sizing:border-box}.panel{position:fixed;inset:0 auto 0 0;width:min(740px,calc(100vw - 46px));background:#262626;color:#f4f4f4;box-shadow:18px 0 45px rgba(0,0,0,.38);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;overflow:hidden}
  button{font:inherit}.header{height:66px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid #414141;background:#2d2d2d}.brand{font-size:21px;font-weight:800;color:#ff6a1a;letter-spacing:.02em}.brand small{font-size:12px;color:#a9a9a9;margin-left:7px;font-weight:500}.header-status{margin-left:22px;color:#b9c0bd;font-size:13px}.header-status:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#28bd84;margin-right:7px;box-shadow:0 0 0 4px rgba(40,189,132,.12)}.header-actions{margin-left:auto;display:flex;gap:8px}.icon{width:36px;height:36px;border:1px solid #505050;border-radius:9px;background:#363636;color:#ddd;cursor:pointer}.icon:hover{border-color:#ff6a1a;color:#ff6a1a}
  .workspace{display:flex;min-height:0;flex:1}.query-side{width:174px;flex:none;padding:14px;background:#292929;border-right:1px solid #414141;overflow:auto}.query-image{width:144px;height:144px;display:block;object-fit:contain;background:#fff;border-radius:5px}.query-title{margin:12px 0 4px;font-size:13px;color:#eee;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.query-source{color:#8f9995;font-size:11px}.side-btn{width:100%;margin-top:10px;padding:10px;border:1px solid #555;border-radius:6px;background:#393939;color:#eee;cursor:pointer;font-weight:700}.side-btn.primary{background:#ff6a1a;border-color:#ff6a1a}.side-btn:hover{filter:brightness(1.08)}.notice{margin-top:13px;padding:10px;border-radius:7px;background:#3a3328;color:#e3c793;font-size:11px}
  .results{min-width:0;flex:1;display:flex;flex-direction:column}.toolbar{min-height:67px;display:flex;align-items:center;gap:7px;padding:12px 18px;border-bottom:1px solid #414141;background:#2b2b2b}.sort{padding:8px 13px;border:1px solid transparent;border-radius:6px;background:transparent;color:#d3d3d3;cursor:default}.sort.active{color:#ff6a1a;border-color:#5a4638;background:#352f2b}.result-count{margin-left:auto;color:#929a97;font-size:12px}.grid-scroll{flex:1;overflow:auto;padding:16px 18px 28px;overscroll-behavior:contain}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.source-card{position:relative;min-width:0;padding:12px;border:1px solid #3e3e3e;border-radius:7px;background:#343434;cursor:pointer;transition:.16s}.source-card:hover{border-color:#ff6a1a;transform:translateY(-2px);box-shadow:0 9px 22px rgba(0,0,0,.22)}.rank{position:absolute;z-index:2;top:20px;left:20px;width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.9);color:#777}.image-wrap{height:190px;background:#fff;border-radius:3px;overflow:hidden;display:grid;place-items:center}.image-wrap img{width:100%;height:100%;object-fit:contain}.image-missing{color:#8b8b8b;font-size:12px}.source-card h3{height:40px;margin:10px 0 7px;font-size:13px;line-height:20px;font-weight:600;color:#e8e8e8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price{color:#ff6a1a;font-size:18px;font-weight:800}.price small{color:#969696;font-size:10px;font-weight:500;margin-left:5px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:5px 9px;margin-top:8px;color:#929997;font-size:11px}.facts span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.facts b{color:#c8cecb;font-weight:500}.badges{display:flex;gap:4px;margin-top:8px;overflow:hidden}.badges i{font-style:normal;font-size:10px;padding:2px 5px;border-radius:3px;background:#513924;color:#ffb17d;white-space:nowrap}.source-card footer{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid #484848;color:#b2b8b5;font-size:11px}.source-card footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-card footer b{margin-left:auto;color:#ff6a1a}.empty{margin:60px auto;padding:28px;text-align:center;color:#a3aaa7}.error{margin:30px auto;max-width:520px;padding:18px;border:1px solid #75522f;border-radius:8px;background:#3b3328;color:#f1c993}.error p{line-height:1.6}.error button{display:block;width:100%;margin-top:12px;padding:10px;border:0;border-radius:6px;background:#ff6a1a;color:#fff;cursor:pointer;font-weight:700}.error button.secondary{background:#51463a;color:#f1c993;border:1px solid #8b6b47}.warning{margin:0 0 14px;padding:10px 12px;border:1px solid #6d573b;border-radius:6px;background:#393228;color:#e7c18f;font-size:12px}
  .loading{display:grid;place-items:center;gap:14px;min-height:280px;color:#aeb5b2}.spinner{width:42px;height:42px;border:4px solid #484848;border-top-color:#ff6a1a;border-radius:50%;animation:spin .85s linear infinite}.loading strong{color:#eceeed;font-size:15px}.loading small{color:#838b88}.crop{padding:12px;background:#303030;border:1px solid #4b4b4b;border-radius:7px}.canvas-wrap{position:relative;line-height:0;background:#fff;overflow:hidden}.crop canvas{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}.selection{position:absolute;display:none;border:2px solid #ff6a1a;background:rgba(255,106,26,.18);pointer-events:none}.crop p{font-size:11px;color:#aaa}.collapsed{position:fixed;left:0;top:42%;width:34px;padding:9px 7px;border:0;border-radius:0 9px 9px 0;background:#ff6a1a;color:#fff;cursor:pointer;writing-mode:vertical-rl;letter-spacing:.05em;font-size:12px;box-shadow:3px 5px 18px rgba(0,0,0,.3)}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:650px){.panel{width:calc(100vw - 38px)}.query-side{width:122px;padding:10px}.query-image{width:100px;height:100px}.header{padding:0 10px}.header-status{margin-left:8px;font-size:11px}.grid{grid-template-columns:1fr}.grid-scroll{padding:10px}}
`;

function ensureHost(): void {
  if (host?.isConnected && shadow) return;
  host = document.createElement('aside'); host.id = 'shopscope-1688-sourcing'; host.style.cssText = 'position:fixed;inset:0 auto 0 0;z-index:2147483646;';
  shadow = host.attachShadow({ mode: 'open' }); document.documentElement.appendChild(host);
}

export function toggleSourcingPanel(): void {
  ensureHost();
  collapsed = !collapsed;
  render();
}

async function firstUseNotice(): Promise<boolean> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(NOTICE_KEY).catch(() => ({}));
  if (stored[NOTICE_KEY]) return false;
  await chrome.storage.local.set({ [NOTICE_KEY]: true }).catch(() => undefined);
  return true;
}

export async function startSourcingSearch(product: SourcingProduct, queryImageDataUrl?: string): Promise<void> {
  ensureHost(); collapsed = false; cropMode = false; showNotice = false;
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  currentJob = { id: requestId, client_request_id: requestId, source_product_id: product.product_id, source_title: product.title, source_image_url: product.image_url, query_image_data_url: queryImageDataUrl ?? '', state: 'preparing-image', results: [], next_page: 1, has_more: false, official_search_url: '', created_at: timestamp, updated_at: timestamp };
  render();
  void firstUseNotice().then((notice) => { if (currentJob?.client_request_id === requestId) { showNotice = notice; render(); } });
  const response = await chrome.runtime.sendMessage({ type: 'START_1688_IMAGE_SEARCH', product, request_id: requestId, query_image_data_url: queryImageDataUrl }).catch((error) => ({ ok: false, error: String(error) }));
  if (currentJob?.client_request_id !== requestId) return;
  if (!response?.ok && currentJob) { currentJob.state = 'failed'; currentJob.error = response?.error || '无法启动1688图搜。'; render(); }
}

export function handleSourcingJobUpdate(job: ImageSearchJob): void {
  if (currentJob?.client_request_id && job.client_request_id !== currentJob.client_request_id) return;
  if (!host?.isConnected && job.state !== 'cancelled') ensureHost();
  currentJob = job; render();
}

function render(): void {
  if (!shadow) return;
  if (collapsed) {
    shadow.innerHTML = `<style>${STYLE}</style><button class="collapsed" aria-label="展开ShopScope货源面板">ShopScope · 1688 货源 ›</button>`;
    shadow.querySelector<HTMLButtonElement>('.collapsed')?.addEventListener('click', () => { collapsed = false; render(); });
    return;
  }
  const image = currentJob?.query_image_data_url || currentJob?.source_image_url || '';
  const results = currentJob?.results ?? [];
  const working = Boolean(currentJob && (['preparing-image', 'uploading', 'searching'].includes(currentJob.state) || (currentJob.enrichment_state === 'running' && results.length > 0)));
  const previousScrollTop = shadow.querySelector<HTMLElement>('.grid-scroll')?.scrollTop ?? 0;
  const errorState = currentJob?.state === 'failed';
  const authState = currentJob?.state === 'needs-auth';
  const challengeState = authState && currentJob?.auth_issue === 'challenge';
  shadow.innerHTML = `<style>${STYLE}</style><section class="panel">
    <header class="header"><div class="brand">ShopScope <small>1688货源</small></div><div class="header-status">${escapeHtml(stateText(currentJob))}</div><div class="header-actions"><button class="icon" data-collapse title="收起面板" aria-label="收起面板">‹</button><button class="icon" data-close title="关闭面板" aria-label="关闭面板">×</button></div></header>
    <div class="workspace"><aside class="query-side">
      ${cropMode ? '<div class="crop"><div class="canvas-wrap"><canvas></canvas><div class="selection"></div></div><p>拖动框选商品主体</p><button class="side-btn primary" data-crop-apply>用框选区域重搜</button><button class="side-btn" data-crop-cancel>取消</button></div>' : `${image ? `<img class="query-image" src="${escapeHtml(image)}" alt="搜索图片" />` : '<div class="query-image"></div>'}<div class="query-title">${escapeHtml(currentJob?.source_title || '尚未选择商品')}</div><div class="query-source">${currentJob ? '来源：Temu商品图片' : '点击商品图片上的搜图按钮'}</div><button class="side-btn" data-crop ${!image || working ? 'disabled' : ''}>框选主体</button><button class="side-btn primary" data-retry ${!currentJob || working ? 'disabled' : ''}>重新搜索</button>${showNotice ? '<div class="notice">点击搜图后，仅将当前商品图片提交给1688官方图片搜索。插件不保存账号密码或完整Cookie。</div>' : ''}`}
    </aside><main class="results">
      <div class="toolbar"><span class="sort active official-order">1688推荐顺序</span><span class="result-count">${results.length ? `${results.length} 条结果${currentJob?.enrichment_state === 'running' ? ' · 正在补充…' : currentJob?.enrichment_state === 'partial' ? ' · 更多结果暂不可用' : ''}` : ''}</span></div>
      <div class="grid-scroll">
        ${!cropMode && authState ? `<div class="error"><strong>${challengeState ? '1688暂时限制访问' : '需要连接1688'}</strong><p>${challengeState ? '1688当前返回了安全验证或访问限制。请在已有的1688页面完成验证，插件不会反复弹出登录窗口。' : '插件没有检测到当前浏览器可用的1688登录状态。点击下方按钮后，会优先使用已经打开的1688页面；登录完成后插件会自动继续本次搜图。'}</p><small>${escapeHtml(currentJob?.error || (challengeState ? '请在1688页面完成验证后重新检测。' : '请先在当前浏览器登录1688。'))}</small><button data-recheck>${challengeState ? '我已完成验证，重新检测' : '我已登录，重新检测'}</button><button class="secondary" data-reopen-login>${challengeState ? '打开已有1688页面' : '连接1688'}</button></div>` : ''}
        ${!cropMode && errorState ? `<div class="error">${escapeHtml(currentJob?.error || '1688图搜暂时失败。')}<button data-official>打开1688官方搜图页</button></div>` : ''}
        ${!cropMode && !errorState && working ? `<div class="loading"><div class="spinner"></div><strong>${escapeHtml(stateText(currentJob))}</strong><small>${results.length ? '正在整理官方结果，完成后显示完整卡片' : 'Temu页面不会跳转，请稍候'}</small></div>` : ''}
        ${!cropMode && !errorState && !working && !results.length ? `<div class="empty">${escapeHtml(currentJob?.error || '1688本次确实没有返回相似货源，可以框选商品主体后重新搜索。')}</div>` : ''}
        ${!cropMode && !errorState && results.length && (currentJob?.error || currentJob?.enrichment_error) ? `<div class="warning">${escapeHtml(currentJob.enrichment_error || currentJob.error || '')}</div>` : ''}
        ${!cropMode && !working && results.length ? `<div class="grid">${results.map(cardMarkup).join('')}</div>` : ''}
      </div>
    </main></div>
  </section>`;
  bindEvents();
  const nextScroll = shadow.querySelector<HTMLElement>('.grid-scroll');
  if (nextScroll && previousScrollTop > 0) nextScroll.scrollTop = previousScrollTop;
  if (cropMode) void initializeCropCanvas();
}

function bindEvents(): void {
  if (!shadow) return;
  shadow.querySelector<HTMLElement>('[data-close]')?.addEventListener('click', () => { collapsed = true; render(); });
  shadow.querySelector<HTMLElement>('[data-collapse]')?.addEventListener('click', () => { collapsed = true; render(); });
  shadow.querySelector<HTMLElement>('[data-retry]')?.addEventListener('click', () => { if (currentJob) void startSourcingSearch({ product_id: currentJob.source_product_id, title: currentJob.source_title, image_url: currentJob.source_image_url }, currentJob.query_image_data_url || undefined); });
  shadow.querySelector<HTMLElement>('[data-crop]')?.addEventListener('click', () => { void openCrop(); });
  shadow.querySelector<HTMLElement>('[data-crop-cancel]')?.addEventListener('click', () => { cropMode = false; render(); });
  shadow.querySelector<HTMLElement>('[data-recheck]')?.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'RECHECK_1688_LOGIN' }); });
  shadow.querySelector<HTMLElement>('[data-reopen-login]')?.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'REOPEN_1688_LOGIN' }); });
  shadow.querySelector<HTMLElement>('[data-official]')?.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'OPEN_1688_OFFICIAL_SEARCH' }); });
  for (const card of shadow.querySelectorAll<HTMLElement>('.source-card')) { const open = () => { if (card.dataset.offerId) void chrome.runtime.sendMessage({ type: 'OPEN_1688_OFFER', offer_id: card.dataset.offerId }); }; card.addEventListener('click', open); card.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); }); }
}

async function openCrop(): Promise<void> {
  if (!currentJob) return;
  cropSource = currentJob.query_image_data_url;
  if (!cropSource) {
    const response = await chrome.runtime.sendMessage({ type: 'PREPARE_SOURCE_IMAGE', image_url: currentJob.source_image_url });
    if (!response?.ok) { currentJob.error = response?.error || '无法读取原图。'; currentJob.state = 'failed'; render(); return; }
    cropSource = response.data_url;
  }
  cropMode = true; render();
}

async function initializeCropCanvas(): Promise<void> {
  const canvas = shadow?.querySelector<HTMLCanvasElement>('canvas'); const selection = shadow?.querySelector<HTMLElement>('.selection');
  if (!canvas || !selection || !cropSource) return;
  const image = new Image(); image.src = cropSource; await image.decode().catch(() => undefined);
  canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height; canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  let sx = 0; let sy = 0; let ex = 0; let ey = 0; let dragging = false;
  const point = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }; };
  const paint = () => { selection.style.display = 'block'; selection.style.left = `${Math.min(sx, ex)}px`; selection.style.top = `${Math.min(sy, ey)}px`; selection.style.width = `${Math.abs(ex - sx)}px`; selection.style.height = `${Math.abs(ey - sy)}px`; };
  canvas.addEventListener('pointerdown', (event) => { const p = point(event); sx = ex = p.x; sy = ey = p.y; dragging = true; canvas.setPointerCapture(event.pointerId); paint(); });
  canvas.addEventListener('pointermove', (event) => { if (!dragging) return; const p = point(event); ex = p.x; ey = p.y; paint(); });
  canvas.addEventListener('pointerup', (event) => { dragging = false; canvas.releasePointerCapture(event.pointerId); });
  shadow?.querySelector<HTMLElement>('[data-crop-apply]')?.addEventListener('click', () => { const rect = canvas.getBoundingClientRect(); const x = Math.min(sx, ex) * canvas.width / rect.width; const y = Math.min(sy, ey) * canvas.height / rect.height; const width = Math.abs(ex - sx) * canvas.width / rect.width; const height = Math.abs(ey - sy) * canvas.height / rect.height; if (width < 20 || height < 20 || !currentJob) return; const output = document.createElement('canvas'); output.width = Math.round(width); output.height = Math.round(height); output.getContext('2d')?.drawImage(canvas, x, y, width, height, 0, 0, output.width, output.height); void startSourcingSearch({ product_id: currentJob.source_product_id, title: currentJob.source_title, image_url: currentJob.source_image_url }, output.toDataURL('image/jpeg', .88)); });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => { if (message?.type === 'SOURCING_JOB_UPDATED' && message.job) handleSourcingJobUpdate(message.job as ImageSearchJob); });
  void chrome.runtime.sendMessage({ type: 'GET_1688_IMAGE_SEARCH_JOB' }).then((response) => { if (response?.job && !['cancelled', 'idle'].includes(response.job.state)) handleSourcingJobUpdate(response.job as ImageSearchJob); }).catch(() => undefined);
}
