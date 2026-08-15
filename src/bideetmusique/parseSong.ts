/**
 * Reading the heading of a song record.
 *
 * A search matching exactly one song is answered with that song's page rather
 * than a list, so this reads the few fields a search row carries: who is
 * credited, what the song is called, and the sleeve. Nothing else on the record
 * is read here, and the lyrics printed further down the page are never read at
 * all: Bide & Musique publishes those while awaiting permission from the rights
 * holders, so this server links the page and repeats none of its text.
 */

import { parseFailure } from "../errors.js";
import type { SongSummary } from "../types.js";
import { textOf } from "./html.js";
import { artistUrl, songUrl, toAbsoluteUrl } from "./urls.js";

/** The record's heading: the artist as a link, then the title, in one line. */
const HEADING =
  /<p[^>]*class="titrerosebg"[^>]*>\s*<a\s+href="\/artist\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>\s*-\s*([\s\S]*?)<\/p>/i;

/** The sleeve at full size, published behind the thumbnail the record shows. */
const SLEEVE =
  /class="pochette-fiche"[\s\S]{0,600}?show-image\.html\?I=(\/images\/pochettes\/\d+\.[a-z]{3,4})/i;
const THUMBNAIL =
  /class="pochette-fiche"[\s\S]{0,600}?<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|gif))"/i;

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
