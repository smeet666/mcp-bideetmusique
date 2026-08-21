/**
 * Turning the bytes of a page into text.
 *
 * Bide & Musique serves ISO-8859-1 and says so in its Content-Type. Reading
 * those bytes as UTF-8 does not fail, it produces replacement characters in
 * every accented word, which reaches a model as a title the site never
 * published. So the charset is read from the header, and the fallback is the
 * encoding the site actually uses rather than the one the platform prefers.
 */

/**
 * Windows-1252 rather than ISO-8859-1 proper: the two agree on every letter,
 * and the bytes 0x80-0x9F that Latin-1 leaves undefined carry the curly
 * apostrophe and the em dash a French page is full of.
 */
const DEFAULT_CHARSET = "windows-1252";

const LATIN_LABELS = new Set([
  "iso-8859-1",
  "iso8859-1",
  "iso_8859-1",
  "latin1",
  "latin-1",
  "l1",
  "cp1252",
  "windows-1252",
]);

export function charsetFromContentType(contentType?: string | null): string {
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? "");
  const label = match?.[1]?.toLowerCase();
  if (!label) {
    return DEFAULT_CHARSET;
  }
  if (LATIN_LABELS.has(label)) {
    return DEFAULT_CHARSET;
  }
  return label;
}

/** Decode a page body, honouring the charset the site declared. */
export function decodeHtml(bytes: ArrayBuffer | Uint8Array, contentType?: string | null): string {
  const charset = charsetFromContentType(contentType);
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder(charset).decode(view);
  } catch {
    // An unknown label is the site naming an encoding this runtime has no table
    // for. Falling back to what it serves everywhere else beats failing the read.
    return new TextDecoder(DEFAULT_CHARSET).decode(view);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  oelig: "œ",
  Eacute: "É",
  Egrave: "È",
  Ecirc: "Ê",
  Agrave: "À",
  Acirc: "Â",
  Ccedil: "Ç",
  Ocirc: "Ô",
  Ugrave: "Ù",
  Icirc: "Î",
  laquo: "«",
  raquo: "»",
  lsaquo: "‹",
  rsaquo: "›",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  deg: "°",
  copy: "©",
  eur: "€",
  euro: "€",
};

/**
 * Decode the entities a title can carry.
 *
 * `&nbsp;` becomes a real U+00A0 rather than a plain space: French typography
 * puts one before a question mark, and the site publishes it, so the title is
 * repeated as published.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return whole;
      }
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const exact = NAMED_ENTITIES[body];
    if (exact !== undefined) {
      return exact;
    }
    const lower = NAMED_ENTITIES[body.toLowerCase()];
    return lower ?? whole;
  });
}

/** ASCII whitespace only, so a non-breaking space survives as published. */
const ASCII_SPACE = /[ \t\n\r\f\v]+/g;

/**
 * The readable text of a fragment.
 *
 * Tags go first and entities second: decoding first would turn a published
 * `&lt;b&gt;` into markup and then strip it, deleting text the site showed.
 */
export function textOf(html: string): string {
  const stripped = html.replace(/<[^>]*>/g, " ");
  return decodeEntities(stripped)
    .replace(ASCII_SPACE, " ")
    .replace(/^ +| +$/g, "");
}
