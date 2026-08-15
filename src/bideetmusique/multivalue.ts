/**
 * Fields that hold several values.
 *
 * A record credits between one and ten writers, and publishes each of them as
 * its own link. Handing that back as one joined string makes a caller split it
 * again, on punctuation that also appears inside names: "Jean-Pierre Lang" is
 * one person, and a hyphen between two names is a separator. So the anchors the
 * site published are the values, and splitting text is the fallback for a field
 * that carries none.
 */

import { decodeEntities, textOf } from "./html.js";

/** A tag's attributes may hold quoted markup, so the closing `>` is found outside quotes. */
const ANCHOR = /<a\b(?:[^>"]|"[^"]*")*>([\s\S]*?)<\/a>/gi;

/**
 * Separators the site puts between values.
 *
 * A hyphen counts only with space on both sides. A comma and a semicolon count
 * on their own, which is what the site's own punctuation says.
 */
const SEPARATOR = /\s\/\s|\s-\s|[,;]/;

/** The anchor texts of a fragment, in the order the site printed them. */
export function linkedValues(html: string): string[] {
  const values: string[] = [];
  ANCHOR.lastIndex = 0;
  for (let match = ANCHOR.exec(html); match !== null; match = ANCHOR.exec(html)) {
    const value = textOf(match[1] ?? "");
    if (value !== "") values.push(value);
  }
  return values;
}

/** A published string split on the separators the site uses between values. */
export function splitValues(text: string): string[] {
  return (
    decodeEntities(text)
      .split(SEPARATOR)
      .map((part) => part.replace(/[ \t\n\r\f\v]+/g, " ").replace(/^ +| +$/g, ""))
      // A part made of nothing but space is no value, and a non-breaking space
      // is space here. Inside a name it stays as published: it separates nothing.
      .filter((part) => part.replace(/[\s ]+/g, "") !== "")
  );
}

/**
 * The values of a field.
 *
 * The anchors win when there are any: the glue between them belongs to the
 * page's typography, and turning it into a value invents a credit nobody holds.
 */
export function fieldValues(html: string): string[] {
  const linked = linkedValues(html);
  if (linked.length > 0) return linked;
  return splitValues(textOf(html));
}
