"use strict";
(() => {
  // src/shared/md5.ts
  var SHIFTS = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  var CONSTANTS = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0);
  function rotateLeft(value, shift) {
    return (value << shift | value >>> 32 - shift) >>> 0;
  }
  function wordHex(value) {
    return [0, 8, 16, 24].map((shift) => (value >>> shift & 255).toString(16).padStart(2, "0")).join("");
  }
  function md5(input) {
    const source = new TextEncoder().encode(input);
    const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(source);
    bytes[source.length] = 128;
    const bitLength = BigInt(source.length) * 8n;
    for (let index = 0; index < 8; index += 1) bytes[paddedLength - 8 + index] = Number(bitLength >> BigInt(index * 8) & 0xffn);
    let a0 = 1732584193;
    let b0 = 4023233417;
    let c0 = 2562383102;
    let d0 = 271733878;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Uint32Array(16);
      for (let index = 0; index < 16; index += 1) {
        const start = offset + index * 4;
        words[index] = (bytes[start] | bytes[start + 1] << 8 | bytes[start + 2] << 16 | bytes[start + 3] << 24) >>> 0;
      }
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f;
        let wordIndex;
        if (index < 16) {
          f = b & c | ~b & d;
          wordIndex = index;
        } else if (index < 32) {
          f = d & b | ~d & c;
          wordIndex = (5 * index + 1) % 16;
        } else if (index < 48) {
          f = b ^ c ^ d;
          wordIndex = (3 * index + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          wordIndex = 7 * index % 16;
        }
        const previousD = d;
        d = c;
        c = b;
        b = b + rotateLeft(a + f + CONSTANTS[index] + words[wordIndex] >>> 0, SHIFTS[index]) >>> 0;
        a = previousD;
      }
      a0 = a0 + a >>> 0;
      b0 = b0 + b >>> 0;
      c0 = c0 + c >>> 0;
      d0 = d0 + d >>> 0;
    }
    return wordHex(a0) + wordHex(b0) + wordHex(c0) + wordHex(d0);
  }

  // src/shared/normalize.ts
  var RESIZE_PARAM_NAMES = /* @__PURE__ */ new Set(["width", "height", "w", "h", "size", "quality", "format"]);
  function cleanText(value) {
    if (value === null || value === void 0 || typeof value === "object") return "";
    return String(value).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
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

  // src/sourcing-api.ts
  var MTOP_APP_KEY = "12574478";
  var IMAGE_UPLOAD_API = "mtop.1688.imageService.putImage";
  var IMAGE_UPLOAD_URL = "https://h5api.m.1688.com/h5/mtop.1688.imageservice.putimage/1.0/";
  var IMAGE_SEARCH_URL = "https://search.1688.com/service/imageSearchOfferResultViewService";
  function parseJsonResponse(text) {
    const trimmed = text.trim();
    if (isAccessChallenge(trimmed)) {
      const issue = /login\.1688\.com|member\/signin|请登录|登录后继续/i.test(trimmed) ? "login" : "challenge";
      throw new Error(`NEEDS_AUTH:1688\u8981\u6C42\u5B8C\u6210\u767B\u5F55\u6216\u5B89\u5168\u9A8C\u8BC1\uFF0C\u8BF7\u5904\u7406\u540E\u91CD\u65B0\u641C\u7D22\u3002 [issue=${issue}]`);
    }
    try {
      return JSON.parse(trimmed);
    } catch {
    }
    const start = trimmed.indexOf("(");
    const end = trimmed.lastIndexOf(")");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start + 1, end));
    throw new Error("1688\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u6570\u636E\u683C\u5F0F\u3002");
  }
  function isAccessChallenge(text) {
    if (!text) return false;
    const sample = text.slice(0, 25e4);
    const challengeMarker = /_____tmd_____|(?:\/|\b)punish(?:\/|\b)|["']action["']\s*:\s*["']captcha|x5secdata|验证码|安全验证/i;
    const authPageMarker = /login\.1688\.com|member\/signin|请登录|登录后继续/i;
    return challengeMarker.test(sample) || /<(?:html|script)\b/i.test(sample) && authPageMarker.test(sample);
  }
  function responseError(data) {
    const values = Array.isArray(data?.ret) ? data.ret : [data?.ret, data?.msg, data?.message];
    return values.filter(Boolean).map(String).join("\uFF1B");
  }
  function isTokenError(data) {
    return /TOKEN|SESSION_EXPIRED|NOT_LOGIN|登录/i.test(responseError(data));
  }
  function isAuthOrChallengeError(data) {
    return isTokenError(data) || /FAIL_SYS_USER_VALIDATE|RGV587|CAPTCHA|安全|验证|PUNISH|X5SECDATA/i.test(responseError(data));
  }
  async function mtopToken() {
    const byUrl = await chrome.cookies.getAll({ url: "https://h5api.m.1688.com/", name: "_m_h5_tk" }).catch(() => []);
    const byDomain = await chrome.cookies.getAll({ domain: "1688.com", name: "_m_h5_tk" }).catch(() => []);
    const cookie = [...byUrl, ...byDomain].find((item) => item.value);
    return decodeURIComponent(cookie?.value ?? "").split("_")[0]?.trim() ?? "";
  }
  async function hasOfficial1688Session() {
    return Boolean(await mtopToken());
  }
  async function rawUploadRequest(body, token) {
    const time = Date.now().toString();
    const url = new URL(IMAGE_UPLOAD_URL);
    const params = {
      jsv: "2.7.2",
      appKey: MTOP_APP_KEY,
      t: time,
      sign: token ? md5(`${token}&${time}&${MTOP_APP_KEY}&${body}`) : "",
      api: IMAGE_UPLOAD_API,
      ecode: "0",
      v: "1.0",
      type: "originaljson",
      dataType: "jsonp"
    };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(body)}`
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`1688\u56FE\u7247\u4E0A\u4F20\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
    return parseJsonResponse(text);
  }
  function findImageSession(value, depth = 0) {
    if (!value || depth > 8) return void 0;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findImageSession(item, depth + 1);
        if (found) return found;
      }
      return void 0;
    }
    if (typeof value !== "object") return void 0;
    const record = value;
    const imageId = cleanText(record.imageId ?? record.image_id ?? record.result);
    if (imageId && imageId.length >= 8) {
      return {
        image_id: imageId,
        ...record.requestId ? { request_id: cleanText(record.requestId) } : {},
        ...record.sessionId ? { session_id: cleanText(record.sessionId) } : {}
      };
    }
    for (const child of Object.values(record)) {
      const found = findImageSession(child, depth + 1);
      if (found) return found;
    }
    return void 0;
  }
  async function uploadImageToOfficial1688(dataUrl) {
    const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/i, "");
    if (!base64 || base64.length < 100) throw new Error("\u5F85\u641C\u7D22\u56FE\u7247\u5185\u5BB9\u65E0\u6548\u3002");
    const body = JSON.stringify({ imageBase64: base64, appName: "searchImageUpload", appKey: "pvvljh1grxcmaay2vgpe9nb68gg9ueg2" });
    let token = await mtopToken();
    if (!token) {
      await rawUploadRequest(body, "").catch(() => void 0);
      token = await mtopToken();
    }
    if (!token) throw new Error("NEEDS_AUTH:\u8BF7\u5148\u5728\u5F53\u524D\u6D4F\u89C8\u5668\u767B\u5F551688\uFF0C\u518D\u91CD\u65B0\u641C\u7D22\u3002 [issue=login]");
    let response = await rawUploadRequest(body, token);
    if (isTokenError(response)) {
      token = await mtopToken();
      if (token) response = await rawUploadRequest(body, token);
    }
    const session = findImageSession(response);
    if (!session) {
      const reason = responseError(response);
      if (isAuthOrChallengeError(response)) {
        const issue = isTokenError(response) ? "session" : "challenge";
        throw new Error(`NEEDS_AUTH:${reason || "1688\u767B\u5F55\u72B6\u6001\u5DF2\u5931\u6548\u6216\u9700\u8981\u5B89\u5168\u9A8C\u8BC1\u3002"} [issue=${issue}]`);
      }
      throw new Error(reason || "1688\u6CA1\u6709\u8FD4\u56DE\u56FE\u7247\u8BC6\u522B\u7F16\u53F7\u3002");
    }
    return session;
  }
  function pathValue(source, paths) {
    for (const path of paths) {
      let value = source;
      for (const part of path.split(".")) value = value && typeof value === "object" ? value[part] : void 0;
      if (value !== void 0 && value !== null && value !== "") return value;
    }
    return void 0;
  }
  function objectValue(source, keys) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return void 0;
    const record = source;
    for (const key of keys) {
      const exact = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
      if (exact && record[exact] !== void 0 && record[exact] !== null && record[exact] !== "") return record[exact];
    }
    return void 0;
  }
  function displayText(raw, keys = ["display", "text", "value", "name", "title", "label"], depth = 0) {
    if (depth > 4 || raw === null || raw === void 0) return "";
    const primitive = cleanText(raw);
    if (primitive) return primitive;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const text = displayText(item, keys, depth + 1);
        if (text) return text;
      }
      return "";
    }
    if (typeof raw !== "object") return "";
    for (const key of keys) {
      const child = objectValue(raw, [key]);
      const text = displayText(child, keys, depth + 1);
      if (text) return text;
    }
    return "";
  }
  function textFromPaths(source, paths, keys) {
    for (const path of paths) {
      const text = displayText(pathValue(source, [path]), keys);
      if (text) return text;
    }
    return "";
  }
  function imageUrlFrom(raw, depth = 0) {
    if (depth > 4 || raw === null || raw === void 0) return "";
    const direct = cleanText(raw);
    if (direct && /^(?:https?:)?\/\//i.test(direct)) return direct;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const value = imageUrlFrom(item, depth + 1);
        if (value) return value;
      }
      return "";
    }
    if (typeof raw !== "object") return "";
    for (const key of ["url", "imageUrl", "image_url", "src", "originUrl", "original", "originalUrl", "bigImage", "mainImage", "productImage", "picUrl"]) {
      const value = imageUrlFrom(objectValue(raw, [key]), depth + 1);
      if (value) return value;
    }
    return "";
  }
  function numericValue(raw) {
    const text = displayText(raw, ["display", "value", "count", "num", "amount", "text"]).replace(/,/g, "");
    const match = text.match(/(\d+(?:\.\d+)?)\s*([万千KkMm])?/);
    if (!match) return void 0;
    const multiplier = match[2] === "\u4E07" ? 1e4 : match[2] === "\u5343" || match[2]?.toLowerCase() === "k" ? 1e3 : match[2]?.toLowerCase() === "m" ? 1e6 : 1;
    const value = Number(match[1]) * multiplier;
    return Number.isFinite(value) ? value : void 0;
  }
  function formatPrice(raw) {
    const text = displayText(raw, ["display", "price", "value", "minPrice", "min", "text"]);
    const values = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter(Number.isFinite);
    if (values.length === 0) return void 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const money = (value) => `\xA5${value.toFixed(2).replace(/\.00$/, "")}`;
    return { display: min === max ? money(min) : `${money(min)}\u2013${money(max)}`, min, max, kind: "page-quote" };
  }
  function normalizedDisplay(raw, suffix = "") {
    const text = displayText(raw, ["display", "value", "text", "count", "num", "amount", "name", "title"]);
    return text ? `${text}${suffix && !text.includes(suffix) ? suffix : ""}` : void 0;
  }
  function percentDisplay(raw) {
    const text = displayText(raw, ["display", "value", "rate", "ratio", "text"]);
    const numeric = numericValue(raw);
    if (!text || numeric === void 0) return {};
    const value = numeric > 0 && numeric <= 1 && !text.includes("%") ? numeric * 100 : numeric;
    return { display: `${Number(value.toFixed(2))}%`, value };
  }
  function badgesFromOffer(offer) {
    const raw = pathValue(offer, ["badges", "tags", "offerIdentities", "sellerIdentities", "serviceTags", "tagList"]);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => displayText(item, ["text", "name", "label", "title", "value"])).filter(Boolean).slice(0, 4);
  }
  function offerId(offer) {
    const direct = cleanText(pathValue(offer, [
      "id",
      "offerId",
      "offer_id",
      "productId",
      "product_id",
      "sku_id",
      "skuId",
      "itemId",
      "information.id"
    ]));
    if (/^\d{8,}$/.test(direct)) return direct;
    const link = cleanText(pathValue(offer, [
      "href",
      "real_url",
      "realUrl",
      "detailUrl",
      "productUrl",
      "url",
      "information.productUrl"
    ]));
    return link.match(/(?:offer\/|offerId=|[?&](?:id|offer_id)=)(\d{8,})/i)?.[1] ?? "";
  }
  function normalizeOfficial1688Offer(offer) {
    const id = offerId(offer);
    if (!id) return void 0;
    const imageRaw = pathValue(offer, ["picture", "imageUrl", "mainImage", "picUrl", "imgUrl", "offerPicUrl", "image.productImage", "image.url", "image", "pictures", "media"]);
    const image = canonicalizeUrl(imageUrlFrom(imageRaw), "https://www.1688.com/");
    const price = formatPrice(pathValue(offer, ["price", "priceDisplay", "tradePrice.price", "priceInfo.price", "showPrice", "discountPrice", "priceInfo", "tradePrice"]));
    const salesRaw = pathValue(offer, ["yearSales", "yearSale", "annualSales", "monthSold", "monthSales", "saleQuantity", "sold", "soldCount", "salesCount", "tradeQuantity", "bookedCount", "sales"]);
    const repurchaseRaw = pathValue(offer, ["repurchaseRate", "repurchaseRatio", "repeatPurchaseRate", "repeatPurchaseRatio", "returnRate"]);
    const repurchase = percentDisplay(repurchaseRaw);
    const minimumRaw = pathValue(offer, ["minOrderQuantity", "minOrder", "tradePrice.minOrder", "quantityBegin", "beginAmount", "moq"]);
    const yearsRaw = pathValue(offer, ["shops.opened_year", "shops.tpyear", "shops.tpYear", "supplier.supplierYear", "supplier.tpYear", "supplierYear", "tpYear", "companyYear", "shopInfo.tpYear", "companyInfo.tpYear"]);
    const years = normalizedDisplay(yearsRaw);
    const title = textFromPaths(offer, ["title", "subject", "offerTitle", "information.title", "information", "productInfo"]);
    return {
      offer_id: id,
      title: title || `1688 \u5546\u54C1 ${id}`,
      image_url: image || "",
      detail_url: `https://detail.1688.com/offer/${id}.html`,
      price,
      sales: normalizedDisplay(salesRaw),
      sales_value: numericValue(salesRaw),
      minimum_order: normalizedDisplay(minimumRaw, "\u4EF6\u8D77\u6279"),
      repurchase_rate: repurchase.display,
      repurchase_rate_value: repurchase.value,
      shipping_time: normalizedDisplay(pathValue(offer, ["shippingTimeGuarantee", "shipSpeed", "shipTime", "deliveryTime", "fahuoTime", "shipWithinHours", "deliveryPromise", "shippingInfo"])),
      supplier_years: years ? /年/.test(years) ? years : `\u5165\u9A7B${years}\u5E74` : void 0,
      listed_at: normalizedDisplay(pathValue(offer, ["createDate", "publishTime", "listedAt", "onlineTime", "addTime", "offerCreateTime"])),
      supplier_name: normalizedDisplay(pathValue(offer, ["shops.shop_name", "shops.company_name", "supplier.supplierName", "supplier.companyName", "supplierName", "companyName", "shopName", "sellerName", "shopInfo.shopName", "companyInfo.companyName", "supplier", "shops"])),
      badges: badgesFromOffer(offer)
    };
  }
  function findOfferPayload(value, depth = 0) {
    if (!value || depth > 8) return void 0;
    if (typeof value === "object" && !Array.isArray(value)) {
      const record = value;
      const offers = record.offerList ?? record.offers;
      if (Array.isArray(offers)) return { offers, pageCount: Number(record.pageCount) || void 0, requestId: cleanText(record.requestId), sessionId: cleanText(record.sessionId) };
      for (const child of Object.values(record)) {
        const found = findOfferPayload(child, depth + 1);
        if (found) return found;
      }
    }
    if (Array.isArray(value)) for (const child of value) {
      const found = findOfferPayload(child, depth + 1);
      if (found) return found;
    }
    return void 0;
  }
  async function searchOfficial1688(session, page = 1, pageSize = 20) {
    const url = new URL(IMAGE_SEARCH_URL);
    const params = {
      tab: "imageSearch",
      imageId: session.image_id,
      imageIdList: session.image_id,
      filt: "y",
      beginPage: String(page),
      pageSize: String(pageSize),
      pageName: "image"
    };
    if (session.request_id) params.requestId = session.request_id;
    if (session.session_id) params.sessionId = session.session_id;
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json, text/plain, */*" } });
    const text = await response.text();
    if (!response.ok) throw new Error(`1688\u56FE\u641C\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
    const data = parseJsonResponse(text);
    const payload = findOfferPayload(data);
    if (!payload) {
      const reason = responseError(data);
      if (isAuthOrChallengeError(data)) {
        const issue = isTokenError(data) ? "session" : "challenge";
        throw new Error(`NEEDS_AUTH:${reason || "1688\u8981\u6C42\u5B8C\u6210\u767B\u5F55\u6216\u5B89\u5168\u9A8C\u8BC1\u3002"} [issue=${issue}]`);
      }
      throw new Error(reason || "1688\u56FE\u641C\u7ED3\u679C\u7ED3\u6784\u6682\u65F6\u65E0\u6CD5\u8BC6\u522B\u3002");
    }
    const results = payload.offers.map(normalizeOfficial1688Offer).filter((item) => Boolean(item));
    const diagnostics = {
      raw_offer_count: payload.offers.length,
      normalized_count: results.length,
      dropped_count: payload.offers.length - results.length,
      dropped_missing_identity: payload.offers.filter((offer) => !offerId(offer)).length,
      missing_image_count: results.filter((item) => !item.image_url).length,
      complete_card_count: results.filter((item) => Boolean(item.image_url && !item.title.startsWith("1688 \u5546\u54C1 ") && item.price)).length
    };
    return {
      results,
      session: { image_id: session.image_id, request_id: payload.requestId || session.request_id, session_id: payload.sessionId || session.session_id },
      has_more: payload.pageCount ? page < payload.pageCount : payload.offers.length >= pageSize,
      diagnostics
    };
  }

  // src/sourcing-dom.ts
  function readOfficialImageSearchCards() {
    const cards = [...document.querySelectorAll('[class*="searchOfferWrapper"]')];
    const seen = /* @__PURE__ */ new Set();
    const textOf = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();
    return cards.flatMap((card) => {
      const links = [...card.querySelectorAll('a[href*="detail.1688.com/offer/"], a[href*="offerId="]')];
      const href = links.find((link) => /(?:\/offer\/|[?&]offerId=)\d{8,}/i.test(link.href))?.href ?? "";
      const id = href.match(/(?:\/offer\/|[?&]offerId=)(\d{8,})/i)?.[1] ?? "";
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const text = (card.innerText || card.textContent || "").replace(/\s+/g, " ").trim();
      const desc = [...card.querySelectorAll('[class*="descText"]')].map((item) => (item.innerText || item.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const sales = desc.find((item) => /^(?:\d+(?:\.\d+)?(?:万|千|[Kk])?\+?)件$/.test(item));
      const minimum = desc.find((item) => /^\d+件起批$/.test(item));
      const repurchase = desc.find((item) => /^回头率\s*\d+(?:\.\d+)?%$/.test(item));
      const shipping = desc.find((item) => /(?:\d+H发|\d+小时发|\d+天达|后天达)/i.test(item));
      const supplierRow = textOf(card.querySelector('[class*="offerShopRow"]'));
      const years = supplierRow.match(/入驻\s*(\d+)\s*年/)?.[1];
      const supplier = supplierRow.replace(/^入驻\s*\d+\s*年\s*/, "").replace(/旺旺在线.*$/u, "").trim();
      const title = textOf(card.querySelector('[class*="titleText"], [class*="offerTitle"], [class*="subject"]'));
      const image = card.querySelector('img.mainImg, img[class*="mainImg"], img[src]');
      const priceCandidates = [...card.querySelectorAll('[class*="priceItem"], [class*="price-item"], [class*="priceValue"], [class*="offerPrice"]')].filter((element) => !element.querySelector('[class*="descText"], [class*="offerDesc"]')).sort((left, right) => left.querySelectorAll("*").length - right.querySelectorAll("*").length);
      const priceText = priceCandidates[0]?.textContent || card.textContent || text;
      const normalizedPriceText = priceText.replace(/\s+/g, " ").replace(/(\d)\s*\.\s*(\d)/g, "$1.$2").replace(/([¥￥])\s+/g, "$1");
      const priceMatch = normalizedPriceText.match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)(?:\s*[-–~至]\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?))?/);
      const price = priceMatch ? priceMatch[2] ? `${priceMatch[1]}-${priceMatch[2]}` : priceMatch[1] : void 0;
      return [{
        offer_id: id,
        href,
        real_url: href,
        picture: image?.currentSrc || image?.src || "",
        title,
        price: price || void 0,
        sales: sales || void 0,
        minOrderQuantity: minimum || void 0,
        repurchaseRate: repurchase || void 0,
        shippingTimeGuarantee: shipping || void 0,
        shops: { opened_year: years, shop_name: supplier }
      }];
    });
  }

  // src/sourcing-order.ts
  function mergeOfficialResult(primary, fallback) {
    if (!fallback) return primary;
    return {
      ...primary,
      title: primary.title.startsWith("1688 \u5546\u54C1 ") && !fallback.title.startsWith("1688 \u5546\u54C1 ") ? fallback.title : primary.title,
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
      badges: primary.badges.length ? primary.badges : fallback.badges
    };
  }
  function mergeOfficialResultsInOrder(apiResults, officialResults) {
    const apiById = new Map(apiResults.map((item) => [item.offer_id, item]));
    const officialIds = new Set(officialResults.map((item) => item.offer_id));
    return officialResults.map((item) => mergeOfficialResult(apiById.get(item.offer_id) ?? item, item)).concat(apiResults.filter((item) => !officialIds.has(item.offer_id)));
  }

  // src/sourcing-background.ts
  var OFFICIAL_SEARCH_URL = "https://air.1688.com/kapp/1688-search/pc-image-search/?tab=imageSearch";
  var SESSION_KEY = "shopscope-active-1688-image-search-v1";
  var SOURCING_MESSAGES = /* @__PURE__ */ new Set([
    "START_1688_IMAGE_SEARCH",
    "CANCEL_1688_IMAGE_SEARCH",
    "GET_1688_IMAGE_SEARCH_JOB",
    "OPEN_1688_LOGIN",
    "OPEN_1688_OFFICIAL_SEARCH",
    "OPEN_1688_OFFER",
    "PREPARE_SOURCE_IMAGE",
    "RECHECK_1688_LOGIN",
    "REOPEN_1688_LOGIN"
  ]);
  var currentJob;
  var generation = 0;
  var authResumeInFlight = false;
  var recoveryPromise = restoreSourcingSession();
  chrome.cookies.onChanged.addListener((change) => {
    if (change.cookie.name === "_m_h5_tk" && /(^|\.)1688\.com$/i.test(change.cookie.domain)) void resumeAfterAuthentication();
  });
  function isSourcingMessage(message) {
    return SOURCING_MESSAGES.has(String(message?.type ?? ""));
  }
  async function handleSourcingMessage(message, sender) {
    await recoveryPromise;
    if (message.type === "START_1688_IMAGE_SEARCH") return startImageSearch(message.product, message.query_image_data_url, sender.tab?.id, message.request_id);
    if (message.type === "CANCEL_1688_IMAGE_SEARCH") {
      await cancelCurrentJob();
      return { ok: true };
    }
    if (message.type === "GET_1688_IMAGE_SEARCH_JOB") return { ok: true, job: currentJob && (!sender.tab?.id || currentJob.source_tab_id === sender.tab.id) ? currentJob : void 0 };
    if (message.type === "OPEN_1688_LOGIN") {
      await openLoginWindow();
      return { ok: true };
    }
    if (message.type === "REOPEN_1688_LOGIN") {
      await openLoginWindow();
      return { ok: true };
    }
    if (message.type === "RECHECK_1688_LOGIN") {
      const connected = await resumeAfterAuthentication();
      return { ok: connected, connected, error: connected ? void 0 : "\u5C1A\u672A\u68C0\u6D4B\u52301688\u767B\u5F55\u72B6\u6001\uFF0C\u8BF7\u5728\u8FDE\u63A5\u7A97\u53E3\u5B8C\u6210\u9A8C\u8BC1\u540E\u518D\u8BD5\u3002" };
    }
    if (message.type === "OPEN_1688_OFFICIAL_SEARCH") {
      const url = new URL(OFFICIAL_SEARCH_URL);
      const imageId = currentJob?.official_session?.image_id;
      if (imageId) {
        url.searchParams.set("imageId", imageId);
        url.searchParams.set("imageIdList", imageId);
      }
      await chrome.tabs.create({ url: url.href, active: true });
      return { ok: true };
    }
    if (message.type === "OPEN_1688_OFFER") {
      const offerId2 = String(message.offer_id ?? "");
      if (!/^\d{8,}$/.test(offerId2)) return { ok: false, error: "1688 \u5546\u54C1 ID \u65E0\u6548\u3002" };
      await chrome.tabs.create({ url: `https://detail.1688.com/offer/${offerId2}.html`, active: true });
      return { ok: true };
    }
    if (message.type === "PREPARE_SOURCE_IMAGE") {
      try {
        return { ok: true, data_url: await prepareImageDataUrl(String(message.image_url ?? "")) };
      } catch (error) {
        return { ok: false, error: errorMessage(error, "\u56FE\u7247\u8BFB\u53D6\u5931\u8D25\u3002") };
      }
    }
    return { ok: false, error: "\u672A\u77E5\u76841688\u56FE\u641C\u8BF7\u6C42\u3002" };
  }
  function handleSourcingTabRemoved(tabId) {
    if (currentJob?.source_tab_id === tabId) void cancelCurrentJob();
    if (currentJob?.fallback_tab_id === tabId) {
      currentJob.fallback_tab_id = void 0;
      if (currentJob.enrichment_state === "running") {
        currentJob.enrichment_state = "partial";
        currentJob.enrichment_error = "\u5B98\u65B9\u7ED3\u679C\u8865\u5145\u9875\u5DF2\u5173\u95ED\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u53EF\u7528\u7ED3\u679C\u3002";
        void broadcastJob();
      }
    }
    if (currentJob?.login_tab_id === tabId) {
      currentJob.login_tab_id = void 0;
      void broadcastJob();
    }
  }
  function handleSourcingWindowRemoved(windowId) {
    if (currentJob?.login_window_id === windowId) {
      currentJob.login_window_id = void 0;
      void broadcastJob();
    }
  }
  async function startImageSearch(rawProduct, rawDataUrl, sourceTabId, rawRequestId) {
    const productId = String(rawProduct?.product_id ?? "").slice(0, 160) || `temu-${Date.now()}`;
    const imageUrl = String(rawProduct?.image_url ?? "");
    if (!imageUrl || !isTemuImageUrl(imageUrl)) return { ok: false, error: "Temu \u5546\u54C1\u56FE\u7247\u5730\u5740\u65E0\u6548\u6216\u6682\u4E0D\u652F\u6301\u3002" };
    await cancelCurrentJob();
    const token = ++generation;
    const timestamp = now();
    const requestId = typeof rawRequestId === "string" && rawRequestId.length <= 100 ? rawRequestId : void 0;
    currentJob = {
      id: requestId || `${productId}-${Date.now()}`,
      client_request_id: requestId,
      source_product_id: productId,
      source_title: String(rawProduct?.title ?? "Temu\u5546\u54C1"),
      source_image_url: imageUrl,
      query_image_data_url: typeof rawDataUrl === "string" && rawDataUrl.startsWith("data:image/") ? rawDataUrl : "",
      source_tab_id: sourceTabId,
      state: "preparing-image",
      results: [],
      next_page: 1,
      has_more: false,
      official_search_url: OFFICIAL_SEARCH_URL,
      created_at: timestamp,
      updated_at: timestamp
    };
    await broadcastJob();
    void runImageSearch(token);
    return { ok: true, job: currentJob };
  }
  async function runImageSearch(token) {
    try {
      const job = assertCurrent(token);
      if (!job.query_image_data_url) job.query_image_data_url = await prepareImageDataUrl(job.source_image_url);
      updateState(token, "uploading");
      await broadcastJob();
      const session = await uploadImageToOfficial1688(job.query_image_data_url);
      job.official_session = session;
      updateState(token, "searching");
      await broadcastJob();
      const page = await searchOfficial1688(session, 1, 20);
      const current = assertCurrent(token);
      current.official_session = page.session;
      current.results = page.results;
      current.next_page = 2;
      current.diagnostics = page.diagnostics;
      current.auth_issue = void 0;
      const parserRejectedAll = page.diagnostics.raw_offer_count > 0 && page.results.length === 0;
      current.has_more = parserRejectedAll ? false : page.has_more;
      current.state = parserRejectedAll ? "failed" : "ready";
      current.enrichment_state = parserRejectedAll ? "partial" : page.results.length ? "running" : "complete";
      current.enrichment_error = void 0;
      current.error = parserRejectedAll ? `1688\u8FD4\u56DE\u4E86 ${page.diagnostics.raw_offer_count} \u6761\u5019\u9009\u8D27\u6E90\uFF0C\u4F46\u63D2\u4EF6\u672A\u80FD\u8BC6\u522B\u5546\u54C1\u7F16\u53F7\u3002\u8BF7\u4F7F\u7528\u5B98\u65B9\u641C\u56FE\u5165\u53E3\uFF0C\u5E76\u628A\u6B64\u63D0\u793A\u53CD\u9988\u7ED9\u5F00\u53D1\u8005\u3002` : page.results.length ? void 0 : "1688\u672C\u6B21\u786E\u5B9E\u6CA1\u6709\u8FD4\u56DE\u76F8\u4F3C\u8D27\u6E90\uFF0C\u53EF\u6846\u9009\u5546\u54C1\u4E3B\u4F53\u540E\u91CD\u641C\u3002";
      current.updated_at = now();
      await broadcastJob();
      if (!parserRejectedAll && page.results.length) void enrichFromOfficialPage(token);
    } catch (error) {
      if (token !== generation || !currentJob) return;
      const message = errorMessage(error, "1688\u5B98\u65B9\u56FE\u641C\u5931\u8D25\u3002");
      currentJob.state = message.startsWith("NEEDS_AUTH:") ? "needs-auth" : "failed";
      currentJob.auth_issue = message.startsWith("NEEDS_AUTH:") ? authIssueFromMessage(message) : void 0;
      currentJob.error = cleanAuthMessage(message);
      currentJob.updated_at = now();
      await broadcastJob();
    }
  }
  function officialSearchUrl(job) {
    const url = new URL(OFFICIAL_SEARCH_URL);
    const imageId = job.official_session?.image_id;
    if (imageId) {
      url.searchParams.set("imageId", imageId);
      url.searchParams.set("imageIdList", imageId);
    }
    return url.href;
  }
  async function enrichFromOfficialPage(token) {
    const job = assertCurrent(token);
    if (!job.official_session || job.fallback_tab_id !== void 0) return;
    job.enrichment_state = "running";
    job.enrichment_error = void 0;
    job.updated_at = now();
    await broadcastJob();
    let tabId;
    try {
      const tab = await chrome.tabs.create({ url: officialSearchUrl(job), active: false });
      tabId = tab.id;
      if (tabId === void 0) throw new Error("\u65E0\u6CD5\u521B\u5EFA1688\u5B98\u65B9\u7ED3\u679C\u9875\u3002");
      job.fallback_tab_id = tabId;
      await broadcastJob();
      let domOffers = [];
      for (let attempt = 0; attempt < 8 && token === generation; attempt += 1) {
        await wait(900);
        const injected = await chrome.scripting.executeScript({ target: { tabId }, func: readOfficialImageSearchCards }).catch(() => []);
        const found = injected[0]?.result;
        if (Array.isArray(found) && found.length) {
          domOffers = found;
          break;
        }
      }
      const current = assertCurrent(token);
      const domResults = domOffers.map(normalizeOfficial1688Offer).filter((item) => Boolean(item));
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
        current.enrichment_state = "complete";
        current.enrichment_error = void 0;
      }
      current.updated_at = now();
      await broadcastJob();
    } catch (error) {
      if (token === generation && currentJob) {
        currentJob.fallback_tab_id = void 0;
        await appendRemainingApiResults(token).catch(() => void 0);
        if (currentJob.enrichment_state === "running") {
          currentJob.enrichment_state = "partial";
          currentJob.enrichment_error = `\u5DF2\u4FDD\u7559\u524D ${currentJob.results.length} \u6761\u7ED3\u679C\uFF0C\u66F4\u591A\u5B98\u65B9\u8D44\u6599\u6682\u4E0D\u53EF\u7528\u3002`;
        }
        currentJob.updated_at = now();
        await broadcastJob();
      }
    } finally {
      if (tabId !== void 0) await chrome.tabs.remove(tabId).catch(() => void 0);
      const job2 = currentJob;
      if (token === generation && job2 && job2.fallback_tab_id === tabId) {
        job2.fallback_tab_id = void 0;
        if (job2.enrichment_state === "running") {
          job2.enrichment_state = "partial";
          job2.enrichment_error = job2.enrichment_error || "\u5B98\u65B9\u7ED3\u679C\u8865\u5145\u672A\u5B8C\u6210\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u53EF\u7528\u7ED3\u679C\u3002";
        }
        job2.updated_at = now();
        await broadcastJob();
      }
    }
  }
  async function appendRemainingApiResults(token) {
    const job = assertCurrent(token);
    if (!job.official_session) throw new Error("\u7F3A\u5C111688\u5B98\u65B9\u641C\u7D22\u4F1A\u8BDD\u3002");
    let pages = 0;
    try {
      while (job.has_more && pages < 4 && token === generation) {
        const page = await searchOfficial1688(job.official_session, job.next_page, 20);
        const current2 = assertCurrent(token);
        const byId = new Set(current2.results.map((item) => item.offer_id));
        current2.results = current2.results.concat(page.results.filter((item) => !byId.has(item.offer_id)));
        current2.official_session = page.session;
        current2.next_page += 1;
        current2.has_more = page.has_more;
        const previousDiagnostics = current2.diagnostics;
        current2.diagnostics = {
          ...page.diagnostics,
          raw_offer_count: (previousDiagnostics?.raw_offer_count ?? 0) + page.diagnostics.raw_offer_count,
          normalized_count: (previousDiagnostics?.normalized_count ?? 0) + page.diagnostics.normalized_count,
          dropped_count: (previousDiagnostics?.dropped_count ?? 0) + page.diagnostics.dropped_count,
          dropped_missing_identity: (previousDiagnostics?.dropped_missing_identity ?? 0) + page.diagnostics.dropped_missing_identity,
          missing_image_count: current2.results.filter((item) => !item.image_url).length,
          complete_card_count: current2.results.filter(isCompleteCard).length,
          dom_fallback_used: previousDiagnostics?.dom_fallback_used,
          dom_offer_count: previousDiagnostics?.dom_offer_count,
          dom_added_count: previousDiagnostics?.dom_added_count
        };
        current2.updated_at = now();
        await broadcastJob();
        pages += 1;
      }
      const current = assertCurrent(token);
      current.enrichment_state = current.has_more ? "partial" : "complete";
      current.enrichment_error = current.has_more ? "\u5DF2\u663E\u793A\u5F53\u524D\u53EF\u7528\u7ED3\u679C\uFF0C\u66F4\u591A\u7ED3\u679C\u6682\u4E0D\u53EF\u7528\u3002" : void 0;
    } catch (error) {
      const current = currentJob;
      if (token === generation && current) {
        current.enrichment_state = "partial";
        current.enrichment_error = "\u5DF2\u663E\u793A\u5F53\u524D\u53EF\u7528\u7ED3\u679C\uFF0C\u66F4\u591A\u7ED3\u679C\u6682\u4E0D\u53EF\u7528\u3002";
      }
    }
  }
  function isCompleteCard(item) {
    return Boolean(item.image_url && !item.title.startsWith("1688 \u5546\u54C1 ") && item.price);
  }
  async function openLoginWindow() {
    if (!currentJob) return;
    if (currentJob.login_tab_id !== void 0) {
      const existing = await chrome.tabs.get(currentJob.login_tab_id).catch(() => void 0);
      if (existing?.id !== void 0) {
        if (existing.windowId !== void 0) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => void 0);
        await chrome.tabs.update(existing.id, { active: true }).catch(() => void 0);
        return;
      }
      currentJob.login_tab_id = void 0;
    }
    const tabs = await chrome.tabs.query({}).catch(() => []);
    const existing1688 = tabs.filter((tab2) => tab2.id !== void 0 && /^https?:\/\/(?:[^/]+\.)?1688\.com\//i.test(tab2.url || "")).sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))[0];
    const tab = existing1688?.id !== void 0 ? await chrome.tabs.update(existing1688.id, { active: true }) : await chrome.tabs.create({ url: `https://login.1688.com/member/signin.htm?Done=${encodeURIComponent("https://www.1688.com/")}`, active: true });
    if (!tab || tab.id === void 0) return;
    if (currentJob) {
      currentJob.login_tab_id = tab.id;
      currentJob.updated_at = now();
      await broadcastJob();
    }
  }
  async function closeLoginWindow() {
    const windowId = currentJob?.login_window_id;
    if (windowId !== void 0) await chrome.windows.remove(windowId).catch(() => void 0);
    if (currentJob) {
      currentJob.login_window_id = void 0;
      currentJob.login_tab_id = void 0;
    }
  }
  async function resumeAfterAuthentication() {
    if (!currentJob || currentJob.state !== "needs-auth" || authResumeInFlight || !await hasOfficial1688Session()) return false;
    authResumeInFlight = true;
    try {
      const token = ++generation;
      currentJob.state = "preparing-image";
      currentJob.error = void 0;
      currentJob.auth_issue = void 0;
      currentJob.updated_at = now();
      await closeLoginWindow();
      await broadcastJob();
      void runImageSearch(token);
      return true;
    } finally {
      authResumeInFlight = false;
    }
  }
  async function cancelCurrentJob() {
    generation += 1;
    if (!currentJob) {
      await chrome.storage.session.remove(SESSION_KEY).catch(() => void 0);
      return;
    }
    await closeLoginWindow();
    if (currentJob.fallback_tab_id !== void 0) await chrome.tabs.remove(currentJob.fallback_tab_id).catch(() => void 0);
    currentJob.state = "cancelled";
    currentJob.updated_at = now();
    await broadcastJob();
    currentJob = void 0;
    await chrome.storage.session.remove(SESSION_KEY).catch(() => void 0);
  }
  async function broadcastJob() {
    if (!currentJob) return;
    const job = structuredClone(currentJob);
    await chrome.storage.session.set({ [SESSION_KEY]: job }).catch(() => void 0);
    if (job.source_tab_id !== void 0) void chrome.tabs.sendMessage(job.source_tab_id, { type: "SOURCING_JOB_UPDATED", job }).catch(() => void 0);
  }
  async function restoreSourcingSession() {
    const stored = await chrome.storage.session.get(SESSION_KEY).catch(() => ({}));
    const restored = stored[SESSION_KEY];
    if (!restored?.id) return;
    currentJob = restored;
    for (const result of restored.results) delete result.shipping_origin;
    delete restored.shipping_origin_progress;
    const token = ++generation;
    if (["preparing-image", "uploading", "searching"].includes(restored.state)) {
      restored.state = "preparing-image";
      restored.error = void 0;
      restored.results = [];
      restored.next_page = 1;
      restored.has_more = false;
      restored.official_session = void 0;
      restored.diagnostics = void 0;
      restored.updated_at = now();
      await broadcastJob();
      void runImageSearch(token);
      return;
    }
    if (restored.state === "ready" && restored.enrichment_state === "running") {
      restored.enrichment_state = "partial";
      restored.enrichment_error = "\u6269\u5C55\u91CD\u65B0\u542F\u52A8\uFF0C\u5DF2\u4FDD\u7559\u5F53\u524D\u53EF\u7528\u7ED3\u679C\u3002";
      restored.fallback_tab_id = void 0;
    }
    await broadcastJob();
  }
  function assertCurrent(token) {
    if (token !== generation || !currentJob) throw new Error("\u56FE\u641C\u4EFB\u52A1\u5DF2\u88AB\u65B0\u641C\u7D22\u66FF\u4EE3\u3002");
    return currentJob;
  }
  function updateState(token, state) {
    const job = assertCurrent(token);
    job.state = state;
    job.updated_at = now();
  }
  async function prepareImageDataUrl(imageUrl) {
    if (imageUrl.startsWith("data:image/")) return imageUrl;
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" || !isTemuImageUrl(parsed.href)) throw new Error("\u5546\u54C1\u56FE\u7247\u5730\u5740\u65E0\u6548\u6216\u6682\u4E0D\u652F\u6301\u3002");
    const response = await fetch(parsed.href, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`\u5546\u54C1\u56FE\u7247\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
    const source = await response.blob();
    if (!source.type.startsWith("image/")) throw new Error("\u4E0B\u8F7D\u5185\u5BB9\u4E0D\u662F\u6709\u6548\u56FE\u7247\u3002");
    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(100, Math.round(bitmap.width * scale));
      const height = Math.max(100, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("\u65E0\u6CD5\u521B\u5EFA\u56FE\u7247\u8F6C\u6362\u753B\u5E03\u3002");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return blobToDataUrl(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 }));
    } catch {
      if (/image\/(?:jpeg|png)/i.test(source.type)) return blobToDataUrl(source);
      throw new Error("\u56FE\u7247\u683C\u5F0F\u8F6C\u6362\u5931\u8D25\uFF0C\u8BF7\u5C1D\u8BD5\u6846\u9009\u5546\u54C1\u4E3B\u4F53\u3002");
    }
  }
  function isTemuImageUrl(raw) {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && /(^|\.)kwcdn\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  }
  async function blobToDataUrl(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunk = 32768;
    for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
  }
  function now() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  }
  function authIssueFromMessage(message) {
    const match = message.match(/\[issue=(login|session|challenge)\]/i);
    if (match) return match[1].toLowerCase();
    return /验证|验证码|安全|拒绝|punish|captcha/i.test(message) ? "challenge" : "login";
  }
  function cleanAuthMessage(message) {
    return message.replace(/^NEEDS_AUTH:/, "").replace(/\s*\[issue=(?:login|session|challenge)\]\s*$/i, "").trim();
  }

  // src/background.ts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isSourcingMessage(message)) return void 0;
    void handleSourcingMessage(message, sender).then((response) => sendResponse(response)).catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "1688\u641C\u56FE\u8BF7\u6C42\u5931\u8D25\u3002" }));
    return true;
  });
  chrome.tabs.onRemoved.addListener((tabId) => handleSourcingTabRemoved(tabId));
  chrome.windows.onRemoved.addListener((windowId) => handleSourcingWindowRemoved(windowId));
})();
