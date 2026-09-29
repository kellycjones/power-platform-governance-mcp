/**
 * Turns Microsoft Learn Markdown into clean, citable sections.
 *
 * Learn docs mix standard Markdown with DocFX extensions (INCLUDE directives,
 * :::image::: blocks, [!NOTE] callouts) and HTML entities. Agents only need the
 * prose, so we strip the markup and split each page on its H2/H3 headings.
 * Each section keeps a deep link (page URL + heading anchor) so answers can cite
 * the exact place in the docs.
 */

export interface Section {
  /** Stable id, e.g. "admin/dlp-policy-scope#2". */
  id: string;
  /** Page id: the doc path without ".md", e.g. "admin/dlp-policy-scope". */
  docId: string;
  docTitle: string;
  /** Heading trail inside the page, e.g. "Policy scope › Tenant-level policies". */
  heading: string;
  /** Top-level area of the docs: "admin", "coe", "alm", ... */
  area: string;
  /** Deep link to the section on learn.microsoft.com. */
  url: string;
  text: string;
}

export interface SourceDoc {
  /** Path relative to the docs root, with forward slashes, e.g. "admin/dlp-policy-scope.md". */
  path: string;
  markdown: string;
}

export interface ChunkOptions {
  /** Site root the doc paths hang off, e.g. "https://learn.microsoft.com/power-platform/". */
  baseUrl: string;
  /** Sections longer than this are split on paragraph boundaries. */
  maxChars?: number;
  /** Sections shorter than this (after cleaning) are dropped as noise. */
  minChars?: number;
}

export function parseFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { meta: {}, body: markdown };

  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!kv || kv[2] === '') continue;
    meta[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: markdown.slice(match[0].length) };
}

const ENTITIES: Record<string, string> = {
  '&mdash;': '—',
  '&ndash;': '–',
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Strips DocFX/HTML markup and keeps readable prose (links become their text). */
export function cleanMarkdown(body: string): string {
  return (
    body
      .replace(/<!--[\s\S]*?-->/g, '')
      // :::image ...::: and other triple-colon blocks (single or multi-line)
      .replace(/:::[\s\S]*?:::/g, '')
      // [!INCLUDE [name](path)] pulls in shared snippets we don't have
      .replace(/\[!INCLUDE\s*\[[^\]]*\]\([^)]*\)\]/gi, '')
      .replace(/\[!INCLUDE[^\]]*\]/gi, '')
      // Callouts, also when indented under a list item: "> [!NOTE]" -> keep the text, drop the marker
      .replace(/^[ \t]*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/gim, '')
      .replace(/^([ \t]*)>[ \t]?/gm, '$1')
      .replace(/\[!(div|VIDEO)[^\]]*\]/gi, '')
      // Images, then links -> link text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[a-z][^>]*>/gi, '')
      .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Learn-style heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** "admin/x.md" -> "admin", "guidance/coe/x.md" -> "coe". */
export function areaFromPath(path: string): string {
  const parts = path.split('/');
  if (parts[0] === 'guidance' && parts.length > 2) return parts[1]!;
  return parts.length > 1 ? parts[0]! : 'general';
}

interface RawSection {
  heading: string;
  anchor: string;
  lines: string[];
}

export function chunkDocument(doc: SourceDoc, options: ChunkOptions): Section[] {
  const maxChars = options.maxChars ?? 1800;
  const minChars = options.minChars ?? 60;
  const { meta, body } = parseFrontMatter(doc.markdown);
  const docId = doc.path.replace(/\.md$/i, '');
  const pageUrl = new URL(docId, options.baseUrl).toString();
  const area = areaFromPath(doc.path);

  let docTitle = meta.title ?? docId;
  let h2 = '';
  let inCode = false;
  const raw: RawSection[] = [{ heading: '', anchor: '', lines: [] }];

  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const heading = inCode ? null : /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) {
      raw[raw.length - 1]!.lines.push(line);
      continue;
    }
    const level = heading[1]!.length;
    const text = cleanMarkdown(heading[2]!);
    if (level === 1) {
      docTitle = text;
      continue;
    }
    if (level === 2) h2 = text;
    raw.push({
      heading: level === 2 || !h2 ? text : `${h2} › ${text}`,
      anchor: slugifyHeading(text),
      lines: [],
    });
  }

  const sections: Section[] = [];
  for (const part of raw) {
    if (LINK_LIST_HEADING.test(part.heading)) continue;
    const text = cleanMarkdown(part.lines.join('\n'));
    if (text.length < minChars) continue;
    for (const piece of splitLongText(text, maxChars)) {
      sections.push({
        id: `${docId}#${sections.length}`,
        docId,
        docTitle,
        heading: part.heading || docTitle,
        area,
        url: part.anchor ? `${pageUrl}#${part.anchor}` : pageUrl,
        text: piece,
      });
    }
  }
  return sections;
}

/** End-of-page link lists ("Related information", "Next steps") are navigation, not content. */
const LINK_LIST_HEADING = /^(related (information|content|articles|resources)|next steps?|see also|learn more)$/i;

/**
 * Packs paragraphs into pieces of at most maxChars. A paragraph that is itself
 * too long (usually a big table or list) is split on line breaks instead.
 */
function splitLongText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const units = text
    .split(/\n{2,}/)
    .flatMap((paragraph) => (paragraph.length > maxChars ? paragraph.split('\n') : [paragraph]));
  const pieces: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > maxChars) {
      pieces.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${unit}` : unit;
  }
  if (current) pieces.push(current);
  return pieces;
}
