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
import { isBideHost } from "./urls.js";
import { RateLimiter, sleep } from "./rateLimiter.js";

const BACKOFF_BASE_MS = 3000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 30_000;

/** A real page from this site weighs several kilobytes of markup. */
const MIN_PLAUSIBLE_HTML = 1500;

/**
 * The most this client will read from one answer.
 *
 * The heaviest page the site publishes is its index of every artist, at about
 * 1.8 MB. Twice that leaves room for the site to grow while keeping a body that
 * never ends from filling memory: the parsers walk a page several times, so the
 * cost of holding one is a multiple of its size.
 */
const MAX_BODY_BYTES = 4_000_000;

/**
 * A document that closed its root element arrived whole, however short it is.
 *
 * The site serves pages and it serves feeds, and a feed of a few entries is
 * shorter than any page while being exactly what was asked for. Judging both by
 * length alone reports a complete feed as a truncated page.
 */
const CLOSES_ITS_ROOT = /<\/(?:html|rss)>/i;

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
  /**
   * The caller's own signal, when the host gave one.
   *
   * A host that abandons a call stops waiting for the answer, and without this
   * the retries keep going: a site run by volunteers would be asked again for
   * a page nobody reads any more.
   */
  signal?: AbortSignal;
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
  const abandoned = () => deps.signal?.aborted === true;

  return limiter.schedule(async () => {
    let lastError: BideEtMusiqueError | undefined;

    // Set when the site says how long to stay away; it replaces our own guess
    // for the next attempt. Applied here rather than where it is read, so no
    // wait is ever served after the last attempt, when nobody would use it.
    let askedWaitMs: number | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (abandoned()) throw givenUp(url);
      if (attempt > 0) {
        const delay = Math.min(askedWaitMs ?? backoffDelay(attempt - 1), BACKOFF_MAX_MS);
        askedWaitMs = null;
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${url}`);
        await sleep(delay);
        if (abandoned()) throw givenUp(url);
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
          // Whichever comes first: the caller giving up, or this client's own
          // patience running out.
          signal: deps.signal
            ? AbortSignal.any([deps.signal, AbortSignal.timeout(config.timeoutMs)])
            : AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        // A stub may leave `url` empty, which is not an address to report.
        finalUrl = response.url || url;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        body = decodeHtml(await readBounded(response, url), response.headers.get("content-type"));
      } catch (error) {
        lastError = asTransportError(error, url);
        logger.debug(`${lastError.code} for ${url}: ${lastError.message}`);
        continue;
      }

      // Redirects are followed, so the address the request ended at is the one
      // the body came from. A body read from anywhere else would enter an answer
      // that names this site as its source. Asking again would land in the same
      // place, so this ends the read rather than costing three more requests.
      if (!isBideHost(finalUrl)) {
        throw parseFailure(url, `an address off the site, ${finalUrl}`);
      }

      if (status === 429 || status === 503) {
        limiter.penalize();
        // A server that says when to come back knows better than our own guess.
        askedWaitMs = retryAfterMs;
        lastError = rateLimited(url, retryAfterMs ?? backoffDelay(attempt));
        logger.info(`rate limited on ${url}, interval now ${limiter.currentIntervalMs}ms`);
        continue;
      }
      // A 403 refuses rather than asking for patience: three more requests
      // would be three more refusals, and the site is run by volunteers.
      if (status === 403) {
        throw new BideEtMusiqueError("rate_limited", `Bide & Musique refused to serve ${url}.`, {
          url,
          status,
          hint: "The site declined this request rather than asking to slow down.",
        });
      }
      if (status === 404) throw notFound(url, "that address");
      if (status >= 500) {
        lastError = upstreamError(url, status);
        continue;
      }
      if (status >= 400) throw upstreamError(url, status);

      const trimmed = body.trim();
      if (trimmed.length < MIN_PLAUSIBLE_HTML && !CLOSES_ITS_ROOT.test(trimmed)) {
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

/**
 * The body, refused past a size no page of this site reaches.
 *
 * Reading in chunks rather than in one call is what makes the limit a limit: an
 * answer that never ends is dropped at the threshold instead of being held
 * whole first and measured after.
 */
async function readBounded(response: Response, url: string): Promise<Uint8Array> {
  const announced = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(announced) && announced > MAX_BODY_BYTES) {
    throw parseFailure(url, `an answer of ${announced} bytes, past what this client reads`);
  }

  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      if (read > MAX_BODY_BYTES) {
        throw parseFailure(url, `an answer past the ${MAX_BODY_BYTES} bytes this client reads`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(read);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body;
}

/** The read the caller stopped waiting for. */
export function givenUp(url: string): BideEtMusiqueError {
  return new BideEtMusiqueError("timeout", `The call was abandoned before ${url} was read.`, {
    url,
    hint: "Nothing further was asked of the site.",
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
