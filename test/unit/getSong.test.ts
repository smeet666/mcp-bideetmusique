/**
 * `get_song`, read from the contract alone: one record page in, one Song out.
 *
 * The markup is built inline rather than captured, so each test states which
 * shape of page it is about. No clock, no network, no randomness: the tool is
 * driven through an injected fetch, and a client whose fetch throws proves that
 * a refusal happened before any request left.
 *
 * The lyrics block is represented by its heading, its rights notice and its
 * "Transcripteur :" line. No line of any song text is written here, invented or
 * otherwise, which is what rules 11 and 12 exist to protect.
 */

import { describe, expect, it } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { parseSongRecord } from "../../src/bideetmusique/parseSong.js";
import { loadConfig } from "../../src/config.js";
import { getSongInput, runGetSong } from "../../src/tools/getSong.js";
import type { Song } from "../../src/types.js";
import {
  clientServingHtml,
  codeOfThrown,
  failureOf,
  refusingClient,
  textOfResult,
} from "./helpers.js";
import type { ToolResult } from "../../src/tools/shared.js";
import type { RecordOptions } from "../builders/song.js";
import {
  DEFAULT_LYRICS_TEXT,
  LYRICS_HEADING,
  RIGHTS_NOTICE,
  SONG_ID,
  SONG_URL,
  STREAM_PATH,
  recordPage,
} from "../builders/song.js";

/** A page carrying nothing but the frame: no heading, no fields. */
function pageWithoutHeading(): string {
  return recordPage({ heading: null });
}

function emptyBodyPage(): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Bide et Musique</title>
</head>
<body></body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Reading the answer.
// ---------------------------------------------------------------------------

interface StructuredSong {
  song_id: string;
  url: string;
  title: string;
  artist: { id: string; name: string; url: string };
  credited_performer: string | null;
  year: number | null;
  writers: string[];
  duration: { text: string; seconds: number | null; precision: string | null };
  labels: string[];
  catalogue_reference: string | null;
  presentation: string | null;
  sleeve_credits: string[];
  see_also: Array<{ id: string; name: string; url: string }>;
  image_url: string | null;
  thumbnail_url: string | null;
  added_on: string | null;
  top50: { times: number; within: number } | null;
  favourites: number | null;
  comments: { count: number; archived: number | null } | null;
  lyrics: Record<string, unknown>;
  source: string;
  notes: string[];
}

function songPayload(result: ToolResult): StructuredSong {
  if (!result.structuredContent) throw new Error("the tool returned no structuredContent");
  return result.structuredContent as unknown as StructuredSong;
}

function parse(options: RecordOptions = {}): Song {
  return parseSongRecord(recordPage(options), SONG_URL, SONG_ID);
}

async function run(options: RecordOptions = {}): Promise<ToolResult> {
  return runGetSong(clientServingHtml(recordPage(options)), {
    song_id: SONG_ID,
    include_lyrics: true,
  });
}

/** Every string the payload holds, at any depth, for the two never-published rules. */
function allStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) for (const entry of value) allStrings(entry, found);
  else if (value && typeof value === "object")
    for (const entry of Object.values(value)) allStrings(entry, found);
  return found;
}

/**
 * `LyricsInfo` declares `rightsNotice`; the contract fixes snake_case for the
 * top-level payload keys and says nothing about nested ones, so the flag is
 * read under either spelling and exactly one of them has to exist.
 */
function rightsNoticeOf(lyrics: Record<string, unknown>): unknown {
  const snake = "rights_notice" in lyrics;
  const camel = "rightsNotice" in lyrics;
  expect(snake || camel).toBe(true);
  return snake ? lyrics.rights_notice : lyrics.rightsNotice;
}

function clientAnswering404(): BideEtMusiqueClient {
  return new BideEtMusiqueClient({
    config: loadConfig({}),
    fetchImpl: async () =>
      new Response("<html><body>Fiche introuvable</body></html>", {
        status: 404,
        headers: { "content-type": "text/html; charset=ISO-8859-1" },
      }),
  });
}

// ---------------------------------------------------------------------------

describe("rule 1 — title, artist and duration always come back, everything else may be absent", () => {
  it("parses a record carrying nothing but a title, an artist and a duration", () => {
    const song = parse({
      writers: [],
      year: null,
      labels: [],
      reference: null,
      addedOn: null,
      sleeve: false,
      audio: false,
    });

    expect(song.title).toBe("Le Petit Bal des Ampoules");
    // The artist link's title attribute holds markup, so the opening tag does
    // not end at the first `>`: a reader that stops there carries the tail of
    // the attribute into the name.
    expect(song.artist.name).toBe("Les Vaillants du Dimanche");
    expect(song.artist.id).toBe("8842");
    expect(song.duration.text).toBe("4 m 16 s");

    expect(song.year).toBeNull();
    expect(song.catalogueReference).toBeNull();
    expect(song.presentation).toBeNull();
    expect(song.creditedPerformer).toBeNull();
    expect(song.addedOn).toBeNull();
    expect(song.imageUrl).toBeNull();
    expect(song.thumbnailUrl).toBeNull();
    expect(song.top50).toBeNull();
    expect(song.favourites).toBeNull();
    expect(song.comments).toBeNull();
    expect(song.writers).toEqual([]);
    expect(song.labels).toEqual([]);
    expect(song.sleeveCredits).toEqual([]);
    expect(song.seeAlso).toEqual([]);
  });

  it("reads a record that carries every field the site knows how to print", () => {
    const song = parse({
      performer: "Mademoiselle Solange",
      presentation: "Une curiosité pressée à Bruxelles pour un club de supporters.",
      sleeveCredits: ["Studio Grandjean", "Photo: R. Marchal"],
      seeAlso: [{ id: "8843", name: "Les Vaillants du Samedi" }],
      top50: "Classé 3 fois dans les 50 premiers",
      favourites: 12,
      comments: { count: 5, archived: 2 },
      lyrics: { transcriber: "Bernard T." },
    });

    expect(song.id).toBe(SONG_ID);
    expect(song.url).toBe(SONG_URL);
    expect(song.creditedPerformer).toBe("Mademoiselle Solange");
    expect(song.year).toBe(1978);
    expect(song.catalogueReference).toBe("BO 45-118");
    expect(song.presentation).toBe("Une curiosité pressée à Bruxelles pour un club de supporters.");
    expect(song.sleeveCredits).toEqual(["Studio Grandjean", "Photo: R. Marchal"]);
    expect(song.seeAlso.map((entry) => entry.name)).toEqual(["Les Vaillants du Samedi"]);
    expect(song.addedOn).toBe("2002-01-21");
    expect(song.top50).toEqual({ times: 3, within: 50 });
    expect(song.favourites).toBe(12);
    expect(song.comments).toEqual({ count: 5, archived: 2 });
    expect(song.imageUrl).toContain(`/images/pochettes/${SONG_ID}.jpg`);
    expect(song.thumbnailUrl).toContain(`/images/thumb200/${SONG_ID}.jpg`);
  });

  it("hands the sparse record back through the tool as a success, not an error", async () => {
    const result = await run({
      writers: [],
      year: null,
      labels: [],
      reference: null,
      addedOn: null,
      sleeve: false,
    });
    const payload = songPayload(result);

    expect(result.isError).toBeFalsy();
    expect(payload.song_id).toBe(SONG_ID);
    expect(payload.title).toBe("Le Petit Bal des Ampoules");
    expect(payload.duration.text).toBe("4 m 16 s");
    expect(payload.source).toBe("bide-et-musique.com");
  });
});

describe("rule 2 — a field the site does not print is never invented", () => {
  it("leaves a missing favourite count null instead of counting zero", () => {
    const song = parse({ favourites: null, comments: null });

    expect(song.favourites).toBeNull();
    expect(song.comments).toBeNull();
    expect(song.favourites).not.toBe(0);
    expect(song.comments).not.toBe(0);
  });

  it("leaves a missing reference null instead of an empty string", () => {
    const song = parse({ reference: null, year: null });

    expect(song.catalogueReference).toBeNull();
    expect(song.catalogueReference).not.toBe("");
    expect(song.year).toBeNull();
  });

  it("guesses no image address for a record with no sleeve", () => {
    const song = parse({ sleeve: false });

    expect(song.imageUrl).toBeNull();
    expect(song.thumbnailUrl).toBeNull();
  });

  it("prints no invented value in the structured answer either", async () => {
    const payload = songPayload(await run({ favourites: null, comments: null, sleeve: false }));

    expect(payload.favourites).toBeNull();
    expect(payload.comments).toBeNull();
    expect(payload.image_url).toBeNull();
    expect(payload.thumbnail_url).toBeNull();
  });
});

describe("rule 3 — multi-valued fields are arrays, one value included", () => {
  it("returns two labels as two entries when a record was co-released", () => {
    const song = parse({ labels: ["Disques Bouton d'Or", "Éditions La Bécane"] });

    expect(song.labels).toEqual(["Disques Bouton d'Or", "Éditions La Bécane"]);
  });

  it("returns a single label as a one-entry array rather than a string", () => {
    const song = parse({ labels: ["Disques Bouton d'Or"] });

    expect(Array.isArray(song.labels)).toBe(true);
    expect(song.labels).toEqual(["Disques Bouton d'Or"]);
  });

  it("returns an empty array, never null, when the record names no label and no writer", () => {
    const song = parse({ labels: [], writers: [], sleeveCredits: [], seeAlso: [] });

    expect(song.labels).toEqual([]);
    expect(song.writers).toEqual([]);
    expect(song.sleeveCredits).toEqual([]);
    expect(song.seeAlso).toEqual([]);
    expect(song.labels).not.toBeNull();
    expect(song.writers).not.toBeNull();
  });

  it("keeps the four multi-valued fields as arrays in the structured answer", async () => {
    const payload = songPayload(
      await run({
        writers: ["Odette Vanderplaen", "Régis Bouchonnet", "Aimé Pouliquen"],
        labels: ["Disques Bouton d'Or", "Éditions La Bécane"],
        sleeveCredits: ["Studio Grandjean", "Photo: R. Marchal", "Maquette: Vif-Argent"],
        seeAlso: [
          { id: "8843", name: "Les Vaillants du Samedi" },
          { id: "8844", name: "Le Grand Orchestre Bouchonnet" },
        ],
      }),
    );

    expect(payload.writers).toHaveLength(3);
    expect(payload.labels).toHaveLength(2);
    expect(payload.sleeve_credits).toHaveLength(3);
    expect(payload.see_also).toHaveLength(2);
    expect(payload.see_also[0]).toMatchObject({ id: "8843", name: "Les Vaillants du Samedi" });
  });
});

describe("rule 4 — a writer's name is not split on its own hyphen", () => {
  it("keeps a hyphenated first name as one writer", () => {
    const song = parse({ writers: ["Jean-Pierre Lang", "Marie-Ange Delcourt"] });

    expect(song.writers).toEqual(["Jean-Pierre Lang", "Marie-Ange Delcourt"]);
  });

  it("keeps a lone hyphenated writer as a single entry", () => {
    const song = parse({ writers: ["Jean-Pierre Lang"] });

    expect(song.writers).toEqual(["Jean-Pierre Lang"]);
  });

  it("keeps a hyphenated label whole as well", () => {
    const song = parse({ labels: ["Vogue-Contact", "Barclay"] });

    expect(song.labels).toEqual(["Vogue-Contact", "Barclay"]);
  });
});

describe("rule 5 — the duration carries its precision", () => {
  it("reads 4 m 16 s as 256 seconds, to the second", () => {
    const song = parse({ duration: "4 m 16 s" });

    expect(song.duration).toEqual({ text: "4 m 16 s", seconds: 256, precision: "second" });
  });

  it("reads 4 m as 240 seconds, to the minute", () => {
    const song = parse({ duration: "4 m" });

    expect(song.duration).toEqual({ text: "4 m", seconds: 240, precision: "minute" });
  });

  it("reads 46 s as 46 seconds, to the second", () => {
    const song = parse({ duration: "46 s" });

    expect(song.duration).toEqual({ text: "46 s", seconds: 46, precision: "second" });
  });

  it("repeats what the site printed in duration.text", async () => {
    const payload = songPayload(await run({ duration: "4 m" }));

    expect(payload.duration.text).toBe("4 m");
    expect(payload.duration.seconds).toBe(240);
    expect(payload.duration.precision).toBe("minute");
  });
});

describe("rule 6 — year is a number, catalogue reference is a string", () => {
  it("reads the year as a number and the reference as text", () => {
    const song = parse({ year: "1978", reference: "BO 45-118" });

    expect(song.year).toBe(1978);
    expect(typeof song.year).toBe("number");
    expect(song.catalogueReference).toBe("BO 45-118");
    expect(typeof song.catalogueReference).toBe("string");
  });

  it("keeps a reference of four digits a reference rather than a year", () => {
    const song = parse({ year: "1966", reference: "4512" });

    expect(song.catalogueReference).toBe("4512");
    expect(typeof song.catalogueReference).toBe("string");
    expect(song.year).toBe(1966);
  });

  it("keeps a four-digit reference a string in the structured answer", async () => {
    const payload = songPayload(await run({ year: null, reference: "4512" }));

    expect(payload.catalogue_reference).toBe("4512");
    expect(payload.year).toBeNull();
  });
});

describe("rule 7 — the title is always a string", () => {
  it("returns a record called 2394 as the string 2394", () => {
    const song = parse({ title: "2394" });

    expect(song.title).toBe("2394");
    expect(typeof song.title).toBe("string");
  });

  it("returns a bare-number title as a string through the tool as well", async () => {
    const payload = songPayload(await run({ title: "2394" }));

    expect(payload.title).toBe("2394");
    expect(typeof payload.title).toBe("string");
  });

  it("keeps a long title whole", () => {
    const title = "Le Petit Bal des Ampoules (version pour la fête du patronage)";
    const song = parse({ title });

    expect(song.title).toBe(title);
  });
});

describe("rule 8 — added_on is ISO, and an unreadable date is null", () => {
  it("turns 21/01/2002 into 2002-01-21", () => {
    expect(parse({ addedOn: "21/01/2002" }).addedOn).toBe("2002-01-21");
  });

  it("turns 05/12/1999 into 1999-12-05, keeping day and month in their places", () => {
    expect(parse({ addedOn: "05/12/1999" }).addedOn).toBe("1999-12-05");
  });

  it("returns null rather than today's date when the page prints no added date", () => {
    expect(parse({ addedOn: null }).addedOn).toBeNull();
  });

  it("returns null rather than today's date when the printed date cannot be read", () => {
    expect(parse({ addedOn: "un jour de 2002" }).addedOn).toBeNull();
  });

  it("publishes the ISO date in the structured answer", async () => {
    expect(songPayload(await run({ addedOn: "21/01/2002" })).added_on).toBe("2002-01-21");
  });
});

describe("rule 9 — the TOP 50 carries both its numbers", () => {
  it("reads Classé 3 fois dans les 50 premiers as three times within fifty", () => {
    expect(parse({ top50: "Classé 3 fois dans les 50 premiers" }).top50).toEqual({
      times: 3,
      within: 50,
    });
  });

  it("reads dans les 10 premiers as a ranking within ten", () => {
    expect(parse({ top50: "Classé 29 fois dans les 10 premiers" }).top50).toEqual({
      times: 29,
      within: 10,
    });
  });

  it("reads a single appearance as one time", () => {
    expect(parse({ top50: "Classé 1 fois dans les 50 premiers" }).top50).toEqual({
      times: 1,
      within: 50,
    });
  });

  it("returns null when the record was never ranked", () => {
    expect(parse({ top50: null }).top50).toBeNull();
  });

  it("publishes both numbers in the structured answer", async () => {
    const payload = songPayload(await run({ top50: "Classé 3 fois dans les 10 premiers" }));

    expect(payload.top50).toEqual({ times: 3, within: 10 });
  });
});

describe("rule 10 — a missing counter is not a zero, and the notes say so", () => {
  it("returns null favourites and null comments when the page prints neither", async () => {
    const result = await run({ favourites: null, comments: null });
    const payload = songPayload(result);

    expect(payload.favourites).toBeNull();
    expect(payload.comments).toBeNull();
  });

  it("says in a note that the absent counters are the site printing nothing", async () => {
    const result = await run({ favourites: null, comments: null });
    const payload = songPayload(result);

    expect(payload.notes.some((note) => /favori|favourite/i.test(note))).toBe(true);
    expect(payload.notes.some((note) => /commentaire|comment/i.test(note))).toBe(true);
    expect(
      payload.notes.some((note) =>
        /ne (les )?(publie|affiche|imprime)|prints? (no|none|nothing)|pas de compteur|no counter|absen/i.test(
          note,
        ),
      ),
    ).toBe(true);
  });

  it("writes the sentence about the counters as a sentence", async () => {
    // The list is spliced into "prints no …", so an entry carrying its own
    // article reads as "prints no the favourite count".
    const both = songPayload(await run({ favourites: null, comments: null }));
    const one = songPayload(
      await run({ favourites: null, comments: { count: 5, archived: null } }),
    );

    expect(both.notes.join(" ")).toContain("prints no favourite count and no comment count");
    expect(one.notes.join(" ")).toContain("prints no favourite count,");
  });

  it("keeps a printed zero-free counter as the number it is", () => {
    const song = parse({ favourites: 2, comments: { count: 1, archived: null } });

    expect(song.favourites).toBe(2);
    expect(song.comments).toEqual({ count: 1, archived: null });
  });

  it("reads the archived comments the page names", () => {
    const song = parse({ comments: { count: 57, archived: 11 } });

    expect(song.comments).toEqual({ count: 57, archived: 11 });
  });

  it("adds no note about counters when the page printed them", async () => {
    const payload = songPayload(await run({ favourites: 12, comments: { count: 5, archived: 2 } }));

    expect(payload.favourites).toBe(12);
    expect(payload.comments).toEqual({ count: 5, archived: 2 });
  });
});

describe("the lyrics a record page carries", () => {
  it("announces the block, its transcriber and its rights notice", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.transcriber).toBe("Bernard T.");
    expect(song.lyrics.rightsNotice).toBe(true);
    expect(song.lyrics.url).toBe(SONG_URL);
  });

  it("reads the words as published, one line per line", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    expect(song.lyrics.text).toBe(DEFAULT_LYRICS_TEXT);
    expect(song.lyrics.text).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it("carries no markup through, whatever the cell holds", () => {
    const song = parse({
      lyrics: {
        lines: [
          "Une ligne <b>appuyée</b> par le site",
          '<span class="txtred">Une autre dans sa balise</span>',
          "Un chevron publié&nbsp;: &lt;b&gt;",
        ],
      },
    });

    expect(song.lyrics.text).toBe(
      [
        "Une ligne appuyée par le site",
        "Une autre dans sa balise",
        // The site escaped this one, so it is text it published rather than
        // markup, and it survives as the reader saw it.
        "Un chevron publié\u00a0: <b>",
      ].join("\n"),
    );
  });

  it("stops before the line naming who typed them", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T.", lines: ["Une seule ligne"] } });

    expect(song.lyrics.text).toBe("Une seule ligne");
    expect(song.lyrics.transcriber).toBe("Bernard T.");
  });

  it("stops at the end of the cell the site never closed", () => {
    const song = parse({
      lyrics: { transcriber: null, unterminated: true, lines: ["Une seule ligne"] },
    });

    expect(song.lyrics.text).toBe("Une seule ligne");
    expect(song.lyrics.text).not.toContain(RIGHTS_NOTICE);
  });

  it("keeps the blank line the site prints between two verses", () => {
    const song = parse({ lyrics: { lines: ["Premier couplet", "", "Second couplet"] } });

    expect(song.lyrics.text).toBe("Premier couplet\n\nSecond couplet");
  });

  it("repeats a marker the site printed in place of the words", () => {
    const song = parse({ lyrics: { transcriber: null, lines: ["(instrumental)"] } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.text).toBe("(instrumental)");
  });

  it("says the words are unreadable rather than absent when the cell holds nothing", () => {
    const song = parse({ lyrics: { transcriber: null, lines: [] } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.text).toBeNull();
  });

  it("says the block is absent for the record whose page carries none", () => {
    const song = parse({ lyrics: null });

    expect(song.lyrics.available).toBe(false);
    expect(song.lyrics.text).toBeNull();
    expect(song.lyrics.transcriber).toBeNull();
    expect(song.lyrics.rightsNotice).toBe(false);
    expect(song.lyrics.url).toBe(SONG_URL);
  });

  it("names no transcriber when the block credits none", () => {
    const song = parse({ lyrics: { transcriber: null } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.transcriber).toBeNull();
  });

  it("keeps the heading, the notice and the credit out of every parsed field", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    for (const value of allStrings(song)) {
      expect(value).not.toContain(RIGHTS_NOTICE);
      expect(value).not.toContain(LYRICS_HEADING);
      expect(value).not.toContain("Transcripteur :");
    }
  });

  it("keeps them out of the structured answer and out of the text", async () => {
    const result = await run({ lyrics: { transcriber: "Bernard T." } });
    const payload = songPayload(result);

    for (const value of allStrings(payload)) {
      expect(value).not.toContain(RIGHTS_NOTICE);
      expect(value).not.toContain(LYRICS_HEADING);
      expect(value).not.toContain("Transcripteur :");
    }
    expect(textOfResult(result)).not.toContain(RIGHTS_NOTICE);

    expect(payload.lyrics.available).toBe(true);
    expect(payload.lyrics.transcriber).toBe("Bernard T.");
    expect(rightsNoticeOf(payload.lyrics)).toBe(true);
    expect(payload.lyrics.url).toBe(SONG_URL);
  });
});

describe("rule 12 — the audio stream address is never published", () => {
  it("holds the stream endpoint in no parsed field", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    for (const value of allStrings(song)) {
      expect(value).not.toContain(STREAM_PATH);
      expect(value).not.toContain("stream_");
    }
  });

  it("holds the stream endpoint in no structured field and in no line of the text", async () => {
    const result = await run({ lyrics: { transcriber: "Bernard T." } });
    const payload = songPayload(result);

    for (const value of allStrings(payload)) {
      expect(value).not.toContain(STREAM_PATH);
      expect(value).not.toContain("stream_");
    }
    expect(textOfResult(result)).not.toContain(STREAM_PATH);
    expect(textOfResult(result)).not.toContain("stream_");
  });

  it("points url and lyrics.url at the record page", async () => {
    const payload = songPayload(await run({ lyrics: { transcriber: "Bernard T." } }));

    expect(payload.url).toBe(SONG_URL);
    expect(payload.lyrics.url).toBe(SONG_URL);
  });
});

describe("rule 13 — a page that is not a record is a parse failure", () => {
  it("fails rather than returning a record full of nulls when the page has no heading", async () => {
    const failure = await failureOf(
      runGetSong(clientServingHtml(pageWithoutHeading()), {
        song_id: SONG_ID,
        include_lyrics: true,
      }),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("fails on an empty body", async () => {
    const failure = await failureOf(
      runGetSong(clientServingHtml(emptyBodyPage()), { song_id: SONG_ID, include_lyrics: true }),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("throws parse_failure from the parser itself on a page with no heading", () => {
    expect(codeOfThrown(() => parseSongRecord(pageWithoutHeading(), SONG_URL, SONG_ID))).toBe(
      "parse_failure",
    );
  });
});

describe("rule 14 — a song id is digits, and 404 is not a parse failure", () => {
  it("refuses a song id of letters before any request goes out", async () => {
    const failure = await failureOf(
      runGetSong(refusingClient(), { song_id: "abc", include_lyrics: true }),
    );

    expect(failure.code).toBe("invalid_input");
    // The refusal names the argument it is about; its exact spelling is the
    // tool's to choose.
    expect(failure.text).toMatch(/song[_ ]id/i);
  });

  it("refuses an id carrying a space, a sign or a suffix, before any request", async () => {
    for (const songId of ["17 34", "-5", "1734a", "17.34", ""]) {
      const failure = await failureOf(
        runGetSong(refusingClient(), { song_id: songId, include_lyrics: true }),
      );
      expect(failure.code).toBe("invalid_input");
    }
  });

  it("accepts an id of digits", async () => {
    const payload = songPayload(await run());

    expect(payload.song_id).toBe(SONG_ID);
  });

  it("reports a record the site answers with 404 as not_found", async () => {
    const failure = await failureOf(
      runGetSong(clientAnswering404(), { song_id: "999999", include_lyrics: true }),
    );

    expect(failure.code).toBe("not_found");
    expect(failure.code).not.toBe("parse_failure");
  });
});

describe("rule 15 — absent fields are stated in the notes", () => {
  it("says what the record does not state when it carries no label, no reference and no writers", async () => {
    const result = await run({ labels: [], reference: null, writers: [] });
    const payload = songPayload(result);

    expect(result.isError).toBeFalsy();
    expect(payload.labels).toEqual([]);
    expect(payload.catalogue_reference).toBeNull();
    expect(payload.writers).toEqual([]);

    expect(payload.notes.some((note) => /label/i.test(note))).toBe(true);
    expect(payload.notes.some((note) => /r[ée]f[ée]rence|reference/i.test(note))).toBe(true);
    expect(payload.notes.some((note) => /auteur|compositeur|writer/i.test(note))).toBe(true);
  });

  it("repeats those absences in the text the caller reads", async () => {
    const text = textOfResult(await run({ labels: [], reference: null, writers: [] }));

    expect(text).toMatch(/label/i);
    expect(text).toMatch(/r[ée]f[ée]rence|reference/i);
    expect(text).toMatch(/auteur|compositeur|writer/i);
  });

  it("states no absence the record does not have", async () => {
    const payload = songPayload(await run());

    expect(payload.notes.some((note) => /label/i.test(note))).toBe(false);
  });
});

/**
 * A transcription longer than this server reads.
 *
 * The cell is located inside a window on the page, and a cell that runs past it
 * has no readable end. Returning what fits would publish a cut transcription
 * under a field that says the words are as published.
 */
describe("a transcription the reader cannot see the end of", () => {
  it("says nothing rather than passing a cut transcription off as the whole", () => {
    const enormous = Array.from({ length: 900 }, (_, index) => `Ligne ${index} du couplet`);
    const song = parse({ lyrics: { transcriber: null, lines: enormous, unterminated: true } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.text).toBeNull();
  });

  it("reads a long transcription whose end is in view", () => {
    const long = Array.from({ length: 60 }, (_, index) => `Ligne ${index}`);
    const song = parse({ lyrics: { transcriber: null, lines: long } });

    expect(song.lyrics.text?.split("\n")).toHaveLength(60);
  });
});

/**
 * Reading a record without paying for the song.
 *
 * A transcription runs to a few thousand characters, and a question about a
 * year has no use for it. What the page carries is reported either way, so
 * leaving the words out never reads as a page that has none.
 */
describe("asking for the record without the words", () => {
  it("leaves the words out while still reporting that the page has some", async () => {
    const result = await runGetSong(clientServingHtml(recordPage({ lyrics: {} })), {
      song_id: SONG_ID,
      include_lyrics: false,
    });
    const payload = songPayload(result);
    const lyrics = payload.lyrics as { available: boolean; text: string | null };

    expect(lyrics.available).toBe(true);
    expect(lyrics.text).toBeNull();
    expect((payload.notes as string[]).join(" ")).toContain("include_lyrics");
  });

  it("keeps the words out of the text block as well", async () => {
    const result = await runGetSong(clientServingHtml(recordPage({ lyrics: {} })), {
      song_id: SONG_ID,
      include_lyrics: false,
    });

    expect(textOfResult(result)).not.toContain("carrousel");
  });

  it("returns them when asked, which is what it does by default", () => {
    expect(getSongInput.parse({ song_id: "1734" })).toEqual({
      song_id: "1734",
      include_lyrics: true,
    });
  });

  it("refuses a song id the schema can see is not one", () => {
    expect(getSongInput.safeParse({ song_id: "abc" }).success).toBe(false);
    expect(getSongInput.safeParse({ song_id: "17 34" }).success).toBe(false);
    expect(getSongInput.safeParse({ song_id: "1734" }).success).toBe(true);
  });
});

/**
 * Two guards on where the record stops and the song starts.
 *
 * A record credits its writing as "Paroles : someone", in the same word the
 * lyrics heading uses, and a transcription can hold a line shaped like a field
 * or like a counter. Reading either as the other puts a word of a song into the
 * record, or a line of the record into the song.
 */
describe("telling the record apart from the song", () => {
  it("takes a writing credit for a field rather than for the lyrics heading", () => {
    const song = parse({ writers: ["Paroles : Jean-Pierre Lang"], lyrics: null });

    expect(song.lyrics.available).toBe(false);
    expect(song.writers).toContain("Paroles : Jean-Pierre Lang");
  });

  it("reads no field of the record out of a line someone sang", () => {
    const song = parse({
      addedOn: null,
      favourites: null,
      comments: null,
      top50: null,
      lyrics: {
        lines: [
          "Ajouté le 01/01/1970",
          "12 personnes ont cette chanson",
          "Classé 99 fois dans les 50 premiers",
          "3 commentaires",
        ],
      },
    });

    expect(song.addedOn).toBeNull();
    expect(song.favourites).toBeNull();
    expect(song.comments).toBeNull();
    expect(song.top50).toBeNull();
  });

  it("says a page prints no notice under the words when it prints none", () => {
    const song = parse({ lyrics: { rightsNotice: false } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.rightsNotice).toBe(false);
  });
});

/**
 * What a caller needs to ask the next question.
 *
 * A record is read as text far more often than as a payload, and the next
 * question about it is almost always one of two: the record itself, or the
 * artist behind it. The text carried the page address and nothing else, so the
 * artist's id had to be dug out of a payload or guessed from a URL.
 */
describe("the ids the answer can be carried on with", () => {
  it("states the record's id and the artist's id, under the names the tools take", async () => {
    const text = textOfResult(await run());

    expect(text).toContain(`song_id : ${SONG_ID}`);
    expect(text).toContain("artist_id : 8842");
  });

  it("states the artist's id of the record it read, whichever artist that is", async () => {
    const text = textOfResult(await run({ artistId: "290", artist: "Bino" }));

    expect(text).toContain("artist_id : 290");
  });
});
