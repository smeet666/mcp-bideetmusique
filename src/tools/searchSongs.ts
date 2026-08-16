/**
 * search_songs: find songs in the Bide & Musique collection, by performer or by
 * title.
 */

import { z } from "zod";
import type { BideEtMusiqueClient } from "../bideetmusique/client.js";
import type { SearchType } from "../bideetmusique/urls.js";
import { SEARCH_TYPE_LABELS, YEAR_QUERY } from "../bideetmusique/urls.js";
import { invalidInput } from "../errors.js";
import { strictInput } from "./arguments.js";
import { ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchSongsDescription = [
  "Search the Bide & Musique collection: French songs, mostly forgotten ones, catalogued by hand",
  "since 2000 by the association that runs the station. Bide & Musique is a French site, so French",
  "terms work best.",
  "'search_type' picks the axis and has to be stated: 'performer' for the artist credited on the",
  "record, 'title' for the name of the song, 'writer' for who wrote or composed it, 'lyrics' for the",
  "words sung in it, 'label' for the label it came out on, 'year' for the year printed on it. Each",
  "asks a different question and they are never merged, so a name that finds nothing as a performer",
  "may still be a title.",
  "'year' takes one four-digit year and nothing else: the site drops any other word on that axis",
  "instead of filtering on it, and the ranges its own form documents return nothing. To combine a",
  "year with words, search the words on their own axis and read each record's year from its page.",
  "Use 'lyrics' to find a song from a line someone remembers. It answers with the songs whose words",
  "match; the words themselves stay on the site, which publishes them while awaiting permission from",
  "the rights holders.",
  "Several keywords are combined with AND, each matched inside words, so every extra word narrows the",
  "search and never widens it. Quoting a phrase returns nothing, whatever the site's own form says.",
  "Results carry the song id, the artist and the page to read, which is where the song's own record",
  "lives: year, label, catalogue reference and writers.",
  "The count returned counts matching songs across every page, so it is usually larger than the rows",
  "of one page; ask for the next page with 'page'.",
  "When you show a song to a user, credit Bide & Musique and link the source URL.",
].join(" ");

export const searchSongsInput = strictInput({
  // Deliberately no min(1): an empty string would be rejected by the schema with
  // a protocol-level validation error, while a whitespace-only one would reach
  // the tool and come back as invalid_input. Letting both through to the same
  // check gives callers one error code for one problem.
  query: z
    .string()
    .max(200)
    .describe("What to search for, in French, for example 'Pierre Bachelet' or 'vacances'."),
  search_type: z
    .enum(["performer", "title", "writer", "lyrics", "label", "year"])
    .describe(
      "Which axis to search: 'performer' for the artist credited on the record, 'title' for the " +
        "name of the song, 'writer' for who wrote or composed it, 'lyrics' for the words sung in it.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(1)
    .describe("Which page of results to read. The answer states which page the site served."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum songs to return from that page."),
});

export const searchSongsOutputShape = {
  query: z.string(),
  search_type: z.enum(["performer", "title", "writer", "lyrics", "label", "year"]),
  page_requested: z.number().int(),
  page_served: z
    .number()
    .int()
    .nullable()
    .describe(
      "The page the site actually served, read from its pagination bar. Asking for a page past the " +
        "last one returns the last page, so this can differ from 'page_requested'.",
    ),
  page_count: z.number().int().nullable(),
  has_more_pages: z.boolean().nullable(),
  total_matches: z
    .number()
    .int()
    .nullable()
    .describe(
      "The number Bide & Musique prints above the results, counting matching songs across every " +
        "page. Null when the site printed none, which is different from zero.",
    ),
  results: z.array(
    z.object({
      song_id: z.string().describe("Bide & Musique song id."),
      title: z.string(),
      url: z.string(),
      artist: z.object({
        id: z.string(),
        name: z.string().describe("The performer as credited on this record."),
        alias_of: z
          .string()
          .nullable()
          .describe(
            "The artist behind the credit, when the site prints one: a record released under a " +
              "one-off name links to the artist who made it.",
          ),
        url: z.string(),
      }),
      image_url: z
        .string()
        .nullable()
        .describe(
          "The sleeve at full size. Published the same way by a results row and by a record page, so " +
            "it means the same thing wherever the row was read. Null when none is published.",
        ),
      thumbnail_url: z
        .string()
        .nullable()
        .describe(
          "The thumbnail as published, whose size follows the page it came from: small from a list of " +
            "results, larger from a record. Use 'image_url' when one size is wanted throughout.",
        ),
      programming: z
        .string()
        .nullable()
        .describe(
          "How the song sits in the station's programming, in the site's own French wording, for " +
            "example 'Dans la programmation générale'.",
        ),
    }),
  ),
  result_count: z.number().int().describe("Songs returned, after 'limit'."),
  rows_on_page: z.number().int().describe("Songs this page held, before 'limit'."),
  source: z.literal("bide-et-musique.com"),
  notes: z.array(z.string()),
};

export interface SearchSongsArgs {
  query: string;
  search_type: SearchType;
  page: number;
  limit: number;
}

/**
 * How much of a query a row actually carries.
 *
 * Bide & Musique matches inside words, so "Bino" as a title brings back eleven
 * records of "Bambino", and "vacan" brings back "Les vacances". Neither row
 * carries the query as a word, and the two are not equally surprising: a row
 * whose word opens with what was typed reads as the intended match, a row that
 * hides it in the middle does not. Both are worth saying, in different words.
 *
 * Accents and punctuation are folded away so "dé" reads the same as "de", and
 * words of two letters are ignored, since an article says nothing about the
 * subject.
 */
type Carried = "word" | "opening" | "inside";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function carriedBy(texts: string[], query: string): Carried {
  const words = fold(query)
    .split(" ")
    .filter((word) => word.length > 2);
  // Nothing long enough to look for: the rows cannot disagree with the query.
  if (words.length === 0) return "word";

  const haystacks = texts.map((text) => ` ${fold(text)} `);
  const carries = (test: (haystack: string, word: string) => boolean) =>
    haystacks.some((haystack) => words.some((word) => test(haystack, word)));

  if (carries((haystack, word) => haystack.includes(` ${word} `))) return "word";
  if (carries((haystack, word) => haystack.includes(` ${word}`))) return "opening";
  return "inside";
}

/**
 * What a row carries of the axis it was searched on.
 *
 * Only two axes are checkable. A results row prints the title and the
 * performer, so a query that matched neither can be pointed out. It prints
 * nothing of the writers and nothing of the lyrics, so on those axes there is
 * no evidence in the row either way, and saying anything about the match would
 * be inventing it.
 */
const MATCHED_FIELD: Partial<
  Record<SearchType, { of: (row: { title: string; artist: { name: string } }) => string; noun: string }>
> = {
  title: { of: (row) => row.title, noun: "title" },
  performer: { of: (row) => row.artist.name, noun: "performer" },
};

/** Where the match was made, on the axes whose rows cannot show it. */
const INVISIBLE_MATCH: Partial<Record<SearchType, string>> = {
  writer: "the writing and composing credits",
  lyrics: "the words sung in the song",
  label: "the label the record came out on",
  year: "the year printed on the record",
};

export async function runSearchSongs(
  client: BideEtMusiqueClient,
  args: SearchSongsArgs,
): Promise<ToolResult> {
  try {
    // Trimming happens before the emptiness check: a whitespace-only query is as
    // empty as a missing one, and letting it through would spend a request on a
    // search the site refuses anyway.
    const query = args.query.trim();
    if (!query) {
      throw invalidInput(
        "'query' cannot be empty.",
        "Give a performer or a song title, for example query=\"Pierre Bachelet\" with " +
          'search_type="performer".',
      );
    }

    if (args.search_type === "year" && !YEAR_QUERY.test(query)) {
      throw invalidInput(
        `"${query}" is not a year, and the Année axis takes nothing else.`,
        "Pass a single four-digit year, for example 1983. Bide & Musique drops any other word on " +
          "this axis instead of filtering on it, so a year with a word beside it answers with every " +
          "song of that year while looking like a narrower search. The ranges its own form " +
          'documents, such as ">1980 <=1985", return nothing at all. To combine a year with words, ' +
          "search the words on their own axis and read each record's year from its page.",
      );
    }

    const { data, cached } = await client.search({
      query,
      searchType: args.search_type,
      page: args.page,
    });

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    if (data.pageServed !== null && data.pageServed !== args.page) {
      notes.push(
        `Page ${args.page} was requested and Bide & Musique served page ${data.pageServed}. The site ` +
          "answers a page past the last one with the last page rather than an error, so these rows " +
          `are page ${data.pageServed}${data.pageCount !== null ? ` of ${data.pageCount}` : ""}.`,
      );
    }

    if (data.redirectedToSong) {
      notes.push(
        "Exactly one song matched, so Bide & Musique answered with that song's own page instead of " +
          "a list. The row therefore comes from the record itself and states no programming marker.",
      );
    }

    if (data.songs.length === 0) {
      notes.push(
        `Bide & Musique found no song for "${query}" on the ${SEARCH_TYPE_LABELS[args.search_type]} ` +
          "axis, which says nothing about the other axes. A name can be a title, a title can be a " +
          "line of a song, a label can be a word, and someone who wrote a record may never have " +
          "sung on one.",
      );
    }

    if (data.songs.length > args.limit) {
      notes.push(
        `This page holds ${data.songs.length} songs; showing the first ${args.limit}. Bide & Musique ` +
          "orders rows by performer and then by title, never by how well a row matches, so these are " +
          "the head of an alphabetical list rather than the closest matches.",
      );
    }

    const field = MATCHED_FIELD[args.search_type];
    if (field && data.songs.length > 0) {
      const carried = carriedBy(
        data.songs.map((song) => field.of(song)),
        query,
      );
      if (carried === "opening") {
        notes.push(
          `No ${field.noun} here carries "${query}" as a whole word; it only opens one. Bide & ` +
            "Musique matches inside words, so a longer word starting with those letters counts as a " +
            "match.",
        );
      }
      if (carried === "inside") {
        notes.push(
          `No ${field.noun} here carries "${query}" as a word at all. Bide & Musique matches inside ` +
            'words, so searching "Bino" brings back records of "Bambino". Read these as rows the site ' +
            "offered for that spelling rather than as matches for the word itself.",
        );
      }
    }

    const matchedOn = INVISIBLE_MATCH[args.search_type];
    if (matchedOn && data.songs.length > 0) {
      notes.push(
        `The match was made on ${matchedOn}, which these rows do not show, so a title that looks ` +
          "unrelated to the query is expected here. Open the song page to see what matched.",
      );
    }

    if (query.includes('"')) {
      notes.push(
        "The query carries a double quote. Bide & Musique's own form offers quotes for searching a " +
          "phrase, and a quoted phrase returns nothing at all. Search the bare words instead: they " +
          "are combined with AND, so the phrase's words together still narrow the search.",
      );
    }

    if (data.unreadableRows > 0) {
      notes.push(
        `${data.unreadableRows} row(s) on this page could not be read and were left out, so the ` +
          "rows shown are fewer than the page held.",
      );
    }

    if (data.totalMatches === null && data.songs.length > 0) {
      notes.push(
        "The site printed no total above these results, so the number of matching songs is unknown " +
          "rather than the number of rows shown here.",
      );
    }

    if (data.hasMorePages === true) {
      notes.push(
        `More results follow: ask for page ${(data.pageServed ?? args.page) + 1} to read them.`,
      );
    }

    const results = data.songs.slice(0, args.limit).map((song) => ({
      song_id: song.id,
      title: song.title,
      url: song.url,
      artist: {
        id: song.artist.id,
        name: song.artist.name,
        alias_of: song.artist.aliasOf,
        url: song.artist.url,
      },
      image_url: song.imageUrl,
      thumbnail_url: song.thumbnailUrl,
      programming: song.programming,
    }));

    const structured = {
      query,
      search_type: args.search_type,
      page_requested: args.page,
      page_served: data.pageServed,
      page_count: data.pageCount,
      has_more_pages: data.hasMorePages,
      total_matches: data.totalMatches,
      results,
      result_count: results.length,
      rows_on_page: data.songs.length,
      source: "bide-et-musique.com" as const,
      notes,
    };

    const header =
      results.length > 0
        ? `${results.length} morceau(x) pour "${query}" (${SEARCH_TYPE_LABELS[args.search_type]}) :`
        : `Aucun morceau pour "${query}" (${SEARCH_TYPE_LABELS[args.search_type]}).`;
    const list = results
      .map(
        (song, index) =>
          `${index + 1}. ${song.artist.name} · ${song.title} · id: ${song.song_id}`,
      )
      .join("\n");

    return ok(structured, list ? `${header}\n${list}` : header, notes);
  } catch (error) {
    return toToolError(error);
  }
}
