# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/smeet666/mcp-bideetmusique/security/advisories/new)
rather than a public issue. Expect an answer within a few days. This is a
spare-time project, so please allow a reasonable delay before disclosing.

## What this server does, and what it cannot do

It reads public pages from bide-et-musique.com over HTTPS and returns what they
say. It writes nowhere, uploads nothing, and contributes nothing back to the
site.

- **No credentials.** No API key, no account, no token, nothing to leak.
- **No disk.** The cache is in memory and dies with the process.
- **No shell, no filesystem.** Nothing in a tool argument reaches either.
- **Addresses are built, never taken.** A tool takes ids and search terms, and
  the URL is composed from them against a fixed host, so a caller cannot point
  this server at a host of their choosing.

## Text that came from the site

Pages carry text written by other people, and it reaches a model through this
server. Two things follow from that, and both are enforced in code rather than
promised here:

- **The site's text cannot imitate a line this server writes.** The lines the
  server adds to an answer open with markers that get indented away wherever
  they appear inside published text.
- **Published text is repeated as published.** Nothing is executed, resolved or
  followed, and a model reading an answer should treat what came from a page as
  quoted material rather than as instructions.

## Dependencies

Two at runtime: the MCP SDK and zod. Both are pinned in `package-lock.json`, and
CI installs with `npm ci` so a build never resolves something newer on its own.
