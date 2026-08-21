/**
 * `get_artist`, read from the contract alone: one artist page in, one Artist
 * out, and a plain statement of how little the catalogue usually holds.
 *
 * The markup is built inline rather than captured, so each test states which
 * shape of page it is about. No clock, no network, no randomness: the tool is
 * driven through an injected fetch, and a client whose fetch throws proves that
 * a refusal happened before any request left.
 *
 * Artist names, song titles, labels and nationalities here are invented. No
 * line of any song text is written into this file.
 */

import { describe, expect, it } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { parseArtistPage } from "../../src/bideetmusique/parseArtist.js";
import { loadConfig } from "../../src/config.js";
import { runGetArtist } from "../../src/tools/getArtist.js";
import type { Artist } from "../../src/types.js";
import {
  clientServingHtml,
  codeOfThrown,
  failureOf,
  refusingClient,
  textOfResult,
} from "./helpers.js";
import type { ToolResult } from "../../src/tools/shared.js";

const ARTIST_ID = "4821";
const ARTIST_URL = `https://www.bide-et-musique.com/artist/${ARTIST_ID}.html`;
const ARTIST_NAME = "Véronique Baldassari";

/** The four markers of the one closed vocabulary the contract names. */
const PROGRAMMING = {
  special: "Dans les programmes spéciaux",
  general: "Dans la programmation générale",
  unranked: "Hors classement",
  broadcast: "Émission",
} as const;

/**
 * The comment count the page prints. It sits in every page built here and must
 * never reach the answer, so any field or line quoting it fails a test rather
 * than shipping.
 */
const COMMENT_COUNT = 17;
const COMMENT_LINE = `${COMMENT_COUNT} commentaires`;

/** The birth date that refuses to be normalised, with its parenthesised death. */
const BIRTH_WITH_DEATH = "08/12/1953 (décès le 29/12/2021)";

// ---------------------------------------------------------------------------
// The markup the site serves, as far as the contract describes it.
// ---------------------------------------------------------------------------

interface SongRow {
  songId: string;
  title: string;
  /** `null` prints an empty year cell, which 3 pages of 50 do. */
  year: string | null;
  programming?: string | null;
  thumb?: boolean;
}

interface ArtistPageOptions {
  id?: string;
  /** Replaces the whole heading block; `null` removes it. */
  heading?: string | null;
  name?: string;
  /** Which of the two header row shapes the page uses. */
  headerShape?: "strong" | "th";
  surname?: string | null;
  firstName?: string | null;
  nationality?: string | null;
  birthDate?: string | null;
  presentation?: string | null;
  aliases?: string[];
  /** The alias label as printed: the site writes both spellings. */
  aliasLabel?: string;
  seeAlso?: Array<{ id: string; name: string }>;
  links?: Array<{ label: string; url: string }>;
  photo?: boolean;
  songs?: SongRow[];
  comments?: number | null;
}

function headerRow(shape: "strong" | "th", label: string, value: string): string {
  return shape === "th"
    ? `<tr><th>${label}</th><td>${value}</td></tr>`
    : `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`;
}

function discographyRow(row: SongRow): string {
  const { songId, title, year, programming = PROGRAMMING.general, thumb = true } = row;

  const bubble = programming
    ? `<td class="category"><a href="/program/in_program/${songId}.html"><img src="/images/bulle-green.png" alt="${programming}" title="${programming}" /></a></td>`
    : `<td class="category">&nbsp;</td>`;
  const vignette = thumb
    ? `<td class="vignette25"><a href="/show-image.html?I=/images/pochettes/${songId}.jpg&amp;T=pochette"><img src="/images/thumb25/${songId}.jpg" alt="Vignette" title="Cliquez pour agrandir" /></a></td>`
    : `<td class="vignette25">&nbsp;</td>`;
  const yearCell = year ? `<td class="annee">${year}</td>` : `<td class="annee">&nbsp;</td>`;
  const titleCell = `<td class="baseitem"><a href="/song/${songId}.html" title="Consulter la fiche de ${title}">${title}</a></td>`;

  return `<tr class="p0">
${bubble}
${vignette}
${yearCell}
${titleCell}
</tr>`;
}

/**
 * An artist page. Every header field is left out when its option is `null`, and
 * a page left with none of them is the ordinary state of the catalogue rather
 * than a broken page.
 */
function artistPage(options: ArtistPageOptions = {}): string {
  const {
    id = ARTIST_ID,
    name = ARTIST_NAME,
    headerShape = "strong",
    surname = null,
    firstName = null,
    nationality = null,
    birthDate = null,
    presentation = null,
    aliases = [],
    aliasLabel = "Autre(s) alias",
    seeAlso = [],
    links = [],
    photo = false,
    songs = [],
    comments = COMMENT_COUNT,
  } = options;

  const heading =
    options.heading === null
      ? ""
      : (options.heading ?? `<div class="titre-bloc"><h2>${name}</h2></div>`);

  const rows: string[] = [];
  if (surname) {
    rows.push(headerRow(headerShape, "Nom", surname));
  }
  if (firstName) {
    rows.push(headerRow(headerShape, "Prénom", firstName));
  }
  if (nationality) {
    rows.push(headerRow(headerShape, "Nationalité", nationality));
  }
  if (birthDate) {
    rows.push(headerRow(headerShape, "Date de naissance", birthDate));
  }
  if (aliases.length > 0) {
    rows.push(headerRow(headerShape, aliasLabel, aliases.join("<br />\n")));
  }
  if (presentation) {
    rows.push(headerRow(headerShape, "Présentation", presentation));
  }
  if (seeAlso.length > 0) {
    rows.push(
      headerRow(
        headerShape,
        "Voir aussi",
        `<ul>${seeAlso
          .map((entry) => `<li><a href="/artist/${entry.id}.html">${entry.name}</a></li>`)
          .join("")}</ul>`,
      ),
    );
  }
  if (links.length > 0) {
    rows.push(
      headerRow(
        headerShape,
        "Liens",
        `<ul>${links
          .map((entry) => `<li><a href="${entry.url}">${entry.label}</a></li>`)
          .join("")}</ul>`,
      ),
    );
  }

  const header = rows.length > 0 ? `<table class="bmtable">\n${rows.join("\n")}\n</table>` : "";

  const portrait = photo
    ? `<div class="photo-artiste"><img src="/images/photos/${id}.jpg" alt="Photo de ${name}" /></div>`
    : "";

  const discography =
    songs.length > 0
      ? `<table class="bmtable small">\n${songs.map(discographyRow).join("\n")}\n</table>`
      : "";

  const commentBlock =
    comments === null
      ? ""
      : `<p class="commentaires"><a href="/artist/${id}/commentaires.html">${comments} commentaires</a></p>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>${name} - Bide et Musique</title>
</head>
<body>
<div id="entete"><a href="/index.html">Accueil</a></div>
<div id="principal">
${heading}
${portrait}
${header}
<p class="tri"><a href="/artist/${id}.html?tri=annee">Par année de sortie</a> - <a href="/artist/${id}.html?tri=alpha">Par ordre alphabétique</a></p>
${discography}
${commentBlock}
</div>
<div id="footer"><p>Bide &amp; Musique</p></div>
</body>
</html>
`;
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

/** One song and nothing else: the median page of the catalogue. */
const ONE_SONG: SongRow[] = [{ songId: "5100", title: "La Valse du Répondeur", year: "1979" }];

/**
 * The largest discography measured, served in the site's order, by year of
 * release. The titles are deliberately out of alphabetical order so that a
 * reader that re-sorts shows up as a failing test.
 */
function twentyThreeSongs(): SongRow[] {
  const titles = [
    "Zébulon sur le Périphérique",
    "Un Dimanche à Vierzon",
    "Le Torchon Brûle Encore",
    "Sirop de Menthe et Grand Amour",
    "Rendez-vous Place Gambetta",
    "Quand Tombe la Pluie de Mars",
    "Pas de Deux au Supermarché",
    "On S'écrira des Cartes",
    "Nuit Blanche à Charleroi",
    "Mon Voisin Joue du Trombone",
    "Les Klaxons de Minuit",
    "La Boum de Tante Huguette",
    "Java pour Deux Cuisinières",
    "Il Pleut sur le Camping",
    "Histoire d'un Parapluie",
    "Grand Écart au Bal du Foot",
    "Fanfare pour un Déménagement",
    "En Route vers Perpignan",
    "Deux Tickets pour Nulle Part",
    "Coup de Foudre au Guichet",
    "Bal Perdu des Beaux Jours",
    "Autoroute du Sud en Août",
    "Adieu Mademoiselle Solange",
  ];
  return titles.map((title, index) => ({
    songId: String(5200 + index),
    title,
    year: String(1982 - index),
  }));
}

// ---------------------------------------------------------------------------
// Reading the answer.
// ---------------------------------------------------------------------------

interface StructuredDiscographyEntry {
  song_id: string;
  title: string;
  url: string;
  year: number | null;
  programming: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

interface StructuredArtist {
  artist_id: string;
  url: string;
  name: string;
  aliases: string[];
  surname: string | null;
  first_name: string | null;
  nationality: string | null;
  birth_date: string | null;
  presentation: string | null;
  see_also: Array<{ id: string; name: string; url: string }>;
  links: Array<{ label: string; url: string }>;
  photo_url: string | null;
  discography: StructuredDiscographyEntry[];
  discography_count: number;
  songs_on_page: number;
  source: string;
  notes: string[];
}

function artistPayload(result: ToolResult): StructuredArtist {
  if (!result.structuredContent) {
    throw new Error("the tool returned no structuredContent");
  }
  return result.structuredContent as unknown as StructuredArtist;
}

function parse(options: ArtistPageOptions = {}): Artist {
  return parseArtistPage(artistPage(options), ARTIST_URL, ARTIST_ID);
}

async function run(options: ArtistPageOptions = {}, limit = 100): Promise<ToolResult> {
  return runGetArtist(clientServingHtml(artistPage(options)), {
    artist_id: options.id ?? ARTIST_ID,
    limit,
  });
}

/**
 * Every string and every number the value holds, at any depth, with the entries
 * under the named keys left out. The two never-published rules sweep the whole
 * payload, and the field that is allowed to carry the value is skipped by name.
 */
function allScalars(value: unknown, skipKeys: string[] = []): Array<string | number> {
  const found: Array<string | number> = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string" || typeof node === "number") {
      found.push(node);
    } else if (Array.isArray(node)) {
      for (const entry of node) {
        walk(entry);
      }
    } else if (node && typeof node === "object") {
      for (const [key, entry] of Object.entries(node)) {
        if (skipKeys.includes(key)) {
          continue;
        }
        walk(entry);
      }
    }
  };
  walk(value);
  return found;
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

describe("rule 1 — the name is the only field every artist page carries", () => {
  it("parses a page carrying nothing but a name", () => {
    const artist = parse({ songs: [] });

    expect(artist.name).toBe(ARTIST_NAME);
    expect(artist.id).toBe(ARTIST_ID);
    expect(artist.url).toBe(ARTIST_URL);

    expect(artist.surname).toBeNull();
    expect(artist.firstName).toBeNull();
    expect(artist.nationality).toBeNull();
    expect(artist.birthDate).toBeNull();
    expect(artist.presentation).toBeNull();
    expect(artist.photoUrl).toBeNull();
    expect(artist.aliases).toEqual([]);
    expect(artist.seeAlso).toEqual([]);
    expect(artist.links).toEqual([]);
    expect(artist.discography).toEqual([]);
  });

  it("hands a page carrying only a name and one song back as a success", async () => {
    const result = await run({ songs: ONE_SONG });
    const payload = artistPayload(result);

    expect(result.isError).toBeFalsy();
    expect(payload.artist_id).toBe(ARTIST_ID);
    expect(payload.name).toBe(ARTIST_NAME);
    expect(payload.source).toBe("bide-et-musique.com");
    expect(payload.discography).toHaveLength(1);
    expect(payload.birth_date).toBeNull();
    expect(payload.nationality).toBeNull();
    expect(payload.aliases).toEqual([]);
  });

  it("reads a page that carries every header field the site knows how to print", () => {
    const artist = parse({
      surname: "Baldassari",
      firstName: "Véronique",
      nationality: "franco-espagnole",
      birthDate: "05/10/1950",
      presentation: "Une chanteuse de cabaret passée par les orchestres de bal du Sud-Ouest.",
      aliases: ["Vérone", "Nicky Balda"],
      seeAlso: [{ id: "4822", name: "Les Frères Baldassari" }],
      links: [{ label: "Site officiel", url: "https://example.org/veronique-baldassari" }],
      photo: true,
      songs: ONE_SONG,
    });

    expect(artist.surname).toBe("Baldassari");
    expect(artist.firstName).toBe("Véronique");
    expect(artist.nationality).toBe("franco-espagnole");
    expect(artist.birthDate).toBe("05/10/1950");
    expect(artist.presentation).toBe(
      "Une chanteuse de cabaret passée par les orchestres de bal du Sud-Ouest.",
    );
    expect(artist.aliases).toEqual(["Vérone", "Nicky Balda"]);
    expect(artist.seeAlso.map((entry) => entry.name)).toEqual(["Les Frères Baldassari"]);
    expect(artist.links).toHaveLength(1);
    expect(artist.photoUrl).toContain(`/images/photos/${ARTIST_ID}.jpg`);
  });

  it("keeps the twenty-three-song page's fields absent when the page prints none", () => {
    const artist = parse({ songs: twentyThreeSongs() });

    expect(artist.name).toBe(ARTIST_NAME);
    expect(artist.discography).toHaveLength(23);
    expect(artist.birthDate).toBeNull();
    expect(artist.nationality).toBeNull();
    expect(artist.surname).toBeNull();
    expect(artist.firstName).toBeNull();
  });
});

describe("rule 2 — a page with no heading is a parse failure, never a nameless artist", () => {
  it("throws parse_failure from the parser when the page carries no heading", () => {
    expect(
      codeOfThrown(() => parseArtistPage(artistPage({ heading: null }), ARTIST_URL, ARTIST_ID)),
    ).toBe("parse_failure");
  });

  it("throws parse_failure on an empty body", () => {
    expect(codeOfThrown(() => parseArtistPage(emptyBodyPage(), ARTIST_URL, ARTIST_ID))).toBe(
      "parse_failure",
    );
  });

  it("fails through the tool rather than returning an artist with a null name", async () => {
    const failure = await failureOf(
      runGetArtist(clientServingHtml(artistPage({ heading: null, songs: ONE_SONG })), {
        artist_id: ARTIST_ID,
        limit: 100,
      }),
    );

    expect(failure.code).toBe("parse_failure");
  });
});

describe("rule 3 — an artist id is digits, and a 404 is not a parse failure", () => {
  it("refuses an artist id of letters before any request goes out", async () => {
    const failure = await failureOf(
      runGetArtist(refusingClient(), { artist_id: "abc", limit: 100 }),
    );

    expect(failure.code).toBe("invalid_input");
    // The refusal names the argument it is about; its exact spelling is the
    // tool's to choose.
    expect(failure.text).toMatch(/artist[_ ]id/i);
  });

  it("refuses an id carrying a space, a sign, a suffix or nothing at all, before any request", async () => {
    for (const artistId of ["48 21", "-5", "4821a", "48.21", "", "4821.html"]) {
      const failure = await failureOf(
        runGetArtist(refusingClient(), { artist_id: artistId, limit: 100 }),
      );
      expect(failure.code).toBe("invalid_input");
    }
  });

  it("accepts an id of digits", async () => {
    const payload = artistPayload(await run({ songs: ONE_SONG }));

    expect(payload.artist_id).toBe(ARTIST_ID);
  });

  it("reports an artist the site answers with 404 as not_found", async () => {
    const failure = await failureOf(
      runGetArtist(clientAnswering404(), { artist_id: "999999", limit: 100 }),
    );

    expect(failure.code).toBe("not_found");
    expect(failure.code).not.toBe("parse_failure");
  });
});

describe("rule 4 — the birth date comes back as published, and nothing is derived from it", () => {
  it("returns 05/10/1950 as published", () => {
    expect(parse({ birthDate: "05/10/1950" }).birthDate).toBe("05/10/1950");
  });

  it("returns a year on its own as published", () => {
    const artist = parse({ birthDate: "1947" });

    expect(artist.birthDate).toBe("1947");
    expect(typeof artist.birthDate).toBe("string");
  });

  it("returns a month and a year as published", () => {
    expect(parse({ birthDate: "12/1957" }).birthDate).toBe("12/1957");
  });

  it("returns the date carrying a death in parentheses whole", () => {
    expect(parse({ birthDate: BIRTH_WITH_DEATH }).birthDate).toBe(BIRTH_WITH_DEATH);
  });

  it("holds no day, no year and no death date derived from it in any parsed field", () => {
    const artist = parse({ birthDate: BIRTH_WITH_DEATH, songs: ONE_SONG });

    expect(artist.birthDate).toBe(BIRTH_WITH_DEATH);
    for (const value of allScalars(artist, ["birthDate"])) {
      if (typeof value === "number") {
        expect(value).not.toBe(1953);
        expect(value).not.toBe(2021);
        continue;
      }
      expect(value).not.toContain("1953");
      expect(value).not.toContain("2021");
      expect(value).not.toContain("décès");
      expect(value).not.toContain("29/12");
    }
  });

  it("holds no derived day, year or death in the structured answer, and prints the string whole", async () => {
    const result = await run({ birthDate: BIRTH_WITH_DEATH, songs: ONE_SONG });
    const payload = artistPayload(result);

    expect(payload.birth_date).toBe(BIRTH_WITH_DEATH);
    for (const value of allScalars(payload, ["birth_date"])) {
      if (typeof value === "number") {
        expect(value).not.toBe(1953);
        expect(value).not.toBe(2021);
        continue;
      }
      expect(value).not.toContain("1953");
      expect(value).not.toContain("2021");
      expect(value).not.toContain("décès");
      expect(value).not.toContain("29/12");
    }

    // No field is named for a death, a birth year or a normalised date either.
    const keys = Object.keys(payload);
    expect(keys.some((key) => /death|deces|décès|died/i.test(key))).toBe(false);
    expect(keys.some((key) => /birth_year|birth_day/i.test(key))).toBe(false);

    const text = textOfResult(result);
    expect(text).toContain(BIRTH_WITH_DEATH);
    expect(text).not.toContain("1953-12-08");
    expect(text).not.toMatch(/d[ée]c[ée]d[ée]/i);
  });
});

describe("rule 5 — nationality is a string, whatever it says", () => {
  it("returns each of the site's spellings unchanged", () => {
    for (const nationality of [
      "suisse",
      "Française",
      "franco-espagnole",
      "Britannique / Thaïlandaise",
      "belge (de Bruxelles)",
    ]) {
      const artist = parse({ nationality });

      expect(artist.nationality).toBe(nationality);
      expect(typeof artist.nationality).toBe("string");
    }
  });

  it("maps a nationality to no code and to no list", async () => {
    const payload = artistPayload(await run({ nationality: "belge (de Bruxelles)" }));

    expect(payload.nationality).toBe("belge (de Bruxelles)");
    expect(typeof payload.nationality).toBe("string");
    expect(Array.isArray(payload.nationality)).toBe(false);
    // A two-letter code or a canonical country name would both be the parser
    // stating something the page does not carry.
    expect(payload.nationality).not.toBe("BE");
    expect(payload.nationality).not.toBe("Belgique");
  });

  it("returns null, not an empty string, when the page states no nationality", () => {
    const artist = parse({ nationality: null });

    expect(artist.nationality).toBeNull();
    expect(artist.nationality).not.toBe("");
  });
});

describe("rule 6 — aliases are an array, read under either spelling of the label", () => {
  it("reads three stacked aliases under the plural label", () => {
    const artist = parse({
      aliasLabel: "Autre(s) alias",
      aliases: ["Vérone", "Nicky Balda", "La Baldassari"],
    });

    expect(artist.aliases).toEqual(["Vérone", "Nicky Balda", "La Baldassari"]);
  });

  it("reads one alias under the singular label", () => {
    const artist = parse({ aliasLabel: "Autre alias", aliases: ["Vérone"] });

    expect(artist.aliases).toEqual(["Vérone"]);
  });

  it("reads two stacked aliases under the singular label as well", () => {
    const artist = parse({ aliasLabel: "Autre alias", aliases: ["Vérone", "Nicky Balda"] });

    expect(artist.aliases).toEqual(["Vérone", "Nicky Balda"]);
  });

  it("reads the plural label written without its parentheses", () => {
    const artist = parse({ aliasLabel: "Autres alias", aliases: ["Vérone", "Nicky Balda"] });

    expect(artist.aliases).toEqual(["Vérone", "Nicky Balda"]);
  });

  it("returns an empty array, never null, when the page states no alias", async () => {
    const artist = parse({ aliases: [] });
    expect(artist.aliases).toEqual([]);
    expect(artist.aliases).not.toBeNull();

    const payload = artistPayload(await run({ aliases: [] }));
    expect(payload.aliases).toEqual([]);
    expect(Array.isArray(payload.aliases)).toBe(true);
  });

  it("keeps the aliases an array in the structured answer, one entry per line", async () => {
    const payload = artistPayload(
      await run({ aliasLabel: "Autre alias", aliases: ["Vérone", "Nicky Balda"] }),
    );

    expect(payload.aliases).toEqual(["Vérone", "Nicky Balda"]);
  });
});

describe("rule 7 — see_also and links are arrays built from the anchors the page publishes", () => {
  it("reads the see-also list as one entry per anchor", () => {
    const artist = parse({
      seeAlso: [
        { id: "4822", name: "Les Frères Baldassari" },
        { id: "4823", name: "Orchestre Marcel Quintin" },
      ],
    });

    expect(artist.seeAlso).toHaveLength(2);
    expect(artist.seeAlso.map((entry) => entry.name)).toEqual([
      "Les Frères Baldassari",
      "Orchestre Marcel Quintin",
    ]);
    expect(artist.seeAlso[0]!.id).toBe("4822");
  });

  it("keeps a link's label and its off-site address as published", () => {
    const artist = parse({
      links: [
        { label: "Site officiel", url: "https://example.org/veronique-baldassari" },
        { label: "Discographie amateur", url: "http://example.net/45-tours/baldassari.html" },
      ],
    });

    expect(artist.links).toEqual([
      { label: "Site officiel", url: "https://example.org/veronique-baldassari" },
      { label: "Discographie amateur", url: "http://example.net/45-tours/baldassari.html" },
    ]);
  });

  it("returns both as empty arrays when the page publishes neither", () => {
    const artist = parse({ seeAlso: [], links: [] });

    expect(artist.seeAlso).toEqual([]);
    expect(artist.links).toEqual([]);
  });

  it("publishes both as arrays in the structured answer", async () => {
    const payload = artistPayload(
      await run({
        seeAlso: [{ id: "4822", name: "Les Frères Baldassari" }],
        links: [{ label: "Site officiel", url: "https://example.org/veronique-baldassari" }],
      }),
    );

    expect(payload.see_also).toHaveLength(1);
    expect(payload.see_also[0]).toMatchObject({ id: "4822", name: "Les Frères Baldassari" });
    expect(payload.links).toEqual([
      { label: "Site officiel", url: "https://example.org/veronique-baldassari" },
    ]);
  });

  it("reads both lists from a page using the th header shape", () => {
    const artist = parse({
      headerShape: "th",
      seeAlso: [{ id: "4822", name: "Les Frères Baldassari" }],
      links: [{ label: "Site officiel", url: "https://example.org/veronique-baldassari" }],
      nationality: "suisse",
    });

    expect(artist.seeAlso.map((entry) => entry.name)).toEqual(["Les Frères Baldassari"]);
    expect(artist.links[0]!.url).toBe("https://example.org/veronique-baldassari");
    expect(artist.nationality).toBe("suisse");
  });
});

describe("rule 8 — a discography row keeps what it carries and nothing more", () => {
  it("reads the song id, the title, the year and the sleeve addresses of one row", () => {
    const artist = parse({ songs: ONE_SONG });

    expect(artist.discography).toHaveLength(1);
    const entry = artist.discography[0]!;
    expect(entry.songId).toBe("5100");
    expect(entry.title).toBe("La Valse du Répondeur");
    expect(entry.url).toContain("/song/5100.html");
    expect(entry.year).toBe(1979);
    expect(typeof entry.year).toBe("number");
    expect(entry.imageUrl).toContain("/images/pochettes/5100.jpg");
    expect(entry.thumbnailUrl).toContain("/images/thumb25/5100.jpg");
  });

  it("keeps a row that carries no year, with year null", () => {
    const artist = parse({
      songs: [
        { songId: "5100", title: "La Valse du Répondeur", year: "1979" },
        { songId: "5101", title: "Le Manège de Saint-Girons", year: null },
      ],
    });

    expect(artist.discography).toHaveLength(2);
    expect(artist.discography[1]!.title).toBe("Le Manège de Saint-Girons");
    expect(artist.discography[1]!.year).toBeNull();
  });

  it("returns each of the four programming markers as the site words it", () => {
    const artist = parse({
      songs: [
        {
          songId: "5100",
          title: "La Valse du Répondeur",
          year: "1979",
          programming: PROGRAMMING.special,
        },
        {
          songId: "5101",
          title: "Le Manège de Saint-Girons",
          year: "1978",
          programming: PROGRAMMING.general,
        },
        {
          songId: "5102",
          title: "Deux Sucres et un Regret",
          year: "1977",
          programming: PROGRAMMING.unranked,
        },
        {
          songId: "5103",
          title: "Le Grand Départ de Juillet",
          year: "1976",
          programming: PROGRAMMING.broadcast,
        },
      ],
    });

    expect(artist.discography.map((entry) => entry.programming)).toEqual([
      PROGRAMMING.special,
      PROGRAMMING.general,
      PROGRAMMING.unranked,
      PROGRAMMING.broadcast,
    ]);
  });

  it("returns a null programming marker for a row that carries no bubble", () => {
    const artist = parse({
      songs: [{ songId: "5100", title: "La Valse du Répondeur", year: "1979", programming: null }],
    });

    expect(artist.discography[0]!.programming).toBeNull();
  });

  it("returns null sleeve addresses for a row with no thumbnail", () => {
    const artist = parse({
      songs: [{ songId: "5100", title: "La Valse du Répondeur", year: "1979", thumb: false }],
    });

    expect(artist.discography[0]!.imageUrl).toBeNull();
    expect(artist.discography[0]!.thumbnailUrl).toBeNull();
  });

  it("publishes a row without a year as year null in the structured answer", async () => {
    const payload = artistPayload(
      await run({
        songs: [
          { songId: "5100", title: "La Valse du Répondeur", year: "1979" },
          { songId: "5101", title: "Le Manège de Saint-Girons", year: null },
        ],
      }),
    );

    expect(payload.discography[1]).toMatchObject({
      song_id: "5101",
      title: "Le Manège de Saint-Girons",
      year: null,
    });
    expect(payload.discography[1]!.year).not.toBe(0);
  });

  it("publishes the four markers unchanged in the structured answer", async () => {
    const payload = artistPayload(
      await run({
        songs: [
          {
            songId: "5100",
            title: "La Valse du Répondeur",
            year: "1979",
            programming: PROGRAMMING.special,
          },
          {
            songId: "5101",
            title: "Le Manège de Saint-Girons",
            year: "1978",
            programming: PROGRAMMING.general,
          },
          {
            songId: "5102",
            title: "Deux Sucres et un Regret",
            year: "1977",
            programming: PROGRAMMING.unranked,
          },
          {
            songId: "5103",
            title: "Le Grand Départ de Juillet",
            year: "1976",
            programming: PROGRAMMING.broadcast,
          },
        ],
      }),
    );

    expect(payload.discography.map((entry) => entry.programming)).toEqual([
      PROGRAMMING.special,
      PROGRAMMING.general,
      PROGRAMMING.unranked,
      PROGRAMMING.broadcast,
    ]);
  });
});

describe("rule 9 — the discography order is the site's, and a truncation says so", () => {
  it("keeps the rows in the order the page printed them", () => {
    const songs = twentyThreeSongs();
    const artist = parse({ songs });

    expect(artist.discography.map((entry) => entry.title)).toEqual(songs.map((row) => row.title));
    // The page's order is by year of release, so an alphabetical answer would
    // be a ranking the site never published.
    const alphabetical = [...songs.map((row) => row.title)].sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
    expect(artist.discography.map((entry) => entry.title)).not.toEqual(alphabetical);
  });

  it("returns all twenty-three songs when the limit is above the page's count", async () => {
    const payload = artistPayload(await run({ songs: twentyThreeSongs() }, 100));

    expect(payload.discography).toHaveLength(23);
    expect(payload.discography_count).toBe(23);
    expect(payload.songs_on_page).toBe(23);
  });

  it("truncates to the limit and keeps the first rows of the site's order", async () => {
    const songs = twentyThreeSongs();
    const payload = artistPayload(await run({ songs }, 10));

    expect(payload.discography).toHaveLength(10);
    expect(payload.discography_count).toBe(10);
    expect(payload.songs_on_page).toBe(23);
    expect(payload.discography.map((entry) => entry.title)).toEqual(
      songs.slice(0, 10).map((row) => row.title),
    );
  });

  it("says in a note how many songs the page held and that the order is the site's", async () => {
    const result = await run({ songs: twentyThreeSongs() }, 10);
    const payload = artistPayload(result);

    expect(payload.notes.some((note) => note.includes("23"))).toBe(true);
    expect(
      payload.notes.some((note) =>
        /ordre du site|order of the site|site's order|ann[ée]e de sortie|year of release/i.test(
          note,
        ),
      ),
    ).toBe(true);
    expect(
      payload.notes.some((note) =>
        /classement|ranking|pas un palmar[èe]s|not a ranking/i.test(note),
      ),
    ).toBe(true);
    expect(textOfResult(result)).toContain("23");
  });

  it("adds no truncation note when the limit held everything", async () => {
    const payload = artistPayload(await run({ songs: ONE_SONG }, 100));

    expect(payload.notes.some((note) => /tronqu|truncat|limit/i.test(note))).toBe(false);
  });
});

describe("rule 10 — an empty discography is stated, never left unexplained", () => {
  it("returns an empty array for an artist the catalogue holds no song for", () => {
    const artist = parse({ songs: [] });

    expect(artist.discography).toEqual([]);
  });

  it("says in a note that the catalogue holds no song for this artist", async () => {
    const result = await run({ songs: [] });
    const payload = artistPayload(result);

    expect(result.isError).toBeFalsy();
    expect(payload.discography).toEqual([]);
    expect(payload.discography_count).toBe(0);
    expect(payload.songs_on_page).toBe(0);
    expect(
      payload.notes.some((note) => /aucune chanson|no song|aucun titre|holds no/i.test(note)),
    ).toBe(true);
  });

  it("repeats the absence in the text the caller reads", async () => {
    const text = textOfResult(await run({ songs: [] }));

    expect(text).toMatch(/aucune chanson|no song|aucun titre/i);
  });

  it("states no such absence for an artist holding one song", async () => {
    const payload = artistPayload(await run({ songs: ONE_SONG }));

    expect(payload.notes.some((note) => /aucune chanson|no song|aucun titre/i.test(note))).toBe(
      false,
    );
  });
});

describe("rule 11 — a page with no header field says so in a note", () => {
  it("notes that the page carries no header field at all", async () => {
    const result = await run({ songs: ONE_SONG });
    const payload = artistPayload(result);

    expect(payload.surname).toBeNull();
    expect(payload.first_name).toBeNull();
    expect(payload.nationality).toBeNull();
    expect(payload.birth_date).toBeNull();
    expect(
      payload.notes.some((note) =>
        /aucune information|aucun champ|no header field|states nothing|nothing about the artist|beyond the name/i.test(
          note,
        ),
      ),
    ).toBe(true);
  });

  it("repeats it in the text, so a caller reading nulls does not take them for a failed read", async () => {
    const text = textOfResult(await run({ songs: ONE_SONG }));

    expect(text).toMatch(
      /aucune information|aucun champ|no header field|states nothing|nothing about the artist|beyond the name/i,
    );
  });

  it("states no such note when the page carries a header field", async () => {
    const payload = artistPayload(await run({ nationality: "suisse", songs: ONE_SONG }));

    expect(payload.nationality).toBe("suisse");
    expect(
      payload.notes.some((note) =>
        /aucune information|aucun champ|no header field|states nothing|nothing about the artist|beyond the name/i.test(
          note,
        ),
      ),
    ).toBe(false);
  });
});

describe("rule 12 — no comment count, ever", () => {
  it("holds the comment count in no parsed field", () => {
    const artist = parse({ comments: COMMENT_COUNT, songs: ONE_SONG });

    for (const value of allScalars(artist)) {
      if (typeof value === "number") {
        expect(value).not.toBe(COMMENT_COUNT);
        continue;
      }
      expect(value).not.toContain(COMMENT_LINE);
      expect(value.toLowerCase()).not.toContain("commentaire");
    }
  });

  it("holds the comment count in no field of the structured answer", async () => {
    const payload = artistPayload(await run({ comments: COMMENT_COUNT, songs: ONE_SONG }));

    expect(Object.keys(payload).some((key) => /comment/i.test(key))).toBe(false);
    for (const value of allScalars(payload)) {
      if (typeof value === "number") {
        expect(value).not.toBe(COMMENT_COUNT);
        continue;
      }
      expect(value).not.toContain(COMMENT_LINE);
      expect(value.toLowerCase()).not.toContain("commentaire");
    }
  });

  it("states it on no line of the text block", async () => {
    const text = textOfResult(await run({ comments: COMMENT_COUNT, songs: ONE_SONG }));

    for (const line of text.split("\n")) {
      expect(line).not.toMatch(/commentaire/i);
      expect(line).not.toMatch(/\bcomments?\b/i);
      expect(line).not.toContain(COMMENT_LINE);
      expect(line).not.toMatch(new RegExp(`\\b${COMMENT_COUNT}\\b`));
    }
  });

  it("says nothing of the comments on the twenty-three-song page either", async () => {
    const result = await run({ comments: COMMENT_COUNT, songs: twentyThreeSongs() });
    const payload = artistPayload(result);

    for (const value of allScalars(payload)) {
      if (typeof value === "string") {
        expect(value.toLowerCase()).not.toContain("commentaire");
      }
    }
    expect(textOfResult(result)).not.toMatch(/commentaire/i);
  });
});
