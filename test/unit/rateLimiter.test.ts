/**
 * Rule 16: two reads run one at a time, spaced by the configured interval, and
 * a configuration below the floor is still paced at the floor.
 *
 * Time is faked from a fixed epoch: the assertions read the clock the client
 * itself reads, so nothing here depends on how fast the machine runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { backoffDelay } from "../../src/bideetmusique/http.js";
import { MIN_ALLOWED_INTERVAL_MS, loadConfig } from "../../src/config.js";
import { fixtureBytes, htmlResponse } from "./helpers.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

function recordingFetch(calls: Array<{ at: number; url: string }>): typeof fetch {
  return async (input) => {
    calls.push({ at: Date.now(), url: String(input) });
    return htmlResponse(fixtureBytes("search-page1.html"));
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pacing between two reads", () => {
  it("sends the second request no earlier than the configured interval after the first", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "deux", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(loadConfig({}).minIntervalMs);
  });

  it("runs the two reads in the order they were asked for", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "deux", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls[0]!.url).toContain("kw=un");
    expect(calls[1]!.url).toContain("kw=deux");
  });

  it("makes the first read wait for nothing", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const read = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await read;

    expect(calls[0]!.at).toBe(EPOCH.getTime());
  });

  it("paces at the floor even when the configuration asks for no interval at all", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      // A configuration object built by hand, bypassing loadConfig: the floor
      // has to hold for a caller importing the client as a library too.
      config: { ...loadConfig({}), minIntervalMs: 0 },
      fetchImpl: recordingFetch(calls),
    });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "deux", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("waits the interval between three reads, and never overlaps them", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const reads = [
      client.search({ query: "un", searchType: "title" }),
      client.search({ query: "deux", searchType: "title" }),
      client.search({ query: "trois", searchType: "title" }),
    ];
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all(reads);

    expect(calls).toHaveLength(3);
    expect(calls[2]!.at - calls[1]!.at).toBeGreaterThanOrEqual(loadConfig({}).minIntervalMs);
  });
});

describe("the cache", () => {
  it("answers the same search twice with one request, and says the second was cached", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const first = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    const firstRead = await first;

    const second = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    const secondRead = await second;

    expect(calls).toHaveLength(1);
    expect(firstRead.cached).toBe(false);
    expect(secondRead.cached).toBe(true);
    expect(secondRead.data.songs.map((song) => song.id)).toEqual(
      firstRead.data.songs.map((song) => song.id),
    );
  });

  it("keeps the two search axes apart in the cache", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "un", searchType: "performer" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
  });
});

/**
 * The delay between two attempts, pinned by the draw it is given.
 *
 * The function takes its randomness as an argument precisely so a test can
 * state the delay instead of measuring one.
 */
describe("the backoff between attempts", () => {
  it("grows with the attempt and stays within the jitter band", () => {
    expect(backoffDelay(0, () => 0)).toBe(1500);
    expect(backoffDelay(0, () => 1)).toBe(3000);
    expect(backoffDelay(1, () => 0)).toBe(3000);
    expect(backoffDelay(2, () => 1)).toBe(12_000);
  });

  it("stops growing at its ceiling, however many attempts have failed", () => {
    for (const attempt of [4, 8, 40]) {
      expect(backoffDelay(attempt, () => 1)).toBe(30_000);
      expect(backoffDelay(attempt, () => 0)).toBe(15_000);
    }
  });
});

/**
 * Two callers wanting the same page at the same moment.
 *
 * A page is cached once it has been read and parsed, so between the request
 * going out and the answer coming back its address is absent from the cache.
 * Without a record of the reads under way, two tools in one turn each miss and
 * each ask.
 */
describe("two reads of the same address at once", () => {
  it("asks the site once and answers both", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: recordingFetch(calls),
    });

    const both = Promise.all([
      client.search({ query: "un", searchType: "title" }),
      client.search({ query: "un", searchType: "title" }),
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    const [first, second] = await both;

    expect(calls).toHaveLength(1);
    expect(second.data).toEqual(first.data);
  });

  it("asks again after a read that failed, rather than serving the failure", async () => {
    let attempts = 0;
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          return new Response("nope", { status: 404 });
        }
        return htmlResponse(fixtureBytes("search-page1.html"));
      },
    });

    const failing = client.search({ query: "un", searchType: "title" }).catch(() => "failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await failing).toBe("failed");

    const second = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await second).data.songs.length).toBeGreaterThan(0);
  });
});
