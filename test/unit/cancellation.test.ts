/**
 * What happens to a read the caller stopped waiting for.
 *
 * A host abandons a call, and without anything carrying that through, the
 * retries and the draws keep going: requests reach a site run by volunteers
 * long after the answer could be of use to anyone. The clock is fake here, so a
 * backoff is waited out rather than lived through.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { loadConfig } from "../../src/config.js";
import { runGetRandomSong } from "../../src/tools/getRandomSong.js";
import { runGetSong } from "../../src/tools/getSong.js";
import { ISO_CONTENT_TYPE, bytesOf, failureOf } from "./helpers.js";
import { SONG_ID, recordPage } from "../builders/song.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

/** A site that answers 503 every time, so the read runs its retries out. */
function failingSite(asked: string[]): BideEtMusiqueClient {
  return new BideEtMusiqueClient({
    config: loadConfig({}),
    fetchImpl: async (input) => {
      asked.push(String(input));
      return new Response("busy", { status: 503, headers: { "content-type": ISO_CONTENT_TYPE } });
    },
  });
}

async function settle<T>(running: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(600_000);
  return running;
}

describe("a caller that stopped waiting", () => {
  it("stops the retries rather than spending them on the site", async () => {
    const asked: string[] = [];
    const caller = new AbortController();

    const running = failureOf(
      runGetSong(failingSite(asked), { song_id: SONG_ID, include_lyrics: true }, caller.signal),
    );

    // Let the first request go out, then give up on the answer.
    await vi.advanceTimersByTimeAsync(1);
    caller.abort();

    const failure = await settle(running);

    expect(failure.code).toBe("timeout");
    expect(asked).toHaveLength(1);
  });

  it("draws no further id once the caller has gone", async () => {
    const asked: string[] = [];
    const caller = new AbortController();
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: async (input) => {
        const url = String(input);
        asked.push(url);
        if (url.endsWith("/new_song.rss")) {
          return new Response(
            bytesOf(
              `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel>` +
                `<item><title>A - Un</title><link>https://www.bide-et-musique.com/song/38579.html</link></item>` +
                `</channel></rss>`,
            ),
            { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } },
          );
        }
        caller.abort();
        return new Response("nope", { status: 404, headers: { "content-type": ISO_CONTENT_TYPE } });
      },
    });

    const failure = await settle(
      failureOf(runGetRandomSong(client, { random: () => 0.5 }, caller.signal)),
    );

    expect(failure.code).toBe("timeout");
    expect(asked.filter((url) => url.includes("/song/"))).toHaveLength(1);
  });

  it("answers normally when the caller is still waiting", async () => {
    const caller = new AbortController();
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: async () =>
        new Response(bytesOf(recordPage()), {
          status: 200,
          headers: { "content-type": ISO_CONTENT_TYPE },
        }),
    });

    const result = await settle(
      runGetSong(client, { song_id: SONG_ID, include_lyrics: true }, caller.signal),
    );

    expect(result.isError).toBeUndefined();
  });
});

/**
 * One read shared by several callers.
 *
 * A page under way is joined rather than asked for twice, so the read belongs
 * to no single caller. One of them giving up says nothing about what the others
 * still want, and the request stops only once nobody is waiting for it.
 */
describe("a read several callers joined", () => {
  /** A site answering slowly enough for a second caller to join the first. */
  function slowSite(asked: string[]): BideEtMusiqueClient {
    return new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: async (input) => {
        asked.push(String(input));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return new Response(bytesOf(recordPage()), {
          status: 200,
          headers: { "content-type": ISO_CONTENT_TYPE },
        });
      },
    });
  }

  it("answers the callers still waiting when one of them gives up", async () => {
    const asked: string[] = [];
    const client = slowSite(asked);
    const leaving = new AbortController();

    const abandoned = failureOf(
      runGetSong(client, { song_id: SONG_ID, include_lyrics: true }, leaving.signal),
    );
    const waiting = runGetSong(client, { song_id: SONG_ID, include_lyrics: true });

    await vi.advanceTimersByTimeAsync(10);
    leaving.abort();
    await vi.advanceTimersByTimeAsync(60_000);

    expect((await abandoned).code).toBe("timeout");
    expect((await waiting).isError).toBeUndefined();
    expect(asked).toHaveLength(1);
  });

  it("tells a caller that joined a read it was not served from the cache", async () => {
    const asked: string[] = [];
    const client = slowSite(asked);

    const both = Promise.all([
      runGetSong(client, { song_id: SONG_ID, include_lyrics: true }),
      runGetSong(client, { song_id: SONG_ID, include_lyrics: true }),
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    const results = await both;

    expect(asked).toHaveLength(1);
    for (const result of results) {
      const notes = (result.structuredContent as { notes: string[] }).notes;
      expect(notes.join(" ")).not.toContain("cache");
    }
  });
});
