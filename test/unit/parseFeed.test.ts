/**
 * The feed of newly catalogued records, read from the contract.
 *
 * The markup is built inline. What it reproduces of the real feed is what the
 * reader has to survive: one line naming both the artist and the song, a title
 * that carries the separator itself, an ampersand the feed escaped twice, and
 * accents served as bytes rather than as entities.
 */

import { describe, expect, it } from "vitest";

import { parseNewSongs } from "../../src/bideetmusique/parseFeed.js";

const FEED_URL = "https://www.bide-et-musique.com/new_song.rss";

interface Entry {
  id: number;
  line: string;
  published?: string | null;
}

function feed(entries: Entry[]): string {
  const items = entries
    .map(
      ({ id, line, published = "Sun, 16 Aug 2026 20:00:34 +0200" }) =>
        `<item><title>${line}</title>` +
        "<description>&lt;table&gt;&lt;/table&gt;</description>" +
        `<link>http://www.bide-et-musique.com/song/${id}.html</link>` +
        "<category>Chanson</category>" +
        `<guid isPermaLink="false">http://www.bide-et-musique.com/song/${id}.html</guid>` +
        (published === null ? "" : `<pubDate>${published}</pubDate>`) +
        "</item>",
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel>
<title>Bide et Musique : nouveaux morceaux</title>
${items}
</channel></rss>`;
}

const ONE = feed([{ id: 38578, line: "Georgette Plana - La France en rose" }]);

describe("reading the entries", () => {
  it("reads the record behind each entry", () => {
    const { songs } = parseNewSongs(ONE, FEED_URL);

    expect(songs).toHaveLength(1);
    expect(songs[0]!.songId).toBe("38578");
    expect(songs[0]!.url).toBe("https://www.bide-et-musique.com/song/38578.html");
  });

  it("separates the artist from the song at the first separator", () => {
    const { songs } = parseNewSongs(ONE, FEED_URL);

    expect(songs[0]!.artistName).toBe("Georgette Plana");
    expect(songs[0]!.title).toBe("La France en rose");
  });

  it("leaves a title holding the separator whole", () => {
    const { songs } = parseNewSongs(
      feed([
        {
          id: 1,
          line: "Les belles histoires - Alice au pays des merveilles - La danse du homard",
        },
      ]),
      FEED_URL,
    );

    expect(songs[0]!.artistName).toBe("Les belles histoires");
    expect(songs[0]!.title).toBe("Alice au pays des merveilles - La danse du homard");
  });

  it("keeps the line as published, so the reading can be checked against it", () => {
    const { songs } = parseNewSongs(ONE, FEED_URL);

    expect(songs[0]!.listedAs).toBe("Georgette Plana - La France en rose");
  });

  it("names no artist rather than inventing one when the line carries no separator", () => {
    const { songs } = parseNewSongs(feed([{ id: 2, line: "Une ligne sans separateur" }]), FEED_URL);

    expect(songs[0]!.artistName).toBeNull();
    expect(songs[0]!.title).toBe("Une ligne sans separateur");
    expect(songs[0]!.listedAs).toBe("Une ligne sans separateur");
  });

  it("resolves the ampersand the feed escaped twice", () => {
    const { songs } = parseNewSongs(
      feed([{ id: 3, line: "Bide &amp;amp; Musique - Alice au pays" }]),
      FEED_URL,
    );

    expect(songs[0]!.artistName).toBe("Bide & Musique");
  });

  // Decoding runs until the text stops changing, so what the feed escaped twice
  // comes back as what the site wrote, and a site writes markup. Tags are then
  // taken out the way they are on a page: a chevron the site published as text
  // is lost, which is the price of no title ever reaching a field as markup.
  it("keeps markup out of a title, whatever the feed escaped it into", () => {
    const { songs } = parseNewSongs(
      feed([{ id: 4, line: "Un groupe - Le signe &amp;lt;b&amp;gt; ici" }]),
      FEED_URL,
    );

    expect(songs[0]!.title).toBe("Le signe ici");
    expect(songs[0]!.title).not.toMatch(/<[a-z/][^>]*>/i);
  });
  it("reads the day the feed published an entry as an ISO date", () => {
    const { songs } = parseNewSongs(ONE, FEED_URL);

    expect(songs[0]!.publishedAt).toBe("2026-08-16");
  });

  it("states no date rather than today's when an entry carries none", () => {
    const { songs } = parseNewSongs(feed([{ id: 5, line: "A - B", published: null }]), FEED_URL);

    expect(songs[0]!.publishedAt).toBeNull();
  });

  it("keeps the order the feed published, whatever that order is", () => {
    const { songs } = parseNewSongs(
      feed([
        { id: 10, line: "A - Un" },
        { id: 11, line: "B - Deux" },
        { id: 12, line: "C - Trois" },
      ]),
      FEED_URL,
    );

    expect(songs.map((song) => song.songId)).toEqual(["10", "11", "12"]);
  });
});

describe("a feed that is not one", () => {
  it("fails rather than answering with no entries when the body names no record", () => {
    expect(() => parseNewSongs("<rss><channel></channel></rss>", FEED_URL)).toThrowError(
      /parse|feed/i,
    );
  });
});

describe("what the feed carries against what could be read", () => {
  it("counts the entries the feed published, including the ones it could not read", () => {
    const body = feed([{ id: 1, line: "A - Un" }]).replace(
      "</channel>",
      "<item><title>Une annonce</title><link>https://www.bide-et-musique.com/news.html</link></item></channel>",
    );

    const read = parseNewSongs(body, FEED_URL);

    expect(read.songs).toHaveLength(1);
    expect(read.published).toBe(2);
  });
});
