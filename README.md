# mcp-bideetmusique

An MCP server for [Bide & Musique](https://www.bide-et-musique.com), the online
station and hand-built catalogue of French songs that fame passed by. No API key,
no account, read-only.

The collection has been catalogued since 2000 by the volunteer association that
runs the station: year, label, catalogue reference, writers and composers, for
tens of thousands of records that no other database describes this way.

## What it does

Five tools.

`search_songs` searches along one axis at a time. The axis has to be named,
because each asks a different question and an answer on one says nothing about
the others.

| `search_type` | Finds                             |
| ------------- | --------------------------------- |
| `performer`   | the artist credited on the record |
| `title`       | the name of the song              |
| `writer`      | who wrote or composed it          |
| `lyrics`      | the words sung in it              |
| `label`       | the label it came out on          |
| `year`        | the year printed on it            |

`get_song` resolves an id from a search into the record itself: the year, the
writers and composers, the duration, the label and its catalogue reference, the
sleeve, the day the collection catalogued it, the station's own chart, and how
many people kept it as a favourite. A record whose page carries a transcription
comes back with the words themselves and who typed them; `include_lyrics` leaves
them out when the question is about the record.

`get_artist` reads an artist's page: who they are, the names they also recorded
under, and what the collection holds of them.

`get_random_song` answers with a record nobody chose. The site publishes no
route to a random one, so the draw runs over the ids it serves, from the first
to the newest its feed of new entries names, and an id the collection does not
serve is drawn again.

`list_new_songs` reads what the collection has just catalogued. The feed behind
it carries a fixed number of entries and offers no second page, so its count is
a window on the newest records rather than a count of the collection.

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

| Variable                 | Default           | What it does                                                                                        |
| ------------------------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| `BIDE_USER_AGENT`        | the project's own | Your application's name. The project identity is appended to it, so the traffic stays attributable. |
| `BIDE_MIN_INTERVAL_MS`   | `3000`            | Minimum gap between requests. Values below 2000 are refused.                                        |
| `BIDE_TIMEOUT_MS`        | `20000`           | Per-request timeout.                                                                                |
| `BIDE_MAX_RETRIES`       | `3`               | Retries on transient failures.                                                                      |
| `BIDE_CACHE_TTL_MS`      | `900000`          | In-memory cache lifetime. Nothing is written to disk.                                               |
| `BIDE_CACHE_MAX_ENTRIES` | `200`             | Cache size.                                                                                         |
| `BIDE_LOG_LEVEL`         | `error`           | `silent`, `error`, `info` or `debug`, on stderr.                                                    |

## What this server owes the site

Bide & Musique is run by a volunteer association, on one server, for free.
Requests go out one at a time, three seconds apart, and the floor cannot be
lowered by configuration. The User-Agent always carries the project and an
address where someone can be reached. The server reads and never writes.

## Licence

MIT, for the code. What the collection holds belongs to Bide & Musique: credit
the site and link the record when you show a result.

---

# mcp-bideetmusique (français)

Un serveur MCP pour [Bide & Musique](https://www.bide-et-musique.com), la
webradio et le catalogue, bâti à la main, des chansons françaises que la gloire
a manquées. Sans clé d'API, sans compte, en lecture seule.

La collection est cataloguée depuis 2000 par l'association bénévole qui tient la
station : année, label, référence de catalogue, auteurs et compositeurs, pour des
dizaines de milliers de disques qu'aucune autre base ne décrit ainsi.

## Ce qu'il fait

Cinq outils.

`search_songs` cherche sur un axe à la fois. L'axe doit être nommé, parce que
chacun pose une question différente et qu'une réponse sur l'un ne dit rien des
autres.

| `search_type` | Trouve                             |
| ------------- | ---------------------------------- |
| `performer`   | l'interprète crédité sur le disque |
| `title`       | le nom du morceau                  |
| `writer`      | qui l'a écrit ou composé           |
| `lyrics`      | les mots chantés dedans            |
| `label`       | le label qui l'a sorti             |
| `year`        | l'année imprimée dessus            |

`get_song` résout un identifiant rendu par une recherche en la fiche elle-même :
l'année, les auteurs et compositeurs, la durée, le label et sa référence de
catalogue, la pochette, le jour où la collection l'a catalogué, le classement
maison et le nombre de personnes qui l'ont mis en favori. Une fiche dont la page
porte une transcription revient avec les paroles elles-mêmes et qui les a
saisies ; `include_lyrics` les laisse de côté quand la question porte sur le
disque.

`get_artist` lit la page d'un artiste : qui il est, les noms sous lesquels il a
aussi enregistré, et ce que la collection tient de lui.

`get_random_song` répond par une fiche que personne n'a choisie. Le site ne
publie aucune route vers une fiche au hasard, donc le tirage se fait sur les
identifiants qu'il sert, du premier au plus récent que son flux des nouveautés
nomme, et un identifiant que la collection ne sert pas donne lieu à un nouveau tirage.

`list_new_songs` lit ce que la collection vient de cataloguer. Le flux derrière
porte un nombre fixe d'entrées et n'offre pas de seconde page, donc son compteur
est une fenêtre sur les fiches les plus récentes et non un compte de la
collection.

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

MIT, pour le code. Ce que contient la collection appartient à Bide & Musique :
créditez le site et liez la fiche quand vous montrez un résultat.
