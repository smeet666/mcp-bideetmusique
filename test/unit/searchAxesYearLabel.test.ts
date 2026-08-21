/**
 * The `label` and `year` axes of `search_songs`.
 *
 * Written from the contract, not from the modules under test: the code each new
 * axis puts in the URL, the shape the year axis accepts, the refusal it owes a
 * caller who sends anything else, and the notes an answer carries when the row
 * shows nothing of what the site matched on.
 *
 * The year axis is the reason this file exists. The site answers `1983 vacances`
 * with every song of 1983 and prints no sign that the word was dropped, so a
 * caller who believes they filtered gets an unfiltered answer that looks
 * filtered. The tests below prove the refusal happens before the request that
 * would produce that answer.
 *
 * Nothing here reaches the network. Markup is built inline with the helpers, and
 * a fetch that throws is how a refusal is proved to have happened first. Songs,
 * artists and labels are invented, and no song's words appear anywhere.
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

/** The six axes the site offers, and the code each one carries in the URL. */
const AXIS_CODES: Record<string, number> = {
  performer: 2,
  title: 3,
  writer: 4,
  lyrics: 6,
  label: 5,
  year: 7,
};

const ALL_AXES = Object.keys(AXIS_CODES) as SearchType[];

/** Every axis but `year`: the ones that take an ordinary text query. */
const TEXT_AXES = ALL_AXES.filter((axis) => axis !== "year");

/** The note that says the site matched inside words. */
const INSIDE_WORDS_NOTE = /inside[^.]*\bwords?\b/i;

/** The note that says the ordering the kept rows were taken in. */
const ORDERING_NOTE = /order/i;

/** The note that says the site's quoted-phrase syntax returns nothing. */
const QUOTED_PHRASE_NOTE = /quot/i;

/**
 * The note that says the match was made on something the rows do not hold. Both
 * halves are required: a note has to name the match and say the rows do not show
 * what it was made on, which is what tells the caller a row that looks unrelated
 * to a label or a year is expected rather than a defect.
 */
const INVISIBLE_MATCH_NOTE = /match[^.]*\brows?\b[^.]*\b(do|does)\s+not\s+(show|carry)/i;

/** The address a fetch was called with, whichever of the three shapes it took. */
function addressOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function notesMatching(notes: string[], ...patterns: RegExp[]): string[] {
  return notes.filter((note) => patterns.every((pattern) => pattern.test(note)));
}

/** A fetch serving one page of markup, recording every address it was asked for. */
function recordingFetch(html: string): { urls: string[]; fetchImpl: typeof fetch } {
  const urls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(addressOf(input));
    return htmlResponse(bytesOf(html));
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

function servingBytes(bytes: Uint8Array): typeof fetch {
  return (async () => htmlResponse(bytes)) as unknown as typeof fetch;
}

async function callSearch(
  fetchImpl: typeof fetch,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const client = await connectServer(fetchImpl);
  const result = await client.callTool({ name: "search_songs", arguments: args });
  return result as unknown as ToolResult;
}

/**
 * A refusal, however the layer chose to express it: an error result or a thrown
 * protocol error. An answer that succeeded is never a refusal, and the code is
 * read from the bracketed marker the errors carry.
 */
async function refusal(run: Promise<ToolResult>): Promise<{ code: string; text: string }> {
  let result: ToolResult;
  try {
    result = await run;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { code: /\[([a-z_]+)\]/.exec(text)?.[1] ?? "", text };
  }
  if (!result.isError) {
    throw new Error(`expected a refusal, got a result: ${textOfResult(result).slice(0, 200)}`);
  }
  const text = textOfResult(result);
  return { code: /\[([a-z_]+)\]/.exec(text)?.[1] ?? "", text };
}

/** Two songs whose titles and performers carry no year and no label. */
const PAGE_OF_TWO = resultsPage({
  header: "Résultat de votre recherche (2 pour « 1983 »)",
  rows: [
    resultRow({
      index: 0,
      songId: "7401",
      title: "Le slow du photocopieur",
      artistId: "841",
      artist: "Trio Bureautique",
    }),
    resultRow({
      index: 1,
      songId: "7402",
      title: "Complainte de la caravane",
      artistId: "842",
      artist: "Nadine Inventée",
      programming: "Dans les programmes spéciaux",
    }),
  ],
});

/** The shapes the year axis has to refuse, each measured on the live site. */
const REFUSED_YEAR_QUERIES: Array<{ query: string; why: string }> = [
  { query: "198", why: "three digits: the site does not match inside a number, and answers 0" },
  { query: "19833", why: "five digits: no record carries such a year, and the site answers 0" },
  { query: "1983 1984", why: "a record has one year, so two of them can never both hold" },
  { query: "1983-1985", why: "a range written with a dash, which the site answers with 0" },
  { query: ">1980", why: "a range the site's own form documents, which answers 0" },
  {
    query: "1983 vacances",
    why: "the site drops the word and answers every song of 1983, with no sign it did",
  },
  {
    query: "mille neuf cent quatre-vingt-trois",
    why: "a year spelled out in words, which the site cannot match",
  },
];

describe("rule 1 — the URL carries the right st", () => {
  it("asks the label axis with st=5", () => {
    const url = new URL(buildSearchUrl({ query: "Barclay", searchType: "label" as SearchType }));

    expect(url.searchParams.get("st")).toBe("5");
    expect(url.searchParams.get("kw")).toBe("Barclay");
    expect(SEARCH_TYPE_CODES["label" as SearchType]).toBe(5);
  });

  it("asks the year axis with st=7", () => {
    const url = new URL(buildSearchUrl({ query: "1983", searchType: "year" as SearchType }));

    expect(url.searchParams.get("st")).toBe("7");
    expect(url.searchParams.get("kw")).toBe("1983");
    expect(SEARCH_TYPE_CODES["year" as SearchType]).toBe(7);
  });

  it("keeps the performer, title, writer and lyrics axes on 2, 3, 4 and 6", () => {
    for (const axis of ["performer", "title", "writer", "lyrics"] as SearchType[]) {
      const url = new URL(buildSearchUrl({ query: "vacances", searchType: axis }));
      expect(url.searchParams.get("st"), axis).toBe(String(AXIS_CODES[axis]));
      expect(SEARCH_TYPE_CODES[axis], axis).toBe(AXIS_CODES[axis]);
    }
  });

  it("gives every axis a code of its own, so no axis is asked as another", () => {
    const codes = ALL_AXES.map((axis) => SEARCH_TYPE_CODES[axis]);
    expect(new Set(codes).size).toBe(ALL_AXES.length);
  });

  it("names the two new axes in the site's own French wording", () => {
    expect(SEARCH_TYPE_LABELS["label" as SearchType]).toBe("Label");
    expect(SEARCH_TYPE_LABELS["year" as SearchType]).toBe("Année");
  });

  it("leaves Page out for page 1 and puts it in from page 2, on the two new axes", () => {
    for (const axis of ["label", "year"] as SearchType[]) {
      const query = axis === "year" ? "1983" : "Barclay";
      const first = new URL(buildSearchUrl({ query, searchType: axis, page: 1 }));
      const second = new URL(buildSearchUrl({ query, searchType: axis, page: 2 }));

      expect(first.searchParams.has("Page"), `${axis} page 1`).toBe(false);
      expect(second.searchParams.get("Page"), `${axis} page 2`).toBe("2");
    }
  });
});

describe("rule 2 — the enum is what the tool declares", () => {
  it("declares exactly the six axes the site offers", async () => {
    const client = await connectServer(throwingFetch);
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "search_songs");

    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as { properties: { search_type?: { enum?: string[] } } };
    const declared = schema.properties.search_type?.enum ?? [];

    expect([...declared].sort()).toEqual([...ALL_AXES].sort());
  });

  it("refuses an axis the site does not offer, before making any request", async () => {
    const { text } = await refusal(
      callSearch(throwingFetch, { query: "Barclay", search_type: "publisher" }),
    );
    expect(text).toMatch(/search_type|publisher|invalid/i);
  });

  it("refuses a near-miss spelling of the new axes, before making any request", async () => {
    for (const axis of ["annee", "année", "labels", "Year"]) {
      const { text } = await refusal(
        callSearch(throwingFetch, { query: "1983", search_type: axis }),
      );
      expect(text, axis).toMatch(/search_type|invalid/i);
    }
  });

  it("refuses the site's own numeric codes for the new axes as a search_type", async () => {
    for (const code of ["5", "7"]) {
      const { text } = await refusal(
        callSearch(throwingFetch, { query: "1983", search_type: code }),
      );
      expect(text, code).toMatch(/search_type|invalid/i);
    }
  });
});

describe("rule 3 — a year query is a whole year, or it is refused", () => {
  for (const { query, why } of REFUSED_YEAR_QUERIES) {
    it(`refuses ${JSON.stringify(query)} on the year axis before any request, because ${why}`, async () => {
      const { code, text } = await refusal(
        callSearch(throwingFetch, { query, search_type: "year" }),
      );
      expect(text).toMatch(/invalid_input/);
      expect(code).toBe("invalid_input");
    });
  }

  it("refuses the full range the site's own form documents, before any request", async () => {
    for (const query of [">1980 <=1985", "<=1985", ">=1980"]) {
      const { text } = await refusal(callSearch(throwingFetch, { query, search_type: "year" }));
      expect(text, query).toMatch(/invalid_input/);
    }
  });

  it("refuses four characters that are not four digits, before any request", async () => {
    for (const query of ["19a3", "198?", "abcd", "19 3"]) {
      const { text } = await refusal(callSearch(throwingFetch, { query, search_type: "year" }));
      expect(text, query).toMatch(/invalid_input/);
    }
  });

  it("refuses a year carrying punctuation or a separator, before any request", async () => {
    for (const query of ["1983.", "1 983", "'1983'", '"1983"', "1983,1984"]) {
      const { text } = await refusal(callSearch(throwingFetch, { query, search_type: "year" }));
      expect(text, query).toMatch(/invalid_input/);
    }
  });
});

describe("rule 4 — the refusal says what to do instead", () => {
  it("names the single four-digit year as the shape that works", async () => {
    const { text } = await refusal(
      callSearch(throwingFetch, { query: "1983 vacances", search_type: "year" }),
    );
    expect(text).toMatch(/four[- ]digit|\b4 digits\b/i);
  });

  it("says the site drops any other word on this axis", async () => {
    const { text } = await refusal(
      callSearch(throwingFetch, { query: "1983 vacances", search_type: "year" }),
    );
    expect(text).toMatch(/drop|ignor/i);
  });

  it("says the ranges the site documents return nothing", async () => {
    const { text } = await refusal(
      callSearch(throwingFetch, { query: ">1980", search_type: "year" }),
    );
    expect(text).toMatch(/range/i);
    expect(text).toMatch(/nothing|no result|zero|0 /i);
  });

  it("gives the same guidance whatever the shape that was refused", async () => {
    for (const { query } of REFUSED_YEAR_QUERIES) {
      const { text } = await refusal(callSearch(throwingFetch, { query, search_type: "year" }));
      expect(text, query).toMatch(/four[- ]digit|\b4 digits\b/i);
      expect(text, query).toMatch(/drop|ignor/i);
      expect(text, query).toMatch(/range/i);
    }
  });
});

describe("rule 5 — a four-digit year is accepted", () => {
  it("reaches the site as kw=1983&st=7", async () => {
    const recorder = recordingFetch(PAGE_OF_TWO);
    await callSearch(recorder.fetchImpl, { query: "1983", search_type: "year" });

    expect(recorder.urls).toHaveLength(1);
    const url = new URL(recorder.urls[0]!);
    expect(url.searchParams.get("kw")).toBe("1983");
    expect(url.searchParams.get("st")).toBe("7");
  });

  it("accepts a year wrapped in whitespace and sends the year alone", async () => {
    const recorder = recordingFetch(PAGE_OF_TWO);
    const result = await callSearch(recorder.fetchImpl, { query: " 1983 ", search_type: "year" });

    expect(result.isError).toBeFalsy();
    expect(recorder.urls).toHaveLength(1);
    const url = new URL(recorder.urls[0]!);
    expect(url.searchParams.get("kw")).toBe("1983");
    expect(url.searchParams.get("st")).toBe("7");
  });

  it("accepts any four digits, the site's own answer deciding whether that year holds songs", async () => {
    for (const query of ["1899", "1984", "2525", "0000"]) {
      const recorder = recordingFetch(PAGE_OF_TWO);
      const result = await callSearch(recorder.fetchImpl, { query, search_type: "year" });

      expect(result.isError, query).toBeFalsy();
      expect(new URL(recorder.urls[0]!).searchParams.get("kw"), query).toBe(query);
    }
  });

  it("echoes the year axis back in the answer", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "1983",
      search_type: "year",
    });

    expect(structured(result).search_type).toBe("year");
    expect(structured(result).query).toBe("1983");
    expect(textOfResult(result)).toContain(SEARCH_TYPE_LABELS["year" as SearchType]);
  });
});

describe("rule 6 — the year rule binds only the year axis", () => {
  it("takes 1983 vacances as an ordinary query on every other axis", async () => {
    for (const axis of TEXT_AXES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "1983 vacances",
        search_type: axis,
      });

      expect(result.isError, axis).toBeFalsy();
      expect(structured(result).search_type, axis).toBe(axis);
      expect(structured(result).results.length, axis).toBeGreaterThan(0);
    }
  });

  it("takes the refused year shapes as ordinary queries on the label axis", async () => {
    for (const { query } of REFUSED_YEAR_QUERIES) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query,
        search_type: "label",
      });
      expect(result.isError, query).toBeFalsy();
    }
  });

  it("sends a label query to the site untouched, whatever it looks like", async () => {
    const recorder = recordingFetch(PAGE_OF_TWO);
    await callSearch(recorder.fetchImpl, { query: "Barclay Vogue", search_type: "label" });

    const url = new URL(recorder.urls[0]!);
    expect(url.searchParams.get("kw")).toBe("Barclay Vogue");
    expect(url.searchParams.get("st")).toBe("5");
  });

  it("sends a label query in the case it was given, the site matching either way", async () => {
    for (const query of ["Barclay", "barclay"]) {
      const recorder = recordingFetch(PAGE_OF_TWO);
      await callSearch(recorder.fetchImpl, { query, search_type: "label" });
      expect(new URL(recorder.urls[0]!).searchParams.get("kw"), query).toBe(query);
    }
  });
});

describe("rule 7 — neither new axis can be checked against a row", () => {
  it("never says the query only sat inside a word, on the label axis", async () => {
    for (const query of ["Barclay", "arcla", "1983"]) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query,
        search_type: "label",
      });
      expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE), query).toHaveLength(0);
    }
  });

  it("never says the query only sat inside a word, on the year axis", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "1983",
      search_type: "year",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).toHaveLength(0);
  });

  it("still says it on an axis whose row carries what was matched, on the same page", async () => {
    // The control: these rows would raise the note on a checkable axis, so its
    // absence above comes from the axis rather than from the markup.
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "ureauti",
      search_type: "performer",
    });
    expect(notesMatching(structured(result).notes, INSIDE_WORDS_NOTE)).not.toHaveLength(0);
  });

  it("says on the label axis that the match was made on what the row does not show", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "Barclay",
      search_type: "label",
    });
    const structuredResult = structured(result);

    expect(structuredResult.results.length).toBeGreaterThan(0);
    expect(notesMatching(structuredResult.notes, INVISIBLE_MATCH_NOTE)).not.toHaveLength(0);
  });

  it("says on the year axis that the match was made on what the row does not show", async () => {
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: "1983",
      search_type: "year",
    });
    const structuredResult = structured(result);

    expect(structuredResult.results.length).toBeGreaterThan(0);
    expect(notesMatching(structuredResult.notes, INVISIBLE_MATCH_NOTE)).not.toHaveLength(0);
  });

  it("claims no invisible match on the title and performer axes", async () => {
    for (const axis of ["title", "performer"] as SearchType[]) {
      const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
        query: "caravane",
        search_type: axis,
      });
      expect(notesMatching(structured(result).notes, INVISIBLE_MATCH_NOTE), axis).toHaveLength(0);
    }
  });
});

describe("rule 8 — everything already true stays true on the new axes", () => {
  it("refuses an empty query before any request, on the label and year axes", async () => {
    for (const axis of ["label", "year"]) {
      for (const query of ["", "   "]) {
        const { text } = await refusal(callSearch(throwingFetch, { query, search_type: axis }));
        expect(text, `${axis} / ${JSON.stringify(query)}`).toMatch(/quer|invalid|empty/i);
      }
    }
  });

  it("reports the page the site served when asked for a page past the last one, on the label axis", async () => {
    const result = await callSearch(servingBytes(fixtureBytes("search-beyond-last.html")), {
      query: "placeholder",
      search_type: "label",
      page: 9,
    });
    const structuredResult = structured(result);

    expect(structuredResult.page_requested).toBe(9);
    expect(structuredResult.page_served).toBe(3);
    expect(structuredResult.has_more_pages).toBe(false);
  });

  it("reports the site's own number of matches on the year axis, above the rows of the page", async () => {
    const page = resultsPage({
      header: "Résultat de votre recherche (1173 pour « 1983 »)",
      rows: [
        resultRow({
          index: 0,
          songId: "7501",
          title: "Le tango du greffier",
          artistId: "851",
          artist: "Orchestre Fictif",
        }),
        resultRow({
          index: 1,
          songId: "7502",
          title: "Rumba des archives",
          artistId: "852",
          artist: "Duo Inventé",
        }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), { query: "1983", search_type: "year" }),
    );

    expect(structuredResult.total_matches).toBe(1173);
    expect(structuredResult.rows_on_page).toBe(2);
  });

  it("reports a total the site did not print as null and never as zero, on the label axis", async () => {
    const page = resultsPage({
      header: null,
      rows: [
        resultRow({
          index: 0,
          songId: "7601",
          title: "Valse du standardiste",
          artistId: "861",
          artist: "Les Siphons",
        }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), { query: "Barclay", search_type: "label" }),
    );

    expect(structuredResult.total_matches).toBeNull();
    expect(structuredResult.results).toHaveLength(1);
  });

  it("names the ordering the kept rows were taken in when the year page is truncated", async () => {
    const page = resultsPage({
      header: "Résultat de votre recherche (3 pour « 1984 »)",
      rows: [
        resultRow({
          index: 0,
          songId: "7701",
          title: "Le twist du plombier",
          artistId: "871",
          artist: "Les Siphons",
        }),
        resultRow({
          index: 1,
          songId: "7702",
          title: "Fondue partie",
          artistId: "872",
          artist: "Duo Fictif",
        }),
        resultRow({
          index: 2,
          songId: "7703",
          title: "Marée basse",
          artistId: "873",
          artist: "Nadine Inventée",
        }),
      ],
    });
    const structuredResult = structured(
      await callSearch(servingBytes(bytesOf(page)), {
        query: "1984",
        search_type: "year",
        limit: 1,
      }),
    );

    expect(structuredResult.result_count).toBe(1);
    expect(structuredResult.rows_on_page).toBe(3);
    expect(notesMatching(structuredResult.notes, ORDERING_NOTE)).not.toHaveLength(0);
  });

  it("calls the quoted-phrase syntax out on the label axis", async () => {
    // The year axis is absent here by nature: a query carrying a double quote is
    // not four digits, so it is refused before any note can be written.
    const result = await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), {
      query: '"Barclay"',
      search_type: "label",
    });
    expect(notesMatching(structured(result).notes, QUOTED_PHRASE_NOTE)).not.toHaveLength(0);
  });

  it("carries the full sleeve and the thumbnail as published, on the label and year axes", async () => {
    for (const axis of ["label", "year"]) {
      const query = axis === "year" ? "1983" : "Barclay";
      const structuredResult = structured(
        await callSearch(servingBytes(bytesOf(PAGE_OF_TWO)), { query, search_type: axis }),
      );
      const first = structuredResult.results[0] as unknown as {
        image_url: string | null;
        thumbnail_url: string | null;
      };

      expect(first.image_url, axis).toContain("/images/pochettes/7401.jpg");
      expect(first.thumbnail_url, axis).toContain("/images/thumb25/7401.jpg");
    }
  });
});
