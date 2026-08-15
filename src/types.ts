/** Domain types shared by the reading layer and the MCP tools. */

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
