# mcp-bideetmusique

An MCP server for [Bide & Musique](https://www.bide-et-musique.com), the online
station and hand-built catalogue of French songs that fame passed by. No API key,
no account, read-only.

The collection has been catalogued since 2000 by the volunteer association that
runs the station: year, label, catalogue reference, writers and composers, for
tens of thousands of records that no other database describes this way.

## What it does

One tool, `search_songs`, searching along one axis at a time. The axis has to be
named, because each asks a different question and an answer on one says nothing
about the others.

| `search_type` | Finds |
|---|---|
| `performer` | the artist credited on the record |
| `title` | the name of the song |
| `writer` | who wrote or composed it |
| `lyrics` | the words sung in it |

`lyrics` is the one that answers "what is that song where they sing about a
photocopier?". It returns the songs whose words match, and none of the text
itself: Bide & Musique publishes those transcriptions while awaiting permission
from the rights holders, so this server links the page rather than repeating it.

## What it will not claim

Every answer is built so a caller can tell what the site actually said:

- **A failure is never an empty result.** Six error codes, and a search the site
  refused is not a collection that holds nothing.
- **The count is the site's own**, counting matching songs across every page, so
  it usually exceeds the rows of one page. A count the site did not print is
  `null`, never `0`.
- **The page served is read, not assumed.** Asking for a page past the last one
  gets the last page back with no error, and the answer says so.
- **Matching happens inside words.** Searching `Bino` brings back records of
  `Bambino`, and the answer says when no row carries the query as a word.
- **Several keywords combine with AND**, so every extra word narrows the search.
  A quoted phrase returns nothing, whatever the site's own form offers.
- **Rows come in the site's order**, by performer then by title, never by how
  well they match, and truncating says so.

## Install

```bash
npm install -g mcp-bideetmusique
```

Then register it with your MCP client:

```json
{
  "mcpServers": {
    "bideetmusique": {
      "command": "mcp-bideetmusique"
    }
  }
}
```

## Configuration

Every variable is optional.

| Variable | Default | What it does |
|---|---|---|
| `BIDE_USER_AGENT` | the project's own | Your application's name. The project identity is appended to it, so the traffic stays attributable. |
| `BIDE_MIN_INTERVAL_MS` | `3000` | Minimum gap between requests. Values below 2000 are refused. |
| `BIDE_TIMEOUT_MS` | `20000` | Per-request timeout. |
| `BIDE_MAX_RETRIES` | `3` | Retries on transient failures. |
| `BIDE_CACHE_TTL_MS` | `900000` | In-memory cache lifetime. Nothing is written to disk. |
| `BIDE_CACHE_MAX_ENTRIES` | `200` | Cache size. |
| `BIDE_LOG_LEVEL` | `error` | `silent`, `error`, `info` or `debug`, on stderr. |

## What this server owes the site

Bide & Musique is run by a volunteer association, on one server, for free.
Requests go out one at a time, three seconds apart, and the floor cannot be
lowered by configuration. The User-Agent always carries the project and an
address where someone can be reached. The server reads and never writes.

## Licence

MIT. Song data belongs to Bide & Musique and to the rights holders of the works
it describes; credit the site and link the record when you show a result.

---

# mcp-bideetmusique (français)

Un serveur MCP pour [Bide & Musique](https://www.bide-et-musique.com), la
webradio et le catalogue, bâti à la main, des chansons françaises que la gloire
a manquées. Sans clé d'API, sans compte, en lecture seule.

La collection est cataloguée depuis 2000 par l'association bénévole qui tient la
station : année, label, référence de catalogue, auteurs et compositeurs, pour des
dizaines de milliers de disques qu'aucune autre base ne décrit ainsi.

## Ce qu'il fait

Un outil, `search_songs`, qui cherche sur un axe à la fois. L'axe doit être
nommé, parce que chacun pose une question différente et qu'une réponse sur l'un
ne dit rien des autres.

| `search_type` | Trouve |
|---|---|
| `performer` | l'interprète crédité sur le disque |
| `title` | le nom du morceau |
| `writer` | qui l'a écrit ou composé |
| `lyrics` | les mots chantés dedans |

`lyrics` répond à « c'est quoi, cette chanson où ils parlent d'un
photocopieur ? ». Il rend les morceaux dont les paroles correspondent, et aucun
mot du texte : Bide & Musique publie ces transcriptions en attendant
l'autorisation des ayants droit, donc ce serveur renvoie vers la page plutôt que
de la répéter.

## Ce qu'il refuse d'affirmer

Chaque réponse est construite pour qu'un appelant sache ce que le site a
réellement dit :

- **Une panne n'est jamais un résultat vide.** Six codes d'erreur, et une
  recherche refusée par le site n'est pas une collection qui ne contient rien.
- **Le compteur est celui du site**, qui compte les morceaux de toutes les pages,
  donc il dépasse presque toujours les lignes d'une page. Un compteur que le site
  n'a pas imprimé vaut `null`, jamais `0`.
- **La page servie est lue, pas supposée.** Demander une page au-delà de la
  dernière rend la dernière, sans erreur, et la réponse le dit.
- **La correspondance se fait à l'intérieur des mots.** Chercher `Bino` ramène
  des disques de `Bambino`, et la réponse signale qu'aucune ligne ne porte le mot.
- **Plusieurs mots-clés se combinent en ET**, donc chaque mot ajouté restreint.
  Une expression entre guillemets ne rend rien, quoi qu'en propose le formulaire
  du site.
- **Les lignes viennent dans l'ordre du site**, par interprète puis par titre,
  jamais par pertinence, et toute troncature le rappelle.

## Ce que ce serveur doit au site

Bide & Musique est tenu par une association bénévole, sur un seul serveur,
gratuitement. Les requêtes partent une à la fois, à trois secondes d'intervalle,
et ce plancher ne se descend par aucune configuration. Le `User-Agent` porte
toujours le projet et une adresse où joindre quelqu'un. Le serveur lit, il
n'écrit jamais.

## Licence

MIT. Les données appartiennent à Bide & Musique et aux ayants droit des œuvres
décrites ; créditez le site et liez la fiche quand vous montrez un résultat.
