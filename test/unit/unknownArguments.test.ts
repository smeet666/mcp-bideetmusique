/**
 * The declared arguments, and the four the tool accepts.
 *
 * Rule 17: a refusal happens before any request. Every client here is wired to
 * a fetch that throws, so a request reaching it fails the test.
 */

import { describe, expect, it } from "vitest";

import { searchSongsInput } from "../../src/tools/searchSongs.js";
import { connectServer, throwingFetch } from "./helpers.js";

describe("the declared shape of the arguments", () => {
  it("accepts the two required arguments and fills page and limit with their defaults", () => {
    const parsed = searchSongsInput.parse({ query: "placeholder", search_type: "title" });

    expect(parsed).toEqual({ query: "placeholder", search_type: "title", page: 1, limit: 20 });
  });

  it("refuses an argument it does not declare", () => {
    expect(searchSongsInput.safeParse({ query: "x", search_type: "title", sort: "date" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: "x", search_type: "title", Page: 2 }).success).toBe(false);
  });

  it("refuses a search with no axis, since the two axes ask different questions", () => {
    expect(searchSongsInput.safeParse({ query: "x" }).success).toBe(false);
  });

  it("refuses an axis the site does not offer here", () => {
    expect(searchSongsInput.safeParse({ query: "x", search_type: "album" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: "x", search_type: "Title" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: "x", search_type: 3 }).success).toBe(false);
  });

  it("accepts both axes it does offer", () => {
    expect(searchSongsInput.safeParse({ query: "x", search_type: "title" }).success).toBe(true);
    expect(searchSongsInput.safeParse({ query: "x", search_type: "performer" }).success).toBe(true);
  });

  it("refuses a missing query and a query that is not a string", () => {
    expect(searchSongsInput.safeParse({ search_type: "title" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: 42, search_type: "title" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: null, search_type: "title" }).success).toBe(false);
  });

  it("accepts a query of 200 characters and refuses one of 201", () => {
    expect(searchSongsInput.safeParse({ query: "a".repeat(200), search_type: "title" }).success).toBe(true);
    expect(searchSongsInput.safeParse({ query: "a".repeat(201), search_type: "title" }).success).toBe(false);
    expect(searchSongsInput.safeParse({ query: "é".repeat(400), search_type: "title" }).success).toBe(false);
  });

  it("accepts pages 1 to 200 and refuses anything outside that range", () => {
    for (const page of [1, 2, 200]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", page }).success).toBe(true);
    }
    for (const page of [0, -1, 201, 1.5, "2", null]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", page }).success).toBe(false);
    }
  });

  it("accepts limits 1 to 50 and refuses anything outside that range", () => {
    for (const limit of [1, 20, 50]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", limit }).success).toBe(true);
    }
    for (const limit of [0, -5, 51, 2.5, "10", null]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", limit }).success).toBe(false);
    }
  });
});

/**
 * What a caller depends on when an argument is bad: the call is refused, the
 * site is left alone, and the message names what to fix. The fetch handed to
 * the server throws when touched, so a refusal that came too late fails here.
 */
describe("rule 17 — the tool never contacts the site in order to refuse", () => {
  it("refuses an unknown argument without making a request", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder", search_type: "title", sort: "date" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("sort");
  });

  it("refuses a query that is nothing but spaces without making a request", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "   ", search_type: "title" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("query");
  });

  // An argument the schema rejects is refused before this server's code runs, so
  // the message is the one the protocol layer writes rather than one opening
  // with an error code. What the three tests below hold it to is what a caller
  // depends on: the call is refused, nothing is asked of the site, and the
  // offending argument is named so the caller can fix it.
  //
  // Whether both kinds of refusal should read alike is an open question, since
  // aligning them means changing the argument module the sibling servers share.

  it("refuses a page outside the declared range without making a request", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder", search_type: "title", page: 0 },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("page");
  });

  it("refuses a limit above the declared maximum without making a request", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder", search_type: "title", limit: 51 },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("limit");
  });

  it("refuses a search with no axis without making a request", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("search_type");
  });
});
