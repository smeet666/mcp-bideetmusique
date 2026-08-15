/**
 * Rule 16: two reads run one at a time, spaced by the configured interval, and
 * a configuration below the floor is still paced at the floor.
 *
 * Time is faked from a fixed epoch: the assertions read the clock the client
 * itself reads, so nothing here depends on how fast the machine runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
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
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "deux", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(loadConfig({}).minIntervalMs);
  });

  it("runs the two reads in the order they were asked for", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "deux", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls[0]!.url).toContain("kw=un");
    expect(calls[1]!.url).toContain("kw=deux");
  });

  it("makes the first read wait for nothing", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

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
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

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
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

    const first = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    const firstRead = await first;

    const second = client.search({ query: "un", searchType: "title" });
    await vi.advanceTimersByTimeAsync(60_000);
    const secondRead = await second;

    expect(calls).toHaveLength(1);
    expect(firstRead.cached).toBe(false);
    expect(secondRead.cached).toBe(true);
    expect(secondRead.data.songs.map((song) => song.id)).toEqual(firstRead.data.songs.map((song) => song.id));
  });

  it("keeps the two search axes apart in the cache", async () => {
    const calls: Array<{ at: number; url: string }> = [];
    const client = new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: recordingFetch(calls) });

    const first = client.search({ query: "un", searchType: "title" });
    const second = client.search({ query: "un", searchType: "performer" });
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.all([first, second]);

    expect(calls).toHaveLength(2);
  });
});
