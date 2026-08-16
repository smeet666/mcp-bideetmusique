/**
 * Reading a song record.
 *
 * Two readings live here. `parseSongPage` takes the few fields a search row
 * carries, for the case where a search matching a single song is answered with
 * that song's page. `parseSongRecord` reads the record itself.
 *
 * Neither reads the lyrics. Bide & Musique prints transcriptions its members
 * typed, under its own notice saying it awaits permission from the rights
 * holders, so this server states that the page has some, who typed them and
 * where they are, and repeats no line of them on any path. The per-song audio
 * stream the page plays is left alone for the same reason: linking a page is not
 * handing out the recording.
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
const TAG_REST = String.raw`(?:[^>"]|"[^"]*")*`;

/** The record's heading: the artist as a link, then the title, in one line. */
const HEADING = new RegExp(
  String.raw`<p[^>]*class="titrerosebg"[^>]*>\s*<a\s+href="/artist/(\d+)\.html"${TAG_REST}>([\s\S]*?)</a>\s*-\s*([\s\S]*?)</p>`,
  "i",
);

/** The sleeve at full size, published behind the thumbnail the record shows. */
const SLEEVE =
  /class="pochette-fiche"[\s\S]{0,600}?show-image\.html\?I=(\/images\/pochettes\/\d+\.[a-z]{3,4})/i;
const THUMBNAIL =
  /class="pochette-fiche"[\s\S]{0,600}?<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|gif))"/i;

/** Fields are written as `Label : <span class="txtred2">value</span>`. */
const FIELD = /([A-Za-zÀ-ÿ][^:<>{}]{1,40}?)\s*:\s*<span class="txtred2">([\s\S]*?)<\/span>/gi;

/** The collapsible block holding the date, the related artists and the chart. */
const EXTRA_BLOCK = /id="songinfos"/i;
const ADDED_ON = /Ajout[ée]\s+le\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const TOP50 = /Class[ée]\s+(\d+)\s+fois\s+dans\s+les\s+(\d+)\s+premiers/i;
const SEE_ALSO = /Voir aussi\s*:?/i;
const ARTIST_ANCHOR = /<a\s+href="\/artist\/(\d+)\.html"(?:[^>"]|"[^"]*")*>([\s\S]*?)<\/a>/gi;

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
 * The lyrics block, located so it can be described and left unread.
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

  // The lyrics sit below the record. Everything read for the fields stops before
  // them, and the counters below are read as numbers from text that is never
  // kept.
  const lyricsAt = html.search(LYRICS_HEADING);
  const record = lyricsAt > 0 ? html.slice(0, lyricsAt) : html;
  const plainRecord = textOf(record);

  const fields = new Map<string, string>();
  FIELD.lastIndex = 0;
  for (let match = FIELD.exec(record); match !== null; match = FIELD.exec(record)) {
    const label = foldLabel(textOf(match[1] ?? ""));
    if (label !== "" && !fields.has(label)) fields.set(label, match[2] ?? "");
  }

  const raw = (label: string) => fields.get(label);
  const asText = (label: string) => {
    const value = raw(label);
    if (value === undefined) return null;
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
    // The comment count sits below the lyrics, so it is read from the whole
    // page. Only the number is kept.
    comments: readComments(html),
    lyrics: readLyrics(html, lyricsAt, url),
  };
}

/** The date the record was catalogued, as an ISO day. */
function readAddedOn(record: string): string | null {
  const match = ADDED_ON.exec(record);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function readTop50(record: string): Top50 | null {
  const match = TOP50.exec(textOf(record));
  if (!match) return null;
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
  const start = record.search(EXTRA_BLOCK) >= 0 ? record.search(EXTRA_BLOCK) : 0;
  const block = record.slice(start);
  const seeAlsoAt = block.search(SEE_ALSO);
  if (seeAlsoAt < 0) return [];

  const window = block.slice(seeAlsoAt, seeAlsoAt + 2000);
  const links: ArtistLink[] = [];
  const seen = new Set<string>([artistId]);

  ARTIST_ANCHOR.lastIndex = 0;
  for (let match = ARTIST_ANCHOR.exec(window); match !== null; match = ARTIST_ANCHOR.exec(window)) {
    const id = match[1];
    const name = textOf(match[2] ?? "");
    if (!id || name === "" || seen.has(id)) continue;
    seen.add(id);
    links.push({ id, name, url: artistUrl(id) });
  }
  return links;
}

function readFavourites(text: string): number | null {
  for (const pattern of FAVOURITES) {
    const value = readNumber(pattern, text);
    if (value !== null) return value;
  }
  return null;
}

function readNumber(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function readComments(html: string): CommentCount | null {
  const plain = textOf(html);
  const count = readNumber(COMMENTS, plain);
  if (count === null) return null;
  return { count, archived: readNumber(ARCHIVED, plain) };
}

/**
 * What the page says about its lyrics.
 *
 * The block is located to be described and then left alone: nothing below the
 * heading is read into the result beyond the transcriber's name and whether the
 * site printed its notice.
 */
function readLyrics(html: string, lyricsAt: number, url: string): LyricsInfo {
  if (lyricsAt < 0) {
    return { available: false, transcriber: null, rightsNotice: false, url };
  }

  const block = html.slice(lyricsAt, lyricsAt + 20_000);
  const transcriber = textOf(TRANSCRIBER.exec(block)?.[1] ?? "");

  return {
    available: true,
    transcriber: transcriber === "" ? null : transcriber,
    rightsNotice: RIGHTS_NOTICE.test(textOf(block)),
    url,
  };
}
