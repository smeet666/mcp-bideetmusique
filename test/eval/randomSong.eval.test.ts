/**
 * Records nobody chose, held to the properties every record must satisfy.
 *
 * Read `test/eval/README.md` for what separates this tier from the unit suite.
 * The short of it: nothing here knows which record comes up, so nothing here
 * compares against an expected value. It checks properties, and it tells a site
 * that could not be read apart from a reader that is wrong.
 */

import { describe, expect, it } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { BideEtMusiqueError } from "../../src/errors.js";
import type { Song } from "../../src/types.js";
import { describeViolations, violationsOf } from "../invariants/song.js";

const evaluating = process.env.BIDE_EVAL === "1";
const DRAWS = Number.parseInt(process.env.BIDE_EVAL_DRAWS ?? "5", 10);

/** The codes that say the site could not be read, rather than read wrongly. */
const SITE_UNREACHABLE = new Set(["network_error", "timeout", "rate_limited"]);

interface Draw {
  id: string;
  song: Song;
}

/**
 * Read records until enough have come back, reporting a site that cannot be
 * read rather than failing over it.
 *
 * An id the collection does not serve is drawn again, and a draw that runs
 * out of attempts is reported as read nothing: an eval that quietly settled for
 * fewer records would report a green run over an empty sample.
 */
async function draw(client: BideEtMusiqueClient, wanted: number): Promise<Draw[]> {
  const { data: newest } = await client.getNewestSongId();
  const highest = Number.parseInt(newest, 10);
  expect(highest).toBeGreaterThan(0);

  const drawn: Draw[] = [];
  let attempts = 0;

  while (drawn.length < wanted && attempts < wanted * 3) {
    attempts += 1;
    const id = String(Math.floor(Math.random() * highest) + 1);

    try {
      const { data } = await client.getSong(id);
      drawn.push({ id, song: data });
    } catch (error) {
      if (error instanceof BideEtMusiqueError && error.code === "not_found") {
        continue;
      }
      throw error;
    }
  }

  return drawn;
}

describe.skipIf(!evaluating)("records drawn from the collection", () => {
  it("satisfy every property, whichever records come up", async () => {
    let drawn: Draw[];

    try {
      drawn = await draw(new BideEtMusiqueClient(), DRAWS);
    } catch (error) {
      if (error instanceof BideEtMusiqueError && SITE_UNREACHABLE.has(error.code)) {
        // Nothing was learned about the reader, so nothing is claimed about
        // it. Failing here would report the site's weather as a defect.
        console.warn(`eval read nothing: [${error.code}] ${error.message}`);
        return;
      }
      throw error;
    }

    expect(drawn.length).toBeGreaterThan(0);

    const broken = drawn
      .map(({ id, song }) => ({ id, violations: violationsOf(song) }))
      .filter(({ violations }) => violations.length > 0);

    // The count is what the run is held to, and the message only says what
    // broke: a formatter that lost a finding cannot turn a broken run green.
    if (broken.length > 0) {
      const report = broken
        .map(({ id, violations }) => describeViolations(`song ${id}`, violations))
        .join("\n\n");
      console.error(report);
    }

    expect(broken.map(({ id }) => id)).toEqual([]);

    // Every property above holds of a record whose transcription came back
    // null, so a reader that stopped reading them would pass this on an empty
    // hand. Thirty records read while writing it all carried the cell, so a
    // sample carrying none says the reader lost them rather than says the
    // draw was unlucky.
    const withLyrics = drawn.filter(({ song }) => song.lyrics.text !== null);
    console.log(
      `eval read ${drawn.length} records, ${withLyrics.length} carrying a transcription: ` +
        drawn.map(({ id }) => id).join(", "),
    );

    expect(withLyrics.length).toBeGreaterThan(0);
  }, 180_000);
});
