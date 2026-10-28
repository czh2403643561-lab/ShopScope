"use strict";
(() => {
  // src/shared/normalize.ts
  var RESIZE_PARAM_NAMES = /* @__PURE__ */ new Set(["width", "height", "w", "h", "size", "quality", "format"]);
  function cleanText(value2) {
    if (value2 === null || value2 === void 0 || typeof value2 === "object") return "";
    return String(value2).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
  }
  function canonicalizeUrl(raw, baseUrl = typeof location !== "undefined" ? location.href : "https://www.1688.com/") {
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return "";
    try {
      const url = new URL(raw.replace(/^\/\//, "https://"), baseUrl);
      if (!/^https?:$/.test(url.protocol)) return "";
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (RESIZE_PARAM_NAMES.has(key.toLowerCase()) || /^spm|^scene|^from|^track/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString();
    } catch {
      return "";
    }
  }

  // src/sourcing-panel.ts
  var NOTICE_KEY = "shopscope-1688-image-search-notice-v1";
  var host;
  var shadow;
  var currentJob;
  var cropMode = false;
  var cropSource = "";
  var showNotice = false;
  var collapsed = true;
  function escapeHtml(value2) {
    return value2.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
  }
  function stateText(job) {
    if (!job) return "\u5728Temu\u5546\u54C1\u56FE\u4E0A\u70B9\u51FB\u6309\u94AE\u5F00\u59CB\u641C\u8D27\u6E90";
    if (job.state === "preparing-image") return "\u6B63\u5728\u51C6\u5907\u56FE\u7247\u2026";
    if (job.state === "uploading") return "\u6B63\u5728\u63D0\u4EA41688\u5B98\u65B9\u56FE\u641C\u2026";
    if (job.enrichment_state === "running" && job.results.length) return "\u6B63\u5728\u5339\u914D\u540C\u6B3E\u8D27\u6E90\u2026";
    if (job.state === "searching") return job.results.length ? "\u6B63\u5728\u5339\u914D\u5B98\u65B9\u7ED3\u679C\u2026" : "\u6B63\u5728\u5339\u914D\u540C\u6B3E\u8D27\u6E90\u2026";
    if (job.state === "ready") return job.results.length ? `\u627E\u5230 ${job.results.length} \u67611688\u8D27\u6E90` : "1688\u672C\u6B21\u6CA1\u6709\u8FD4\u56DE\u8D27\u6E90";
    if (job.state === "needs-auth") return job.auth_issue === "challenge" ? "1688\u6682\u65F6\u9650\u5236\u8BBF\u95EE" : "\u9700\u8981\u8FDE\u63A51688";
    if (job.state === "failed") return job.diagnostics?.raw_offer_count ? "1688\u5DF2\u8FD4\u56DE\u6570\u636E\uFF0C\u4F46\u89E3\u6790\u5931\u8D25" : "\u641C\u7D22\u5931\u8D25";
    return "\u641C\u7D22\u5DF2\u53D6\u6D88";
  }
  function value(raw, fallback = "\u2014") {
    return escapeHtml(raw || fallback);
  }
  function cardMarkup(result, index) {
    const optionalFacts = [
      result.shipping_time ? `<span>\u53D1\u8D27 <b>${value(result.shipping_time)}</b></span>` : "",
      result.supplier_years ? `<span>\u5E97\u9F84 <b>${value(result.supplier_years)}</b></span>` : ""
    ].join("");
    return `<article class="source-card" data-offer-id="${result.offer_id}" tabindex="0" role="link">
    <div class="rank">${index + 1}</div>
    <div class="image-wrap">${result.image_url ? `<img src="${escapeHtml(result.image_url)}" alt="" loading="lazy" />` : '<span class="image-missing">\u56FE\u7247\u672A\u8FD4\u56DE</span>'}</div>
    <h3>${escapeHtml(result.title)}</h3>
    <div class="price">${value(result.price?.display)} <small>\u9875\u9762\u53C2\u8003\u4EF7</small></div>
    <div class="facts">
      <span>\u9500\u91CF <b>${value(result.sales)}</b></span><span>\u8D77\u6279 <b>${value(result.minimum_order)}</b></span>
      <span>\u56DE\u5934\u7387 <b>${value(result.repurchase_rate)}</b></span>${optionalFacts}
    </div>
    ${result.badges.length ? `<div class="badges">${result.badges.map((badge) => `<i>${escapeHtml(badge)}</i>`).join("")}</div>` : ""}
    <footer title="${value(result.supplier_name)}"><span>${value(result.supplier_name, "\u4F9B\u5E94\u5546\u672A\u663E\u793A")}</span><b>\u2197</b></footer>
  </article>`;
  }
  var STYLE = `
  :host{all:initial}*{box-sizing:border-box}.panel{position:fixed;inset:0 auto 0 0;width:min(740px,calc(100vw - 46px));background:#262626;color:#f4f4f4;box-shadow:18px 0 45px rgba(0,0,0,.38);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;overflow:hidden}
  button{font:inherit}.header{height:66px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid #414141;background:#2d2d2d}.brand{font-size:21px;font-weight:800;color:#ff6a1a;letter-spacing:.02em}.brand small{font-size:12px;color:#a9a9a9;margin-left:7px;font-weight:500}.header-status{margin-left:22px;color:#b9c0bd;font-size:13px}.header-status:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#28bd84;margin-right:7px;box-shadow:0 0 0 4px rgba(40,189,132,.12)}.header-actions{margin-left:auto;display:flex;gap:8px}.icon{width:36px;height:36px;border:1px solid #505050;border-radius:9px;background:#363636;color:#ddd;cursor:pointer}.icon:hover{border-color:#ff6a1a;color:#ff6a1a}
  .workspace{display:flex;min-height:0;flex:1}.query-side{width:174px;flex:none;padding:14px;background:#292929;border-right:1px solid #414141;overflow:auto}.query-image{width:144px;height:144px;display:block;object-fit:contain;background:#fff;border-radius:5px}.query-title{margin:12px 0 4px;font-size:13px;color:#eee;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.query-source{color:#8f9995;font-size:11px}.side-btn{width:100%;margin-top:10px;padding:10px;border:1px solid #555;border-radius:6px;background:#393939;color:#eee;cursor:pointer;font-weight:700}.side-btn.primary{background:#ff6a1a;border-color:#ff6a1a}.side-btn:hover{filter:brightness(1.08)}.notice{margin-top:13px;padding:10px;border-radius:7px;background:#3a3328;color:#e3c793;font-size:11px}
  .results{min-width:0;flex:1;display:flex;flex-direction:column}.toolbar{min-height:67px;display:flex;align-items:center;gap:7px;padding:12px 18px;border-bottom:1px solid #414141;background:#2b2b2b}.sort{padding:8px 13px;border:1px solid transparent;border-radius:6px;background:transparent;color:#d3d3d3;cursor:default}.sort.active{color:#ff6a1a;border-color:#5a4638;background:#352f2b}.result-count{margin-left:auto;color:#929a97;font-size:12px}.grid-scroll{flex:1;overflow:auto;padding:16px 18px 28px;overscroll-behavior:contain}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.source-card{position:relative;min-width:0;padding:12px;border:1px solid #3e3e3e;border-radius:7px;background:#343434;cursor:pointer;transition:.16s}.source-card:hover{border-color:#ff6a1a;transform:translateY(-2px);box-shadow:0 9px 22px rgba(0,0,0,.22)}.rank{position:absolute;z-index:2;top:20px;left:20px;width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.9);color:#777}.image-wrap{height:190px;background:#fff;border-radius:3px;overflow:hidden;display:grid;place-items:center}.image-wrap img{width:100%;height:100%;object-fit:contain}.image-missing{color:#8b8b8b;font-size:12px}.source-card h3{height:40px;margin:10px 0 7px;font-size:13px;line-height:20px;font-weight:600;color:#e8e8e8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.price{color:#ff6a1a;font-size:18px;font-weight:800}.price small{color:#969696;font-size:10px;font-weight:500;margin-left:5px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:5px 9px;margin-top:8px;color:#929997;font-size:11px}.facts span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.facts b{color:#c8cecb;font-weight:500}.badges{display:flex;gap:4px;margin-top:8px;overflow:hidden}.badges i{font-style:normal;font-size:10px;padding:2px 5px;border-radius:3px;background:#513924;color:#ffb17d;white-space:nowrap}.source-card footer{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid #484848;color:#b2b8b5;font-size:11px}.source-card footer span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-card footer b{margin-left:auto;color:#ff6a1a}.empty{margin:60px auto;padding:28px;text-align:center;color:#a3aaa7}.error{margin:30px auto;max-width:520px;padding:18px;border:1px solid #75522f;border-radius:8px;background:#3b3328;color:#f1c993}.error p{line-height:1.6}.error button{display:block;width:100%;margin-top:12px;padding:10px;border:0;border-radius:6px;background:#ff6a1a;color:#fff;cursor:pointer;font-weight:700}.error button.secondary{background:#51463a;color:#f1c993;border:1px solid #8b6b47}.warning{margin:0 0 14px;padding:10px 12px;border:1px solid #6d573b;border-radius:6px;background:#393228;color:#e7c18f;font-size:12px}
  .loading{display:grid;place-items:center;gap:14px;min-height:280px;color:#aeb5b2}.spinner{width:42px;height:42px;border:4px solid #484848;border-top-color:#ff6a1a;border-radius:50%;animation:spin .85s linear infinite}.loading strong{color:#eceeed;font-size:15px}.loading small{color:#838b88}.crop{padding:12px;background:#303030;border:1px solid #4b4b4b;border-radius:7px}.canvas-wrap{position:relative;line-height:0;background:#fff;overflow:hidden}.crop canvas{display:block;width:100%;height:auto;touch-action:none;cursor:crosshair}.selection{position:absolute;display:none;border:2px solid #ff6a1a;background:rgba(255,106,26,.18);pointer-events:none}.crop p{font-size:11px;color:#aaa}.collapsed{position:fixed;left:0;top:42%;width:34px;padding:9px 7px;border:0;border-radius:0 9px 9px 0;background:#ff6a1a;color:#fff;cursor:pointer;writing-mode:vertical-rl;letter-spacing:.05em;font-size:12px;box-shadow:3px 5px 18px rgba(0,0,0,.3)}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:650px){.panel{width:calc(100vw - 38px)}.query-side{width:122px;padding:10px}.query-image{width:100px;height:100px}.header{padding:0 10px}.header-status{margin-left:8px;font-size:11px}.grid{grid-template-columns:1fr}.grid-scroll{padding:10px}}
`;
  function ensureHost() {
    if (host?.isConnected && shadow) return;
    host = document.createElement("aside");
    host.id = "shopscope-1688-sourcing";
    host.style.cssText = "position:fixed;inset:0 auto 0 0;z-index:2147483646;";
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
  }
  function toggleSourcingPanel() {
    ensureHost();
    collapsed = !collapsed;
    render();
  }
  async function firstUseNotice() {
    const stored = await chrome.storage.local.get(NOTICE_KEY).catch(() => ({}));
    if (stored[NOTICE_KEY]) return false;
    await chrome.storage.local.set({ [NOTICE_KEY]: true }).catch(() => void 0);
    return true;
  }
  async function startSourcingSearch(product, queryImageDataUrl) {
    ensureHost();
    collapsed = false;
    cropMode = false;
    showNotice = await firstUseNotice();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    currentJob = { id: `pending-${Date.now()}`, source_product_id: product.product_id, source_title: product.title, source_image_url: product.image_url, query_image_data_url: queryImageDataUrl ?? "", state: "preparing-image", results: [], next_page: 1, has_more: false, official_search_url: "", created_at: timestamp, updated_at: timestamp };
    render();
    const response = await chrome.runtime.sendMessage({ type: "START_1688_IMAGE_SEARCH", product, query_image_data_url: queryImageDataUrl }).catch((error) => ({ ok: false, error: String(error) }));
    if (!response?.ok && currentJob) {
      currentJob.state = "failed";
      currentJob.error = response?.error || "\u65E0\u6CD5\u542F\u52A81688\u56FE\u641C\u3002";
      render();
    }
  }
  function handleSourcingJobUpdate(job) {
    if (!host?.isConnected && job.state !== "cancelled") ensureHost();
    currentJob = job;
    render();
  }
  function render() {
    if (!shadow) return;
    if (collapsed) {
      shadow.innerHTML = `<style>${STYLE}</style><button class="collapsed" aria-label="\u5C55\u5F00ShopScope\u8D27\u6E90\u9762\u677F">ShopScope \xB7 1688 \u8D27\u6E90 \u203A</button>`;
      shadow.querySelector(".collapsed")?.addEventListener("click", () => {
        collapsed = false;
        render();
      });
      return;
    }
    const image = currentJob?.query_image_data_url || currentJob?.source_image_url || "";
    const results = currentJob?.results ?? [];
    const working = Boolean(currentJob && (["preparing-image", "uploading", "searching"].includes(currentJob.state) || currentJob.enrichment_state === "running" && results.length > 0));
    const previousScrollTop = shadow.querySelector(".grid-scroll")?.scrollTop ?? 0;
    const errorState = currentJob?.state === "failed";
    const authState = currentJob?.state === "needs-auth";
    const challengeState = authState && currentJob?.auth_issue === "challenge";
    shadow.innerHTML = `<style>${STYLE}</style><section class="panel">
    <header class="header"><div class="brand">ShopScope <small>1688\u8D27\u6E90</small></div><div class="header-status">${escapeHtml(stateText(currentJob))}</div><div class="header-actions"><button class="icon" data-collapse title="\u6536\u8D77\u9762\u677F" aria-label="\u6536\u8D77\u9762\u677F">\u2039</button><button class="icon" data-close title="\u5173\u95ED\u9762\u677F" aria-label="\u5173\u95ED\u9762\u677F">\xD7</button></div></header>
    <div class="workspace"><aside class="query-side">
      ${cropMode ? '<div class="crop"><div class="canvas-wrap"><canvas></canvas><div class="selection"></div></div><p>\u62D6\u52A8\u6846\u9009\u5546\u54C1\u4E3B\u4F53</p><button class="side-btn primary" data-crop-apply>\u7528\u6846\u9009\u533A\u57DF\u91CD\u641C</button><button class="side-btn" data-crop-cancel>\u53D6\u6D88</button></div>' : `${image ? `<img class="query-image" src="${escapeHtml(image)}" alt="\u641C\u7D22\u56FE\u7247" />` : '<div class="query-image"></div>'}<div class="query-title">${escapeHtml(currentJob?.source_title || "\u5C1A\u672A\u9009\u62E9\u5546\u54C1")}</div><div class="query-source">${currentJob ? "\u6765\u6E90\uFF1ATemu\u5546\u54C1\u56FE\u7247" : "\u70B9\u51FB\u5546\u54C1\u56FE\u7247\u4E0A\u7684\u641C\u56FE\u6309\u94AE"}</div><button class="side-btn" data-crop ${!image || working ? "disabled" : ""}>\u6846\u9009\u4E3B\u4F53</button><button class="side-btn primary" data-retry ${!currentJob || working ? "disabled" : ""}>\u91CD\u65B0\u641C\u7D22</button>${showNotice ? '<div class="notice">\u70B9\u51FB\u641C\u56FE\u540E\uFF0C\u4EC5\u5C06\u5F53\u524D\u5546\u54C1\u56FE\u7247\u63D0\u4EA4\u7ED91688\u5B98\u65B9\u56FE\u7247\u641C\u7D22\u3002\u63D2\u4EF6\u4E0D\u4FDD\u5B58\u8D26\u53F7\u5BC6\u7801\u6216\u5B8C\u6574Cookie\u3002</div>' : ""}`}
    </aside><main class="results">
      <div class="toolbar"><span class="sort active official-order">1688\u63A8\u8350\u987A\u5E8F</span><span class="result-count">${results.length ? `${results.length} \u6761\u7ED3\u679C${currentJob?.enrichment_state === "running" ? " \xB7 \u6B63\u5728\u8865\u5145\u2026" : currentJob?.enrichment_state === "partial" ? " \xB7 \u66F4\u591A\u7ED3\u679C\u6682\u4E0D\u53EF\u7528" : ""}` : ""}</span></div>
      <div class="grid-scroll">
        ${!cropMode && authState ? `<div class="error"><strong>${challengeState ? "1688\u6682\u65F6\u9650\u5236\u8BBF\u95EE" : "\u9700\u8981\u8FDE\u63A51688"}</strong><p>${challengeState ? "1688\u5F53\u524D\u8FD4\u56DE\u4E86\u5B89\u5168\u9A8C\u8BC1\u6216\u8BBF\u95EE\u9650\u5236\u3002\u8BF7\u5728\u5DF2\u6709\u76841688\u9875\u9762\u5B8C\u6210\u9A8C\u8BC1\uFF0C\u63D2\u4EF6\u4E0D\u4F1A\u53CD\u590D\u5F39\u51FA\u767B\u5F55\u7A97\u53E3\u3002" : "\u63D2\u4EF6\u6CA1\u6709\u68C0\u6D4B\u5230\u5F53\u524D\u6D4F\u89C8\u5668\u53EF\u7528\u76841688\u767B\u5F55\u72B6\u6001\u3002\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u540E\uFF0C\u4F1A\u4F18\u5148\u4F7F\u7528\u5DF2\u7ECF\u6253\u5F00\u76841688\u9875\u9762\uFF1B\u767B\u5F55\u5B8C\u6210\u540E\u63D2\u4EF6\u4F1A\u81EA\u52A8\u7EE7\u7EED\u672C\u6B21\u641C\u56FE\u3002"}</p><small>${escapeHtml(currentJob?.error || (challengeState ? "\u8BF7\u57281688\u9875\u9762\u5B8C\u6210\u9A8C\u8BC1\u540E\u91CD\u65B0\u68C0\u6D4B\u3002" : "\u8BF7\u5148\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u767B\u5F551688\u3002"))}</small><button data-recheck>${challengeState ? "\u6211\u5DF2\u5B8C\u6210\u9A8C\u8BC1\uFF0C\u91CD\u65B0\u68C0\u6D4B" : "\u6211\u5DF2\u767B\u5F55\uFF0C\u91CD\u65B0\u68C0\u6D4B"}</button><button class="secondary" data-reopen-login>${challengeState ? "\u6253\u5F00\u5DF2\u67091688\u9875\u9762" : "\u8FDE\u63A51688"}</button></div>` : ""}
        ${!cropMode && errorState ? `<div class="error">${escapeHtml(currentJob?.error || "1688\u56FE\u641C\u6682\u65F6\u5931\u8D25\u3002")}<button data-official>\u6253\u5F001688\u5B98\u65B9\u641C\u56FE\u9875</button></div>` : ""}
        ${!cropMode && !errorState && working ? `<div class="loading"><div class="spinner"></div><strong>${escapeHtml(stateText(currentJob))}</strong><small>${results.length ? "\u6B63\u5728\u6574\u7406\u5B98\u65B9\u7ED3\u679C\uFF0C\u5B8C\u6210\u540E\u663E\u793A\u5B8C\u6574\u5361\u7247" : "Temu\u9875\u9762\u4E0D\u4F1A\u8DF3\u8F6C\uFF0C\u8BF7\u7A0D\u5019"}</small></div>` : ""}
        ${!cropMode && !errorState && !working && !results.length ? `<div class="empty">${escapeHtml(currentJob?.error || "1688\u672C\u6B21\u786E\u5B9E\u6CA1\u6709\u8FD4\u56DE\u76F8\u4F3C\u8D27\u6E90\uFF0C\u53EF\u4EE5\u6846\u9009\u5546\u54C1\u4E3B\u4F53\u540E\u91CD\u65B0\u641C\u7D22\u3002")}</div>` : ""}
        ${!cropMode && !errorState && results.length && (currentJob?.error || currentJob?.enrichment_error) ? `<div class="warning">${escapeHtml(currentJob.enrichment_error || currentJob.error || "")}</div>` : ""}
        ${!cropMode && !working && results.length ? `<div class="grid">${results.map(cardMarkup).join("")}</div>` : ""}
      </div>
    </main></div>
  </section>`;
    bindEvents();
    const nextScroll = shadow.querySelector(".grid-scroll");
    if (nextScroll && previousScrollTop > 0) nextScroll.scrollTop = previousScrollTop;
    if (cropMode) void initializeCropCanvas();
  }
  function bindEvents() {
    if (!shadow) return;
    shadow.querySelector("[data-close]")?.addEventListener("click", () => {
      collapsed = true;
      render();
    });
    shadow.querySelector("[data-collapse]")?.addEventListener("click", () => {
      collapsed = true;
      render();
    });
    shadow.querySelector("[data-retry]")?.addEventListener("click", () => {
      if (currentJob) void startSourcingSearch({ product_id: currentJob.source_product_id, title: currentJob.source_title, image_url: currentJob.source_image_url }, currentJob.query_image_data_url || void 0);
    });
    shadow.querySelector("[data-crop]")?.addEventListener("click", () => {
      void openCrop();
    });
    shadow.querySelector("[data-crop-cancel]")?.addEventListener("click", () => {
      cropMode = false;
      render();
    });
    shadow.querySelector("[data-recheck]")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "RECHECK_1688_LOGIN" });
    });
    shadow.querySelector("[data-reopen-login]")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "REOPEN_1688_LOGIN" });
    });
    shadow.querySelector("[data-official]")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "OPEN_1688_OFFICIAL_SEARCH" });
    });
    for (const card of shadow.querySelectorAll(".source-card")) {
      const open = () => {
        if (card.dataset.offerId) void chrome.runtime.sendMessage({ type: "OPEN_1688_OFFER", offer_id: card.dataset.offerId });
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") open();
      });
    }
  }
  async function openCrop() {
    if (!currentJob) return;
    cropSource = currentJob.query_image_data_url;
    if (!cropSource) {
      const response = await chrome.runtime.sendMessage({ type: "PREPARE_SOURCE_IMAGE", image_url: currentJob.source_image_url });
      if (!response?.ok) {
        currentJob.error = response?.error || "\u65E0\u6CD5\u8BFB\u53D6\u539F\u56FE\u3002";
        currentJob.state = "failed";
        render();
        return;
      }
      cropSource = response.data_url;
    }
    cropMode = true;
    render();
  }
  async function initializeCropCanvas() {
    const canvas = shadow?.querySelector("canvas");
    const selection = shadow?.querySelector(".selection");
    if (!canvas || !selection || !cropSource) return;
    const image = new Image();
    image.src = cropSource;
    await image.decode().catch(() => void 0);
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    let sx = 0;
    let sy = 0;
    let ex = 0;
    let ey = 0;
    let dragging = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) };
    };
    const paint = () => {
      selection.style.display = "block";
      selection.style.left = `${Math.min(sx, ex)}px`;
      selection.style.top = `${Math.min(sy, ey)}px`;
      selection.style.width = `${Math.abs(ex - sx)}px`;
      selection.style.height = `${Math.abs(ey - sy)}px`;
    };
    canvas.addEventListener("pointerdown", (event) => {
      const p = point(event);
      sx = ex = p.x;
      sy = ey = p.y;
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      paint();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const p = point(event);
      ex = p.x;
      ey = p.y;
      paint();
    });
    canvas.addEventListener("pointerup", (event) => {
      dragging = false;
      canvas.releasePointerCapture(event.pointerId);
    });
    shadow?.querySelector("[data-crop-apply]")?.addEventListener("click", () => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(sx, ex) * canvas.width / rect.width;
      const y = Math.min(sy, ey) * canvas.height / rect.height;
      const width = Math.abs(ex - sx) * canvas.width / rect.width;
      const height = Math.abs(ey - sy) * canvas.height / rect.height;
      if (width < 20 || height < 20 || !currentJob) return;
      const output = document.createElement("canvas");
      output.width = Math.round(width);
      output.height = Math.round(height);
      output.getContext("2d")?.drawImage(canvas, x, y, width, height, 0, 0, output.width, output.height);
      void startSourcingSearch({ product_id: currentJob.source_product_id, title: currentJob.source_title, image_url: currentJob.source_image_url }, output.toDataURL("image/jpeg", 0.88));
    });
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "SOURCING_JOB_UPDATED" && message.job) handleSourcingJobUpdate(message.job);
    });
    void chrome.runtime.sendMessage({ type: "GET_1688_IMAGE_SEARCH_JOB" }).then((response) => {
      if (response?.job && !["cancelled", "idle"].includes(response.job.state)) handleSourcingJobUpdate(response.job);
    }).catch(() => void 0);
  }

  // src/temu-product-search.ts
  var BUTTON_ID = "shopscope-temu-image-search-button";
  var PRODUCT_PATH = /(?:^|\/)(?:product|goods|product_image|product-detail)\//i;
  var CARD_SELECTORS = [
    "[data-goods-id]",
    "[data-product-id]",
    '[class*="product-item"]',
    '[class*="goods-item"]',
    "._3nm8E1o6",
    ".ueQ3rCYG"
  ].join(",");
  var host2;
  var activeImage;
  function productImage(image) {
    if (!image.isConnected) return false;
    const raw = image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || "";
    if (!raw) return false;
    try {
      const url = new URL(raw, location.href);
      return /(^|\.)kwcdn\.com$/i.test(url.hostname) && PRODUCT_PATH.test(url.pathname);
    } catch {
      return false;
    }
  }
  function productCard(image) {
    return image.closest(CARD_SELECTORS) ?? image.parentElement ?? image;
  }
  function productId(image, card) {
    for (const anchor of [image.closest("a"), ...card.querySelectorAll("a")]) {
      if (!anchor?.href) continue;
      try {
        const url = new URL(anchor.href, location.href);
        for (const key of ["goods_id", "goodsId", "product_id", "productId", "item_id", "itemId"]) {
          const value2 = url.searchParams.get(key);
          if (value2) return value2.slice(0, 120);
        }
        const match = url.pathname.match(/(?:goods|product)[^\d]*(\d{6,})/i);
        if (match) return match[1];
      } catch {
      }
    }
    return image.dataset.goodsId || image.dataset.productId || image.currentSrc.slice(-80) || `temu-${Date.now()}`;
  }
  function productSnapshot(image) {
    if (!productImage(image)) return void 0;
    const card = productCard(image);
    const imageUrl = canonicalizeUrl(image.currentSrc || image.getAttribute("src") || image.getAttribute("data-src") || "");
    if (!imageUrl) return void 0;
    const alt = cleanText(image.alt);
    const title = alt && alt.toLowerCase() !== "image" ? alt : cleanText(image.getAttribute("title") || card.querySelector("[title]")?.getAttribute("title") || card.textContent).slice(0, 180) || "Temu\u5546\u54C1";
    return { product_id: productId(image, card), title, image_url: imageUrl };
  }
  function positionButton(image) {
    if (!host2) return;
    const rect = image.getBoundingClientRect();
    if (rect.width < 70 || rect.height < 70 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) {
      hideButton();
      return;
    }
    host2.style.display = "block";
    host2.style.left = `${Math.min(innerWidth - 40, Math.max(4, rect.right - 38))}px`;
    host2.style.top = `${Math.max(4, rect.top + 6)}px`;
  }
  function hideButton() {
    if (host2 && !host2.matches(":focus-within")) host2.style.display = "none";
    activeImage = void 0;
  }
  function installButton() {
    if (host2?.isConnected) return;
    host2 = document.createElement("span");
    host2.id = BUTTON_ID;
    host2.style.cssText = "position:fixed;z-index:2147483645;display:none;pointer-events:auto;";
    const shadow2 = host2.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(0,0,0,.18);border-radius:50%;background:#fff;color:#146b55;box-shadow:0 2px 8px rgba(0,0,0,.24);cursor:pointer}button:hover{background:#e9f5f0}svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2}`;
    const button = document.createElement("button");
    button.type = "button";
    button.title = "\u7528\u6B64\u5546\u54C1\u56FE\u7247\u641C\u7D221688\u8D27\u6E90";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>';
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const product = activeImage && productSnapshot(activeImage);
      if (product) void startSourcingSearch(product);
    });
    host2.addEventListener("pointerleave", hideButton);
    shadow2.append(style, button);
    document.documentElement.appendChild(host2);
  }
  function onPointerOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !productImage(target)) return;
    activeImage = target;
    positionButton(target);
  }
  function onFocusIn(event) {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !productImage(target)) return;
    activeImage = target;
    positionButton(target);
  }
  function onTogglePanel(message) {
    if (message?.type !== "TOGGLE_SHOP_SCOPE_PANEL") return false;
    toggleSourcingPanel();
    return true;
  }
  function installTemuProductSearch() {
    installButton();
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", (event) => {
      const target = event.target;
      if (target === activeImage && event.relatedTarget !== host2) hideButton();
    }, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", (event) => {
      if (event.target === activeImage && event.relatedTarget !== host2) hideButton();
    }, true);
    window.addEventListener("scroll", () => activeImage && positionButton(activeImage), true);
    window.addEventListener("resize", () => activeImage && positionButton(activeImage));
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (onTogglePanel(message)) {
        sendResponse({ ok: true });
        return true;
      }
      return void 0;
    });
  }

  // src/content.ts
  if (/^https:\/\/www\.temu\.com\//i.test(location.href)) installTemuProductSearch();
})();
