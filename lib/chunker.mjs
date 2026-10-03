export const DEFAULT_CHUNK_OPTIONS = { maxChars: 800, overlapChars: 100 };

function hardSplit(s, max) {
  const parts = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (w.length > max) {
      if (cur) { parts.push(cur); cur = ''; }
      for (let i = 0; i < w.length; i += max) parts.push(w.slice(i, i + max));
      continue;
    }
    if (cur && cur.length + 1 + w.length > max) { parts.push(cur); cur = w; }
    else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) parts.push(cur);
  return parts;
}

export function chunkText(text, options = {}) {
  const { maxChars, overlapChars } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!(maxChars > 0) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new RangeError('Require maxChars > 0 and 0 <= overlapChars < maxChars');
  }

  const normalized = text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim();
  if (!normalized) return [];

  const units = [];
  for (const para of normalized.split(/\n\s*\n/)) {
    const p = para.replace(/\s*\n\s*/g, ' ').trim();
    if (!p) continue;
    if (p.length <= maxChars) { units.push(p); continue; }
    for (const s of p.split(/(?<=[.!?])\s+/)) {
      if (s.length <= maxChars) units.push(s);
      else units.push(...hardSplit(s, maxChars));
    }
  }

  const size = (arr) => arr.join(' ').length;
  const chunks = [];
  let current = [];
  for (const u of units) {
    if (current.length && size(current) + 1 + u.length > maxChars) {
      chunks.push(current.join(' '));
      const carry = [];
      for (let i = current.length - 1; i >= 0; i--) {
        if (size([current[i], ...carry]) > overlapChars) break;
        carry.unshift(current[i]);
      }
      current = carry;
      while (current.length && size(current) + 1 + u.length > maxChars) current.shift();
    }
    current.push(u);
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}