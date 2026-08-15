/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one cache are shared by all tools, so pacing
 * applies to the server as a whole rather than per tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BideEtMusiqueClient } from "./bideetmusique/client.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import {
  runSearchSongs,
  searchSongsDescription,
  searchSongsInput,
  searchSongsOutputShape,
} from "./tools/searchSongs.js";
import type { SearchSongsArgs } from "./tools/searchSongs.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server only reads, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new BideEtMusiqueClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-bideetmusique", version: PKG_VERSION },
    {
      instructions:
        "Tools for the Bide & Musique collection: French songs, mostly forgotten ones, catalogued " +
        "by hand by the volunteer association that runs the station. No API key and no account are " +
        "needed. search_songs asks along one axis at a time and the axis has to be named: " +
        "'performer' for the artist credited on the record, 'title' for the name of the song, " +
        "'writer' for who wrote or composed it, 'lyrics' for the words sung in it, 'label' for the " +
        "label it came out on, 'year' for the year printed on it. A search on one axis says nothing " +
        "about the others, so a name that returns nothing as a performer may still be a title. " +
        "The year axis takes one four-digit year and nothing else: the site drops any other word " +
        "there instead of filtering on it. Several keywords are combined with AND and each is " +
        "matched inside words, so " +
        "every extra word narrows the search; a quoted phrase returns nothing, whatever the site's " +
        "own form offers. The count returned is the number the site prints, counting " +
        "matching songs across every page, and it is normal for it to exceed the rows of one page. " +
        "The site answers a page past the last one with the last page and no error, so read " +
        "'page_served' rather than assuming the page asked for. Song pages carry lyrics that Bide & " +
        "Musique publishes while awaiting permission from the rights holders; this server serves " +
        "none of that text and links the page instead. Credit Bide & Musique and link the song page " +
        "when you show a result.",
    },
  );

  server.registerTool(
    "search_songs",
    {
      title: "Search songs",
      description: searchSongsDescription,
      inputSchema: searchSongsInput,
      outputSchema: z.object(searchSongsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runSearchSongs(client, args as SearchSongsArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
