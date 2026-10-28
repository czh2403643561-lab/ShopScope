const RESIZE_PARAM_NAMES = new Set(['width', 'height', 'w', 'h', 'size', 'quality', 'format']);

export function cleanText(value: unknown): string {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

export function canonicalizeUrl(raw: string, baseUrl = typeof location !== 'undefined' ? location.href : 'https://www.1688.com/'): string {
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  try {
    const url = new URL(raw.replace(/^\/\//, 'https://'), baseUrl);
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (RESIZE_PARAM_NAMES.has(key.toLowerCase()) || /^spm|^scene|^from|^track/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}
