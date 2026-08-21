/**
 * The declared arguments, and the four the tool accepts.
 *
 * Rule 17: a refusal happens before any request. Every client here is wired to
 * a fetch that throws, so a request reaching it fails the test.
 */

import { describe, expect, it } from "vitest";

import { getArtistInput } from "../../src/tools/getArtist.js";
import { getSongInput } from "../../src/tools/getSong.js";
import { searchSongsInput } from "../../src/tools/searchSongs.js";
import { connectServer, throwingFetch } from "./helpers.js";

/** The message of every issue a refusal carries. */
function refusalMessages(result: {
  success: boolean;
  error?: { issues: Array<{ message: string }> };
}): string[] {
  expect(result.success).toBe(false);
  return (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("the declared shape of the arguments", () => {
  it("accepts the two required arguments and fills page and limit with their defaults", () => {
    const parsed = searchSongsInput.parse({ query: "placeholder", search_type: "title" });

    expect(parsed).toEqual({ query: "placeholder", search_type: "title", page: 1, limit: 20 });
  });

  it("refuses an argument it does not declare", () => {
    expect(
      searchSongsInput.safeParse({ query: "x", search_type: "title", sort: "date" }).success,
    ).toBe(false);
    expect(searchSongsInput.safeParse({ query: "x", search_type: "title", Page: 2 }).success).toBe(
      false,
    );
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
    expect(
      searchSongsInput.safeParse({ query: "a".repeat(200), search_type: "title" }).success,
    ).toBe(true);
    expect(
      searchSongsInput.safeParse({ query: "a".repeat(201), search_type: "title" }).success,
    ).toBe(false);
    expect(
      searchSongsInput.safeParse({ query: "é".repeat(400), search_type: "title" }).success,
    ).toBe(false);
  });

  it("accepts pages 1 to 200 and refuses anything outside that range", () => {
    for (const page of [1, 2, 200]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", page }).success).toBe(
        true,
      );
    }
    for (const page of [0, -1, 201, 1.5, "2", null]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", page }).success).toBe(
        false,
      );
    }
  });

  it("accepts limits 1 to 50 and refuses anything outside that range", () => {
    for (const limit of [1, 20, 50]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", limit }).success).toBe(
        true,
      );
    }
    for (const limit of [0, -5, 51, 2.5, "10", null]) {
      expect(searchSongsInput.safeParse({ query: "x", search_type: "title", limit }).success).toBe(
        false,
      );
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

/**
 * One vocabulary for every refusal.
 *
 * A caller branches on the error code a message opens with. The code of a tool
 * writes its own refusals and the schema refuses on its own before that code
 * runs, so both paths open with the same code and name the argument at fault.
 */
describe("every refusal of an argument opens with its error code", () => {
  const outsideTheDeclaration: [string, unknown][] = [
    ["a page below the range", { query: "x", search_type: "title", page: 0 }],
    ["a page above the range", { query: "x", search_type: "title", page: 201 }],
    ["a page that is not whole", { query: "x", search_type: "title", page: 1.5 }],
    ["a limit above the maximum", { query: "x", search_type: "title", limit: 51 }],
    ["a query longer than the maximum", { query: "a".repeat(201), search_type: "title" }],
    ["a query of the wrong type", { query: 42, search_type: "title" }],
    ["a missing query", { search_type: "title" }],
    ["a missing axis", { query: "x" }],
    ["an axis the site does not offer", { query: "x", search_type: "album" }],
    ["an argument that is not declared", { query: "x", search_type: "title", sort: "date" }],
  ];

  it.each(outsideTheDeclaration)("refuses %s with the code", (_name, argument) => {
    for (const message of refusalMessages(searchSongsInput.safeParse(argument))) {
      expect(message).toMatch(/^\[invalid_input\] /);
    }
  });

  it("carries the code on the other two tools as well", () => {
    for (const message of refusalMessages(getSongInput.safeParse({ song_id: 0 }))) {
      expect(message).toMatch(/^\[invalid_input\] /);
    }
    for (const message of refusalMessages(getArtistInput.safeParse({ artist_id: -1 }))) {
      expect(message).toMatch(/^\[invalid_input\] /);
    }
  });

  it("names the argument at fault alongside the code", () => {
    const refused = searchSongsInput.safeParse({ query: "x", search_type: "title", page: 0 });

    expect(refused.success).toBe(false);
    if (!refused.success) {
      expect(refused.error.issues[0]!.path).toEqual(["page"]);
    }
  });

  it("reaches a caller through the tool, code and argument together", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder", search_type: "title", page: 0 },
    });

    expect(result.isError).toBe(true);
    const said = JSON.stringify(result.content);
    expect(said).toContain("[invalid_input]");
    expect(said).toContain("page");
  });
});
