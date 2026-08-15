/**
 * The tool, driven end to end over an injected fetch stub. No network.
 *
 * Rules 1, 2, 3, 5, 7, 11, 13, 14, 17 and 18: what the structured payload and
 * the text mirror may claim about what the site actually served.
 */

import { describe, expect, it } from "vitest";

import { runSearchSongs } from "../../src/tools/searchSongs.js";
import {
  clientServingFixture,
  failureOf,
  refusingClient,
  structured,
  textOfResult,
} from "./helpers.js";

const BASE_ARGS = { search_type: "title" as const, page: 1, limit: 20 };

describe("rule 2 — the tool reports the site's total, not its own row count", () => {
  it("reports 42 matches while three rows sit on this page", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
    });
    const payload = structured(result);

    expect(payload.total_matches).toBe(42);
    expect(payload.rows_on_page).toBe(3);
    expect(payload.result_count).toBe(3);
    expect(payload.results).toHaveLength(3);
    expect(result.isError).toBeFalsy();
  });

  it("echoes the axis, the trimmed query and the page that was asked for", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "  placeholder  ",
    });
    const payload = structured(result);

    expect(payload.query).toBe("placeholder");
    expect(payload.search_type).toBe("title");
    expect(payload.page_requested).toBe(1);
    expect(payload.source).toBe("bide-et-musique.com");
  });

  it("reads the pagination bar into the payload rather than assuming it", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
    });
    const payload = structured(result);

    expect(payload.page_served).toBe(1);
    expect(payload.page_count).toBe(3);
    expect(payload.has_more_pages).toBe(true);
  });
});

describe("rule 3 — an absence the site stated is reported as an absence, with a note", () => {
  it("returns no rows, a total of zero and a note saying the site found nothing", async () => {
    const result = await runSearchSongs(clientServingFixture("search-empty.html"), {
      ...BASE_ARGS,
      query: "zzzqqxwv",
    });
    const payload = structured(result);

    expect(result.isError).toBeFalsy();
    expect(payload.results).toEqual([]);
    expect(payload.result_count).toBe(0);
    expect(payload.rows_on_page).toBe(0);
    expect(payload.total_matches).toBe(0);
    expect(payload.notes.some((note) => /aucun|pas de r|nothing|no (result|match|song)/i.test(note))).toBe(true);
  });
});

describe("rule 4 — the refusal page is a refusal, not an empty answer", () => {
  it("fails with invalid_input when the site says something must be searched for", async () => {
    const failure = await failureOf(
      runSearchSongs(clientServingFixture("search-no-query.html"), { ...BASE_ARGS, query: "x" }),
    );

    expect(failure.code).toBe("invalid_input");
  });
});

describe("rule 5 — rows served for a page past the last are never presented as that page", () => {
  it("says page 3 was served when page 99 was asked for", async () => {
    const result = await runSearchSongs(clientServingFixture("search-beyond-last.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      page: 99,
    });
    const payload = structured(result);

    expect(payload.page_requested).toBe(99);
    expect(payload.page_served).toBe(3);
    expect(payload.page_count).toBe(3);
    expect(payload.has_more_pages).toBe(false);
    expect(payload.result_count).toBe(2);
    expect(payload.rows_on_page).toBe(2);
  });

  it("notes that the site answered with its last page instead", async () => {
    const result = await runSearchSongs(clientServingFixture("search-beyond-last.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      page: 99,
    });
    const payload = structured(result);

    expect(payload.notes.some((note) => note.includes("3"))).toBe(true);
  });

  it("lets no field other than page_requested carry the number 99", async () => {
    const result = await runSearchSongs(clientServingFixture("search-beyond-last.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      page: 99,
    });
    const payload = structured(result) as unknown as Record<string, unknown>;

    for (const [key, value] of Object.entries(payload)) {
      if (key === "page_requested" || key === "notes") continue;
      expect(value).not.toBe(99);
      expect(JSON.stringify(value) ?? "").not.toMatch(/\b99\b/);
    }
  });

  it("never lets a note claim page 99 was served without naming the page that was", async () => {
    const result = await runSearchSongs(clientServingFixture("search-beyond-last.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      page: 99,
    });
    const payload = structured(result);

    for (const note of payload.notes) {
      if (note.includes("99")) expect(note).toContain("3");
    }
  });
});

describe("rule 7 — an unreadable row is named in the notes", () => {
  it("returns the two rows it could read and says one row could not be read", async () => {
    const result = await runSearchSongs(clientServingFixture("search-broken-row.html"), {
      ...BASE_ARGS,
      query: "casse",
    });
    const payload = structured(result);

    expect(payload.results.map((song) => song.song_id)).toEqual(["5001", "5003"]);
    expect(payload.notes.some((note) => /\b1\b/.test(note) && /row|line|ligne|illisib|unread/i.test(note))).toBe(
      true,
    );
  });

  it("counts only the rows it returns, and explains any row it did not", async () => {
    const result = await runSearchSongs(clientServingFixture("search-broken-row.html"), {
      ...BASE_ARGS,
      query: "casse",
    });
    const payload = structured(result);

    expect(payload.result_count).toBe(2);
    expect(payload.total_matches).toBe(3);
    // The contract pins result_count and the note. It leaves open whether
    // rows_on_page counts the rows the page printed or the rows that could be
    // read; either is honest only while the gap is named in a note.
    expect([2, 3]).toContain(payload.rows_on_page);
    if (payload.rows_on_page > payload.result_count) {
      expect(payload.notes.some((note) => /row|line|ligne|illisib|unread/i.test(note))).toBe(true);
    }
  });
});

describe("rule 13 — limit truncates and says so", () => {
  it("returns two of three rows and gives both numbers in a note", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      limit: 2,
    });
    const payload = structured(result);

    expect(payload.result_count).toBe(2);
    expect(payload.rows_on_page).toBe(3);
    expect(payload.results).toHaveLength(2);
    expect(payload.notes.some((note) => note.includes("2") && note.includes("3"))).toBe(true);
  });

  it("keeps the rows the page listed first when it truncates", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      limit: 1,
    });

    expect(structured(result).results.map((song) => song.song_id)).toEqual(["1001"]);
  });

  it("adds no truncation note when the page held fewer rows than the limit", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      limit: 50,
    });
    const payload = structured(result);

    expect(payload.result_count).toBe(3);
    expect(payload.rows_on_page).toBe(3);
    expect(payload.notes.some((note) => /limit|tronqu|truncat/i.test(note))).toBe(false);
  });
});

describe("rule 11 — a value the row did not carry stays null in the payload", () => {
  it("gives a null image_url and a null programming for the bare row", async () => {
    const result = await runSearchSongs(clientServingFixture("search-bare-row.html"), {
      ...BASE_ARGS,
      query: "nu",
    });
    const song = structured(result).results[0];

    expect(song?.song_id).toBe("4001");
    expect(song?.image_url).toBeNull();
    expect(song?.programming).toBeNull();
  });
});

describe("rule 14 — every address in the payload is absolute and on the site", () => {
  it("puts nothing in url, artist.url or image_url that is not a site address", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
    });

    for (const song of structured(result).results) {
      expect(song.url.startsWith("https://www.bide-et-musique.com/")).toBe(true);
      expect(song.artist.url.startsWith("https://www.bide-et-musique.com/")).toBe(true);
      expect(song.image_url === null || song.image_url.startsWith("https://www.bide-et-musique.com/")).toBe(true);
    }
  });

  it("keeps the alias apart from the name in the payload as well", async () => {
    const result = await runSearchSongs(clientServingFixture("search-single-page.html"), {
      ...BASE_ARGS,
      query: "bino",
    });
    const [first, second] = structured(result).results;

    expect(first?.artist.name).toBe("Bino Placeholder et les gosses");
    expect(first?.artist.alias_of).toBe("Bino Placeholder");
    expect(second?.artist.alias_of).toBeNull();
  });
});

describe("rule 1 — a failure is never an empty result", () => {
  it("fails with parse_failure when the table announces matches and holds no row", async () => {
    const failure = await failureOf(
      runSearchSongs(clientServingFixture("search-table-no-rows.html"), { ...BASE_ARGS, query: "vide" }),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("fails with parse_failure when the page carries no results block", async () => {
    const failure = await failureOf(
      runSearchSongs(clientServingFixture("search-no-block.html"), { ...BASE_ARGS, query: "x" }),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("refuses a query that trims to nothing, without asking the site", async () => {
    const failure = await failureOf(runSearchSongs(refusingClient(), { ...BASE_ARGS, query: "   " }));

    expect(failure.code).toBe("invalid_input");
  });
});

describe("rule 18 — the text mirror stands alone", () => {
  it("names the songs in the text block, since many clients render only that", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
    });
    const text = textOfResult(result);

    expect(result.content[0]?.type).toBe("text");
    expect(text).toContain("La valse du photocopieur");
    expect(text).toContain("Mon tracteur me quitte");
    expect(text).toContain("Fondue partie");
    expect(text).toContain("Les Bureaux Tristes");
  });

  it("carries every note of the payload in the text block", async () => {
    const result = await runSearchSongs(clientServingFixture("search-page1.html"), {
      ...BASE_ARGS,
      query: "placeholder",
      limit: 2,
    });
    const text = textOfResult(result);

    for (const note of structured(result).notes) {
      expect(text).toContain(note);
    }
  });

  it("states the absence in the text block too when the site found nothing", async () => {
    const result = await runSearchSongs(clientServingFixture("search-empty.html"), {
      ...BASE_ARGS,
      query: "zzzqqxwv",
    });

    expect(textOfResult(result).trim().length).toBeGreaterThan(0);
    expect(textOfResult(result)).toMatch(/aucun|pas de r|nothing|no (result|match|song)/i);
  });
});
