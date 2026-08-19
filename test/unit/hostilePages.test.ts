/**
 * Pages that are not what the site publishes.
 *
 * A reader meets a broken page the day a server answers half of one, and what
 * it does then is part of the contract: it fails with a code, it never reports
 * a value it did not read, and it never spends unbounded work on a page that
 * repeats an opening it never closes.
 *
 * Nothing here measures a duration. What makes a run bounded is that the
 * patterns are bounded, and a bounded pattern refuses a degenerate page instead
 * of searching the whole of it, which is what these tests state.
 */

import { describe, expect, it } from "vitest";

import { parseArtistPage } from "../../src/bideetmusique/parseArtist.js";
import { parseNewSongs } from "../../src/bideetmusique/parseFeed.js";
import { parseSongPage, parseSongRecord } from "../../src/bideetmusique/parseSong.js";
import { BideEtMusiqueError } from "../../src/errors.js";
import { recordPage } from "../builders/song.js";

const SONG_URL = "https://www.bide-et-musique.com/song/1734.html";
const ARTIST_URL = "https://www.bide-et-musique.com/artist/8842.html";
const FEED_URL = "https://www.bide-et-musique.com/new_song.rss";

/** The code a call failed with, or the value it returned. */
function outcome(run: () => unknown): string {
  try {
    run();
    return "returned";
  } catch (error) {
    if (error instanceof BideEtMusiqueError) return error.code;
    throw error;
  }
}

describe("a heading the page opens and never closes", () => {
  const degenerate = `<html><body>${'<p class="titrerosebg"><a href="/artist/1.html">x</a> - y'.repeat(800)}</body></html>`;

  it("is refused by both readings rather than searched to the end", () => {
    expect(outcome(() => parseSongPage(degenerate, SONG_URL, "1734"))).toBe("parse_failure");
    expect(outcome(() => parseSongRecord(degenerate, SONG_URL, "1734"))).toBe("parse_failure");
  });

  it("leaves a record whose heading is ordinary readable", () => {
    const song = parseSongRecord(
      recordPage({ title: "Le Petit Bal des Ampoules" }),
      SONG_URL,
      "1734",
    );

    expect(song.title).toBe("Le Petit Bal des Ampoules");
  });

  it("reads a title as long as the site could plausibly print", () => {
    const long = "Un titre à rallonge ".repeat(10).trim();
    const song = parseSongRecord(recordPage({ title: long }), SONG_URL, "1734");

    expect(song.title).toBe(long);
  });
});

describe("an address the page publishes that is not one", () => {
  function artistPageLinking(href: string): string {
    return `<html><body><div class="titre-bloc"><h2>Un artiste</h2></div>
<table><tr><td><strong>Liens</strong></td><td><a href="${href}">ailleurs</a></td></tr></table>
</body></html>`;
  }

  it("fails with a code rather than throwing what the URL parser threw", () => {
    for (const href of ["http://[", "http://a:99999999999/", "http://[::1:::1]/", "https://%%/"]) {
      const code = outcome(() => parseArtistPage(artistPageLinking(href), ARTIST_URL, "8842"));

      expect(["returned", "parse_failure"]).toContain(code);
    }
  });

  it("keeps the addresses it could read", () => {
    const artist = parseArtistPage(
      artistPageLinking("https://example.org/quelque-part"),
      ARTIST_URL,
      "8842",
    );

    expect(artist.links.map((link) => link.url)).toContain("https://example.org/quelque-part");
  });
});

describe("what the feed publishes inside a title", () => {
  function feedTitled(title: string): string {
    return `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel>
<item><title>${title}</title><link>https://www.bide-et-musique.com/song/1.html</link></item>
</channel></rss>`;
  }

  it("carries no markup through to the fields", () => {
    const { songs } = parseNewSongs(
      feedTitled("&lt;b&gt;Un groupe&lt;/b&gt; - &lt;script&gt;x&lt;/script&gt;"),
      FEED_URL,
    );

    for (const value of [songs[0]!.artistName, songs[0]!.title, songs[0]!.listedAs]) {
      expect(String(value)).not.toMatch(/<[a-z/][^>]*>/i);
    }
  });

  it("states no date rather than one no calendar holds", () => {
    const body = feedTitled("A - B").replace(
      "</item>",
      "<pubDate>Sat, 01 Jan 275760 00:00:00 +0000</pubDate></item>",
    );
    const { songs } = parseNewSongs(body, FEED_URL);

    const published = songs[0]!.publishedAt;
    expect(published === null || /^\d{4}-\d{2}-\d{2}$/.test(published)).toBe(true);
  });
});

describe("a number the page prints that no reading can hold", () => {
  it("states no day rather than one the calendar has no room for", () => {
    const song = parseSongRecord(recordPage({ addedOn: "99/99/9999" }), SONG_URL, "1734");

    expect(song.addedOn).toBeNull();
  });

  it("states no seconds rather than a figure past what a number holds", () => {
    const song = parseSongRecord(
      recordPage({ duration: "99999999999999999999 s" }),
      SONG_URL,
      "1734",
    );

    expect(song.duration.text).toBe("99999999999999999999 s");
    expect(song.duration.seconds).toBeNull();
  });
});
