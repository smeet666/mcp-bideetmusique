/** Rule 12: the page is decoded from the charset it declares, never guessed. */

import { describe, expect, it } from "vitest";

import { decodeEntities, decodeHtml, textOf } from "../../src/bideetmusique/html.js";
import { ISO_CONTENT_TYPE, bytesOf, fixtureBytes } from "./helpers.js";

const NBSP = " ";

describe("decodeHtml", () => {
  it("reads the accented characters the site wrote, from ISO-8859-1 bytes", () => {
    const html = decodeHtml(fixtureBytes("search-accents.html"), ISO_CONTENT_TYPE);

    expect(html).toContain("é");
    expect(html).toContain("à");
    expect(html).toContain("É");
    expect(html).toContain("Où est passé mon dé à coudre");
    expect(html).toContain("Les Frères Ébène");
  });

  it("gives a different, wrong text when the same bytes are read as UTF-8", () => {
    const bytes = fixtureBytes("search-accents.html");

    const asIso = decodeHtml(bytes, ISO_CONTENT_TYPE);
    const asUtf8 = new TextDecoder("utf-8").decode(bytes);

    // A decoder that ignores the declared charset produces this second string.
    // The two must differ, otherwise the assertions above prove nothing.
    expect(asUtf8).not.toBe(asIso);
    expect(asUtf8).not.toContain("Où est passé mon dé à coudre");
    expect(asUtf8).not.toContain("Les Frères Ébène");
  });

  it("honours a Content-Type naming UTF-8 instead of assuming the site's charset", () => {
    const bytes = fixtureBytes("search-accents.html");

    expect(decodeHtml(bytes, "text/html; charset=utf-8")).not.toContain(
      "Où est passé mon dé à coudre",
    );
  });

  it("falls back to ISO-8859-1 when no Content-Type is given", () => {
    const bytes = fixtureBytes("search-accents.html");

    expect(decodeHtml(bytes)).toBe(decodeHtml(bytes, ISO_CONTENT_TYPE));
    expect(decodeHtml(bytes, null)).toBe(decodeHtml(bytes, ISO_CONTENT_TYPE));
  });

  it("falls back to ISO-8859-1 when the Content-Type names a charset it does not know", () => {
    const bytes = fixtureBytes("search-accents.html");

    expect(decodeHtml(bytes, "text/html; charset=x-unknown-42")).toBe(
      decodeHtml(bytes, ISO_CONTENT_TYPE),
    );
  });

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const copy = new Uint8Array(fixtureBytes("search-accents.html"));

    expect(decodeHtml(copy.buffer as ArrayBuffer, ISO_CONTENT_TYPE)).toContain("dé à coudre");
  });

  it("reads a charset name whatever its case and quoting", () => {
    const bytes = bytesOf("café");

    expect(decodeHtml(bytes, 'text/html; charset="ISO-8859-1"')).toBe("café");
    expect(decodeHtml(bytes, "text/html; CharSet=iso-8859-1")).toBe("café");
    expect(decodeHtml(bytes, "text/html; charset=latin1")).toBe("café");
  });
});

describe("decodeEntities", () => {
  it("turns a named entity into the character it names", () => {
    expect(decodeEntities("Les Frères Ébène &amp; Cie")).toBe("Les Frères Ébène & Cie");
    expect(decodeEntities("&lt;tag&gt; &quot;quoted&quot; &#39;apos&#39;")).toBe(
      `<tag> "quoted" 'apos'`,
    );
  });

  it("turns &nbsp; into a real U+00A0, and never into a plain space", () => {
    const decoded = decodeEntities("coudre&nbsp;?");

    expect(decoded).toBe(`coudre${NBSP}?`);
    expect(decoded).not.toBe("coudre ?");
  });

  it("turns decimal and hexadecimal numeric entities into their character", () => {
    expect(decodeEntities("caf&#233;")).toBe("café");
    expect(decodeEntities("caf&#xE9;")).toBe("café");
    expect(decodeEntities("caf&#Xe9;")).toBe("café");
  });

  it("leaves text that only looks like an entity alone", () => {
    expect(decodeEntities("R&D et 5 &amp 3")).toBe("R&D et 5 &amp 3");
  });
});

describe("textOf", () => {
  it("strips the tags, decodes the entities, collapses the whitespace and trims", () => {
    const html = `  <a href="/artist/701.html" title="x">Les Frères\n   Ébène &amp; Cie</a>\t `;

    expect(textOf(html)).toBe("Les Frères Ébène & Cie");
  });

  it("keeps the non-breaking space the site printed instead of turning it into a plain space", () => {
    const text = textOf("<td>Où est passé mon dé à coudre&nbsp;?</td>");

    expect(text).toBe(`Où est passé mon dé à coudre${NBSP}?`);
  });

  it("returns an empty string for markup that carries no text", () => {
    expect(textOf("<td></td>")).toBe("");
    expect(textOf("")).toBe("");
  });
});
