/**
 * get_artist: read what the collection holds of one artist.
 */

import { z } from "zod";
import type { BideEtMusiqueClient } from "../bideetmusique/client.js";
import { strictInput } from "./arguments.js";
import { noteIfTextIsCut, ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getArtistDescription = [
  "Read an artist's page on Bide & Musique: the names they recorded under, what the catalogue notes",
  "about them, and every song of theirs the collection holds, each with its year.",
  "Takes the 'artist_id' that search_songs and get_song return.",
  "An artist page is a way into a discography rather than a biography: half of them state nothing",
  "beyond the name, and the median artist has one record here. Fields the page does not state come",
  "back null or empty, which is the ordinary state of this catalogue rather than a failed read.",
  "The date of birth comes back exactly as written, since the catalogue states a full date, a bare",
  "year, or a date with a death beside it. Nationality is free text for the same reason.",
  "Rows come in the site's order, by year of release, never by importance.",
  "When you show an artist to a user, credit Bide & Musique and link the page.",
].join(" ");

export const getArtistInput = strictInput({
  artist_id: z
    .string()
    .max(20)
    .regex(/^\d+$/)
    .describe(
      "The artist id returned by search_songs or get_song, digits only, for example '290'.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(100)
    .describe("Maximum songs of the discography to return."),
});

const artistLink = z.object({ id: z.string(), name: z.string(), url: z.string() });

export const getArtistOutputShape = {
  artist_id: z.string(),
  url: z.string(),
  name: z.string(),
  aliases: z
    .array(z.string())
    .describe("Other names this artist recorded under, as the page stacks them."),
  surname: z.string().nullable(),
  first_name: z.string().nullable(),
  nationality: z
    .string()
    .nullable()
    .describe("As the catalogue writes it, in its own words: 'suisse', 'franco-espagnole'."),
  birth_date: z
    .string()
    .nullable()
    .describe(
      "Exactly as published, which may be a day, a bare year, a month and a year, or a date with a " +
        "death beside it. Nothing here is parsed into a date.",
    ),
  presentation: z.string().nullable(),
  see_also: z.array(artistLink),
  links: z
    .array(z.object({ label: z.string(), url: z.string() }))
    .describe("Addresses off the site, with the label the page gave them."),
  photo_url: z.string().nullable(),
  discography: z.array(
    z.object({
      song_id: z.string().describe("Pass this to get_song for the record itself."),
      title: z.string(),
      url: z.string(),
      year: z.number().int().nullable(),
      programming: z
        .string()
        .nullable()
        .describe(
          "How the song sits in the station's programming, in the site's own French wording.",
        ),
      image_url: z.string().nullable(),
      thumbnail_url: z.string().nullable(),
    }),
  ),
  discography_count: z.number().int().describe("Songs returned, after 'limit'."),
  songs_on_page: z.number().int().describe("Songs the page held, before 'limit'."),
  source: z.literal("bide-et-musique.com"),
  notes: z.array(z.string()),
};

export interface GetArtistArgs {
  artist_id: string;
  limit: number;
}

export async function runGetArtist(
  client: BideEtMusiqueClient,
  args: GetArtistArgs,
  signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getArtist(args.artist_id.trim(), signal);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const statesNothing =
      data.aliases.length === 0 &&
      data.surname === null &&
      data.firstName === null &&
      data.nationality === null &&
      data.birthDate === null &&
      data.presentation === null;
    if (statesNothing) {
      notes.push(
        "This page states nothing about the artist beyond the name. Half of the artist pages in this " +
          "collection are like that, so read it as a catalogue that holds records rather than " +
          "biographies, not as a page this server failed to read.",
      );
    }

    if (data.discography.length === 0) {
      notes.push(
        "The page lists no song, so the collection holds none for this artist under this name. " +
          "Another name they recorded under may hold some.",
      );
    }

    if (data.discography.length > args.limit) {
      notes.push(
        `This page lists ${data.discography.length} songs; showing the first ${args.limit}. Bide & ` +
          "Musique orders them by year of release and never as a ranking, so these are the earliest " +
          "rather than the best known.",
      );
    }

    const undated = data.discography.filter((entry) => entry.year === null).length;
    if (undated > 0) {
      notes.push(`${undated} of these songs carry no year on this page.`);
    }

    const discography = data.discography.slice(0, args.limit).map((entry) => ({
      song_id: entry.songId,
      title: entry.title,
      url: entry.url,
      year: entry.year,
      programming: entry.programming,
      image_url: entry.imageUrl,
      thumbnail_url: entry.thumbnailUrl,
    }));

    const structured = {
      artist_id: data.id,
      url: data.url,
      name: data.name,
      aliases: data.aliases,
      surname: data.surname,
      first_name: data.firstName,
      nationality: data.nationality,
      birth_date: data.birthDate,
      presentation: data.presentation,
      see_also: data.seeAlso,
      links: data.links,
      photo_url: data.photoUrl,
      discography,
      discography_count: discography.length,
      songs_on_page: data.discography.length,
      source: "bide-et-musique.com" as const,
      notes,
    };

    const header = [
      data.name,
      data.aliases.length > 0 ? `Autres alias : ${data.aliases.join(", ")}` : null,
      data.nationality !== null ? `Nationalité : ${data.nationality}` : null,
      data.birthDate !== null ? `Date de naissance : ${data.birthDate}` : null,
    ].filter((line): line is string => line !== null);

    const list = discography.map(
      (entry, index) =>
        `${index + 1}. ${entry.year ?? "----"} · ${entry.title} · id: ${entry.song_id}`,
    );

    const body = [...header, ...list, data.url].join("\n");
    noteIfTextIsCut(body, notes);

    return ok(structured, body, notes);
  } catch (error) {
    return toToolError(error);
  }
}
