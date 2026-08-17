/**
 * One real request per shape, against the live site.
 *
 * Skipped unless BIDE_LIVE=1, so an ordinary test run never touches a server a
 * volunteer association pays for. The unit suite proves the parsing; this
 * proves the assumptions about the site still hold.
 */

import { describe, expect, it } from "vitest";
import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";

const live = process.env.BIDE_LIVE === "1";

describe.skipIf(!live)("live smoke", () => {
  const client = new BideEtMusiqueClient();

  it("finds songs by title and states the total the site prints", async () => {
    const { data } = await client.search({ query: "vacances", searchType: "title" });

    expect(data.songs.length).toBeGreaterThan(0);
    expect(data.totalMatches).not.toBeNull();
    expect(data.totalMatches!).toBeGreaterThan(data.songs.length);
    expect(data.pageServed).toBe(1);

    const first = data.songs[0]!;
    expect(first.id).toMatch(/^\d+$/);
    expect(first.url).toMatch(/^https:\/\/www\.bide-et-musique\.com\/song\/\d+\.html$/);
    expect(first.artist.url).toMatch(/^https:\/\/www\.bide-et-musique\.com\/artist\/\d+\.html$/);
  });

  it("finds songs by performer", async () => {
    const { data } = await client.search({ query: "bachelet", searchType: "performer" });

    expect(data.songs.length).toBeGreaterThan(0);
    expect(data.songs.every((song) => song.artist.name.length > 0)).toBe(true);
  });

  it("reads back the last page when asked for one past it", async () => {
    const { data } = await client.search({ query: "vacances", searchType: "title", page: 99 });

    expect(data.pageServed).not.toBeNull();
    expect(data.pageServed!).toBeLessThan(99);
    expect(data.hasMorePages).toBe(false);
  });

  it("reads the record itself when a single song matches", async () => {
    const { data } = await client.search({ query: "tracteur", searchType: "title" });

    expect(data.redirectedToSong).toBe(true);
    expect(data.songs).toHaveLength(1);
    expect(data.totalMatches).toBe(1);
    expect(data.songs[0]!.artist.name.length).toBeGreaterThan(0);
  });

  it("reports an absence the site states as an absence", async () => {
    const { data } = await client.search({ query: "zzzqqxwvy", searchType: "title" });

    expect(data.songs).toEqual([]);
    expect(data.totalMatches).toBe(0);
  });

  it("reads the records the collection has just catalogued", async () => {
    const { data } = await client.getNewSongs();

    expect(data.songs.length).toBeGreaterThan(0);
    expect(data.published).toBeGreaterThanOrEqual(data.songs.length);

    const first = data.songs[0]!;
    expect(first.songId).toMatch(/^\d+$/);
    expect(first.url).toMatch(/^https:\/\/www\.bide-et-musique\.com\/song\/\d+\.html$/);
    expect(first.listedAs.length).toBeGreaterThan(0);
    // The feed is served as UTF-8 where the pages are ISO-8859-1, and a client
    // reading it on the wrong one leaves these behind.
    expect(data.songs.map((song) => song.listedAs).join(" ")).not.toMatch(/Ã|�/);
  });

  it("reads the newest id from that same feed", async () => {
    const { data } = await client.getNewestSongId();

    expect(data).toMatch(/^\d+$/);
    expect(Number.parseInt(data, 10)).toBeGreaterThan(30_000);
  });
});
