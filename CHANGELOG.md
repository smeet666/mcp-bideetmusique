# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/smeet666/mcp-bideetmusique/releases/tag/v0.1.0
