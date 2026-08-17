/**
 * The four search axes of `search_songs`.
 *
 * Written from the contract, not from the modules under test: the axes the site
 * offers, the code each one puts in the URL, the wording each one carries back,
 * and the notes an answer owes the caller depending on whether a results row
 * can be checked against the query.
 *
 * Nothing here reaches the network. Markup is built inline with the helpers, and
 * a fetch that throws is how a refusal is proved to have happened before any
 * request. Songs and artists are invented; the lyrics axis is about which song
 * matched, and no song's words appear anywhere in this file.
 */

import { describe, expect, it } from "vitest";

import {
  SEARCH_TYPE_CODES,
  SEARCH_TYPE_LABELS,
  buildSearchUrl,
  type SearchType,
} from "../../src/bideetmusique/urls.js";
import type { ToolResult } from "../../src/tools/shared.js";

import {
  bytesOf,
  connectServer,
  fixtureBytes,
  htmlResponse,
  resultRow,
  resultsPage,
  structured,
  textOfResult,
  throwingFetch,
} from "./helpers.js";

const AXES: SearchType[] = ["performer", "title", "writer", "lyrics"];

/** The axes whose results row holds the field the site matched on. */
const CHECKABLE_AXES: SearchType[] = ["performer", "title"];
/** The axes whose results row holds nothing of what the site matched on. */
const INVISIBLE_AXES: SearchType[] = ["writer", "lyrics"];

/**
 * The note that says the site matched inside words, raised when no row on the
 * page carries the query as a word of its own.
 */
const INSIDE_WORDS_NOTE = /inside[^.]*\bwords?\b/i;

/** The note that says the site's quoted-phrase syntax returns nothing. */
const QUOTED_PHRASE_NOTE = /quot/i;

/** The note that says the ordering the kept rows were taken in. */
const ORDERING_NOTE = /order/i;

/**
 * The note that says the match was made on something the rows do not hold. Both
 * halves are required: a note has to name the match and say the rows do not
 * show what it was made on, which is what tells the caller an unrelated-looking
 * title is expected rather than a defect.
 */
const INVISIBLE_MATCH_NOTE = /match[^.]*\brows?\b[^.]*\b(do|does)\s+not\s+(show|carry)/i;

function notesMatching(notes: string[], ...patterns: RegExp[]): string[] {
  return notes.filter((note) => patterns.every((pattern) => pattern.test(note)));
}

/** A fetch serving one page of markup, recording every address it was asked for. */
function recordingFetch(html: string): { urls: string[]; fetchImpl: typeof fetch } {
  const urls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return htmlResponse(bytesOf(html));
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

function servingBytes(bytes: Uint8Array): typeof fetch {
  return (async () => htmlResponse(bytes)) as unknown as typeof fetch;
}

interface SearchArguments {
  query: string;
  search_type: SearchType | string;
  page?: number;
  limit?: number;
}

async function callSearch(
  fetchImpl: typeof fetch,
  args: SearchArguments | Record<string, unknown>,
): Promise<ToolResult> {
  const client = await connectServer(fetchImpl);
  const result = await client.callTool({
    name: "search_songs",
    arguments: args as Record<string, unknown>,
  });
  return result as unknown as ToolResult;
}

/**
 * The text of a refusal, however the layer chose to express it: an error result
 * or a thrown protocol error. An answer that succeeded is never a refusal.
 */
async function refusalText(run: Promise<ToolResult>): Promise<string> {
  let result: ToolResult;
  try {
    result = await run;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (!result.isError) {
    throw new Error(`expected a refusal, got a result: ${textOfResult(result).slice(0, 200)}`);
  }
  return textOfResult(result);
}

/** Two songs whose titles and performers carry none of the fragments searched below. */
const PAGE_OF_TWO = resultsPage({
  header: "Résultat de votre recherche (2 pour « vacan »)",
  rows: [
    resultRow({
      index: 0,
      songId: "7001",
      title: "Les vacances au camping",
      artistId: "801",
      artist: "Trio Bureautique",
    }),
    resultRow({
      index: 1,
      songId: "7002",
      title: "Le twist de la caravane",
      artistId: "802",
      artist: "Nadine Inventée",
      programming: "Dans les programmes spéciaux",
    }),
  ],
});

const NO_RESULTS_HTML = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Recherche - Bide et Musique</title></head><body>
<div id="resultat">
    <p>Il n'y a pas de résultat pour la recherche <em class="emph">«&nbsp;zzzqqxwv&nbsp;»</em></p>
</div>
</body></html>
`;

describe("rule 1 — the URL carries the right st", () => {
  it("asks the writer axis with st=4 and the lyrics axis with st=6", () => {
    const writer = new URL(buildSearchUrl({ query: "vacances", searchType: "writer" }));
    const lyrics = new URL(buildSearchUrl({ query: "vacances", searchType: "lyrics" }));

    expect(writer.searchParams.get("st")).toBe("4");
    expect(lyrics.searchParams.get("st")).toBe("6");
    expect(SEARCH_TYPE_CODES.writer).toBe(4);
    expect(SEARCH_TYPE_CODES.lyrics).toBe(6);
  });

  it("keeps the performer axis on st=2 and the title axis on st=3", () => {
    const performer = new URL(buildSearchUrl({ query: "vacances", searchType: "performer" }));
    const title = new URL(buildSearchUrl({ query: "vacances", searchType: "title" }));

    expect(performer.searchParams.get("st")).toBe("2");
    expect(title.searchParams.get("st")).toBe("3");
    expect(SEARCH_TYPE_CODES.performer).toBe(2);
    expect(SEARCH_TYPE_CODES.title).toBe(3);
  });

  it("leaves Page out for page 1 and puts it in from page 2, on every axis", () => {
    for (const axis of AXES) {
      const implicit = new URL(buildSearchUrl({ query: "vacances", searchType: axis }));
      const first = new URL(buildSearchUrl({ query: "vacances", searchType: axis, page: 1 }));
      const second = new URL(buildSearchUrl({ query: "vacances", searchType: axis, page: 2 }));

      expect(implicit.searchParams.has("Page"), `${axis} page 1`).toBe(false);
      expect(first.searchParams.has("Page"), `${axis} page 1`).toBe(false);
      expect(second.searchParams.get("Page"), `${axis} page 2`).toBe("2");
      expect(first.searchParams.get("kw"), `${axis} keyword`).toBe("vacances");
    }
  });
});

describe("rule 2 — the enum is what the tool declares", () => {
  it("declares exactly the axes this server publishes", async () => {
    const client = await connectServer(throwingFetch);
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "search_songs");

    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as {
      properties: { search_type?: { enum?: string[] } };
    };
    expect(schema.properties.search_type?.enum).toEqual([
      "performer",
      "title",
      "writer",
      "lyrics",
      "label",
      "year",
    ]);
  });

  it("refuses an axis the site does not offer before making any request", async () => {
    const text = await refusalText(
      callSearch(throwingFetch, { query: "vacances", search_type: "composer" }),
    );
    expect(text).toMatch(/search_type|composer|invalid/i);
  });

  it("refuses the site's own numeric code as a search_type before making any request", async () => {
    const text = await refusalText(callSearch(throwingFetch, { query: "vacances", search_type: "6" }));
    expect(text).toMatch(/search_type|invalid/i);
  });
});

describe("rule 3 — each axis is named in the answer", () => {
  it("labels every axis in the site's own French wording", () => {
    expect(SEARCH_TYPE_LABELS).toEqual({
      performer: "Interprète",
      title: "Nom du morceau",
      writer: "Auteur / Compositeur",
      label: "Label",
      lyrics: "Paroles",
      year: "Année",
    });
  });

  it("names the axis asked for in the answer and echoes search_type back", async () => {
    for (const axis of AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "vacan",
        search_type: axis,
      });

      expect(structured(result).search_type, axis).toBe(axis);
      expect(textOfResult(result), axis).toContain(SEARCH_TYPE_LABELS[axis]);
    }
  });
});

describe("rule 4 — no axis is merged into another", () => {
  it("builds a different URL for every axis, the query being the same", async () => {
    const urls = new Set<string>();
    for (const axis of AXES) {
      const recorder = recordingFetch(PAGE_OF_TWO);
      await callSearch(recorder.fetchImpl, { query: "vacances", search_type: axis });
      expect(recorder.urls, axis).toHaveLength(1);
      urls.add(recorder.urls[0]!);
    }
    expect(urls.size).toBe(AXES.length);
  });

  it("carries a different label for every axis, the query being the same", async () => {
    const labels = new Set(AXES.map((axis) => SEARCH_TYPE_LABELS[axis]));
    expect(labels.size).toBe(AXES.length);

    for (const axis of AXES) {
      const text = textOfResult(
        await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), { query: "vacances", search_type: axis }),
      );
      const others = AXES.filter((other) => other !== axis);
      for (const other of others) {
        expect(text, `${axis} must not claim ${other}`).not.toContain(SEARCH_TYPE_LABELS[other]);
      }
    }
  });
});

describe("rule 5 — the inside-words note fires only where a row can be checked", () => {
  it("fires on the title axis when the query only sits inside a title's word", async () => {
    // "ampin" sits inside "camping" the way the site's own example sits inside
    // "Bambino": no title carries it as a word of its own.
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "ampin",
      search_type: "title",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).not.toHaveLength(0);
  });

  it("fires on the title axis when the query is only the start of a title's word", async () => {
    // "vacan" opens "vacances" and is no word of the row either: the beginning
    // of a word is inside it just as much as its middle.
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "vacan",
      search_type: "title",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).not.toHaveLength(0);
  });

  it("fires on the performer axis when the query only sits inside a performer's word", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "ureauti",
      search_type: "performer",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).not.toHaveLength(0);
  });

  it("fires on the performer axis when the query is only the start of a performer's word", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "bureau",
      search_type: "performer",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).not.toHaveLength(0);
  });

  it("stays silent on the title axis when a title carries the query as a word", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "camping",
      search_type: "title",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).toHaveLength(0);
  });

  it("stays silent on the performer axis when a performer carries the query as a word", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "Trio",
      search_type: "performer",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).toHaveLength(0);
  });

  it("never fires on the writer and lyrics axes, not even when no row carries the query", async () => {
    for (const query of ["ampin", "vacan"]) {
      for (const axis of INVISIBLE_AXES) {
        const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
          query,
          search_type: axis,
        });
        expect(
          notesMatching(structured(result).notes, INSIDE_WORDS_NOTE),
          `${axis} / ${query}`,
        ).toHaveLength(0);
      }
    }
  });
});

describe("rule 6 — an invisible match is announced", () => {
  it("says on the writer and lyrics axes that the match was made on what the row does not hold", async () => {
    for (const axis of INVISIBLE_AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "vacances",
        search_type: axis,
      });
      const structuredResult = structured(result);
      expect(structuredResult.results.length, axis).toBeGreaterThan(0);
      expect(notesMatching(structuredResult.notes, INVISIBLE_MATCH_NOTE), axis).not.toHaveLength(0);
    }
  });

  it("claims no invisible match on the title and performer axes", async () => {
    for (const axis of CHECKABLE_AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "vacances",
        search_type: axis,
      });
      expect(notesMatching(structured(result).notes, INVISIBLE_MATCH_NOTE), axis).toHaveLength(0);
    }
  });
});

describe("rule 7 — a query carrying a double quote is called out", () => {
  it("calls the quoted-phrase syntax out on every axis when results came back", async () => {
    for (const axis of AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: '"les vacances"',
        search_type: axis,
      });
      expect(notesMatching(structured(result).notes, QUOTED_PHRASE_NOTE), axis).not.toHaveLength(0);
    }
  });

  it("calls the quoted-phrase syntax out when nothing came back", async () => {
    for (const axis of AXES) {
      const result = await callSearch(servingBytes(bytesOf(NO_RESULTS_HTML)), {
        query: '"les vacances"',
        search_type: axis,
      });
      const structuredResult = structured(result);
      expect(structuredResult.results, axis).toHaveLength(0);
      expect(notesMatching(structuredResult.notes, QUOTED_PHRASE_NOTE), axis).not.toHaveLength(0);
    }
  });

  it("says nothing about quotes for a query that carries none", async () => {
    for (const axis of AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "les vacances",
        search_type: axis,
      });
      expect(notesMatching(structured(result).notes, QUOTED_PHRASE_NOTE), axis).toHaveLength(0);
    }
  });
});

describe("rule 8 — several words restrict", () => {
  it("states in the tool description that keywords combine with AND", async () => {
    const { searchSongsDescription } = (await import("../../src/tools/searchSongs.js")) as {
      searchSongsDescription: string;
    };
    expect(searchSongsDescription).toMatch(/keywords[^.]*\bAND\b/);
  });
});

describe("rule 9 — everything already true stays true on the new axes", () => {
  it("refuses an empty query before any request, on the writer and lyrics axes", async () => {
    for (const axis of INVISIBLE_AXES) {
      const text = await refusalText(callSearch(throwingFetch, { query: "   ", search_type: axis }));
      expect(text, axis).toMatch(/quer|invalid|empty/i);
    }
  });

  it("reports the page the site served when asked for a page past the last one", async () => {
    const result = await callSearch(servingBytes(fixtureBytes("search-beyond-last.html")), {
      query: "placeholder",
      search_type: "lyrics",
      page: 9,
    });
    const structuredResult = structured(result);

    expect(structuredResult.page_requested).toBe(9);
    expect(structuredResult.page_served).toBe(3);
    expect(structuredResult.has_more_pages).toBe(false);
  });

  it("reports the site's own number of matches, above the rows of the page", async () => {
    const page = resultsPage({
      header: "Résultat de votre recherche (753 pour « mer »)",
      rows: [
        resultRow({ index: 0, songId: "7101", title: "La mer en hiver", artistId: "811", artist: "Les Phares" }),
        resultRow({ index: 1, songId: "7102", title: "Marée basse", artistId: "812", artist: "Duo Inventé" }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), { query: "mer", search_type: "lyrics" }),
    );

    expect(structuredResult.total_matches).toBe(753);
    expect(structuredResult.rows_on_page).toBe(2);
  });

  it("reports a total the site did not print as null and never as zero", async () => {
    const page = resultsPage({
      header: null,
      rows: [
        resultRow({ index: 0, songId: "7201", title: "Le tango du greffier", artistId: "821", artist: "Orchestre Fictif" }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), { query: "greffe", search_type: "writer" }),
    );

    expect(structuredResult.total_matches).toBeNull();
    expect(structuredResult.results).toHaveLength(1);
  });

  it("names the ordering the kept rows were taken in when the page is truncated", async () => {
    const page = resultsPage({
      header: "Résultat de votre recherche (3 pour « plombier »)",
      rows: [
        resultRow({ index: 0, songId: "7301", title: "Le twist du plombier", artistId: "831", artist: "Les Siphons" }),
        resultRow({ index: 1, songId: "7302", title: "Complainte du parking", artistId: "832", artist: "Nadine Inventée" }),
        resultRow({ index: 2, songId: "7303", title: "Fondue partie", artistId: "833", artist: "Duo Fictif" }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), {
        query: "plombier",
        search_type: "writer",
        limit: 1,
      }),
    );

    expect(structuredResult.result_count).toBe(1);
    expect(structuredResult.rows_on_page).toBe(3);
    expect(notesMatching(structuredResult.notes, ORDERING_NOTE)).not.toHaveLength(0);
  });

  it("carries the full sleeve and the thumbnail as published on the new axes", async () => {
    for (const axis of INVISIBLE_AXES) {
      const structuredResult = structured(
        await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), { query: "vacances", search_type: axis }),
      );
      const first = structuredResult.results[0] as unknown as {
        image_url: string | null;
        thumbnail_url: string | null;
      };

      expect(first.image_url, axis).toContain("/images/pochettes/7001.jpg");
      expect(first.thumbnail_url, axis).toContain("/images/thumb25/7001.jpg");
    }
  });
});
