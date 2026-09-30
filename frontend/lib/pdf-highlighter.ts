/**
 * PDF Source Text Highlighter Utility
 *
 * Provides character-level mapping and multi-item fuzzy/normalized text search
 * to accurately highlight cited sources in PDF documents without blocking the text.
 */

export interface HighlightRange {
  start: number;
  end: number;
  sourceId?: number;
  isActive?: boolean;
}

export interface ItemHighlightData {
  itemIndex: number;
  ranges: HighlightRange[];
}

export interface SourceCitation {
  document: string;
  snippet: string;
  score: number;
  pageNumber?: number;
}

/**
 * Normalizes text for comparison by collapsing whitespace,
 * normalizing quotes/dashes, and converting to lowercase.
 */
export function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Escapes characters for safe inclusion inside HTML template fragments.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface PageTextMapping {
  charToItem: Array<{ itemIdx: number; charIdx: number }>;
  pageText: string;
  normToRaw: number[];
  normText: string;
}

/**
 * Builds a continuous text index with character-to-item mapping from PDF text items.
 */
export function buildPageMapping(
  items: Array<{ str: string; hasEOL?: boolean }>
): PageTextMapping {
  const charToItem: Array<{ itemIdx: number; charIdx: number }> = [];
  let pageText = "";

  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const str = items[itemIdx].str || "";
    for (let charIdx = 0; charIdx < str.length; charIdx++) {
      charToItem.push({ itemIdx, charIdx });
    }
    pageText += str;

    // Add a virtual space between distinct items if the item doesn't end with whitespace
    // or if hasEOL is flagged by pdf.js.
    if (items[itemIdx].hasEOL || (str.length > 0 && !/\s$/.test(str))) {
      pageText += " ";
      charToItem.push({ itemIdx, charIdx: -1 });
    }
  }

  const normToRaw: number[] = [];
  let normText = "";
  let inSpace = false;

  for (let i = 0; i < pageText.length; i++) {
    let ch = pageText[i];
    if (/[\u2018\u2019]/.test(ch)) ch = "'";
    else if (/[\u201C\u201D]/.test(ch)) ch = '"';
    else if (/[\u2013\u2014]/.test(ch)) ch = "-";

    if (/\s/.test(ch)) {
      if (!inSpace) {
        normText += " ";
        normToRaw.push(i);
        inSpace = true;
      }
    } else {
      normText += ch.toLowerCase();
      normToRaw.push(i);
      inSpace = false;
    }
  }

  return { charToItem, pageText, normToRaw, normText };
}

/**
 * Finds all occurrences of a source snippet within a page's text items,
 * returning the item index and character ranges within each item.
 */
export function findSnippetMatchesInPage(
  items: Array<{ str: string; hasEOL?: boolean }>,
  snippet: string,
  sourceId: number,
  isActive: boolean
): ItemHighlightData[] {
  if (!snippet || !snippet.trim() || !items || items.length === 0) {
    return [];
  }

  const { charToItem, normToRaw, normText } = buildPageMapping(items);
  const normSnippet = normalizeText(snippet);
  if (!normSnippet) return [];

  // Generate fallback candidates in order of precision:
  // 1. Full normalized snippet
  // 2. Sentences of significant length (>= 20 chars)
  // 3. First 10 words
  const candidates: string[] = [normSnippet];

  const sentences = normSnippet
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  for (const s of sentences) {
    if (!candidates.includes(s)) candidates.push(s);
  }

  const words = normSnippet.split(" ");
  if (words.length > 6) {
    const firstChunk = words.slice(0, 10).join(" ");
    if (!candidates.includes(firstChunk)) candidates.push(firstChunk);
  }

  const rawMatches: Array<{ rawStart: number; rawEnd: number }> = [];

  for (const cand of candidates) {
    let searchFrom = 0;
    let foundAny = false;
    while (searchFrom < normText.length) {
      const idx = normText.indexOf(cand, searchFrom);
      if (idx === -1) break;

      const rawStart = normToRaw[idx];
      const endCharIdx = idx + cand.length - 1;
      const rawEnd = (endCharIdx < normToRaw.length ? normToRaw[endCharIdx] : rawStart + cand.length) + 1;

      rawMatches.push({ rawStart, rawEnd });
      foundAny = true;
      searchFrom = idx + cand.length;
    }
    // If the higher-priority candidate matched, do not duplicate with smaller fragments
    if (foundAny) break;
  }

  if (rawMatches.length === 0) return [];

  const itemMatches = new Map<number, HighlightRange[]>();

  for (const { rawStart, rawEnd } of rawMatches) {
    for (let r = rawStart; r < rawEnd; r++) {
      const mapping = charToItem[r];
      if (mapping && mapping.charIdx >= 0) {
        const { itemIdx, charIdx } = mapping;
        if (!itemMatches.has(itemIdx)) {
          itemMatches.set(itemIdx, []);
        }
        const list = itemMatches.get(itemIdx)!;
        const last = list[list.length - 1];
        if (last && last.end === charIdx && last.sourceId === sourceId) {
          last.end = charIdx + 1;
        } else {
          list.push({
            start: charIdx,
            end: charIdx + 1,
            sourceId,
            isActive,
          });
        }
      }
    }
  }

  return Array.from(itemMatches.entries()).map(([itemIndex, ranges]) => ({
    itemIndex,
    ranges,
  }));
}

/**
 * Transforms an item's raw text string into HTML with `<mark class="source-highlight">` tags.
 * Preserves all underlying text so canvas glyphs are never blocked.
 */
export function applyHighlightsToText(
  str: string,
  ranges: HighlightRange[]
): string {
  if (!ranges || ranges.length === 0) {
    return escapeHtml(str);
  }

  // Sort ranges by start offset
  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  // Merge overlapping or contiguous ranges
  const merged: HighlightRange[] = [];
  for (const r of sorted) {
    const cur = {
      start: Math.max(0, Math.min(str.length, r.start)),
      end: Math.max(0, Math.min(str.length, r.end)),
      sourceId: r.sourceId,
      isActive: r.isActive,
    };
    if (cur.start >= cur.end) continue;

    const prev = merged[merged.length - 1];
    if (prev && cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
      if (cur.isActive) prev.isActive = true;
    } else {
      merged.push(cur);
    }
  }

  let result = "";
  let lastIdx = 0;

  for (const r of merged) {
    if (r.start > lastIdx) {
      result += escapeHtml(str.slice(lastIdx, r.start));
    }
    const activeClass = r.isActive ? " active" : "";
    const sourceAttr = r.sourceId !== undefined ? ` data-source-id="${r.sourceId}"` : "";
    const highlightedText = escapeHtml(str.slice(r.start, r.end));
    result += `<mark class="source-highlight${activeClass}"${sourceAttr}>${highlightedText}</mark>`;
    lastIdx = r.end;
  }

  if (lastIdx < str.length) {
    result += escapeHtml(str.slice(lastIdx));
  }

  return result;
}
