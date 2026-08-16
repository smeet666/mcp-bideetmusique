/** Domain types shared by the reading layer and the MCP tools. */

export type { Duration, DurationPrecision } from "./bideetmusique/duration.js";
import type { Duration } from "./bideetmusique/duration.js";

/** An artist the record links to. */
export interface ArtistLink {
  id: string;
  name: string;
  url: string;
}

/**
 * A ranking in the station's own chart.
 *
 * The line reads "Classé N fois dans les M premiers", and M is not always 50:
 * records are ranked within the first 10 as well. Keeping only the count would
 * drop half of what the site said.
 */
export interface Top50 {
  times: number;
  within: number;
}

export interface CommentCount {
  count: number;
  /** Comments the site moved out of the main thread, when it says how many. */
  archived: number | null;
}

/**
 * The lyrics a record page carries, with what the page says around them.
 *
 * `available` reports the cell, `text` reports what was read out of it. A cell
 * holding nothing readable leaves `text` null with `available` true, which says
 * the page announced lyrics and none could be read; the two are separate
 * because merging them would report an unreadable cell as a record with no
 * lyrics at all.
 */
export interface LyricsInfo {
  available: boolean;
  /** The lines as published, separated by newlines, free of markup. */
  text: string | null;
  transcriber: string | null;
  rightsNotice: boolean;
  url: string;
}

/**
 * One entry in the feed of records the collection has just catalogued.
 *
 * The feed publishes a single line naming both the artist and the song, and
 * `listedAs` keeps it as published: the two are read off it at the first
 * separator, and the line is what a caller checks that reading against.
 */
export interface NewSong {
  songId: string;
  title: string;
  /** Null when the line names no artist apart from the song. */
  artistName: string | null;
  listedAs: string;
  url: string;
  /** When the feed published it, as an ISO date, or null when it states none. */
  publishedAt: string | null;
}

/**
 * The feed as a whole: what it published, and what could be read out of it.
 *
 * The two are separate because an entry pointing at something other than a
 * record is dropped, and a list of what was read, counted as what the site
 * published, would be a count of a feed nobody serves.
 */
export interface NewSongsFeed {
  songs: NewSong[];
  /** Entries the feed carries, read or not. */
  published: number;
}

/** An address off the site, with the label the page gave it. */
export interface ExternalLink {
  label: string;
  url: string;
}

/** One record in what an artist has in the collection. */
export interface DiscographyEntry {
  songId: string;
  title: string;
  url: string;
  year: number | null;
  programming: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * An artist, as the catalogue holds them.
 *
 * Half of these pages carry nothing but a name, and the median artist has one
 * record in the collection: every field below the name is absent more often than
 * not, which is the ordinary state of the catalogue rather than a failed read.
 */
export interface Artist {
  id: string;
  url: string;
  name: string;
  aliases: string[];
  /** The catalogue's own "Nom". */
  surname: string | null;
  /** Its "Prénom". */
  firstName: string | null;
  nationality: string | null;
  /**
   * Exactly as published. The catalogue writes a full date, a bare year, a month
   * and a year, or a date with a death beside it, so nothing here is parsed.
   */
  birthDate: string | null;
  presentation: string | null;
  seeAlso: ArtistLink[];
  links: ExternalLink[];
  photoUrl: string | null;
  discography: DiscographyEntry[];
}

/** One record, as the site publishes it. */
export interface Song {
  id: string;
  url: string;
  title: string;
  artist: ArtistLink;
  /** A performer the sleeve credits apart from the artist page, when there is one. */
  creditedPerformer: string | null;
  year: number | null;
  writers: string[];
  duration: Duration;
  labels: string[];
  catalogueReference: string | null;
  presentation: string | null;
  sleeveCredits: string[];
  seeAlso: ArtistLink[];
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** ISO date, converted from the JJ/MM/AAAA the site prints. */
  addedOn: string | null;
  top50: Top50 | null;
  favourites: number | null;
  comments: CommentCount | null;
  lyrics: LyricsInfo;
}

/** The performer credited on a search row. */
export interface ArtistRef {
  id: string;
  name: string;
  /**
   * The artist this credit is an alias of, when the site prints one.
   *
   * Bide & Musique credits a record to the name printed on the sleeve and links
   * it to the artist behind it: "Bino et les gosses d'Angoulême (alias de Bino)".
   * Both names are kept, because collapsing them would rename the record.
   */
  aliasOf: string | null;
  url: string;
}

/** A search hit: enough to pick a song, nothing more. */
export interface SongSummary {
  id: string;
  title: string;
  url: string;
  artist: ArtistRef;
  /**
   * The sleeve at full size. Both a results row and a record page publish this
   * address, so it is the one image that means the same thing wherever the row
   * was read.
   */
  imageUrl: string | null;
  /**
   * The thumbnail as published, whose size follows the page it came from: a
   * results row prints a small one, a record page a larger one.
   */
  thumbnailUrl: string | null;
  /**
   * How the song sits in the station's programming, in the site's own wording,
   * for example "Dans la programmation générale". Null when the row carries no
   * such marker.
   */
  programming: string | null;
}

/**
 * One page of search results, as the site served it.
 *
 * `pageServed` is read from the pagination bar rather than assumed from the
 * request: asking for a page past the last one gets the last page back, with no
 * error, and a caller told otherwise would read those rows as page 99.
 */
export interface SearchPage {
  songs: SongSummary[];
  /**
   * The count Bide & Musique prints above the results, which counts matching
   * songs across every page. Null when the site printed none.
   */
  totalMatches: number | null;
  pageServed: number | null;
  pageCount: number | null;
  hasMorePages: boolean | null;
  /** Rows present in the table that could not be read, and were dropped. */
  unreadableRows: number;
  /**
   * True when the search matched exactly one song and the site answered with
   * that song's own page instead of a list. The row then comes from a record
   * rather than from a results table, which is why it carries no programming
   * marker.
   */
  redirectedToSong: boolean;
}
