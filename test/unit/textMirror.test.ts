/**
 * Rule: a text block shorter than the answer says so.
 *
 * The block is capped, and three of the five tools can reach that cap on their
 * own defaults. A cut that goes unannounced reads as the whole answer.
 */

import { describe, expect, it } from "vitest";

import { MAX_TEXT_MIRROR_CHARS, noteIfTextIsCut, ok } from "../../src/tools/shared.js";
import { textOfResult } from "./helpers.js";

describe("announcing a cut text block", () => {
  it("says nothing when the whole body fits", () => {
    const notes: string[] = [];
    noteIfTextIsCut("court", notes);

    expect(notes).toEqual([]);
  });

  it("says so when the body cannot fit", () => {
    const notes: string[] = [];
    noteIfTextIsCut("x".repeat(MAX_TEXT_MIRROR_CHARS), notes);

    expect(notes.join(" ")).toContain("cut to fit");
  });

  it("counts the note it is about to add, so no cut goes unannounced", () => {
    // A body that fits the bare cap and overflows once the trailer is written
    // is exactly the band a naive measurement misses.
    const notes = ["Une note déjà présente qui occupe de la place dans le pied de page."];
    const body = "x".repeat(MAX_TEXT_MIRROR_CHARS - 40);
    noteIfTextIsCut(body, notes);

    const result = ok({}, body, notes);
    const cut = textOfResult(result).includes("…");

    expect(notes.join(" ").includes("cut to fit")).toBe(cut);
  });
});
