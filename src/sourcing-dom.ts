/**
 * This function is injected into one official 1688 result page. Keep it
 * self-contained: Chrome serializes the function body for executeScript.
 */
export function readOfficialImageSearchCards(): unknown[] {
  const cards = [...document.querySelectorAll<HTMLElement>('[class*="searchOfferWrapper"]')];
  const seen = new Set<string>();
  const textOf = (element: Element | null | undefined): string => (element?.textContent || '').replace(/\s+/g, ' ').trim();
  return cards.flatMap((card) => {
    const links = [...card.querySelectorAll<HTMLAnchorElement>('a[href*="detail.1688.com/offer/"], a[href*="offerId="]')];
    const href = links.find((link) => /(?:\/offer\/|[?&]offerId=)\d{8,}/i.test(link.href))?.href ?? '';
    const id = href.match(/(?:\/offer\/|[?&]offerId=)(\d{8,})/i)?.[1] ?? '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const text = (card.innerText || card.textContent || '').replace(/\s+/g, ' ').trim();
    const desc = [...card.querySelectorAll<HTMLElement>('[class*="descText"]')].map((item) => (item.innerText || item.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const sales = desc.find((item) => /^(?:\d+(?:\.\d+)?(?:万|千|[Kk])?\+?)件$/.test(item));
    const minimum = desc.find((item) => /^\d+件起批$/.test(item));
    const repurchase = desc.find((item) => /^回头率\s*\d+(?:\.\d+)?%$/.test(item));
    const shipping = desc.find((item) => /(?:\d+H发|\d+小时发|\d+天达|后天达)/i.test(item));
    const supplierRow = textOf(card.querySelector<HTMLElement>('[class*="offerShopRow"]'));
    const years = supplierRow.match(/入驻\s*(\d+)\s*年/)?.[1];
    const supplier = supplierRow.replace(/^入驻\s*\d+\s*年\s*/, '').replace(/旺旺在线.*$/u, '').trim();
    const title = textOf(card.querySelector<HTMLElement>('[class*="titleText"], [class*="offerTitle"], [class*="subject"]'));
    const image = card.querySelector<HTMLImageElement>('img.mainImg, img[class*="mainImg"], img[src]');
    // The official page often renders a price as separate text nodes (`¥`, `0`,
    // `.31`). Read the price-specific nodes first and join split decimals before
    // parsing, otherwise the old text regex incorrectly returned `0`.
    const priceCandidates = [...card.querySelectorAll<HTMLElement>('[class*="priceItem"], [class*="price-item"], [class*="priceValue"], [class*="offerPrice"]')]
      .filter((element) => !element.querySelector('[class*="descText"], [class*="offerDesc"]'))
      .sort((left, right) => left.querySelectorAll('*').length - right.querySelectorAll('*').length);
    const priceText = priceCandidates[0]?.textContent || card.textContent || text;
    const normalizedPriceText = priceText.replace(/\s+/g, ' ').replace(/(\d)\s*\.\s*(\d)/g, '$1.$2').replace(/([¥￥])\s+/g, '$1');
    const priceMatch = normalizedPriceText.match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)(?:\s*[-–~至]\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?))?/);
    const price = priceMatch ? (priceMatch[2] ? `${priceMatch[1]}-${priceMatch[2]}` : priceMatch[1]) : undefined;
    return [{
      offer_id: id, href, real_url: href, picture: image?.currentSrc || image?.src || '', title,
      price: price || undefined, sales: sales || undefined, minOrderQuantity: minimum || undefined,
      repurchaseRate: repurchase || undefined, shippingTimeGuarantee: shipping || undefined,
      shops: { opened_year: years, shop_name: supplier },
    }];
  });
}
