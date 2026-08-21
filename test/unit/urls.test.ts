/**
 * Rule 15: the query is encoded into the URL, and the search axis picks `st`.
 * Rule 14: what the server calls a site URL is absolute and on the site.
 */

import { describe, expect, it } from "vitest";

import {
  BASE_URL,
  artistUrl,
  buildSearchUrl,
  isBideHost,
  songUrl,
} from "../../src/bideetmusique/urls.js";

describe("buildSearchUrl", () => {
  it("encodes the query so it round-trips back to the string that was asked for", () => {
    const query = "dé à coudre & co";

    const url = buildSearchUrl({ query, searchType: "title" });

    expect(new URL(url).searchParams.get("kw")).toBe(query);
  });

  it("asks the title axis with st=3 and the performer axis with st=2", () => {
    expect(
      new URL(buildSearchUrl({ query: "x", searchType: "title" })).searchParams.get("st"),
    ).toBe("3");
    expect(
      new URL(buildSearchUrl({ query: "x", searchType: "performer" })).searchParams.get("st"),
    ).toBe("2");
  });

  it("leaves Page out for the first page and sets Page=2 for the second", () => {
    expect(
      new URL(buildSearchUrl({ query: "x", searchType: "title" })).searchParams.get("Page"),
    ).toBeNull();
    expect(
      new URL(buildSearchUrl({ query: "x", searchType: "title", page: 1 })).searchParams.get(
        "Page",
      ),
    ).toBeNull();
    expect(
      new URL(buildSearchUrl({ query: "x", searchType: "title", page: 2 })).searchParams.get(
        "Page",
      ),
    ).toBe("2");
  });

  it("builds an address on the search page of the site and nowhere else", () => {
    const url = buildSearchUrl({ query: "placeholder", searchType: "performer", page: 3 });

    expect(url.startsWith(`${BASE_URL}/recherche.html`)).toBe(true);
    expect(isBideHost(url)).toBe(true);
  });

  it("encodes a query made of characters that would otherwise split the URL", () => {
    const query = "a&b=c?d#e/f+g %";

    const url = buildSearchUrl({ query, searchType: "title" });

    expect(new URL(url).searchParams.get("kw")).toBe(query);
    // The separators must be escaped rather than carried through raw.
    expect(url).not.toContain("a&b=c");
  });

  it("carries a 200-character query through without truncating it", () => {
    const query = "é".repeat(200);

    expect(new URL(buildSearchUrl({ query, searchType: "title" })).searchParams.get("kw")).toBe(
      query,
    );
  });
});

describe("songUrl and artistUrl", () => {
  it("names the song and artist pages on the site, absolutely", () => {
    expect(songUrl("1001")).toBe(`${BASE_URL}/song/1001.html`);
    expect(artistUrl("501")).toBe(`${BASE_URL}/artist/501.html`);
    expect(songUrl("1001").startsWith("https://www.bide-et-musique.com/")).toBe(true);
    expect(artistUrl("501").startsWith("https://www.bide-et-musique.com/")).toBe(true);
  });
});

describe("isBideHost", () => {
  it("accepts the site itself", () => {
    expect(isBideHost("https://www.bide-et-musique.com/song/1001.html")).toBe(true);
    expect(isBideHost(`${BASE_URL}/recherche.html?kw=x&st=3`)).toBe(true);
  });

  it("refuses a host that merely starts with the site's name", () => {
    expect(isBideHost("https://bide-et-musique.com.evil.test/")).toBe(false);
    expect(isBideHost("https://www.bide-et-musique.com.evil.test/song/1.html")).toBe(false);
    expect(isBideHost("https://evil.test/?u=https://www.bide-et-musique.com/")).toBe(false);
  });

  it("refuses what is not an absolute http address at all", () => {
    expect(isBideHost("/song/1001.html")).toBe(false);
    expect(isBideHost("javascript:alert(1)")).toBe(false);
    expect(isBideHost("not a url")).toBe(false);
    expect(isBideHost("")).toBe(false);
  });
});
