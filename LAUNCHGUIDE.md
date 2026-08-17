# mcp-bideetmusique

**Search the hand-built catalogue of forgotten French songs, from Bide & Musique.
No API key, no account, read-only.**

- **npm:** [`mcp-bideetmusique`](https://www.npmjs.com/package/mcp-bideetmusique)
- **Repository:** https://github.com/smeet666/mcp-bideetmusique
- **License:** MIT
- **Transport:** stdio
- **Runtime:** Node.js 20.18.1 or later

## What it is

Bide & Musique is an online station whose catalogue has been built by hand since
2000 by the volunteer association that runs it: year, label, catalogue
reference, writers and composers, for tens of thousands of records that no other
database describes this way. This server reads it.

## Tools

| Tool              | What it answers                                                               |
| ----------------- | ----------------------------------------------------------------------------- |
| `search_songs`    | Search along one named axis: performer, title, writer, lyrics, label or year. |
| `get_song`        | One record, with the words its page publishes.                                |
| `get_artist`      | An artist's page and what the collection holds of them.                       |
| `get_random_song` | A record nobody chose.                                                        |
| `list_new_songs`  | What the collection has just catalogued.                                      |

## Install

```bash
npm install -g mcp-bideetmusique
```

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "mcp-bideetmusique"
    }
  }
}
```

## What sets it apart

Every answer is built so a caller can tell what the site actually said. A
failure is never an empty result, a count is named after what it counts, and a
value the site did not print comes back null rather than guessed. The station is
run by volunteers, so the server paces itself at one request every three
seconds, and that floor cannot be configured away.
