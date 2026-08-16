/**
 * `list_new_songs`, read from the contract: a window on the newest records.
 *
 * What the tool is held to here is what a caller cannot check for itself: the
 * count means the feed rather than the collection, a truncation is announced,
 * and a line naming no artist comes back naming none.
 */

import { describe, expect, it } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { loadConfig } from "../../src/config.js";
import { listNewSongsInput, runListNewSongs } from "../../src/tools/listNewSongs.js";
import type { ToolResult } from "../../src/tools/shared.js";
import { clientServingHtml, textOfResult } from "./helpers.js";

interface Entry {
  id: number;
  line: string;
}

function feed(entries: Entry[]): string {
  const items = entries
    .map(
      ({ id, line }) =>
        `<item><title>${line}</title>` +
        `<link>http://www.bide-et-musique.com/song/${id}.html</link>` +
        `<pubDate>Sun, 16 Aug 2026 20:00:34 +0200</pubDate></item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel>
<title>Bide et Musique : nouveaux morceaux</title>${items}</channel></rss>`;
}

/** A feed of the given size, each entry naming a record of its own. */
function feedOf(size: number): string {
  return feed(
    Array.from({ length: size }, (_, index) => ({
      id: 38_500 + index,
      line: `Artiste ${index} - Chanson ${index}`,
    })),
  );
}

function payload(result: ToolResult): Record<string, unknown> {
  if (!result.structuredContent) throw new Error("the tool returned no structuredContent");
  return result.structuredContent;
}

async function run(body: string, limit = 20): Promise<ToolResult> {
  return runListNewSongs(clientServingHtml(body), { limit });
}

describe("the entries it answers with", () => {
  it("reads each entry into a record, an artist and a song", async () => {
    const result = await run(feed([{ id: 38578, line: "Georgette Plana - La France en rose" }]));
    const [first] = payload(result).results as Array<Record<string, unknown>>;

    expect(first).toEqual({
      song_id: "38578",
      title: "La France en rose",
      artist_name: "Georgette Plana",
      listed_as: "Georgette Plana - La France en rose",
      url: "https://www.bide-et-musique.com/song/38578.html",
      published_at: "2026-08-16",
    });
  });

  it("keeps the order the feed published", async () => {
    const result = await run(feedOf(4));
    const ids = (payload(result).results as Array<{ song_id: string }>).map(
      (entry) => entry.song_id,
    );

    expect(ids).toEqual(["38500", "38501", "38502", "38503"]);
  });

  it("names the record and its address in the text as well", async () => {
    const result = await run(feed([{ id: 38578, line: "Georgette Plana - La France en rose" }]));

    expect(textOfResult(result)).toContain("Georgette Plana - La France en rose");
    expect(textOfResult(result)).toContain("https://www.bide-et-musique.com/song/38578.html");
  });
});

describe("what the count is allowed to mean", () => {
  it("counts the entries the feed carries, never the records the collection holds", async () => {
    const result = await run(feedOf(50), 5);

    expect(payload(result).entries_in_feed).toBe(50);
    expect(payload(result).result_count).toBe(5);
    expect((payload(result).notes as string[]).join(" ")).toContain("says nothing about how many");
  });

  it("says so when it showed fewer entries than it read", async () => {
    const result = await run(feedOf(50), 5);

    expect((payload(result).notes as string[]).join(" ")).toContain(
      "Showing 5 of the 50 entries read",
    );
  });

  it("adds no truncation note when the whole feed was shown", async () => {
    const result = await run(feedOf(3), 20);

    expect((payload(result).notes as string[]).join(" ")).not.toContain("Showing ");
  });
});

describe("a line the feed names no artist on", () => {
  it("comes back naming none rather than one cut out of the song", async () => {
    const result = await run(feed([{ id: 7, line: "Une ligne sans separateur" }]));
    const [first] = payload(result).results as Array<Record<string, unknown>>;

    expect(first!.artist_name).toBeNull();
    expect(first!.title).toBe("Une ligne sans separateur");
  });

  it("is counted in a note, so a caller reads the empty field as published", async () => {
    const result = await run(
      feed([
        { id: 7, line: "Une ligne sans separateur" },
        { id: 8, line: "Un groupe - Une chanson" },
      ]),
    );

    expect((payload(result).notes as string[]).join(" ")).toContain("1 of these entries");
  });
});

describe("the arguments", () => {
  it("fills the limit with its default and accepts the whole range", () => {
    expect(listNewSongsInput.parse({})).toEqual({ limit: 20 });
    expect(listNewSongsInput.safeParse({ limit: 1 }).success).toBe(true);
    expect(listNewSongsInput.safeParse({ limit: 50 }).success).toBe(true);
  });

  it("refuses a limit past what the feed can hold, and anything undeclared", () => {
    expect(listNewSongsInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(listNewSongsInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(listNewSongsInput.safeParse({ page: 2 }).success).toBe(false);
  });
});

/**
 * The site serves its pages as ISO-8859-1 and this feed as UTF-8, and says so
 * in each response. One client reads both, so the accents are checked on the
 * charset the feed actually declares rather than on the one the pages use.
 */
describe("the charset the feed declares", () => {
  it("reads accents served as UTF-8 rather than mangling them", async () => {
    const body = feed([{ id: 9, line: "Georgette Planà - L'été où tout a brûlé" }]);
    const client = new BideEtMusiqueClient({
      config: loadConfig({}),
      fetchImpl: async () =>
        new Response(Buffer.from(body, "utf8"), {
          status: 200,
          headers: { "content-type": "text/xml; charset=utf-8" },
        }),
    });

    const result = await runListNewSongs(client, { limit: 20 });
    const [first] = payload(result).results as Array<Record<string, unknown>>;

    expect(first!.artist_name).toBe("Georgette Planà");
    expect(first!.title).toBe("L'été où tout a brûlé");
  });
});
