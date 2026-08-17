/**
 * get_random_song: one record from the collection, drawn at random.
 *
 * Bide & Musique publishes no route to a random record, so the draw is made
 * here over the ids the site serves: the far end comes from its feed of new
 * entries, and the near end is the first id. The numbering has gaps where the
 * site serves no record, and a gap is drawn again rather than answered, since
 * an id nobody catalogued is not a record.
 */

import type { BideEtMusiqueClient } from "../bideetmusique/client.js";
import { BideEtMusiqueError } from "../errors.js";
import { strictInput } from "./arguments.js";
import { getSongOutputShape } from "./getSong.js";
import { noteIfTextIsCut, ok, quotedBlock, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getRandomSongDescription = [
  "Read one record drawn at random from the Bide & Musique collection: same answer as get_song, on a",
  "record nobody chose.",
  "Use it to browse the collection. For a question about a particular song, use get_song.",
  "The draw runs over the ids the site serves, from the first to the newest one its feed of new",
  "entries names, and an id the collection does not serve is drawn again.",
  "Records whose page carries a transcription come back with the words themselves, as published.",
  "When you show a record to a user, credit Bide & Musique and link the page.",
].join(" ");

export const getRandomSongInput = strictInput({});

export const getRandomSongOutputShape = getSongOutputShape;

/**
 * How many ids may be drawn before the draw is reported as a failure.
 *
 * Each miss costs the site a request, and the gaps are sparse enough that five
 * misses in a row is more likely a defect than bad luck.
 */
const MAX_DRAWS = 5;

export interface GetRandomSongOptions {
  /** Injected so a test states which id is drawn instead of hoping for one. */
  random?: () => number;
}

export async function runGetRandomSong(
  client: BideEtMusiqueClient,
  options: GetRandomSongOptions = {},
): Promise<ToolResult> {
  const random = options.random ?? Math.random;

  try {
    const newest = await client.getNewestSongId();
    const highest = Number.parseInt(newest.data, 10);

    const drawn: string[] = [];
    for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
      const id = String(Math.floor(random() * highest) + 1);
      // Asking twice for an id already known to be unserved spends a request on
      // an answer this call already has.
      if (drawn.includes(id)) continue;
      drawn.push(id);

      try {
        return answer(await client.getSong(id), drawn, newest.data);
      } catch (error) {
        if (error instanceof BideEtMusiqueError && error.code === "not_found") continue;
        throw error;
      }
    }

    throw new BideEtMusiqueError(
      "not_found",
      `Drew ${MAX_DRAWS} ids the collection does not serve: ${drawn.join(", ")}.`,
      { hint: "Asking again draws another set." },
    );
  } catch (error) {
    return toToolError(error);
  }
}

function answer(
  outcome: Awaited<ReturnType<BideEtMusiqueClient["getSong"]>>,
  drawn: string[],
  highest: string,
): ToolResult {
  const { data, cached } = outcome;

  const notes: string[] = [];
  if (cached) notes.push("Served from this server's short-lived in-memory cache.");

  notes.push(
    `Drawn from the ids 1 to ${highest}, the newest the collection's feed of new entries names. ` +
      "Ids the site does not serve are drawn again, so a record answering here is one it served.",
  );
  if (drawn.length > 1) {
    notes.push(
      `${drawn.length - 1} of the ids drawn before this one are not served: ${drawn
        .slice(0, -1)
        .join(", ")}.`,
    );
  }

  if (data.lyrics.available && data.lyrics.text === null) {
    notes.push(
      "This record announces a transcription and none could be read out of it, so the words " +
        "come back null while the record still reports one.",
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
      text: data.lyrics.text,
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
    data.url,
  ].filter((line): line is string => line !== null);

  const body =
    data.lyrics.text !== null
      ? `${lines.join("\n")}\n\n${quotedBlock("Paroles publiées par Bide & Musique :", data.lyrics.text)}`
      : lines.join("\n");

  noteIfTextIsCut(body, notes);

  return ok(structured, body, notes);
}
