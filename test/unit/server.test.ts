/**
 * Rule 20: the tool is registered read-only and declares an output schema.
 * The server is driven over an in-memory transport with the network stubbed.
 */

import { describe, expect, it } from "vitest";

import { connectServer, fixtureBytes, htmlResponse, throwingFetch } from "./helpers.js";

const servingPage1: typeof fetch = async () => htmlResponse(fixtureBytes("search-page1.html"));

describe("the tool the server registers", () => {
  it("registers search_songs", async () => {
    const client = await connectServer(throwingFetch);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain("search_songs");
  });

  it("declares search_songs as read-only", async () => {
    const client = await connectServer(throwingFetch);
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "search_songs");

    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("declares an output schema for search_songs", async () => {
    const client = await connectServer(throwingFetch);
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "search_songs");

    expect(tool?.outputSchema).toBeDefined();
    expect(
      Object.keys((tool?.outputSchema as { properties?: object } | undefined)?.properties ?? {}),
    ).toEqual(
      expect.arrayContaining([
        "query",
        "search_type",
        "page_requested",
        "page_served",
        "page_count",
        "has_more_pages",
        "total_matches",
        "results",
        "result_count",
        "rows_on_page",
        "source",
        "notes",
      ]),
    );
  });

  it("publishes exactly the four arguments it accepts, and closes the door on the rest", async () => {
    const client = await connectServer(throwingFetch);
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "search_songs");
    const schema = tool?.inputSchema as {
      properties?: object;
      required?: string[];
      additionalProperties?: boolean;
    };

    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      "limit",
      "page",
      "query",
      "search_type",
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(["query", "search_type"]));
  });

  it("describes the tool well enough for a caller to choose between the two axes", async () => {
    const client = await connectServer(throwingFetch);
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "search_songs");

    expect(tool?.description ?? "").toContain("performer");
    expect(tool?.description ?? "").toContain("title");
  });
});

describe("a search through the server", () => {
  it("answers with both the structured payload and the text block", async () => {
    const client = await connectServer(servingPage1);

    const result = await client.callTool({
      name: "search_songs",
      arguments: { query: "placeholder", search_type: "title" },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("La valse du photocopieur");
    const payload = result.structuredContent as {
      total_matches: number;
      result_count: number;
      source: string;
    };
    expect(payload.total_matches).toBe(42);
    expect(payload.result_count).toBe(3);
    expect(payload.source).toBe("bide-et-musique.com");
  });

  it("refuses a tool it does not register", async () => {
    const client = await connectServer(throwingFetch);

    // The SDK answers an unknown tool with an error result rather than a
    // protocol rejection; either is a refusal, an answer with rows is not.
    const call = client.callTool({ name: "search_albums", arguments: {} }).catch((error) => error);
    const outcome = await call;

    if (outcome instanceof Error) return;
    expect(outcome.isError).toBe(true);
  });
});

/**
 * The whole surface, rather than one tool of it.
 *
 * The order is fixed because a client caches a tool list by it, and every tool
 * declares an output schema because a caller reading structuredContent has
 * nothing else to validate it against.
 */
describe("the surface the server publishes", () => {
  it("registers the five tools in a fixed order", async () => {
    const client = await connectServer(throwingFetch);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "search_songs",
      "get_song",
      "get_artist",
      "get_random_song",
      "list_new_songs",
    ]);
  });

  it("declares every tool read-only, with an output schema and a description", async () => {
    const client = await connectServer(throwingFetch);

    for (const tool of (await client.listTools()).tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect((tool.description ?? "").length, tool.name).toBeGreaterThan(0);
    }
  });

  it("declares the drawn record as the one answer that changes between calls", async () => {
    const client = await connectServer(throwingFetch);
    const tools = (await client.listTools()).tools;

    const drawn = tools.find((tool) => tool.name === "get_random_song");
    expect(drawn?.annotations?.idempotentHint).toBe(false);

    for (const tool of tools.filter((entry) => entry.name !== "get_random_song")) {
      expect(tool.annotations?.idempotentHint, tool.name).toBe(true);
    }
  });

  it("refuses an argument on the tool that takes none, without reaching the site", async () => {
    const client = await connectServer(throwingFetch);

    const result = await client.callTool({
      name: "get_random_song",
      arguments: { song_id: "1734" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("song_id");
  });
});
