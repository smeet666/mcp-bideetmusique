/**
 * The feed of newly catalogued records.
 *
 * It is the only place the site publishes what it has just added, and the only
 * place it names its most recent id, which is what bounds a draw over the
 * catalogue. Taking that bound from the site keeps it a published fact, where a
 * constant written here would age into a claim about a catalogue that has grown
 * past it.
 */

import { parseFailure } from "../errors.js";
import type { NewSong, NewSongsFeed } from "../types.js";
import { decodeEntities } from "./html.js";
import { songUrl } from "./urls.js";

const ITEM = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
const TITLE = /<title>([\s\S]*?)<\/title>/i;
const LINK = /<link>([\s\S]*?)<\/link>/i;
const PUB_DATE = /<pubDate>([\s\S]*?)<\/pubDate>/i;
const SONG_LINK = /\/song\/(\d+)\.html/;

/**
 * What separates the artist from the song on the one line an entry publishes.
 *
 * A song title can carry it too, so only the first occurrence separates and the
 * rest belongs to the title.
 */
const SEPARATOR = " - ";

/**
 * The feed escapes text that was escaped already, so an ampersand reaches it as
 * `&amp;amp;`. Decoding runs until the text stops changing, which resolves that
 * without touching a page: a second pass only fires where a first one produced
 * an entity, which is the double escaping and nothing else.
 */
const MAX_DECODE_PASSES = 3;

function decodeFeedText(text: string): string {
  let current = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const decoded = decodeEntities(current);
    if (decoded === current) return current;
    current = decoded;
  }
  return current;
}

/**
 * The feed: the records it names, in the order it published them, and how many
 * entries it carries.
 */
export function parseNewSongs(xml: string, url: string): NewSongsFeed {
  const songs: NewSong[] = [];
  let published = 0;

  ITEM.lastIndex = 0;
  for (let match = ITEM.exec(xml); match !== null; match = ITEM.exec(xml)) {
    published += 1;
    const item = match[1] ?? "";
    const songId = SONG_LINK.exec(LINK.exec(item)?.[1] ?? "")?.[1];
    if (!songId) continue;

    const listedAs = decodeFeedText(TITLE.exec(item)?.[1] ?? "").trim();
    const at = listedAs.indexOf(SEPARATOR);

    songs.push({
      songId,
      // An entry whose line carries no separator names no artist here rather
      // than one cut out of the title.
      artistName: at > 0 ? listedAs.slice(0, at).trim() : null,
      title: at > 0 ? listedAs.slice(at + SEPARATOR.length).trim() : listedAs,
      listedAs,
      url: songUrl(songId),
      publishedAt: readDate(PUB_DATE.exec(item)?.[1]),
    });
  }

  if (songs.length === 0) {
    throw parseFailure(url, "a feed of new records naming no record");
  }

  return { songs, published };
}

/** The day an entry was published, or nothing when it states none readably. */
function readDate(raw: string | undefined): string | null {
  if (raw === undefined) return null;

  const at = new Date(raw.trim());
  if (Number.isNaN(at.getTime())) return null;

  return at.toISOString().slice(0, 10);
}
