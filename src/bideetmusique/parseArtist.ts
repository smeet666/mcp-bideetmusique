/**
 * Reading an artist page.
 *
 * The page is a way into a discography rather than a biography: half of them
 * carry no field at all beyond the name, and the median artist has one record in
 * the collection. So the name is the only thing this reading requires, and
 * everything else is absent until proven otherwise.
 */

import { parseFailure } from "../errors.js";
import type { Artist, ArtistLink, DiscographyEntry, ExternalLink } from "../types.js";
import { textOf } from "./html.js";
import { artistUrl, songUrl, toAbsoluteUrl } from "./urls.js";

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
const CELL_MAX = 2000;
const ROW_MAX = 8000;

const NAME = new RegExp(
  String.raw`<div[^>]*class="titre-bloc"[^>]*>\s*<h2[^>]*>([\s\S]{0,${INLINE_MAX}}?)</h2>`,
  "i",
);
const PHOTO = /<img[^>]+src="(\/images\/photos\/[^"]+)"/i;

/**
 * A header row, in either of the two shapes the page uses: a bold label in a
 * cell, or a table header.
 */
const HEADER_ROW =
  /<tr>\s*(?:<td[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/td>|<th[^>]*>([\s\S]*?)<\/th>)\s*<td[^>]*>([\s\S]*?)<\/td>/gi;

const DISCOGRAPHY_ROW = new RegExp(
  String.raw`<tr class="p[01]">([\s\S]{0,${ROW_MAX}}?)</tr>`,
  "gi",
);
const SONG_ANCHOR = new RegExp(
  String.raw`<a\s+href="/song/(\d+)\.html"(?:[^>"]|"[^"]*")*>([\s\S]{0,${INLINE_MAX}}?)</a>`,
  "i",
);
const CELL = new RegExp(String.raw`<td[^>]*>([\s\S]{0,${CELL_MAX}}?)</td>`, "gi");
const YEAR_CELL = /^\d{4}$/;
const THUMBNAIL = /<img[^>]+src="(\/images\/thumb\d*\/\d+\.[a-z]{3,4})"/i;
const SLEEVE = /show-image\.html\?I=(\/images\/pochettes\/\d+\.[a-z]{3,4})/i;
const IMAGE_ALT = /<img[^>]+\balt\s*=\s*"([^"]*)"/gi;

const ANCHOR = new RegExp(
  String.raw`<a\s+href="([^"]+)"(?:[^>"]|"[^"]*")*>([\s\S]{0,${INLINE_MAX}}?)</a>`,
  "gi",
);
const ARTIST_HREF = /^\/artist\/(\d+)\.html$/i;

/** Fold a label so "Autre alias" and "Autres alias" name the same field. */
function foldLabel(label: string): string {
  return textOf(label)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function parseArtistPage(html: string, url: string, id: string): Artist {
  const name = textOf(NAME.exec(html)?.[1] ?? "");
  if (name === "") {
    throw parseFailure(url, "a page carrying no artist heading");
  }

  const header = new Map<string, string>();
  HEADER_ROW.lastIndex = 0;
  for (let match = HEADER_ROW.exec(html); match !== null; match = HEADER_ROW.exec(html)) {
    const label = foldLabel(match[1] ?? match[2] ?? "");
    if (label !== "" && !header.has(label)) {
      header.set(label, match[3] ?? "");
    }
  }

  /** The cell of the first label the test accepts, since wording varies. */
  const cellFor = (matches: (label: string) => boolean): string | undefined => {
    for (const [label, cell] of header) {
      if (matches(label)) {
        return cell;
      }
    }
    return undefined;
  };

  const textFor = (matches: (label: string) => boolean): string | null => {
    const cell = cellFor(matches);
    if (cell === undefined) {
      return null;
    }
    const value = textOf(cell);
    return value === "" ? null : value;
  };

  const aliasCell = cellFor((label) => label.includes("alias"));
  const photo = PHOTO.exec(html)?.[1];

  return {
    id,
    url: artistUrl(id),
    name,
    aliases: aliasCell === undefined ? [] : splitLines(aliasCell),
    surname: textFor((label) => label === "nom"),
    firstName: textFor((label) => label === "prenom"),
    nationality: textFor((label) => label === "nationalite"),
    // Published as written: a date, a bare year, a month and a year, or a date
    // with a death beside it. Parsing it would state a day the catalogue never
    // wrote.
    birthDate: textFor((label) => label.startsWith("date de naissance")),
    presentation: textFor((label) => label === "presentation"),
    seeAlso: readArtistLinks(cellFor((label) => label === "voir aussi")),
    links: readExternalLinks(cellFor((label) => label === "liens")),
    photoUrl: photo ? toAbsoluteUrl(photo) : null,
    discography: readDiscography(html),
  };
}

/** A cell stacking several values, one per line. */
function splitLines(cell: string): string[] {
  return cell
    .split(/<br\s*\/?>/i)
    .map((line) => textOf(line))
    .filter((line) => line !== "");
}

function readArtistLinks(cell: string | undefined): ArtistLink[] {
  if (cell === undefined) {
    return [];
  }
  const links: ArtistLink[] = [];
  ANCHOR.lastIndex = 0;
  for (let match = ANCHOR.exec(cell); match !== null; match = ANCHOR.exec(cell)) {
    const id = ARTIST_HREF.exec(match[1] ?? "")?.[1];
    const name = textOf(match[2] ?? "");
    if (!id || name === "") {
      continue;
    }
    links.push({ id, name, url: artistUrl(id) });
  }
  return links;
}

/** Addresses off the site, kept with the label the page gave them. */
function readExternalLinks(cell: string | undefined): ExternalLink[] {
  if (cell === undefined) {
    return [];
  }
  const links: ExternalLink[] = [];
  ANCHOR.lastIndex = 0;
  for (let match = ANCHOR.exec(cell); match !== null; match = ANCHOR.exec(cell)) {
    const href = match[1] ?? "";
    const label = textOf(match[2] ?? "");
    if (href === "" || label === "") {
      continue;
    }

    // A page publishes addresses people typed, and one of them can be no
    // address. Dropping it is honest; keeping the label beside nothing would
    // offer a link that leads nowhere.
    const url = toAbsoluteUrl(href);
    if (url === null) {
      continue;
    }

    links.push({ label, url });
  }
  return links;
}

function readDiscography(html: string): DiscographyEntry[] {
  const entries: DiscographyEntry[] = [];

  DISCOGRAPHY_ROW.lastIndex = 0;
  for (let match = DISCOGRAPHY_ROW.exec(html); match !== null; match = DISCOGRAPHY_ROW.exec(html)) {
    const row = match[1] ?? "";
    const song = SONG_ANCHOR.exec(row);
    if (!song) {
      continue;
    }

    const songId = song[1];
    const title = textOf(song[2] ?? "");
    if (!songId || title === "") {
      continue;
    }

    entries.push({
      songId,
      title,
      url: songUrl(songId),
      year: readYear(row),
      programming: readProgramming(row),
      imageUrl: readAbsolute(SLEEVE, row),
      thumbnailUrl: readAbsolute(THUMBNAIL, row),
    });
  }

  return entries;
}

function readYear(row: string): number | null {
  CELL.lastIndex = 0;
  for (let match = CELL.exec(row); match !== null; match = CELL.exec(row)) {
    const value = textOf(match[1] ?? "");
    if (YEAR_CELL.test(value)) {
      return Number.parseInt(value, 10);
    }
  }
  return null;
}

/**
 * The programming marker, read from the bubble rather than from the sleeve: the
 * thumbnail's own description opens with the word the site uses for it.
 */
function readProgramming(row: string): string | null {
  IMAGE_ALT.lastIndex = 0;
  for (let match = IMAGE_ALT.exec(row); match !== null; match = IMAGE_ALT.exec(row)) {
    const alt = textOf(match[1] ?? "");
    if (alt === "" || /^Vignette\b/i.test(alt)) {
      continue;
    }
    return alt;
  }
  return null;
}

function readAbsolute(pattern: RegExp, row: string): string | null {
  const path = pattern.exec(row)?.[1];
  return path ? toAbsoluteUrl(path) : null;
}
