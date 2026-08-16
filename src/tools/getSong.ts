/**
 * get_song: read one record from the Bide & Musique collection.
 */

import { z } from "zod";
import type { BideEtMusiqueClient } from "../bideetmusique/client.js";
import { strictInput } from "./arguments.js";
import { ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getSongDescription = [
  "Read one song's record on Bide & Musique: the year, the writers and composers, the duration, the",
  "label and its catalogue reference, the sleeve, when the collection catalogued it, how it ranked in",
  "the station's own chart, and how many people kept it as a favourite.",
  "Takes the 'song_id' that search_songs returns.",
  "Three things are always there: the title, the artist and the duration. Everything else is absent",
  "on some records, and comes back null or empty rather than guessed; a counter the record does not",
  "print is unknown, not zero.",
  "The record page carries lyrics that Bide & Musique publishes while awaiting permission from the",
  "rights holders. This tool says whether they are there, who transcribed them and where to read",
  "them, and returns none of that text.",
  "When you show a record to a user, credit Bide & Musique and link the page.",
].join(" ");

export const getSongInput = strictInput({
  song_id: z
    .string()
    .max(20)
    .describe("The song id returned by search_songs, digits only, for example '1734'."),
});

const artistLink = z.object({ id: z.string(), name: z.string(), url: z.string() });

export const getSongOutputShape = {
  song_id: z.string(),
  url: z.string(),
  title: z.string(),
  artist: artistLink,
  credited_performer: z
    .string()
    .nullable()
    .describe("A performer the sleeve credits apart from the artist page, when the record names one."),
  year: z.number().int().nullable(),
  writers: z
    .array(z.string())
    .describe(
      "Writers and composers as credited, one entry each, empty when the record credits none. A few " +
        "records name the part someone took, and the entry then reads as the site prints it, for " +
        "example 'Paroles : Jean-Pierre Lang'.",
    ),
  duration: z.object({
    text: z.string().describe("The duration exactly as the record prints it."),
    seconds: z.number().int().nullable(),
    precision: z
      .enum(["second", "minute", "hour"])
      .nullable()
      .describe(
        "The smallest unit the record stated. A record saying '4 m' is 240 seconds at minute " +
          "precision: it never claimed the seconds.",
      ),
  }),
  labels: z.array(z.string()).describe("One entry per label, two when a record was co-released."),
  catalogue_reference: z
    .string()
    .nullable()
    .describe("The reference printed on the record. A reference of four digits is not a year."),
  presentation: z.string().nullable().describe("What the catalogue wrote about the record."),
  sleeve_credits: z.array(z.string()).describe("Who is credited for the sleeve, when anyone is."),
  see_also: z.array(artistLink).describe("Other artists the record links to."),
  image_url: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  added_on: z.string().nullable().describe("The day the collection catalogued it, as an ISO date."),
  top50: z
    .object({
      times: z.number().int(),
      within: z.number().int().describe("The chart depth the site named, which is 50 or 10."),
    })
    .nullable(),
  favourites: z
    .number()
    .int()
    .nullable()
    .describe("How many people keep it as a favourite. Null when the page prints no counter."),
  comments: z
    .object({ count: z.number().int(), archived: z.number().int().nullable() })
    .nullable(),
  lyrics: z.object({
    available: z.boolean(),
    transcriber: z.string().nullable(),
    rights_notice: z
      .boolean()
      .describe("True when the page prints its notice about awaiting permission from the rights holders."),
    url: z.string().describe("Where to read them: the record page. This tool carries none of the text."),
  }),
  source: z.literal("bide-et-musique.com"),
  notes: z.array(z.string()),
};

export interface GetSongArgs {
  song_id: string;
}

export async function runGetSong(
  client: BideEtMusiqueClient,
  args: GetSongArgs,
): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getSong(args.song_id.trim());

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    // What a record does not state is worth saying out loud: a caller reading a
    // null cannot tell a field the site left blank from one this server failed
    // to read.
    const missing = [
      data.year === null ? "the year" : null,
      data.writers.length === 0 ? "the writers" : null,
      data.labels.length === 0 ? "the label" : null,
      data.catalogueReference === null ? "the catalogue reference" : null,
    ].filter((item): item is string => item !== null);
    if (missing.length > 0) {
      notes.push(`This record states none of: ${missing.join(", ")}.`);
    }

    const silentCounters = [
      data.favourites === null ? "the favourite count" : null,
      data.comments === null ? "the comment count" : null,
    ].filter((item): item is string => item !== null);
    if (silentCounters.length > 0) {
      notes.push(
        `This record prints no ${silentCounters.join(" and no ")}, so what is missing comes back ` +
          "unknown rather than as zero: the site shows that line only once there is something to " +
          "count.",
      );
    }

    if (data.duration.precision === "minute") {
      notes.push(
        `The record states its length as "${data.duration.text}", so the seconds are this server's ` +
          "arithmetic on whole minutes rather than a figure the site published.",
      );
    }

    if (data.lyrics.available) {
      notes.push(
        "The page carries lyrics transcribed by a member, which Bide & Musique publishes while " +
          "awaiting permission from the rights holders. This server returns none of that text; read " +
          "them on the page if you need them.",
      );
    }

    const structured = {
      song_id: data.id,
      url: data.url,
      title: data.title,
      artist: data.artist,
      credited_performer: data.creditedPerformer,
      year: data.year,
      writers: data.writers,
      duration: data.duration,
      labels: data.labels,
      catalogue_reference: data.catalogueReference,
      presentation: data.presentation,
      sleeve_credits: data.sleeveCredits,
      see_also: data.seeAlso,
      image_url: data.imageUrl,
      thumbnail_url: data.thumbnailUrl,
      added_on: data.addedOn,
      top50: data.top50,
      favourites: data.favourites,
      comments: data.comments,
      lyrics: {
        available: data.lyrics.available,
        transcriber: data.lyrics.transcriber,
        rights_notice: data.lyrics.rightsNotice,
        url: data.lyrics.url,
      },
      source: "bide-et-musique.com" as const,
      notes,
    };

    const lines = [
      `${data.artist.name} · ${data.title}`,
      data.year !== null ? `Année : ${data.year}` : null,
      data.writers.length > 0 ? `Auteurs compositeurs : ${data.writers.join(", ")}` : null,
      `Durée : ${data.duration.text}`,
      data.labels.length > 0 ? `Label : ${data.labels.join(", ")}` : null,
      data.catalogueReference !== null ? `Référence : ${data.catalogueReference}` : null,
      data.top50 !== null
        ? `Au TOP 50 de B&M : classé ${data.top50.times} fois dans les ${data.top50.within} premiers`
        : null,
      data.url,
    ].filter((line): line is string => line !== null);

    return ok(structured, lines.join("\n"), notes);
  } catch (error) {
    return toToolError(error);
  }
}
