/**
 * Runtime configuration, read from environment variables.
 *
 * A bad value never crashes the process: an MCP server that dies at startup
 * because of a typo in a client config file is very hard to diagnose from the
 * host application, so invalid input is refused and reported on stderr.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export type LogLevel = "silent" | "error" | "info" | "debug";

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-bideetmusique v${PKG_VERSION} (${REPO_URL})`;

export const DEFAULTS = {
  minIntervalMs: 3000,
  timeoutMs: 20_000,
  maxRetries: 3,
  cacheTtlMs: 15 * 60 * 1000,
  cacheMaxEntries: 200,
  logLevel: "error" as LogLevel,
};

/**
 * Floor on the request interval, enforced regardless of configuration.
 *
 * Bide & Musique is run by a volunteer association on a single server, publishes
 * no rate limit, and asks nothing in return. Self-imposed pacing is the whole of
 * the politeness contract here, so a value below this floor is refused and the
 * default is used instead.
 */
export const MIN_ALLOWED_INTERVAL_MS = 2000;

const LOG_LEVELS: LogLevel[] = ["silent", "error", "info", "debug"];

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

function readNumber(name: string, env: NodeJS.ProcessEnv, range: NumericRange): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return range.fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`${name}="${raw}" is not a number, using ${range.fallback}`);
    return range.fallback;
  }

  // Out-of-range values fall back to the default rather than being clamped to
  // the nearest bound. Clamping turns a typo into a silent behaviour change:
  // -1 retries becomes "never retry", and -1 cache entries disables the cache
  // outright, both of which look like working configuration.
  const rounded = Math.round(parsed);
  if (rounded < range.min || rounded > range.max) {
    warn(
      `${name}=${raw} is outside the accepted range ${range.min}-${range.max} and was ignored; ` +
        `using ${range.fallback}`,
    );
    return range.fallback;
  }
  return rounded;
}

function warn(message: string): void {
  process.stderr.write(`[mcp-bideetmusique] ${message}\n`);
}

/**
 * Read the request interval, refusing anything below the floor.
 *
 * A value under the floor falls back to the default rather than to the floor
 * itself: someone who set 0 was not asking for 2000, they were asking for no
 * pacing at all, and the safe reading of that request is to ignore it.
 */
function readInterval(env: NodeJS.ProcessEnv): number {
  const raw = env.BIDE_MIN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULTS.minIntervalMs;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`BIDE_MIN_INTERVAL_MS="${raw}" is not a number, using ${DEFAULTS.minIntervalMs}ms`);
    return DEFAULTS.minIntervalMs;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_ALLOWED_INTERVAL_MS) {
    warn(
      `BIDE_MIN_INTERVAL_MS=${raw} is below the ${MIN_ALLOWED_INTERVAL_MS}ms floor and was ignored; ` +
        `using ${DEFAULTS.minIntervalMs}ms. A volunteer association serves these pages, so this ` +
        "client paces itself.",
    );
    return DEFAULTS.minIntervalMs;
  }

  return Math.min(60_000, rounded);
}

/**
 * The identity the site sees, whatever the caller sets.
 *
 * A caller is welcome to name their own application, and the traffic still has
 * to be attributable: the association running the site must be able to tell
 * whose client is reading it and reach a person about it. So a caller-supplied
 * name is kept and the project identity is appended to it, rather than replacing
 * one with the other.
 */
export function withProjectIdentity(userAgent: string): string {
  const trimmed = userAgent.trim();
  if (!trimmed) return DEFAULT_USER_AGENT;
  return trimmed.includes(REPO_URL) ? trimmed : `${trimmed} ${DEFAULT_USER_AGENT}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUserAgent = env.BIDE_USER_AGENT?.trim();
  const rawLogLevel = env.BIDE_LOG_LEVEL?.trim().toLowerCase();

  let logLevel = DEFAULTS.logLevel;
  if (rawLogLevel) {
    if (LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      warn(`BIDE_LOG_LEVEL="${rawLogLevel}" is unknown, using "${DEFAULTS.logLevel}"`);
    }
  }

  return {
    userAgent: withProjectIdentity(rawUserAgent ?? ""),
    minIntervalMs: readInterval(env),
    timeoutMs: readNumber("BIDE_TIMEOUT_MS", env, {
      min: 1000,
      max: 120_000,
      fallback: DEFAULTS.timeoutMs,
    }),
    maxRetries: readNumber("BIDE_MAX_RETRIES", env, {
      min: 0,
      max: 10,
      fallback: DEFAULTS.maxRetries,
    }),
    cacheTtlMs: readNumber("BIDE_CACHE_TTL_MS", env, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
      fallback: DEFAULTS.cacheTtlMs,
    }),
    cacheMaxEntries: readNumber("BIDE_CACHE_MAX_ENTRIES", env, {
      min: 0,
      max: 10_000,
      fallback: DEFAULTS.cacheMaxEntries,
    }),
    logLevel,
  };
}

const LEVEL_RANK: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

/**
 * Logs go to stderr without exception. On a stdio transport, stdout carries the
 * protocol and any stray write there corrupts the session.
 */
export function createLogger(level: LogLevel) {
  const emit = (at: LogLevel, message: string) => {
    if (LEVEL_RANK[level] >= LEVEL_RANK[at]) {
      process.stderr.write(`[mcp-bideetmusique] ${message}\n`);
    }
  };
  return {
    error: (message: string) => emit("error", message),
    info: (message: string) => emit("info", message),
    debug: (message: string) => emit("debug", message),
  };
}

export type Logger = ReturnType<typeof createLogger>;
