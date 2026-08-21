/**
 * list_new_songs: what the collection has just catalogued.
 */

import { z } from "zod";
import type { BideEtMusiqueClient } from "../bideetmusique/client.js";
import { strictInput } from "./arguments.js";
import { noteIfTextIsCut, ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const listNewSongsDescription = [
  "Read the records Bide & Musique has just catalogued.",
  "The collection is built by hand and grows a few records at a time, so this answers what has been",
  "added lately rather than what the station is playing.",
  "The feed carries a fixed number of entries and offers no second page, so the count is what it",
  "holds and says nothing about how many records the collection has.",
  "Entries come in the order the feed publishes them, which runs newest first without being sorted:",
  "read 'published_at' rather than the position to date one.",
  "Each entry names the song and the artist as one line, which is read apart at the first separator",
  "and kept whole under 'listed_as'. Use get_song on the id for the record itself: year, writers,",
  "label, duration and the words when the page carries them.",
  "When you show a record to a user, credit Bide & Musique and link the page.",
].join(" ");

export const listNewSongsInput = strictInput({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum entries to return, taken from the head of the feed."),
});

export const listNewSongsOutputShape = {
  results: z.array(
    z.object({
      song_id: z.string(),
      title: z.string().describe("The song, read off the line the feed publishes."),
      artist_name: z
        .string()
        .nullable()
        .describe(
          "The artist, read off the same line. Null when the line carries no separator, since " +
            "the feed names no artist of its own there.",
        ),
      listed_as: z
        .string()
        .describe("The line as the feed published it, naming both, before it was read apart."),
      url: z.string(),
      published_at: z
        .string()
        .nullable()
        .describe("The day the feed published the entry, as an ISO date."),
    }),
  ),
  result_count: z.number().int(),
  entries_in_feed: z
    .number()
    .int()
    .describe(
      "How many entries the feed carries, read or not. It is a fixed window on the newest " +
        "records, never a count of the collection.",
    ),
  source: z.literal("bide-et-musique.com"),
  notes: z.array(z.string()),
};

export interface ListNewSongsArgs {
  limit: number;
}

export async function runListNewSongs(
  client: BideEtMusiqueClient,
  args: ListNewSongsArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getNewSongs(signal);
    const shown = data.songs.slice(0, args.limit);

    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }

    notes.push(
      `Bide & Musique publishes ${data.published} entries here, and this feed is the whole of ` +
        "what it offers: there is no second page, and the number says nothing about how many " +
        "records the collection holds.",
    );

    if (shown.length < data.songs.length) {
      notes.push(
        `Showing ${shown.length} of the ${data.songs.length} entries read. Raise 'limit' to read ` +
          "the rest.",
      );
    }

    // An entry pointing at something other than a record is dropped, and a
    // count of what was read, named after what the site published, would count
    // a feed nobody serves.
    if (data.songs.length < data.published) {
      notes.push(
        `${data.published - data.songs.length} of the entries the feed carries name no record, ` +
          "so they are absent from this list.",
      );
    }

    const unnamed = shown.filter((song) => song.artistName === null).length;
    if (unnamed > 0) {
      notes.push(
        `${unnamed} of these entries publish one line naming no artist apart from the song, so ` +
          "the artist comes back null rather than cut out of the title. Their record page names " +
          "the artist.",
      );
    }

    const structured = {
      results: shown.map((song) => ({
        song_id: song.songId,
        title: song.title,
        artist_name: song.artistName,
        listed_as: song.listedAs,
        url: song.url,
        published_at: song.publishedAt,
      })),
      result_count: shown.length,
      entries_in_feed: data.published,
      source: "bide-et-musique.com" as const,
      notes,
    };

    const lines = shown.map((song) => {
      const day = song.publishedAt === null ? "" : `${song.publishedAt} · `;
      return `${day}${song.listedAs} : ${song.url}`;
    });

    const body = lines.join("\n");
    noteIfTextIsCut(body, notes);

    return ok(structured, body, notes);
  } catch (error) {
    return toToolError(error);
  }
}
