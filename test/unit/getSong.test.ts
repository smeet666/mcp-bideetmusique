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
import { runGetSong } from "../../src/tools/getSong.js";
import type { Song } from "../../src/types.js";
import {
  clientServingHtml,
  codeOfThrown,
  failureOf,
  refusingClient,
  textOfResult,
} from "./helpers.js";
import type { ToolResult } from "../../src/tools/shared.js";

const SONG_ID = "1734";
const SONG_URL = `https://www.bide-et-musique.com/song/${SONG_ID}.html`;

/** The per-song audio endpoint. It sits in every page built here and must never
 * reach the answer, so any field quoting it fails a test rather than shipping. */
const STREAM_PATH = `/stream_${SONG_ID}.php`;

/** A sentence of the lyrics block that is not a lyric: the rights notice the
 * site prints under the words. It stands in for the block's content, so an
 * output that swallowed the block shows up as this sentence escaping. */
const RIGHTS_NOTICE =
  "Ces paroles sont publiées en attente d'une autorisation des ayants droit.";

const LYRICS_HEADING = "Paroles de la chanson";

// ---------------------------------------------------------------------------
// The markup the site serves, as far as the contract describes it.
// ---------------------------------------------------------------------------

interface Comments {
  count: number;
  archived?: number | null;
}

interface LyricsBlock {
  transcriber?: string | null;
  rightsNotice?: boolean;
}

interface RecordOptions {
  id?: string;
  artistId?: string;
  artist?: string;
  title?: string;
  /** Replaces the whole heading paragraph; `null` removes it. */
  heading?: string | null;
  writers?: string[];
  duration?: string | null;
  year?: string | null;
  labels?: string[];
  reference?: string | null;
  presentation?: string | null;
  sleeveCredits?: string[];
  performer?: string | null;
  addedOn?: string | null;
  seeAlso?: Array<{ id: string; name: string }>;
  top50?: string | null;
  favourites?: number | null;
  comments?: Comments | null;
  sleeve?: boolean;
  lyrics?: LyricsBlock | null;
  audio?: boolean;
}

function anchor(href: string, text: string): string {
  return `<a href="${href}">${text}</a>`;
}

function field(label: string, value: string): string {
  return `<tr><td class="informations">${label} : <span class="txtred2">${value}</span></td></tr>`;
}

/**
 * A record page. Every optional field is left out when its option is `null` or
 * an empty array, which is how the site prints a record it knows less about.
 *
 * The contract fixes the markup of the heading, the `informations` cells, the
 * `songinfos` block and the sleeve. It fixes none for the favourite count, the
 * comment count or the lyrics block, so those three are reconstructed from the
 * wording it quotes. A test that fails only on one of them is a disagreement
 * about where the value sits on the page, and the page is what settles it.
 */
function recordPage(options: RecordOptions = {}): string {
  const {
    id = SONG_ID,
    artistId = "8842",
    artist = "Les Vaillants du Dimanche",
    title = "Le Petit Bal des Ampoules",
    writers = ["Odette Vanderplaen", "Régis Bouchonnet"],
    duration = "4 m 16 s",
    year = "1978",
    labels = ["Disques Bouton d'Or"],
    reference = "BO 45-118",
    presentation = null,
    sleeveCredits = [],
    performer = null,
    addedOn = "21/01/2002",
    seeAlso = [],
    top50 = null,
    favourites = null,
    comments = null,
    sleeve = true,
    lyrics = null,
    audio = true,
  } = options;

  // The artist link carries markup inside its title attribute, so an opening
  // tag here does not end at the first `>`.
  const headingParagraph =
    options.heading === null
      ? ""
      : (options.heading ??
        `<p class="titrerosebg"><a href="/artist/${artistId}.html" title="Consulter la fiche de <b>${artist}</b>">${artist}</a> - ${title}</p>`);

  const rows: string[] = [];
  if (performer) rows.push(field("Interprète", anchor("/artist/9001.html", performer)));
  if (writers.length > 0) {
    rows.push(
      field(
        "Auteurs compositeurs",
        writers.map((name, index) => anchor(`/auteur/${400 + index}.html`, name)).join(" - "),
      ),
    );
  }
  if (year) rows.push(field("Année", anchor(`/annee/${year}.html`, year)));
  if (duration) rows.push(field("Durée", duration));
  if (labels.length > 0) {
    rows.push(
      field(
        "Label",
        labels.map((name, index) => anchor(`/label/${700 + index}.html`, name)).join(" - "),
      ),
    );
  }
  if (reference) rows.push(field("Référence", reference));
  if (presentation) rows.push(field("Présentation", presentation));
  if (sleeveCredits.length > 0) {
    rows.push(
      field(
        "Pochette",
        sleeveCredits.map((name, index) => anchor(`/pochette/${900 + index}.html`, name)).join(" - "),
      ),
    );
  }

  const infos: string[] = [];
  if (addedOn) infos.push(`<p>Ajouté le ${addedOn}</p>`);
  if (seeAlso.length > 0) {
    infos.push(
      `<p>Voir aussi : ${seeAlso
        .map((entry) => anchor(`/artist/${entry.id}.html`, entry.name))
        .join(", ")}</p>`,
    );
  }
  if (top50) infos.push(`<p>Au TOP 50 de B&amp;M : ${top50}</p>`);
  if (favourites !== null && favourites !== undefined) {
    infos.push(
      `<p class="favoris">Cette chanson est dans les favoris de ${anchor(
        `/song/${id}/fans.html`,
        String(favourites),
      )} personnes</p>`,
    );
  }
  if (comments) {
    const archived =
      comments.archived === null || comments.archived === undefined
        ? ""
        : `, dont ${comments.archived} archivé${comments.archived > 1 ? "s" : ""}`;
    infos.push(
      `<p class="commentaires">${anchor(`/song/${id}/commentaires.html`, `${comments.count} commentaire${comments.count > 1 ? "s" : ""}`)}${archived}</p>`,
    );
  }

  const pochette = sleeve
    ? `<div class="pochette-fiche"><a href="/show-image.html?I=/images/pochettes/${id}.jpg&amp;T=pochette"><img src="/images/thumb200/${id}.jpg" alt="Pochette" /></a></div>`
    : "";

  const player = audio
    ? `<audio controls preload="none"><source src="${STREAM_PATH}" type="audio/mpeg" />Votre navigateur ne lit pas l'audio.</audio>`
    : "";

  const lyricsBlock = lyrics
    ? [
        `<div id="parolesbloc">`,
        `<p class="titrebleubg">${LYRICS_HEADING}</p>`,
        lyrics.rightsNotice === false ? "" : `<p class="txtsmall">${RIGHTS_NOTICE}</p>`,
        lyrics.transcriber ? `<p class="txtsmall">Transcripteur : ${lyrics.transcriber}</p>` : "",
        `</div>`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>${title} - Bide et Musique</title>
</head>
<body>
<div id="entete"><a href="/index.html">Accueil</a></div>
<div id="principal">
${headingParagraph}
${pochette}
${player}
<table class="bmtable">
${rows.join("\n")}
</table>
<div id="songinfos">
<p class="titrebleubg">Plus d'infos</p>
${infos.join("\n")}
</div>
${lyricsBlock}
</div>
<div id="footer"><p>Bide &amp; Musique</p></div>
</body>
</html>
`;
}

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
  return runGetSong(clientServingHtml(recordPage(options)), { song_id: SONG_ID });
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
    expect(song.presentation).toBe(
      "Une curiosité pressée à Bruxelles pour un club de supporters.",
    );
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
      payload.notes.some((note) => /ne (les )?(publie|affiche|imprime)|prints? (no|none|nothing)|pas de compteur|no counter|absen/i.test(note)),
    ).toBe(true);
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

describe("rule 11 — lyrics are announced, never carried", () => {
  it("announces the block, its transcriber and its rights notice", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.transcriber).toBe("Bernard T.");
    expect(song.lyrics.rightsNotice).toBe(true);
    expect(song.lyrics.url).toBe(SONG_URL);
  });

  it("says the block is absent for the record whose page carries none", () => {
    const song = parse({ lyrics: null });

    expect(song.lyrics.available).toBe(false);
    expect(song.lyrics.transcriber).toBeNull();
    expect(song.lyrics.rightsNotice).toBe(false);
    expect(song.lyrics.url).toBe(SONG_URL);
  });

  it("names no transcriber when the block credits none", () => {
    const song = parse({ lyrics: { transcriber: null } });

    expect(song.lyrics.available).toBe(true);
    expect(song.lyrics.transcriber).toBeNull();
  });

  it("carries no content of the lyrics block in any parsed field", () => {
    const song = parse({ lyrics: { transcriber: "Bernard T." } });

    for (const value of allStrings(song)) {
      expect(value).not.toContain(RIGHTS_NOTICE);
      expect(value).not.toContain(LYRICS_HEADING);
      expect(value).not.toContain("Transcripteur :");
    }
  });

  it("carries no content of the lyrics block in the structured answer or the text", async () => {
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
      runGetSong(clientServingHtml(pageWithoutHeading()), { song_id: SONG_ID }),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("fails on an empty body", async () => {
    const failure = await failureOf(
      runGetSong(clientServingHtml(emptyBodyPage()), { song_id: SONG_ID }),
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
    const failure = await failureOf(runGetSong(refusingClient(), { song_id: "abc" }));

    expect(failure.code).toBe("invalid_input");
    // The refusal names the argument it is about; its exact spelling is the
    // tool's to choose.
    expect(failure.text).toMatch(/song[_ ]id/i);
  });

  it("refuses an id carrying a space, a sign or a suffix, before any request", async () => {
    for (const songId of ["17 34", "-5", "1734a", "17.34", ""]) {
      const failure = await failureOf(runGetSong(refusingClient(), { song_id: songId }));
      expect(failure.code).toBe("invalid_input");
    }
  });

  it("accepts an id of digits", async () => {
    const payload = songPayload(await run());

    expect(payload.song_id).toBe(SONG_ID);
  });

  it("reports a record the site answers with 404 as not_found", async () => {
    const failure = await failureOf(runGetSong(clientAnswering404(), { song_id: "999999" }));

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
