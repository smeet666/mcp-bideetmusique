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
  getArtistDescription,
  getArtistInput,
  getArtistOutputShape,
  runGetArtist,
} from "./tools/getArtist.js";
import type { GetArtistArgs } from "./tools/getArtist.js";
import {
  getRandomSongDescription,
  getRandomSongInput,
  getRandomSongOutputShape,
  runGetRandomSong,
} from "./tools/getRandomSong.js";
import type { GetRandomSongOptions } from "./tools/getRandomSong.js";
import {
  getSongDescription,
  getSongInput,
  getSongOutputShape,
  runGetSong,
} from "./tools/getSong.js";
import type { GetSongArgs } from "./tools/getSong.js";
import {
  listNewSongsDescription,
  listNewSongsInput,
  listNewSongsOutputShape,
  runListNewSongs,
} from "./tools/listNewSongs.js";
import type { ListNewSongsArgs } from "./tools/listNewSongs.js";
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
        "'page_served' rather than assuming the page asked for. get_song resolves an id from a " +
        "search into the record itself. The title, the artist and the duration are always stated; " +
        "the year, the writers, the label, the catalogue reference and the sleeve are absent on " +
        "some records and come back null rather than guessed, and a counter the page prints " +
        "nothing for is unknown rather than zero. A record whose page carries a transcription comes back with the words " +
        "themselves under 'lyrics.text', and one whose page carries none says so. get_random_song " +
        "answers with a record nobody chose, drawn over the ids the site serves. It is for " +
        "browsing the collection when no particular song is being asked about. " +
        "list_new_songs reads what the collection has just catalogued, from a feed of a fixed " +
        "number of entries whose count says nothing about how many records it holds. " +
        "Credit Bide & Musique and link the song page when you show a result.",
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
    async (args, extra) => runSearchSongs(client, args as SearchSongsArgs, extra?.signal),
  );

  server.registerTool(
    "get_song",
    {
      title: "Read a song's record",
      description: getSongDescription,
      inputSchema: getSongInput,
      outputSchema: z.object(getSongOutputShape),
      annotations: READ_ONLY,
    },
    async (args, extra) => runGetSong(client, args as GetSongArgs, extra?.signal),
  );

  server.registerTool(
    "get_artist",
    {
      title: "Read an artist's page",
      description: getArtistDescription,
      inputSchema: getArtistInput,
      outputSchema: z.object(getArtistOutputShape),
      annotations: READ_ONLY,
    },
    async (args, extra) => runGetArtist(client, args as GetArtistArgs, extra?.signal),
  );

  server.registerTool(
    "get_random_song",
    {
      title: "Read a record drawn at random",
      description: getRandomSongDescription,
      inputSchema: getRandomSongInput,
      outputSchema: z.object(getRandomSongOutputShape),
      // Two calls answer with two different records, so this tool is not
      // idempotent.
      annotations: { ...READ_ONLY, idempotentHint: false },
    },
    async (args, extra) => runGetRandomSong(client, args as GetRandomSongOptions, extra?.signal),
  );

  server.registerTool(
    "list_new_songs",
    {
      title: "Read what was just catalogued",
      description: listNewSongsDescription,
      inputSchema: listNewSongsInput,
      outputSchema: z.object(listNewSongsOutputShape),
      annotations: READ_ONLY,
    },
    async (args, extra) => runListNewSongs(client, args as ListNewSongsArgs, extra?.signal),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
