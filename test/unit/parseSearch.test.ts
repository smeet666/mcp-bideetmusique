/**
 * The parser, read against the fixtures.
 *
 * Rules 2 to 12 and 14: what the page states, the parser states; what the page
 * does not state, the parser leaves null; what it cannot read, it counts.
 */

import { describe, expect, it } from "vitest";

import { parseSearchPage } from "../../src/bideetmusique/parseSearch.js";
import { BideEtMusiqueError } from "../../src/errors.js";
import { SEARCH_URL, codeOfThrown, fixtureHtml, resultRow, resultsPage } from "./helpers.js";

const NBSP = " ";

describe("rule 2 — total_matches is the site's number", () => {
  it("reports the count the site printed, not the rows on this page", () => {
    const page = parseSearchPage(fixtureHtml("search-page1.html"), SEARCH_URL);

    expect(page.totalMatches).toBe(42);
    expect(page.songs).toHaveLength(3);
  });

  it("reports the same total on a later page, where fewer rows are shown", () => {
    const page = parseSearchPage(fixtureHtml("search-page3.html"), SEARCH_URL);

    expect(page.totalMatches).toBe(42);
    expect(page.songs).toHaveLength(2);
  });

  it("leaves the total null when the site printed no header, never zero", () => {
    const html = resultsPage({
      header: null,
      rows: [resultRow({ songId: "6001", title: "Sans entête", artistId: "999", artist: "Groupe Sans Entête" })],
    });

    const page = parseSearchPage(html, SEARCH_URL);

    expect(page.totalMatches).toBeNull();
    expect(page.songs).toHaveLength(1);
  });
});

describe("rule 3 — an absence stated by the site is an absence", () => {
  it("returns no songs and a total of zero for the page saying there is no result", () => {
    const page = parseSearchPage(fixtureHtml("search-empty.html"), SEARCH_URL);

    expect(page.songs).toEqual([]);
    expect(page.totalMatches).toBe(0);
    expect(page.pageServed).toBe(1);
    expect(page.pageCount).toBe(1);
    expect(page.hasMorePages).toBe(false);
    expect(page.unreadableRows).toBe(0);
  });
});

describe("rule 4 — a refusal is not an absence", () => {
  it("throws invalid_input for the page asking to search for something", () => {
    expect(codeOfThrown(() => parseSearchPage(fixtureHtml("search-no-query.html"), SEARCH_URL))).toBe(
      "invalid_input",
    );
  });

  it("raises the refusal as a BideEtMusiqueError and invents no address for it", () => {
    try {
      parseSearchPage(fixtureHtml("search-no-query.html"), SEARCH_URL);
      expect.unreachable("the refusal page must not parse as a result");
    } catch (error) {
      expect(error).toBeInstanceOf(BideEtMusiqueError);
      // `details.url` is optional in the contract, so its absence is allowed;
      // an address other than the one being read would not be.
      const url = (error as BideEtMusiqueError).details.url;
      expect(url === undefined || url === SEARCH_URL).toBe(true);
    }
  });
});

describe("rule 5 — a page past the last is the last page", () => {
  it("reads page 3 from the bar when the site answers Page=99 with its last page", () => {
    const url = "https://www.bide-et-musique.com/recherche.html?kw=placeholder&st=3&Page=99";

    const page = parseSearchPage(fixtureHtml("search-beyond-last.html"), url);

    expect(page.pageServed).toBe(3);
    expect(page.pageCount).toBe(3);
    expect(page.hasMorePages).toBe(false);
    expect(page.songs).toHaveLength(2);
  });

  it("never takes the requested page number from the address it was given", () => {
    const url = "https://www.bide-et-musique.com/recherche.html?kw=placeholder&st=3&Page=99";

    const page = parseSearchPage(fixtureHtml("search-beyond-last.html"), url);

    expect(page.pageServed).not.toBe(99);
  });
});

describe("rule 6 — page_served comes from the bar", () => {
  it("reads a single page when the site printed no pagination bar at all", () => {
    const page = parseSearchPage(fixtureHtml("search-single-page.html"), SEARCH_URL);

    expect(page.pageServed).toBe(1);
    expect(page.pageCount).toBe(1);
    expect(page.hasMorePages).toBe(false);
  });

  it("reads the active cell and the page count from the bar on the first of three pages", () => {
    const page = parseSearchPage(fixtureHtml("search-page1.html"), SEARCH_URL);

    expect(page.pageServed).toBe(1);
    expect(page.pageCount).toBe(3);
    expect(page.hasMorePages).toBe(true);
  });

  it("says there is nothing after the last page", () => {
    const page = parseSearchPage(fixtureHtml("search-page3.html"), SEARCH_URL);

    expect(page.pageServed).toBe(3);
    expect(page.pageCount).toBe(3);
    expect(page.hasMorePages).toBe(false);
  });
});

describe("rule 7 — a row that cannot be read is counted, never dropped in silence", () => {
  it("returns the two readable rows and counts the third as unreadable", () => {
    const page = parseSearchPage(fixtureHtml("search-broken-row.html"), SEARCH_URL);

    expect(page.songs.map((song) => song.id)).toEqual(["5001", "5003"]);
    expect(page.unreadableRows).toBe(1);
  });

  it("counts no unreadable row on a page whose rows all read", () => {
    expect(parseSearchPage(fixtureHtml("search-page1.html"), SEARCH_URL).unreadableRows).toBe(0);
  });
});

describe("rule 8 — a table announcing matches and holding no row is a parse failure", () => {
  it("refuses to call a table of seven matches with no row an empty result", () => {
    expect(codeOfThrown(() => parseSearchPage(fixtureHtml("search-table-no-rows.html"), SEARCH_URL))).toBe(
      "parse_failure",
    );
  });
});

describe("rule 9 — a page with no results block at all is a parse failure", () => {
  it("refuses a page that carries no results block", () => {
    expect(codeOfThrown(() => parseSearchPage(fixtureHtml("search-no-block.html"), SEARCH_URL))).toBe(
      "parse_failure",
    );
  });

  it("refuses an empty body rather than reporting an absence of songs", () => {
    expect(codeOfThrown(() => parseSearchPage("", SEARCH_URL))).toBe("parse_failure");
  });
});

describe("rule 10 — the alias is kept apart from the name", () => {
  it("splits the name from the alias the site prints in italics", () => {
    const page = parseSearchPage(fixtureHtml("search-single-page.html"), SEARCH_URL);
    const first = page.songs[0];

    expect(first?.artist.name).toBe("Bino Placeholder et les gosses");
    expect(first?.artist.aliasOf).toBe("Bino Placeholder");
  });

  it("leaves the alias null on a row that carries none", () => {
    const page = parseSearchPage(fixtureHtml("search-single-page.html"), SEARCH_URL);
    const second = page.songs[1];

    expect(second?.artist.name).toBe("Bino Placeholder");
    expect(second?.artist.aliasOf).toBeNull();
  });

  it("treats an alias fragment with nothing in it as no alias", () => {
    const html = resultsPage({
      rows: [
        resultRow({
          songId: "7001",
          title: "Alias vide",
          artistId: "710",
          artist: "Groupe Sans Alias <em>(alias de )</em>",
        }),
      ],
    });

    const page = parseSearchPage(html, SEARCH_URL);
    const song = page.songs[0];

    expect(song?.artist.aliasOf).toBeNull();
    expect(song?.artist.name).toBe("Groupe Sans Alias");
  });

  it("never leaves the alias wording inside the name", () => {
    const page = parseSearchPage(fixtureHtml("search-single-page.html"), SEARCH_URL);

    for (const song of page.songs) {
      expect(song.artist.name).not.toContain("alias de");
      expect(song.artist.name).not.toContain("(");
    }
  });
});

describe("rule 11 — what the row does not carry is null", () => {
  it("gives a null image and a null programming for a row that has neither", () => {
    const page = parseSearchPage(fixtureHtml("search-bare-row.html"), SEARCH_URL);
    const song = page.songs[0];

    expect(song?.id).toBe("4001");
    expect(song?.imageUrl).toBeNull();
    expect(song?.programming).toBeNull();
  });

  it("never fills an absent value with an empty string or a guessed address", () => {
    const page = parseSearchPage(fixtureHtml("search-bare-row.html"), SEARCH_URL);
    const song = page.songs[0];

    expect(song?.imageUrl).not.toBe("");
    expect(song?.programming).not.toBe("");
    // The row carries no thumbnail, so no address may be built from the song id.
    expect(String(song?.imageUrl)).not.toContain("4001.jpg");
  });

  it("reports the programming in the site's own wording when the row carries a bubble", () => {
    const page = parseSearchPage(fixtureHtml("search-page1.html"), SEARCH_URL);

    expect(page.songs.map((song) => song.programming)).toEqual([
      "Dans la programmation générale",
      "Dans les programmes spéciaux",
      "Hors classement",
    ]);
  });
});

describe("rule 12 — the page is decoded, not guessed", () => {
  it("carries a real non-breaking space in the title, where the site wrote &nbsp;", () => {
    const page = parseSearchPage(fixtureHtml("search-accents.html"), SEARCH_URL);
    const song = page.songs[0];

    expect(song?.title).toBe(`Où est passé mon dé à coudre${NBSP}?`);
    expect(song?.title).not.toBe("Où est passé mon dé à coudre ?");
  });

  it("carries the ampersand and the accented capital of the artist name", () => {
    const page = parseSearchPage(fixtureHtml("search-accents.html"), SEARCH_URL);

    expect(page.songs[0]?.artist.name).toBe("Les Frères Ébène & Cie");
  });
});

describe("rule 14 — URLs are absolute and on the site", () => {
  const PREFIX = "https://www.bide-et-musique.com/";

  it("makes every song, artist and image address absolute and on the site", () => {
    for (const fixture of ["search-page1.html", "search-page3.html", "search-single-page.html"]) {
      const page = parseSearchPage(fixtureHtml(fixture), SEARCH_URL);

      expect(page.songs.length).toBeGreaterThan(0);
      for (const song of page.songs) {
        expect(song.url.startsWith(PREFIX)).toBe(true);
        expect(song.artist.url.startsWith(PREFIX)).toBe(true);
        expect(song.imageUrl === null || song.imageUrl.startsWith(PREFIX)).toBe(true);
      }
    }
  });

  it("names the song and artist pages by the ids the row carried", () => {
    const page = parseSearchPage(fixtureHtml("search-page1.html"), SEARCH_URL);
    const first = page.songs[0];

    expect(first?.id).toBe("1001");
    expect(first?.title).toBe("La valse du photocopieur");
    expect(first?.url).toBe("https://www.bide-et-musique.com/song/1001.html");
    expect(first?.artist.id).toBe("501");
    expect(first?.artist.name).toBe("Les Bureaux Tristes");
    expect(first?.artist.url).toBe("https://www.bide-et-musique.com/artist/501.html");
  });
});
