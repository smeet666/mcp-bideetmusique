/**
 * HTTP layer: one GET, with backoff.
 *
 * The body is read as bytes and decoded through the charset the response
 * declares. `response.text()` would assume UTF-8 and hand back a page where
 * every accented title is corrupted, which the parser has no way to notice.
 */

import type { Config, Logger } from "../config.js";
import {
  BideEtMusiqueError,
  notFound,
  parseFailure,
  rateLimited,
  upstreamError,
} from "../errors.js";
import { decodeHtml } from "./html.js";
import { RateLimiter, sleep } from "./rateLimiter.js";

const BACKOFF_BASE_MS = 3000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 30_000;

/** A real page from this site weighs several kilobytes of markup. */
const MIN_PLAUSIBLE_HTML = 1500;

/** Exponential backoff with jitter, so parallel clients do not resynchronise. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt);
  return Math.round(capped * (0.5 + random() * 0.5));
}

export interface HttpDeps {
  config: Config;
  limiter: RateLimiter;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export interface Fetched {
  html: string;
  /**
   * The address the request ended at, which a redirect makes different from the
   * one asked for. A search matching a single song lands on that song's page,
   * and this is what says so.
   */
  finalUrl: string;
}

/**
 * Fetch one page as decoded HTML, retrying transient conditions.
 *
 * The retry loop and its sleeps run inside a single limiter slot, so a queued
 * request cannot slip into the window the current one is backing away from.
 */
export async function fetchHtml(url: string, deps: HttpDeps): Promise<Fetched> {
  const { config, limiter, logger } = deps;
  const doFetch = deps.fetchImpl ?? fetch;

  return limiter.schedule(async () => {
    let lastError: BideEtMusiqueError | undefined;

    // Set when the site says how long to stay away; it replaces our own guess
    // for the next attempt. Applied here rather than where it is read, so no
    // wait is ever served after the last attempt, when nobody would use it.
    let askedWaitMs: number | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delay = Math.min(askedWaitMs ?? backoffDelay(attempt - 1), BACKOFF_MAX_MS);
        askedWaitMs = null;
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${url}`);
        await sleep(delay);
      }

      let status: number;
      let body: string;
      let finalUrl = url;
      let retryAfterMs: number | null = null;
      try {
        await limiter.beforeRequest();
        const response = await doFetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        // A stub may leave `url` empty, which is not an address to report.
        finalUrl = response.url || url;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        body = decodeHtml(await response.arrayBuffer(), response.headers.get("content-type"));
      } catch (error) {
        lastError = asTransportError(error, url);
        logger.debug(`${lastError.code} for ${url}: ${lastError.message}`);
        continue;
      }

      if (status === 429 || status === 503 || status === 403) {
        limiter.penalize();
        // A server that says when to come back knows better than our own guess.
        askedWaitMs = retryAfterMs;
        lastError = rateLimited(url, retryAfterMs ?? backoffDelay(attempt));
        logger.info(`rate limited on ${url}, interval now ${limiter.currentIntervalMs}ms`);
        continue;
      }
      if (status === 404) throw notFound(url, "that address");
      if (status >= 500) {
        lastError = upstreamError(url, status);
        continue;
      }
      if (status >= 400) throw upstreamError(url, status);

      const trimmed = body.trim();
      if (trimmed.length < MIN_PLAUSIBLE_HTML && !/<\/html>/i.test(trimmed)) {
        // A 200 carrying too few bytes to be a page is worth another attempt,
        // since a site under load answers that way. What it is not is evidence
        // of rate limiting: the exchange succeeded and the body was unreadable,
        // so once the attempts run out that is what gets reported. Pacing still
        // backs off, which costs nothing and helps if the site was struggling.
        limiter.penalize();
        lastError = parseFailure(url, "the answer was too short to be a page");
        logger.info(`implausibly short body on ${url} (${trimmed.length} bytes)`);
        continue;
      }

      limiter.relax();
      return { html: body, finalUrl };
    }

    throw lastError ?? new BideEtMusiqueError("network_error", `Could not fetch ${url}.`, { url });
  });
}

/** `Retry-After` carries either seconds or an HTTP date. */
function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

function asTransportError(error: unknown, url: string): BideEtMusiqueError {
  if (error instanceof BideEtMusiqueError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new BideEtMusiqueError("timeout", "Bide & Musique did not answer in time.", {
      url,
      hint: "Raise BIDE_TIMEOUT_MS if this happens often on a slow connection.",
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new BideEtMusiqueError("network_error", `Could not reach Bide & Musique: ${message}`, {
    url,
  });
}
