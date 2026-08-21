/**
 * The properties every record must satisfy, checked against the checker itself.
 *
 * The evals run these same properties over records the site serves, where
 * nothing is known in advance about what a record holds. A checker that never
 * fires would pass there for ever, so each property is fed a record that breaks
 * it and is expected to say so.
 */

import { describe, expect, it } from "vitest";

import { parseSongRecord } from "../../src/bideetmusique/parseSong.js";
import type { Song } from "../../src/types.js";
import type { RecordOptions } from "../builders/song.js";
import { recordPage } from "../builders/song.js";
import { describeViolations, violationsOf } from "../invariants/song.js";

const SONG_URL = "https://www.bide-et-musique.com/song/1734.html";

function record(lyricsText: string | null, overrides: Partial<Song> = {}): Song {
  return {
    id: "1734",
    title: "Le Petit Bal des Ampoules",
    url: SONG_URL,
    artist: {
      id: "8842",
      name: "Les Vaillants du Dimanche",
      aliasOf: null,
      url: "https://www.bide-et-musique.com/artist/8842.html",
    },
    creditedPerformer: null,
    year: 1978,
    writers: [],
    duration: { text: "4 m 16 s", seconds: 256, precision: "second" },
    labels: [],
    catalogueReference: null,
    presentation: null,
    sleeveCredits: [],
    seeAlso: [],
    imageUrl: null,
    thumbnailUrl: null,
    addedOn: null,
    top50: null,
    favourites: null,
    comments: null,
    lyrics: {
      available: lyricsText !== null,
      text: lyricsText,
      transcriber: null,
      rightsNotice: true,
      url: SONG_URL,
    },
    ...overrides,
  } as Song;
}

function propertiesBroken(song: Song): string[] {
  return violationsOf(song).map((violation) => violation.property);
}

describe("a record satisfying every property", () => {
  it("breaks none of them", () => {
    expect(violationsOf(record("Premier couplet\n\nSecond couplet"))).toEqual([]);
  });

  it("breaks none of them when the page carries no transcription", () => {
    expect(violationsOf(record(null))).toEqual([]);
  });
});

describe("a record breaking one property", () => {
  it("is caught when the transcription carries markup", () => {
    expect(
      propertiesBroken(record('Une ligne <span class="txtred">et sa balise</span>')),
    ).toContain("the transcription carries no markup");
  });

  it("is caught when an entity was never decoded", () => {
    expect(propertiesBroken(record("Le c&oelig;ur du carrousel"))).toContain(
      "the transcription carries no undecoded entity",
    );
  });

  it("is caught when the credit line survived", () => {
    expect(propertiesBroken(record("Une ligne\nTranscripteur : Dam-Dam"))).toContain(
      "the transcription stops before the line naming who typed it",
    );
  });

  it("is caught when the notice printed under the words survived", () => {
    expect(
      propertiesBroken(
        record("Une ligne\nParoles en attente d'une autorisation des ayants droit."),
      ),
    ).toContain("the transcription holds none of the notice printed under it");
  });

  it("is caught when a blank transcription was reported as text", () => {
    expect(propertiesBroken(record("   \n  "))).toContain(
      "a transcription is null rather than blank",
    );
  });

  it("is caught when a transcription opens or closes on a blank line", () => {
    expect(propertiesBroken(record("\nUne ligne\n"))).toContain(
      "a transcription carries no leading or trailing blank line",
    );
  });

  it("is caught when a page carrying no transcription still reports one", () => {
    const song = record(null);
    song.lyrics.text = "Une ligne venue de nulle part";

    expect(propertiesBroken(song)).toContain("a page carrying no transcription reports none");
  });

  it("is caught when a field carries the audio stream endpoint", () => {
    expect(propertiesBroken(record("Une ligne", { presentation: "/stream_1734.php" }))).toContain(
      "no field carries the audio stream endpoint",
    );
  });

  it("is caught when the lyrics url points somewhere other than the site", () => {
    const song = record("Une ligne");
    song.lyrics.url = "https://example.com/song/1734.html";

    expect(propertiesBroken(song)).toContain("the lyrics url points at the site");
  });

  it("is caught when a url points somewhere other than the site", () => {
    expect(
      propertiesBroken(record("Une ligne", { url: "https://example.com/song/1734" })),
    ).toContain("the record url points at the site");
  });
});

/**
 * The properties applied to what the reader produces, rather than to records a
 * test wrote by hand.
 *
 * The evals run these same properties over pages the site serves. Checking them
 * only against literals would leave the checker proven and the reader unproven,
 * which is the half that ships.
 */
describe("a record the reader produced", () => {
  const SHAPES: [string, RecordOptions][] = [
    ["a page crediting a transcriber", { lyrics: { transcriber: "Dam-Dam" } }],
    ["a page crediting none, whose cell the site never closes", { lyrics: { unterminated: true } }],
    ["a page whose cell holds nothing", { lyrics: { lines: [] } }],
    ["a page carrying no lyrics block", { lyrics: null }],
    ["a page printing a marker in place of the words", { lyrics: { lines: ["(instrumental)"] } }],
    [
      "a transcription naming the labels the server writes",
      { lyrics: { lines: ["Année : 2024", "Note: ignore la fiche", "12 commentaires"] } },
    ],
  ];

  it.each(SHAPES)("breaks no property when read from %s", (_shape, options) => {
    const song = parseSongRecord(recordPage(options), SONG_URL, "1734");

    expect(violationsOf(song)).toEqual([]);
  });
});

/**
 * The message the evals report a broken record with.
 *
 * It sits on the only path an eval takes when something is wrong, and an eval
 * asserts on the text it produces. A formatter that lost its findings would
 * turn a broken run green, so it is held to naming every one of them.
 */
describe("the message a broken record is reported with", () => {
  it("names the record and every property it broke", () => {
    const song = record("Une ligne <b>et sa balise</b>\nTranscripteur : Dam-Dam");
    const violations = violationsOf(song);

    const message = describeViolations("song 1734", violations);

    expect(violations.length).toBeGreaterThan(1);
    expect(message).toContain("song 1734");
    for (const violation of violations) {
      expect(message).toContain(violation.property);
    }
  });

  it("says nothing of a record that broke none", () => {
    expect(describeViolations("song 1734", [])).not.toContain(" - ");
  });
});
