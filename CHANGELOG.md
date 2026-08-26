# Changelog

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-21

The surface is settled: five tools, their arguments and their output schemas are
what callers can build on, and a change to any of them will carry a major
version. What follows is what this release adds and fixes over 0.3.0.

### Added

- A call the host abandons stops the read: the caller's signal reaches the
  request, the retries between attempts, and the draws `get_random_song` makes.
  A page under way is shared by the callers waiting for it and abandoned only
  once the last of them has gone.
- `get_random_song` takes `include_lyrics`, like `get_song`.
- `get_song` and `get_random_song` state the record's id and the artist's id in
  the text they render, under the names the tools take them by, so a record read
  as text can be carried on to `get_artist` without digging through the payload.

### Fixed

- A heading, a row, a cell and a feed entry are read within a bound. A page
  repeating an opening it never closes was searched from every one of them, and
  45 kB of such a page held the server for 2.7 seconds.
- An address a page publishes that no reader can resolve drops the link, rather
  than raising an error outside the six codes.
- A note is one line. Notes quote what a caller asked for, and a quoted line
  break opened a line of the answer that read as one this server wrote.
- An error this server did not expect is reported as a failure to read rather
  than as the site being unreachable, which invited a retry that could not help.
- A day the calendar has no room for, a date outside four digits of year, and a
  length past what a number counts exactly are left unstated rather than
  reported as values.
- A title the feed publishes reaches no field as markup.
- The note naming a counter the record does not print reads as a sentence.

## [0.3.0] - 2026-08-16

### Added

- Two more search axes: `label` for the label a record came out on, and `year`
  for the year printed on it. The year axis takes one four-digit year, since the
  site drops any other word there instead of filtering on it.
- `get_artist`, reading an artist's page: who they are, the names they also
  recorded under, and what the collection holds of them.
- `get_random_song`, answering with a record nobody chose. The site publishes no
  route to a random record, so the draw runs over the ids it serves, bounded by
  the newest id its feed of new entries names, and an id the collection no longer
  serves is drawn again.
- `get_song` returns the transcription a record page carries, under
  `lyrics.text`, alongside who typed it. Its `include_lyrics` argument leaves the
  words out for a question about the record itself, while still reporting
  whether the page carries any.
- `list_new_songs`, reading the records the collection has just catalogued from
  the site's feed of new entries. The feed carries a fixed number of entries and
  offers no second page, so the count it reports is a window on the newest
  records rather than a count of the collection.
- An eval tier under `test/eval`, checking records the site serves today against
  the properties every record must satisfy. The same properties are applied to
  built pages by the unit suite, from one definition in `test/invariants`.

### Changed

- Every refusal of an argument opens with its error code. The bounds a tool
  declares are checked by the schema before its own code runs, and both paths now
  answer in the same vocabulary.
- zod 4.

### Fixed

- A body too short to be a page is judged by whether it closed its root element,
  so a complete feed of a few entries reads as the complete document it is.
- A page served from an address off the site ends the read instead of being
  parsed into an answer that names this site as its source.
- A body is refused past a size no page of this site reaches, rather than being
  held whole in memory.
- A 403 ends the read rather than being retried as though the site had asked for
  patience.
- A text block shortened to fit says so, on every tool rather than on two.
- A transcription is set apart from the lines this server writes, so a line
  someone typed into one cannot be read as a field of the record.
- A counter is read from the page with the transcription cut out of it, so a
  line someone sang is never taken for the number of comments.
- Two tools wanting the same page in one turn ask the site once.

## [0.1.0] - 2026-08-15

First release.

### Added

- `search_songs`, searching the Bide & Musique collection along one axis at a
  time: `performer`, `title`, `writer` and `lyrics`. The axis has to be named,
  since each asks a different question and an answer on one says nothing about
  the others.
- Results carry the song id and page, the artist behind the credit with the
  alias the site prints, the sleeve at full size and the thumbnail as published,
  and the programming marker in the site's own wording.
- Pagination: the page actually served is read from the site's own bar, so a
  page past the last one is reported as the last page rather than as the page
  asked for.
- Notes qualifying every answer: the ordering behind a truncated list, a query
  matched only inside longer words, a match made on text the rows do not show,
  a quoted phrase the site answers with nothing, and a page served from the
  in-memory cache.
- A `./client` entry point publishing the reading layer without the protocol,
  with its own pacing, cache and error taxonomy.

### Notes

- The lyrics axis answers which songs match and carries none of the text. Bide &
  Musique publishes those transcriptions while awaiting permission from the
  rights holders, so this server links the record instead.
- Requests go out one at a time, three seconds apart, with a floor no
  configuration can lower, and the User-Agent always carries the project and an
  address where someone can be reached.

[1.0.0]: https://github.com/smeet666/mcp-bideetmusique/releases/tag/v1.0.0
[0.3.0]: https://github.com/smeet666/mcp-bideetmusique/releases/tag/v0.3.0
[0.1.0]: https://github.com/smeet666/mcp-bideetmusique/releases/tag/v0.1.0
