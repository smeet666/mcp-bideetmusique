/**
 * High-level Bide & Musique client.
 *
 * This module knows nothing about MCP, which keeps it testable against plain
 * strings and usable as a library through the `./client` export.
 */

import type { Config, Logger } from "../config.js";
import {
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
  withProjectIdentity,
} from "../config.js";
import { invalidInput, parseFailure } from "../errors.js";
import type { Artist, NewSongsFeed, SearchPage, Song } from "../types.js";
import { TtlLruCache } from "./cache.js";
import type { Fetched } from "./http.js";
import { fetchHtml } from "./http.js";
import { parseArtistPage } from "./parseArtist.js";
import { parseNewSongs } from "./parseFeed.js";
import { parseSearchPage } from "./parseSearch.js";
import { parseSongPage, parseSongRecord } from "./parseSong.js";
import { RateLimiter } from "./rateLimiter.js";
import type { SearchType } from "./urls.js";
import {
  ARTIST_ID,
  SONG_ID,
  artistUrl,
  buildSearchUrl,
  extractSongId,
  newSongsFeedUrl,
  songUrl,
} from "./urls.js";

export interface BideEtMusiqueClientOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

export interface Outcome<T> {
  data: T;
  /** True when served from the in-memory cache rather than the network. */
  cached: boolean;
}

export interface SearchInput {
  query: string;
  searchType: SearchType;
  page?: number;
}

/**
 * Apply the guarantees this project makes about its own traffic.
 *
 * The environment parser already enforces both, but this class is published as
 * a library through the `./client` export and takes a caller-built config, so
 * without this the pacing floor and the honest identity would be optional for
 * anyone importing it. A volunteer association pays for these pages, so the
 * pacing is self-imposed politeness, and it holds on every path.
 *
 * A caller may still name their own application in the User-Agent, and the
 * project identity is appended to it either way, so the site can always tell
 * whose client is reading and reach someone about it.
 */
function withGuarantees(config: Config): Config {
  return {
    ...config,
    userAgent: withProjectIdentity(config.userAgent),
    minIntervalMs: Math.max(MIN_ALLOWED_INTERVAL_MS, config.minIntervalMs),
  };
}

export class BideEtMusiqueClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  private readonly cache: TtlLruCache<unknown>;
  private readonly fetchImpl: typeof fetch | undefined;
  /**
   * Reads under way, by address.
   *
   * The cache is filled once a page has been read and parsed, so between the
   * request going out and the answer coming back the address is absent from it.
   * Two tools wanting the same page in one turn would each miss and each ask.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: BideEtMusiqueClientOptions = {}) {
    this.config = withGuarantees(options.config ?? loadConfig());
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ minIntervalMs: this.config.minIntervalMs });
    this.cache = new TtlLruCache<unknown>(this.config.cacheMaxEntries, this.config.cacheTtlMs);
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Search the collection along one axis.
   *
   * A search matching exactly one song is answered with a redirect to that
   * song's own page. The address the request ended at is what says so, and the
   * single record is read as the one row it is: reporting the missing results
   * table as a failure would deny a song the site did find.
   */
  async search(input: SearchInput): Promise<Outcome<SearchPage>> {
    const url = buildSearchUrl(input);
    return this.fetchParsed(url, ({ html, finalUrl }) => {
      const songId = extractSongId(finalUrl);
      if (songId) {
        return {
          songs: [parseSongPage(html, finalUrl, songId)],
          totalMatches: 1,
          pageServed: 1,
          pageCount: 1,
          hasMorePages: false,
          unreadableRows: 0,
          redirectedToSong: true,
        };
      }
      return parseSearchPage(html, finalUrl);
    });
  }

  /**
   * Read one record.
   *
   * The id is checked here rather than only at the tool, since this class is
   * published as a library: a malformed id would otherwise be asked of the site
   * and come back as a 404 that reads like an absent song.
   */
  async getSong(id: string): Promise<Outcome<Song>> {
    if (!SONG_ID.test(id)) {
      throw invalidInput(
        `"${id}" is not a Bide & Musique song id.`,
        "Ids are digits only, as returned by search_songs.",
      );
    }
    const url = songUrl(id);
    return this.fetchParsed(url, ({ html, finalUrl }) => parseSongRecord(html, finalUrl, id));
  }

  /** Read one artist page: who they are, and what the collection holds of them. */
  async getArtist(id: string): Promise<Outcome<Artist>> {
    if (!ARTIST_ID.test(id)) {
      throw invalidInput(
        `"${id}" is not a Bide & Musique artist id.`,
        "Ids are digits only, as returned by search_songs and get_song.",
      );
    }
    const url = artistUrl(id);
    return this.fetchParsed(url, ({ html, finalUrl }) => parseArtistPage(html, finalUrl, id));
  }

  /** The records the collection has just catalogued, newest first. */
  async getNewSongs(): Promise<Outcome<NewSongsFeed>> {
    const url = newSongsFeedUrl();
    return this.fetchParsed(url, ({ html, finalUrl }) => parseNewSongs(html, finalUrl));
  }

  /**
   * The highest song id the collection currently serves.
   *
   * The site publishes no count of its records and no route to a random one, so
   * the far end of the range is read from its feed of new entries. It changes
   * as the collection grows, which is why it is asked for rather than held as a
   * constant.
   *
   * The feed is read through the same address as the list of new records, so
   * wanting both in one turn costs the site one request whether the two calls
   * follow each other or overlap.
   */
  async getNewestSongId(): Promise<Outcome<string>> {
    const { data, cached } = await this.getNewSongs();

    let highest = 0;
    for (const song of data.songs) {
      const id = Number.parseInt(song.songId, 10);
      if (Number.isFinite(id) && id > highest) highest = id;
    }

    // A feed shaped like a feed while naming no usable id would otherwise hand
    // back a range that ends before it starts.
    if (highest <= 0) {
      throw parseFailure(newSongsFeedUrl(), "a feed naming no id to read the range from");
    }

    return { data: String(highest), cached };
  }

  /**
   * Fetch, parse, then cache. In that order: a page that could not be read is
   * never stored, so a bad minute at the site cannot be replayed from memory
   * for the rest of the cache lifetime, leaving the tool unable to recover
   * after the site comes back.
   *
   * The cached value is the parsed result rather than the raw page, which also
   * keeps a few dozen kilobytes of markup per entry out of memory.
   */
  private async fetchParsed<T>(url: string, parse: (fetched: Fetched) => T): Promise<Outcome<T>> {
    const hit = this.cache.get(url);
    if (hit !== undefined) {
      this.logger.debug(`cache hit ${url}`);
      return { data: hit as T, cached: true };
    }

    const underWay = this.inFlight.get(url);
    if (underWay !== undefined) {
      this.logger.debug(`joining the read under way for ${url}`);
      return { data: (await underWay) as T, cached: true };
    }

    const read = (async () => {
      const fetched = await fetchHtml(url, {
        config: this.config,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      });

      const data = parse(fetched);
      this.cache.set(url, data);
      return data;
    })();

    // Dropped on failure as well as on success, so a bad minute is not
    // remembered as the answer for every later caller.
    this.inFlight.set(url, read);
    try {
      return { data: (await read) as T, cached: false };
    } finally {
      this.inFlight.delete(url);
    }
  }
}
