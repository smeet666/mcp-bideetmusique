/**
 * Reading a page of search results.
 *
 * The site serves hand-written markup from an older generation of the web:
 * unquoted attributes, a stray `</td>` before every `</tr>`, no class on the
 * rows beyond the alternating `p0`/`p1`. So this reads anchors by the address
 * they point at rather than by position in a table, which survives a change of
 * layout and fails loudly on a change of addressing.
 *
 * The one thing this module refuses to do is guess. A page it does not
 * recognise is a parse failure, because a caller handed an empty list reads it
 * as a collection that holds nothing.
 */

import { invalidInput, parseFailure } from "../errors.js";
import type { ArtistRef, SearchPage, SongSummary } from "../types.js";
import { textOf } from "./html.js";
import { artistUrl, songUrl, toAbsoluteUrl } from "./urls.js";

const RESULTS_BLOCK = /id="resultat"/i;
/** The site's own words for a search with nothing to search for. */
const NO_QUERY = /Il faut rechercher quelque chose/i;
/** The site's own words for a search that matched nothing. */
const NO_RESULT = /Il n['’]y a pas de r[ée]sultat/i;

const RESULTS_TABLE = /class="bmtable/i;
const HEADER_COUNT = /R[ée]sultat de votre recherche\s*\(\s*([\d\s .,]+?)\s+pour/i;

/**
 * How far a lazy match may run before a page is judged unreadable.
 *
 * Each of these elements holds one thing: a label, a cell, a row. Letting a
 * match run to the end of the document lets a page that repeats an opening it
 * never closes send the search back over everything that follows, once per
 * opening, and the whole server waits on it. Each bound is an order of
 * magnitude past what the site prints there.
 */
const INLINE_MAX = 400;
const CELL_MAX = 2_000;
const ROW_MAX = 8_000;

const ROW = new RegExp(
  String.raw`<tr\s+class=["']?p[01]["']?[^>]*>([\s\S]{0,${ROW_MAX}}?)</tr>`,
  "gi",
);

/**
 * The rest of an opening tag, up to the `>` that closes it.
 *
 * A quoted attribute value may itself hold markup: the title attribute of an
 * artist link carries the same `<em>` the link text does, unescaped. Stopping at
 * the first `>` would end the tag inside that attribute and read the remains of
 * it as the link text.
 */
const TAG_REST = '(?:[^>"]|"[^"]*")*';

const SONG_ANCHOR = new RegExp(
  String.raw`<a\s+href="/song/(\d+)\.html"${TAG_REST}>([\s\S]{0,${INLINE_MAX}}?)</a>`,
  "i",
);
const ARTIST_ANCHOR = new RegExp(
  String.raw`<a\s+href="/artist/(\d+)\.html"${TAG_REST}>([\s\S]{0,${INLINE_MAX}}?)</a>`,
  "i",
);
const THUMBNAIL = /<img[^>]+src="(\/images\/thumb\d*\/\d+\.[a-z]{3,4})"/i;
/** The sleeve at full size, which the row publishes behind its thumbnail. */
const SLEEVE = /show-image\.html\?I=(\/images\/pochettes\/\d+\.[a-z]{3,4})/i;
const CATEGORY_CELL = new RegExp(
  String.raw`<td[^>]*class="category"[^>]*>([\s\S]{0,${CELL_MAX}}?)</td>`,
  "i",
);
const IMAGE_ALT = /\balt\s*=\s*"([^"]*)"/i;

const PAGEBAR = new RegExp(
  String.raw`<span[^>]*class="pagebar"[^>]*>([\s\S]{0,${CELL_MAX}}?)</span>`,
  "i",
);
const ACTIVE_PAGE = /<td[^>]*class="pageactive"[^>]*>\s*(\d+)\s*<\/td>/i;
/** The separator is read from the markup, where an ampersand is written `&amp;`. */
const PAGE_LINK = /[?&](?:amp;)?Page=(\d+)/gi;

/** The artist credit as printed, and the artist it is an alias of. */
const ALIAS = new RegExp(
  String.raw`<em[^>]*>\s*\(?\s*alias de\s+([\s\S]{0,${INLINE_MAX}}?)\s*\)?\s*</em>`,
  "i",
);

export function parseSearchPage(html: string, url: string): SearchPage {
  const start = html.search(RESULTS_BLOCK);
  if (start < 0) {
    throw parseFailure(url, "the page carries no results block");
  }
  const block = html.slice(start);

  if (NO_QUERY.test(block)) {
    // The site refused the request rather than answering it. Handing this back
    // as zero results would say the collection holds nothing for a search that
    // was never run.
    throw invalidInput(
      "Bide & Musique refused the search because it carried nothing to search for.",
      "Pass a non-empty 'query'.",
    );
  }

  if (NO_RESULT.test(block)) {
    return {
      songs: [],
      totalMatches: 0,
      pageServed: 1,
      pageCount: 1,
      hasMorePages: false,
      unreadableRows: 0,
      redirectedToSong: false,
    };
  }

  const totalMatches = readTotal(block);

  if (!RESULTS_TABLE.test(block) && totalMatches === null) {
    throw parseFailure(url, "no results table and no statement that there are none");
  }

  const { songs, unreadableRows } = readRows(block);
  if (songs.length === 0) {
    throw parseFailure(url, "a results table holding no row this server could read");
  }

  return {
    songs,
    totalMatches,
    unreadableRows,
    redirectedToSong: false,
    ...readPagination(block),
  };
}

/** The count the site prints, which counts matching songs across every page. */
function readTotal(block: string): number | null {
  const raw = HEADER_COUNT.exec(block)?.[1];
  if (raw === undefined) {
    return null;
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") {
    return null;
  }
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

function readRows(block: string): { songs: SongSummary[]; unreadableRows: number } {
  const songs: SongSummary[] = [];
  let unreadableRows = 0;

  ROW.lastIndex = 0;
  for (let match = ROW.exec(block); match !== null; match = ROW.exec(block)) {
    const row = match[1] ?? "";
    const song = readRow(row);
    if (song) {
      songs.push(song);
    } else {
      unreadableRows += 1;
    }
  }

  return { songs, unreadableRows };
}

function readRow(row: string): SongSummary | null {
  const songMatch = SONG_ANCHOR.exec(row);
  const artistMatch = ARTIST_ANCHOR.exec(row);
  if (!songMatch || !artistMatch) {
    return null;
  }

  const songId = songMatch[1];
  const artistId = artistMatch[1];
  const title = textOf(songMatch[2] ?? "");
  if (!songId || !artistId || title === "") {
    return null;
  }

  const thumbnail = THUMBNAIL.exec(row)?.[1];
  const sleeve = SLEEVE.exec(row)?.[1];
  const category = CATEGORY_CELL.exec(row)?.[1];
  const programming = category ? (IMAGE_ALT.exec(category)?.[1]?.trim() ?? "") : "";

  return {
    id: songId,
    title,
    url: songUrl(songId),
    artist: readArtist(artistId, artistMatch[2] ?? ""),
    imageUrl: sleeve ? toAbsoluteUrl(sleeve) : null,
    thumbnailUrl: thumbnail ? toAbsoluteUrl(thumbnail) : null,
    programming: programming === "" ? null : programming,
  };
}

/**
 * Split the credit from the artist behind it.
 *
 * A record credited to a one-off name links to the artist who made it, and the
 * site prints both: "Bino et les gosses (alias de Bino)". Keeping only one of
 * them would either rename the record or lose the artist, so both are kept and
 * the name stays what the sleeve says.
 */
function readArtist(id: string, innerHtml: string): ArtistRef {
  const aliasMatch = ALIAS.exec(innerHtml);
  const aliasOf = aliasMatch ? textOf(aliasMatch[1] ?? "") : "";
  const name = textOf(aliasMatch ? innerHtml.replace(aliasMatch[0], " ") : innerHtml);

  return {
    id,
    name,
    aliasOf: aliasOf === "" ? null : aliasOf,
    url: artistUrl(id),
  };
}

/**
 * Which page the site actually served.
 *
 * Asking for a page past the last one gets the last page back, with no error
 * and a bar still pointing at the real page number. So the number comes from
 * the bar, never from the request: a caller told they hold page 99 would read
 * those rows as the tail of the results.
 *
 * A page holding results and no bar at all is the whole of the results.
 */
function readPagination(block: string): {
  pageServed: number | null;
  pageCount: number | null;
  hasMorePages: boolean | null;
} {
  const bar = PAGEBAR.exec(block)?.[1];
  if (!bar) {
    return { pageServed: 1, pageCount: 1, hasMorePages: false };
  }

  const activeRaw = ACTIVE_PAGE.exec(bar)?.[1];
  const pageServed = activeRaw ? Number.parseInt(activeRaw, 10) : null;

  let highest = pageServed ?? 0;
  PAGE_LINK.lastIndex = 0;
  for (let match = PAGE_LINK.exec(bar); match !== null; match = PAGE_LINK.exec(bar)) {
    const page = Number.parseInt(match[1] ?? "", 10);
    if (Number.isFinite(page) && page > highest) {
      highest = page;
    }
  }

  const pageCount = highest > 0 ? highest : null;
  const hasMorePages = pageServed !== null && pageCount !== null ? pageServed < pageCount : null;

  return { pageServed, pageCount, hasMorePages };
}
