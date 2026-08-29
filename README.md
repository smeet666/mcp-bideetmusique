<img src="assets/icon-128.png" alt="" width="96" align="right">

# mcp-bideetmusique

[![npm](https://img.shields.io/npm/v/mcp-bideetmusique.svg)](https://www.npmjs.com/package/mcp-bideetmusique)
[![CI](https://github.com/smeet666/mcp-bideetmusique/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-bideetmusique/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-bideetmusique.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-bideetmusique)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-bideetmusique/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-bideetmusique)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-bideetmusique-1n4meg?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-bideetmusique-1n4meg)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=bideetmusique&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1iaWRlZXRtdXNpcXVlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=bideetmusique&config=%7B%22name%22%3A%22bideetmusique%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-bideetmusique%22%5D%7D)

[Bide & Musique](https://www.bide-et-musique.com) is a French web radio and the
collection of records it plays, catalogued by hand by the volunteer association
that runs it. Its subject is the forgotten song: the flop, the novelty record,
the television theme, the single nobody reissued. A record's page carries the
performer, the writers and composers, the year, the label and its catalogue
reference, the sleeve, the duration, the station's own chart placings, and the
words when a listener transcribed them.

This server connects a chat client to that collection. You can search it along
one axis at a time, by performer, title, writer, lyrics, label or year; read one
record in full; read what the site holds about an artist with their discography;
draw a record at random; and see what has just been catalogued. It needs no API
key and no account.

_[Version française](#mcp-bideetmusique-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=bideetmusique&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1iaWRlZXRtdXNpcXVlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=bideetmusique&config=%7B%22name%22%3A%22bideetmusique%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-bideetmusique%22%5D%7D)

**Claude Code**

```bash
claude mcp add bideetmusique -- npx -y mcp-bideetmusique
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "npx",
      "args": ["-y", "mcp-bideetmusique"]
    }
  }
}
```

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-bideetmusique:2.0.1"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`www.bide-et-musique.com`, and nothing else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-bideetmusique-2.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-bideetmusique/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- « Qu'est-ce que Bide & Musique a de Jacques Dutronc ? »
- "Which songs mention a submarine in their words?"
- "Read me that record: the label, the year, who wrote it."
- "Play me something at random from the collection."
- "What has been catalogued lately?"

The ordinary path runs from a search to a record: a row carries a `song_id`, and
`get_song` reads it.

## Tools

| Tool              | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `search_songs`    | Searches the collection along one axis at a time.               |
| `get_song`        | Reads one record in full, words included.                       |
| `get_artist`      | Reads an artist and the records the collection holds of theirs. |
| `get_random_song` | Draws a record nobody chose.                                    |
| `list_new_songs`  | Reads what the collection has just catalogued.                  |

### `search_songs`

Searches along one axis, which has to be named: each asks a different question,
and an answer on one says nothing about the others. A name that returns nothing
as a performer may still be a title.

| Argument      | Type                                                        | Required | What it does                   |
| ------------- | ----------------------------------------------------------- | -------- | ------------------------------ |
| `query`       | string, up to 200 characters                                | yes      | What to look for on that axis. |
| `search_type` | `performer`, `title`, `writer`, `lyrics`, `label` or `year` | yes      | The axis to search along.      |
| `page`        | integer, 1 to 200, default `1`                              | no       | Which page of rows.            |
| `limit`       | integer, 1 to 50, default `20`                              | no       | Rows to serve.                 |

| `search_type` | Finds                             |
| ------------- | --------------------------------- |
| `performer`   | the artist credited on the record |
| `title`       | the name of the song              |
| `writer`      | who wrote or composed it          |
| `lyrics`      | the words sung in it              |
| `label`       | the label it came out on          |
| `year`        | the year printed on it            |

The `year` axis takes one four-digit year and nothing else: the site drops any
other word there instead of filtering on it. Several keywords are combined with
AND and each is matched inside words, so every extra word narrows the search, and
a quoted phrase returns nothing whatever the site's own form offers.

**In return:** rows carrying `song_id`, which `get_song` takes; `title`; `url`;
and the `artist`. `total_matches` is the number the site prints, counting
matching songs across every page, so it exceeds the rows of one page.
`page_served` is the page the site actually served, since it answers a page past
the last one with the last page and no error: read it rather than assuming the
page asked for. `page_count` and `has_more_pages` are `null` where the site
printed neither.

### `get_song`

Reads one record in full.

| Argument         | Type                        | Required | What it does                                        |
| ---------------- | --------------------------- | -------- | --------------------------------------------------- |
| `song_id`        | string, up to 20 characters | yes      | The id a search row carries.                        |
| `include_lyrics` | boolean, default `true`     | no       | Carry the transcribed words when the page has them. |

**In return:** `title`, `artist`, `credited_performer`, `year`, `writers`,
`duration` with the text exactly as the record prints it and its `precision`,
`labels` with one entry per label, `catalogue_reference`, `presentation`,
`sleeve_credits`, `image_url`, `added_on` as an ISO date, the station's chart
placings, `favourites` and `comments`. The title, the artist and the duration are
always stated; the rest is absent on some records and comes back `null` rather
than guessed, and a counter the page prints nothing for is unknown rather than
zero. `lyrics.available` says whether the page carries a transcription, and
`lyrics.text` holds the words with the `transcriber` who wrote them down.

### `get_artist`

Reads what the collection holds about one artist, with the records it has of
theirs.

| Argument    | Type                             | Required | What it does                    |
| ----------- | -------------------------------- | -------- | ------------------------------- |
| `artist_id` | string, up to 20 characters      | yes      | The artist id a record carries. |
| `limit`     | integer, 1 to 200, default `100` | no       | Records of theirs to serve.     |

**In return:** `name`, `aliases`, `surname`, `first_name`, `nationality`,
`birth_date`, `presentation`, `see_also`, `links` and `photo_url`, each `null` or
empty where the page states nothing. `discography` carries their records, each
with its `song_id` for `get_song`, its `title`, `url`, `year` and how often the
station programmed it. `discography_count` counts the records served and
`songs_on_page` the records the page held, so a truncated discography is visible.

### `get_random_song`

Draws a record nobody chose, over the ids the site serves. It is for browsing the
collection when no particular song is being asked about.

| Argument         | Type                    | Required | What it does                                        |
| ---------------- | ----------------------- | -------- | --------------------------------------------------- |
| `include_lyrics` | boolean, default `true` | no       | Carry the transcribed words when the page has them. |

**In return:** the record `get_song` returns.

### `list_new_songs`

Reads what the collection has just catalogued.

| Argument | Type                           | Required | What it does   |
| -------- | ------------------------------ | -------- | -------------- |
| `limit`  | integer, 1 to 50, default `20` | no       | Rows to serve. |

**In return:** rows carrying `song_id`, `title` read off the line the feed
publishes, `artist_name`, `listed_as`, `url` and `published_at`.
`entries_in_feed` is the number of entries the feed holds, which is a fixed
number and says nothing about how many records the collection holds.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                 | Default              | What it does                                                                       |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------- |
| `BIDE_USER_AGENT`        | the project identity | Names your application to the site, with an address where a person can be reached. |
| `BIDE_MIN_INTERVAL_MS`   | `3000`               | Gap between two requests, from 2000 to 60000.                                      |
| `BIDE_TIMEOUT_MS`        | `20000`              | Deadline for one request, from 1000 to 120000.                                     |
| `BIDE_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 10.                                  |
| `BIDE_CACHE_TTL_MS`      | `900000`             | How long a page stays in memory, from 0 to 86400000.                               |
| `BIDE_CACHE_MAX_ENTRIES` | `200`                | Pages held in memory at once, from 0 to 10000.                                     |
| `BIDE_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                           |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                   |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `not_found`     | The site answered, and holds no such record.            | Check the id with `search_songs`.                                                                            |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                  |
| `rate_limited`  | The site asked this client to slow down.                | Wait the number of seconds the hint names and call again with the same arguments. The record is still there. |
| `parse_failure` | The page loaded and the expected content was absent.    | Report it at [the issue tracker](https://github.com/smeet666/mcp-bideetmusique/issues).                      |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                           |
| `timeout`       | The request passed its deadline.                        | Raise `BIDE_TIMEOUT_MS`, or ask for fewer rows.                                                              |

## As a library

The layer reading the site is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { BideEtMusiqueClient } from "mcp-bideetmusique/client";

const client = new BideEtMusiqueClient();
const { data, cached } = await client.getSong("1234");
console.log(data.title, data.labels, cached);
```

`search`, `getSong`, `getArtist` and `getNewSongs` each answer `{ data, cached }`,
and throw an error carrying one of the six codes. The two-second floor between
two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least three seconds between them, and the
floor of two seconds holds however the server is configured. Bide & Musique is
run by a volunteer association on its own means, and this pacing is what the
collection is owed. The `User-Agent` always ends with the project identity and an
address where a person can be reached.

Every result carries the address of the record's page. The catalogue is the work
of the association and of the listeners who built it, transcriptions included.

This MCP server is an unofficial project, with no affiliation to Bide & Musique.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `www.bide-et-musique.com` and nothing else, holds its answers in memory
while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
site itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-bideetmusique/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The catalogue belongs to Bide & Musique and to the
listeners who built it.

---

<a name="mcp-bideetmusique-français"></a>

# mcp-bideetmusique (français)

_[English version](#mcp-bideetmusique)_

[Bide & Musique](https://www.bide-et-musique.com) est une radio web française et
la collection de disques qu'elle diffuse, cataloguée à la main par l'association
bénévole qui la tient. Son sujet est la chanson oubliée : le bide, le disque de
fantaisie, le générique de télévision, le 45 tours que personne n'a réédité. La
page d'un disque porte l'interprète, les auteurs et compositeurs, l'année, le
label et sa référence de catalogue, la pochette, la durée, les classements du
hit-parade de la station, et les paroles quand un auditeur les a transcrites.

Ce serveur relie un client de conversation à cette collection. On peut y chercher
selon un axe à la fois, par interprète, titre, auteur, paroles, label ou année ;
lire une fiche en entier ; lire ce que le site contient sur un artiste avec sa
discographie ; tirer un disque au hasard ; et voir ce qui vient d'être catalogué.
Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=bideetmusique&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1iaWRlZXRtdXNpcXVlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=bideetmusique&config=%7B%22name%22%3A%22bideetmusique%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-bideetmusique%22%5D%7D)

**Claude Code**

```bash
claude mcp add bideetmusique -- npx -y mcp-bideetmusique
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "npx",
      "args": ["-y", "mcp-bideetmusique"]
    }
  }
}
```

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-bideetmusique:2.0.1"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `www.bide-et-musique.com`, et de rien d'autre : aucun volume, aucun
port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-bideetmusique-2.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-bideetmusique/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Qu'est-ce que Bide & Musique a de Jacques Dutronc ? »
- « Quelles chansons parlent d'un sous-marin dans leurs paroles ? »
- « Lis-moi cette fiche : le label, l'année, qui l'a écrite. »
- « Fais-moi écouter quelque chose au hasard dans la collection. »
- « Qu'est-ce qui a été catalogué récemment ? »

Le chemin ordinaire va d'une recherche à une fiche : une ligne porte un
`song_id`, et `get_song` la lit.

## Les outils

| Outil             | Ce qu'il fait                                             |
| ----------------- | --------------------------------------------------------- |
| `search_songs`    | Cherche dans la collection selon un axe à la fois.        |
| `get_song`        | Lit une fiche en entier, paroles comprises.               |
| `get_artist`      | Lit un artiste et les disques que la collection a de lui. |
| `get_random_song` | Tire un disque que personne n'a choisi.                   |
| `list_new_songs`  | Lit ce que la collection vient de cataloguer.             |

### `search_songs`

Cherche selon un axe, qu'il faut nommer : chacun pose une question différente, et
une réponse sur l'un ne dit rien des autres. Un nom qui ne rend rien comme
interprète peut très bien être un titre.

| Argument      | Type                                                        | Requis | Ce qu'il fait                 |
| ------------- | ----------------------------------------------------------- | ------ | ----------------------------- |
| `query`       | chaîne, jusqu'à 200 caractères                              | oui    | Ce qu'on cherche sur cet axe. |
| `search_type` | `performer`, `title`, `writer`, `lyrics`, `label` ou `year` | oui    | L'axe de recherche.           |
| `page`        | entier, 1 à 200, défaut `1`                                 | non    | Quelle page de lignes.        |
| `limit`       | entier, 1 à 50, défaut `20`                                 | non    | Lignes à servir.              |

| `search_type` | Trouve                          |
| ------------- | ------------------------------- |
| `performer`   | l'artiste crédité sur le disque |
| `title`       | le nom de la chanson            |
| `writer`      | qui l'a écrite ou composée      |
| `lyrics`      | les mots qui y sont chantés     |
| `label`       | le label qui l'a publiée        |
| `year`        | l'année imprimée dessus         |

L'axe `year` prend une année à quatre chiffres et rien d'autre : le site laisse
tomber tout autre mot au lieu de filtrer dessus. Plusieurs mots-clés sont
combinés par ET et chacun est cherché à l'intérieur des mots, donc chaque mot
supplémentaire resserre la recherche, et une expression entre guillemets ne rend
rien, quoi qu'en propose le formulaire du site.

**En retour :** des lignes portant `song_id`, que `get_song` reprend ; `title` ;
`url` ; et l'`artist`. `total_matches` est le nombre que le site imprime,
comptant les chansons correspondantes sur toutes les pages, donc il dépasse les
lignes d'une page. `page_served` est la page que le site a réellement servie,
puisqu'il répond à une page au-delà de la dernière par la dernière page et sans
erreur : lisez-la plutôt que de supposer la page demandée. `page_count` et
`has_more_pages` valent `null` là où le site n'a imprimé ni l'un ni l'autre.

### `get_song`

Lit une fiche en entier.

| Argument         | Type                          | Requis | Ce qu'il fait                                      |
| ---------------- | ----------------------------- | ------ | -------------------------------------------------- |
| `song_id`        | chaîne, jusqu'à 20 caractères | oui    | L'identifiant que porte une ligne.                 |
| `include_lyrics` | booléen, défaut `true`        | non    | Porter les paroles transcrites quand la page en a. |

**En retour :** `title`, `artist`, `credited_performer`, `year`, `writers`,
`duration` avec le texte exactement comme la fiche l'imprime et sa `precision`,
`labels` avec une entrée par label, `catalogue_reference`, `presentation`,
`sleeve_credits`, `image_url`, `added_on` en date ISO, les classements du
hit-parade de la station, `favourites` et `comments`. Le titre, l'artiste et la
durée sont toujours indiqués ; le reste est absent sur certaines fiches et revient
`null` plutôt que deviné, et un compteur que la page n'imprime pas est inconnu
plutôt que nul. `lyrics.available` dit si la page porte une transcription, et
`lyrics.text` contient les mots avec le `transcriber` qui les a notés.

### `get_artist`

Lit ce que la collection contient sur un artiste, avec les disques qu'elle a de
lui.

| Argument    | Type                          | Requis | Ce qu'il fait                                |
| ----------- | ----------------------------- | ------ | -------------------------------------------- |
| `artist_id` | chaîne, jusqu'à 20 caractères | oui    | L'identifiant d'artiste que porte une fiche. |
| `limit`     | entier, 1 à 200, défaut `100` | non    | Disques de lui à servir.                     |

**En retour :** `name`, `aliases`, `surname`, `first_name`, `nationality`,
`birth_date`, `presentation`, `see_also`, `links` et `photo_url`, chacun `null`
ou vide là où la page n'indique rien. `discography` porte ses disques, chacun
avec son `song_id` pour `get_song`, son `title`, `url`, `year` et le nombre de
fois où la station l'a programmé. `discography_count` compte les disques servis
et `songs_on_page` ceux que la page contenait, si bien qu'une discographie
tronquée se voit.

### `get_random_song`

Tire un disque que personne n'a choisi, parmi les identifiants que le site sert.
Il sert à parcourir la collection quand aucune chanson précise n'est en
question.

| Argument         | Type                   | Requis | Ce qu'il fait                                      |
| ---------------- | ---------------------- | ------ | -------------------------------------------------- |
| `include_lyrics` | booléen, défaut `true` | non    | Porter les paroles transcrites quand la page en a. |

**En retour :** la fiche que rend `get_song`.

### `list_new_songs`

Lit ce que la collection vient de cataloguer.

| Argument | Type                        | Requis | Ce qu'il fait    |
| -------- | --------------------------- | ------ | ---------------- |
| `limit`  | entier, 1 à 50, défaut `20` | non    | Lignes à servir. |

**En retour :** des lignes portant `song_id`, `title` lu sur la ligne que le flux
publie, `artist_name`, `listed_as`, `url` et `published_at`. `entries_in_feed`
est le nombre d'entrées que le flux contient, qui est un nombre fixe et ne dit
rien du nombre de disques que la collection contient.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                 | Défaut               | Ce qu'elle fait                                                                   |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| `BIDE_USER_AGENT`        | l'identité du projet | Nomme votre application auprès du site, avec une adresse où joindre une personne. |
| `BIDE_MIN_INTERVAL_MS`   | `3000`               | Écart entre deux requêtes, de 2000 à 60000.                                       |
| `BIDE_TIMEOUT_MS`        | `20000`              | Délai d'une requête, de 1000 à 120000.                                            |
| `BIDE_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 10.                                    |
| `BIDE_CACHE_TTL_MS`      | `900000`             | Durée pendant laquelle une page reste en mémoire, de 0 à 86400000.                |
| `BIDE_CACHE_MAX_ENTRIES` | `200`                | Pages gardées en mémoire à la fois, de 0 à 10000.                                 |
| `BIDE_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.               |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                 | Que faire                                                                                       |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `not_found`     | Le site a répondu, et n'a pas cette fiche.         | Vérifiez l'identifiant avec `search_songs`.                                                     |
| `invalid_input` | Les arguments ont été refusés avant toute requête. | Lisez le message, qui nomme l'argument.                                                         |
| `rate_limited`  | Le site demande à ce client de ralentir.           | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La fiche est toujours là. |
| `parse_failure` | La page a chargé et le contenu attendu est absent. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-bideetmusique/issues).   |
| `network_error` | La requête n'a pas abouti.                         | Réessayez sous peu.                                                                             |
| `timeout`       | La requête a dépassé son délai.                    | Augmentez `BIDE_TIMEOUT_MS`, ou demandez moins de lignes.                                       |

## Comme bibliothèque

La couche qui lit le site est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { BideEtMusiqueClient } from "mcp-bideetmusique/client";

const client = new BideEtMusiqueClient();
const { data, cached } = await client.getSong("1234");
console.log(data.title, data.labels, cached);
```

`search`, `getSong`, `getArtist` et `getNewSongs` répondent chacun
`{ data, cached }`, et lèvent une erreur portant un des six codes. Le plancher de
deux secondes entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins trois secondes entre elles, et le
plancher de deux secondes tient quelle que soit la configuration. Bide & Musique
est tenu par une association bénévole sur ses propres moyens, et ce rythme est ce
qu'on doit à la collection. Le `User-Agent` se termine toujours par l'identité du
projet et une adresse où joindre une personne.

Chaque résultat porte l'adresse de la page de la fiche. Le catalogue est l'œuvre
de l'association et des auditeurs qui l'ont bâti, transcriptions comprises.

Ce MCP est un projet non officiel, sans affiliation à Bide & Musique.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `www.bide-et-musique.com`, garde ses réponses en mémoire le temps qu'il
tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une
requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le site lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-bideetmusique/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Le catalogue appartient à Bide & Musique et aux
auditeurs qui l'ont bâti.
