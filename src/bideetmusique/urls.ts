/** URL construction and validation for bide-et-musique.com. */

import { invalidInput } from "../errors.js";

const ABSOLUTE_URL = /^https?:\/\//i;
const SONG_PATH = /^\/song\/(\d+)\.html$/i;

export const BASE_URL = "https://www.bide-et-musique.com";

const ALLOWED_HOSTS = new Set(["bide-et-musique.com", "www.bide-et-musique.com"]);

/**
 * The search axes this server exposes.
 *
 * The site offers nine, keyed by the `st` parameter. Four are published here,
 * and each asks a different question: who is credited on the record, what the
 * song is called, who wrote it, and what is sung in it. An answer on one says
 * nothing about the others, so they are never merged.
 */
export type SearchType = "performer" | "title" | "writer" | "lyrics" | "label" | "year";

export const SEARCH_TYPE_CODES: Record<SearchType, number> = {
  performer: 2,
  title: 3,
  writer: 4,
  label: 5,
  lyrics: 6,
  year: 7,
};

/** The site's own wording for each axis, used when an answer has to name one. */
export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  performer: "Interprète",
  title: "Nom du morceau",
  writer: "Auteur / Compositeur",
  label: "Label",
  lyrics: "Paroles",
  year: "Année",
};

/**
 * The year axis takes one whole year and nothing else.
 *
 * It matches a year exactly rather than inside a number, so "198" finds nothing,
 * and it drops any other word rather than filtering on it: "1983 vacances"
 * answers with every song of 1983, which reads as a filtered answer and is not
 * one. So a query that is not a year is refused before it can look like a
 * search.
 */
export const YEAR_QUERY = /^\d{4}$/;

export interface SearchUrlInput {
  query: string;
  searchType: SearchType;
  page?: number;
}

/**
 * Build a search URL.
 *
 * `Page` is left out for the first page, which is the address a reader gets
 * from the search form, so the cache key for page 1 is the same whether the
 * caller passed the default or nothing.
 */
export function buildSearchUrl({ query, searchType, page = 1 }: SearchUrlInput): string {
  const code = SEARCH_TYPE_CODES[searchType];
  if (code === undefined) {
    throw invalidInput(
      `"${searchType}" is not a search type.`,
      `Use one of: ${Object.keys(SEARCH_TYPE_CODES).join(", ")}.`,
    );
  }

  const url = new URL(`${BASE_URL}/recherche.html`);
  url.searchParams.set("kw", query);
  url.searchParams.set("st", String(code));
  if (page > 1) {
    url.searchParams.set("Page", String(Math.floor(page)));
  }
  return url.toString();
}

/** A song id as the site numbers them, and as search_songs hands them back. */
export const SONG_ID = /^\d+$/;

export function songUrl(id: string): string {
  return `${BASE_URL}/song/${id}.html`;
}

/** The feed of records the collection has just catalogued. */
export function newSongsFeedUrl(): string {
  return `${BASE_URL}/new_song.rss`;
}

/** An artist id as the site numbers them. */
export const ARTIST_ID = /^\d+$/;

export function artistUrl(id: string): string {
  return `${BASE_URL}/artist/${id}.html`;
}

/**
 * The song id an address names, when it names one.
 *
 * A search matching a single song lands on that song's page, so the address the
 * request ended at is what says which song was found.
 */
export function extractSongId(rawUrl: string): string | null {
  let path = rawUrl;
  if (ABSOLUTE_URL.test(rawUrl)) {
    if (!isBideHost(rawUrl)) {
      return null;
    }
    path = new URL(rawUrl).pathname;
  }
  return SONG_PATH.exec(path)?.[1] ?? null;
}

/** True only for bide-et-musique.com, so a hostile URL cannot be used as a proxy. */
export function isBideHost(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
}

/**
 * An address the site published, resolved against the site itself.
 *
 * A page publishes addresses written by people, and one of them can be no
 * address at all. Nothing is invented in its place: the caller drops the link
 * rather than receiving an error the six codes never named.
 */
export function toAbsoluteUrl(href: string): string | null {
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return null;
  }
}
