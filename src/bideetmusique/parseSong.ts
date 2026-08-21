/**
 * Reading a song record.
 *
 * Two readings live here. `parseSongPage` takes the few fields a search row
 * carries, for the case where a search matching a single song is answered with
 * that song's page. `parseSongRecord` reads the record itself, including the
 * transcription its page publishes.
 *
 * The per-song audio stream the page plays is left alone: the address of a
 * stream is the recording, and this server reads a catalogue.
 */

import { parseFailure } from "../errors.js";
import type { ArtistLink, CommentCount, LyricsInfo, Song, SongSummary, Top50 } from "../types.js";
import { parseDuration } from "./duration.js";
import { textOf } from "./html.js";
import { fieldValues } from "./multivalue.js";
import { artistUrl, songUrl, toAbsoluteUrl } from "./urls.js";

/**
 * The rest of an opening tag, up to the `>` that closes it.
 *
 * A quoted attribute value may hold markup of its own: the artist link's title
 * attribute repeats the name with the emphasis around it. Stopping at the first
 * `>` would end the tag inside that attribute and read its remains as the name.
 */
const TAG_REST = '(?:[^>"]|"[^"]*")*';

/**
 * How far a name or a title may run inside the heading.
 *
 * Both are one line of a page. Letting them run unbounded lets a page that
 * repeats the opening without ever closing it send the search back over
 * everything that follows, once per opening: the work then grows far faster
 * than the page does, and the whole server waits on it. A bound well past any
 * title the site prints keeps a real heading readable and a degenerate one
 * cheap to refuse.
 */
const HEADING_FIELD_MAX = 400;

/** The record's heading: the artist as a link, then the title, in one line. */
const HEADING = new RegExp(
  String.raw`<p[^>]*class="titrerosebg"[^>]*>\s*<a\s+href="/artist/(\d+)\.html"${TAG_REST}>([\s\S]{0,${HEADING_FIELD_MAX}}?)</a>\s*-\s*([\s\S]{0,${HEADING_FIELD_MAX}}?)</p>`,
  "i",
);

/** The sleeve at full size, published behind the thumbnail the record shows. */
const SLEEVE =
  /class="pochette-fiche"[\s\S]{0,600}?show-image\.html\?I=(\/images\/pochettes\/\d+\.[a-z]{3,4})/i;
const THUMBNAIL =
  /class="pochette-fiche"[\s\S]{0,600}?<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|gif))"/i;

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

/** Fields are written as `Label : <span class="txtred2">value</span>`. */
const FIELD = new RegExp(
  String.raw`([A-Za-zÀ-ÿ][^:<>{}]{1,40}?)\s*:\s*<span class="txtred2">([\s\S]{0,${CELL_MAX}}?)</span>`,
  "gi",
);

/** The collapsible block holding the date, the related artists and the chart. */
const EXTRA_BLOCK = /id="songinfos"/i;
const ADDED_ON = /Ajout[ée]\s+le\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const TOP50 = /Class[ée]\s+(\d+)\s+fois\s+dans\s+les\s+(\d+)\s+premiers/i;
const SEE_ALSO = /Voir aussi\s*:?/i;
const ARTIST_ANCHOR = new RegExp(
  String.raw`<a\s+href="/artist/(\d+)\.html"(?:[^>"]|"[^"]*")*>([\s\S]{0,${INLINE_MAX}}?)</a>`,
  "gi",
);

/**
 * How many people keep the record as a favourite.
 *
 * The count is tied to the word it belongs to rather than to a sentence read
 * word for word, since the number and the noun trade places depending on how the
 * line is phrased. Every pattern ties it to "personnes" or to "favoris", so a
 * stray number elsewhere on the page cannot be taken for it.
 */
const FAVOURITES = [
  /(\d+)\s+personnes?\s+(?:ont|a)\s+cette\s+chanson/i,
  /favoris\s+(?:de\s+)?(\d+)\s+personnes?/i,
  /(\d+)\s+personnes?[^.]{0,60}?favoris/i,
  /favoris[^.]{0,60}?(\d+)\s+personnes?/i,
];

const COMMENTS = /(\d+)\s+commentaires?/i;
const ARCHIVED = /dont\s+(\d+)\s+archiv/i;

/**
 * The heading that opens the lyrics block, which is what says a page has one.
 *
 * The heading is the word on its own or the head of a longer one, so a title
 * naming the song after it still marks the block. Two guards keep it from
 * matching the writing credits, where the site prints "Paroles : someone" inside
 * a link: the heading is a block element rather than an anchor, and its text
 * carries no colon.
 */
const LYRICS_HEADING = /<(?:p|h[1-6]|div|td)\b[^>]*>\s*Paroles\b[^<:]{0,40}</i;
/**
 * Who typed the transcription.
 *
 * The name follows the word, sometimes wrapped in a tag of its own and
 * sometimes bare, so one optional tag is stepped over and the reading stops at
 * the next one: what comes after that tag is the site's notice, not a name.
 */
const TRANSCRIBER = /Transcripteur\s*:\s*(?:<[^>]*>\s*)?([^<]*)/i;
const RIGHTS_NOTICE = /en attente d'une autorisation/i;

/** The cell the transcription itself sits in. */
const LYRICS_CELL = /<td[^>]*\bclass="paroles"[^>]*>/i;
/**
 * Where that cell stops.
 *
 * The site closes it with `</td>` under a record it credits a transcriber for
 * and opens the next row with `</tr>` alone under one it credits none for.
 * Waiting for `</td>` therefore runs past the cell on the second kind and
 * carries the rows below it into the answer.
 */
const CELL_END = /<\/t[dr]\b[^>]*>/i;
/** The credit line, which closes the transcription rather than belonging to it. */
const TRANSCRIBER_MARKER = /Transcripteur\s*:/i;
const LINE_BREAK = /<br\s*\/?>/gi;
/** Enough for a transcription, and a stop for a cell the site never closes. */
const MAX_LYRICS_LENGTH = 20_000;

export function parseSongPage(html: string, url: string, id: string): SongSummary {
  const heading = HEADING.exec(html);
  if (!heading) {
    throw parseFailure(url, "a song record whose heading could not be read");
  }

  const artistId = heading[1];
  const artistName = textOf(heading[2] ?? "");
  const title = textOf(heading[3] ?? "");
  if (!artistId || title === "") {
    throw parseFailure(url, "a song record naming neither a title nor an artist");
  }

  const sleeve = SLEEVE.exec(html)?.[1];
  const thumbnail = THUMBNAIL.exec(html)?.[1];

  return {
    id,
    title,
    url: songUrl(id),
    artist: {
      id: artistId,
      name: artistName,
      // A record page prints the credit alone; the site states an alias on the
      // results row, so claiming one here would invent it.
      aliasOf: null,
      url: artistUrl(artistId),
    },
    imageUrl: sleeve ? toAbsoluteUrl(sleeve) : null,
    thumbnailUrl: thumbnail ? toAbsoluteUrl(thumbnail) : null,
    // The programming marker belongs to the results table, in a vocabulary this
    // page does not use.
    programming: null,
  };
}

/** Fold a label so "Année" and "annee" name the same field. */
function foldLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function parseSongRecord(html: string, url: string, id: string): Song {
  const heading = HEADING.exec(html);
  if (!heading) {
    throw parseFailure(url, "a page carrying no song record");
  }

  const artistId = heading[1];
  const title = textOf(heading[3] ?? "");
  if (!artistId || title === "") {
    throw parseFailure(url, "a record naming neither a title nor an artist");
  }

  // The lyrics sit below the record, so everything read for the fields stops at
  // their heading: a word of a song must never reach a field of the record.
  const lyricsAt = html.search(LYRICS_HEADING);
  const record = lyricsAt > 0 ? html.slice(0, lyricsAt) : html;
  const plainRecord = textOf(record);

  const fields = new Map<string, string>();
  FIELD.lastIndex = 0;
  for (let match = FIELD.exec(record); match !== null; match = FIELD.exec(record)) {
    const label = foldLabel(textOf(match[1] ?? ""));
    if (label !== "" && !fields.has(label)) {
      fields.set(label, match[2] ?? "");
    }
  }

  const raw = (label: string) => fields.get(label);
  const asText = (label: string) => {
    const value = raw(label);
    if (value === undefined) {
      return null;
    }
    const text = textOf(value);
    return text === "" ? null : text;
  };
  const asList = (label: string) => {
    const value = raw(label);
    return value === undefined ? [] : fieldValues(value);
  };

  const yearText = asText("annee");
  const year = yearText !== null && /^\d{4}$/.test(yearText) ? Number.parseInt(yearText, 10) : null;

  const sleeve = SLEEVE.exec(record)?.[1];
  const thumbnail = THUMBNAIL.exec(record)?.[1];

  return {
    id,
    url: songUrl(id),
    title,
    artist: {
      id: artistId,
      name: textOf(heading[2] ?? ""),
      url: artistUrl(artistId),
    },
    creditedPerformer: asText("interprete"),
    year,
    writers: asList("auteurs compositeurs"),
    duration: parseDuration(asText("duree")),
    labels: asList("label"),
    catalogueReference: asText("reference"),
    presentation: asText("presentation"),
    sleeveCredits: asList("pochette"),
    seeAlso: readSeeAlso(record, artistId),
    imageUrl: sleeve ? toAbsoluteUrl(sleeve) : null,
    thumbnailUrl: thumbnail ? toAbsoluteUrl(thumbnail) : null,
    addedOn: readAddedOn(record),
    top50: readTop50(record),
    favourites: readFavourites(plainRecord),
    // The comment count sits below the transcription, so the page is read
    // whole with the transcription cut out of it: a line someone sang reading
    // "3 commentaires" is a word of a song, never the counter.
    comments: readComments(withoutTranscription(html, lyricsAt)),
    lyrics: readLyrics(html, lyricsAt, url),
  };
}

/** The date the record was catalogued, as an ISO day. */
function readAddedOn(record: string): string | null {
  const match = ADDED_ON.exec(record);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;

  // The site prints the day it catalogued a record, and a page can print
  // something the calendar has no room for. An ISO-shaped string that names no
  // day would be read as a date by everything downstream.
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== iso) {
    return null;
  }

  return iso;
}

function readTop50(record: string): Top50 | null {
  const match = TOP50.exec(textOf(record));
  if (!match) {
    return null;
  }
  const times = Number.parseInt(match[1] ?? "", 10);
  const within = Number.parseInt(match[2] ?? "", 10);
  return Number.isFinite(times) && Number.isFinite(within) ? { times, within } : null;
}

/**
 * The artists the record points to besides its own.
 *
 * The block repeats the record's artist, which is the link to their page rather
 * than a related act, so it is left out.
 */
function readSeeAlso(record: string, artistId: string): ArtistLink[] {
  const start = Math.max(record.search(EXTRA_BLOCK), 0);
  const block = record.slice(start);
  const seeAlsoAt = block.search(SEE_ALSO);
  if (seeAlsoAt < 0) {
    return [];
  }

  const window = block.slice(seeAlsoAt, seeAlsoAt + 2000);
  const links: ArtistLink[] = [];
  const seen = new Set<string>([artistId]);

  ARTIST_ANCHOR.lastIndex = 0;
  for (let match = ARTIST_ANCHOR.exec(window); match !== null; match = ARTIST_ANCHOR.exec(window)) {
    const id = match[1];
    const name = textOf(match[2] ?? "");
    if (!id || name === "" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    links.push({ id, name, url: artistUrl(id) });
  }
  return links;
}

function readFavourites(text: string): number | null {
  for (const pattern of FAVOURITES) {
    const value = readNumber(pattern, text);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function readNumber(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * The page with the transcription taken out of it.
 *
 * What sits below the cell belongs to the record and has to be read, and what
 * sits inside it is a song. Cutting the cell is what lets one page serve both
 * readings without either borrowing from the other.
 */
function withoutTranscription(html: string, lyricsAt: number): string {
  if (lyricsAt < 0) {
    return html;
  }

  const block = html.slice(lyricsAt, lyricsAt + MAX_LYRICS_LENGTH);
  const opening = LYRICS_CELL.exec(block);
  if (!opening) {
    return html;
  }

  const from = lyricsAt + opening.index + opening[0].length;
  const end = CELL_END.exec(html.slice(from, from + MAX_LYRICS_LENGTH));
  if (!end) {
    return html.slice(0, from);
  }

  return html.slice(0, from) + html.slice(from + end.index);
}

function readComments(html: string): CommentCount | null {
  const plain = textOf(html);
  const count = readNumber(COMMENTS, plain);
  if (count === null) {
    return null;
  }
  return { count, archived: readNumber(ARCHIVED, plain) };
}

/**
 * The lyrics block: the transcription, who typed it, and the notice under it.
 *
 * The credit and the notice are read from the block as a whole, and the
 * transcription from the cell alone, which is what keeps the rows printed below
 * the cell out of it.
 */
function readLyrics(html: string, lyricsAt: number, url: string): LyricsInfo {
  if (lyricsAt < 0) {
    return { available: false, text: null, transcriber: null, rightsNotice: false, url };
  }

  const block = html.slice(lyricsAt, lyricsAt + MAX_LYRICS_LENGTH);
  const transcriber = textOf(TRANSCRIBER.exec(block)?.[1] ?? "");

  return {
    available: true,
    text: readLyricsText(block),
    transcriber: transcriber === "" ? null : transcriber,
    rightsNotice: RIGHTS_NOTICE.test(textOf(block)),
    url,
  };
}

/**
 * The transcription as the page prints it, one published line per line.
 *
 * Each line is read on its own so the breaks the site marks up survive, and the
 * credit line closing the cell is dropped: it says who typed the words rather
 * than being one of them.
 */
function readLyricsText(block: string): string | null {
  const opening = LYRICS_CELL.exec(block);
  if (!opening) {
    return null;
  }

  const afterOpening = block.slice(opening.index + opening[0].length);
  const end = CELL_END.exec(afterOpening);
  // A cell running past the window has no end in view, so what fits is a piece
  // of a transcription. Returning it would publish a cut one under a field
  // saying the words are as published.
  if (!end) {
    return null;
  }
  const cell = afterOpening.slice(0, end.index);

  const credit = TRANSCRIBER_MARKER.exec(cell);
  const published = credit ? cell.slice(0, credit.index) : cell;

  // Only `<br>` breaks a line. The newlines the markup itself carries sit
  // inside a line and are folded away with the rest of its whitespace.
  const lines = published.split(LINE_BREAK).map(textOf);
  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }

  const text = lines.join("\n");
  return text === "" ? null : text;
}
