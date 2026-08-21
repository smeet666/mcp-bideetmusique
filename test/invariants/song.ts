/**
 * What a record must satisfy, whichever record it is.
 *
 * These are properties rather than expected values: they hold for the record a
 * test builds and for one the site serves this morning, which is what lets the
 * deterministic suite and the evals check the same thing from two sources. A
 * property stated once here cannot drift between them.
 *
 * A checker that finds nothing is worthless unless something proves it can, so
 * the deterministic suite feeds it records that violate each property and
 * expects it to say so.
 */

import type { Song } from "../../src/types.js";

export interface Violation {
  /** The property that failed, named the way it reads in this file. */
  property: string;
  /** What was found, short enough to read in a failure message. */
  found: string;
}

const MARKUP = /<[a-z/][^>]*>/i;
const UNDECODED_ENTITY = /&(?:[a-z][a-z0-9]*|#x?[0-9a-f]+);/i;
const CREDIT_LINE = /Transcripteur\s*:/i;
const RIGHTS_NOTICE = /en attente d'une autorisation/i;
const STREAM_ENDPOINT = /stream_\d+\.php|\/stream_/i;

/** The site, and nothing beyond it. */
const SITE_URL = "https://www.bide-et-musique.com/";

function excerpt(text: string, match: RegExpExecArray): string {
  const from = Math.max(0, match.index - 20);
  return text.slice(from, match.index + match[0].length + 20).replace(/\s+/g, " ");
}

/**
 * Everything wrong with a record, or an empty list.
 *
 * The whole record is checked rather than the first failure, so one run names
 * every property broken instead of one per run.
 */
export function violationsOf(song: Song): Violation[] {
  const violations: Violation[] = [];
  const note = (property: string, found: string) => violations.push({ property, found });

  const lyrics = song.lyrics;

  if (lyrics.text !== null) {
    const checks: [string, RegExp][] = [
      ["the transcription carries no markup", MARKUP],
      ["the transcription carries no undecoded entity", UNDECODED_ENTITY],
      ["the transcription stops before the line naming who typed it", CREDIT_LINE],
      // The notice sits in the row immediately under the cell, and no song is
      // sung in the site's own words, so it is the one sentinel that says the
      // cell boundary held. A counter further down the page reads like a line
      // someone could sing, and a property that fires on published words is a
      // property that reports a good record as a defect.
      ["the transcription holds none of the notice printed under it", RIGHTS_NOTICE],
    ];
    for (const [property, pattern] of checks) {
      const match = pattern.exec(lyrics.text);
      if (match) {
        note(property, excerpt(lyrics.text, match));
      }
    }

    if (lyrics.text.trim() === "") {
      note("a transcription is null rather than blank", JSON.stringify(lyrics.text));
    }
    if (lyrics.text !== lyrics.text.trim()) {
      note(
        "a transcription carries no leading or trailing blank line",
        JSON.stringify(lyrics.text.slice(0, 20)),
      );
    }
  }

  if (!lyrics.available && lyrics.text !== null) {
    note("a page carrying no transcription reports none", String(lyrics.text).slice(0, 40));
  }

  if (!lyrics.url.startsWith(SITE_URL)) {
    note("the lyrics url points at the site", lyrics.url);
  }
  if (!song.url.startsWith(SITE_URL)) {
    note("the record url points at the site", song.url);
  }

  // The per-song audio endpoint sits on every record page and belongs to the
  // station's stream rather than to the catalogue.
  for (const value of stringsOf(song)) {
    const match = STREAM_ENDPOINT.exec(value);
    if (match) {
      note("no field carries the audio stream endpoint", excerpt(value, match));
    }
  }

  return violations;
}

/** Every string anywhere in the record, however deeply nested. */
function stringsOf(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsOf);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(stringsOf);
  }
  return [];
}

/** A failure message naming every property broken, for a test to throw. */
export function describeViolations(label: string, violations: Violation[]): string {
  return [
    `${label} breaks ${violations.length} of the properties a record must satisfy:`,
    ...violations.map((violation) => `  - ${violation.property}, found: ${violation.found}`),
  ].join("\n");
}
