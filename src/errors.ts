/**
 * Error taxonomy surfaced to the calling model.
 *
 * A failure must never be reported as an empty result. A model that sees "no
 * song found" cannot tell that apart from a genuine absence, and will
 * confidently tell the user that Bide & Musique does not hold the record.
 */

export type ErrorCode =
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "parse_failure"
  | "network_error"
  | "timeout";

export interface ErrorDetails {
  url?: string;
  status?: number;
  retryAfterMs?: number;
  hint?: string;
}

export class BideEtMusiqueError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "BideEtMusiqueError";
  }
}

const ISSUES_URL = "https://github.com/smeet666/mcp-bideetmusique/issues";

export function notFound(url: string, what: string): BideEtMusiqueError {
  return new BideEtMusiqueError("not_found", `Bide & Musique has nothing at ${what}.`, {
    url,
    status: 404,
    hint: "Use search_songs to find a song and its id.",
  });
}

export function invalidInput(message: string, hint?: string): BideEtMusiqueError {
  return new BideEtMusiqueError("invalid_input", message, hint ? { hint } : {});
}

export function rateLimited(url: string, retryAfterMs: number): BideEtMusiqueError {
  return new BideEtMusiqueError(
    "rate_limited",
    "Bide & Musique is rate limiting this client. This does NOT mean the song is absent from the collection.",
    {
      url,
      retryAfterMs,
      hint:
        `Wait about ${Math.ceil(retryAfterMs / 1000)} seconds, then call the same tool again with the ` +
        "same arguments. If it keeps happening, raise BIDE_MIN_INTERVAL_MS.",
    },
  );
}

export function parseFailure(url: string, what: string): BideEtMusiqueError {
  return new BideEtMusiqueError(
    "parse_failure",
    `The page loaded but the expected results were not found (${what}). ` +
      "Bide & Musique may have changed how it publishes them.",
    { url, hint: `Please report this, with what you searched for, at ${ISSUES_URL}` },
  );
}

export function upstreamError(url: string, status: number): BideEtMusiqueError {
  return new BideEtMusiqueError("network_error", `Bide & Musique returned HTTP ${status}.`, {
    url,
    status,
    ...(status >= 500
      ? { hint: "This is a problem on the Bide & Musique side. Try again shortly." }
      : {}),
  });
}
