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
import type { SearchPage } from "../types.js";
import { TtlLruCache } from "./cache.js";
import type { Fetched } from "./http.js";
import { fetchHtml } from "./http.js";
import { parseSearchPage } from "./parseSearch.js";
import { parseSongPage } from "./parseSong.js";
import { RateLimiter } from "./rateLimiter.js";
import type { SearchType } from "./urls.js";
import { buildSearchUrl, extractSongId } from "./urls.js";

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

    const fetched = await fetchHtml(url, {
      config: this.config,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });

    const data = parse(fetched);
    this.cache.set(url, data);
    return { data, cached: false };
  }
}
