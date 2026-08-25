/**
 * Generates the HTML fixtures used by the unit tests.
 *
 * The fixtures reproduce the markup Bide & Musique serves on its search page,
 * with invented songs and artists in place of real ones. The parser is checked
 * against structure, so no content from the site needs to live in this
 * repository.
 *
 * Files are written as ISO-8859-1 bytes, which is what the site serves and what
 * the decoding layer has to handle: a fixture written in UTF-8 would let a
 * broken decoder pass.
 *
 * Run with: npm run build:fixtures
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

/** Real pages weigh tens of kilobytes; the padding keeps size checks meaningful. */
const PAD = `<!-- ${"remplissage ".repeat(400)} -->`;

const BUBBLES = {
  "Dans la programmation générale": "bulle-green.png",
  "Dans les programmes spéciaux": "bulle-orange.png",
  "Hors classement": "bulle-grey.png",
};

/**
 * One result row.
 *
 * `song`, `artist` and `label` carry HTML as the site writes it, so a fixture can
 * hold the `<em>` the site puts around an alias.
 */
function row({
  index,
  songId,
  title,
  artistId,
  artist,
  programming = "Dans la programmation générale",
  thumb = true,
  songLink = true,
}) {
  const bubble = programming
    ? `<td class="category"><a href="/program/in_program/${songId}.html"><img src="/images/${BUBBLES[programming]}" alt="${programming}" title="${programming}" /></a></td>`
    : `<td class="category">&nbsp;</td>`;

  const vignette = thumb
    ? `<td class="vignette25">    <a href="/show-image.html?I=/images/pochettes/${songId}.jpg&amp;T=placeholder"><img src="/images/thumb25/${songId}.jpg" alt ="Vignette de placeholder" title="Cliquez pour agrandir" /></a>\n</td>`
    : `<td class="vignette25">&nbsp;</td>`;

  const titleCell = songLink
    ? `<td class="baseitem"><a href="/song/${songId}.html" title="Consulter la fiche de ${title}">${title}</a></td>`
    : `<td class="baseitem">${title}</td>`;

  return `<tr class=p${index % 2}>
${bubble}
${vignette}<td class="baseitem"><a href="/artist/${artistId}.html" title="Consulter la fiche de ${artist}">${artist}</a></td>
${titleCell}
</td></tr>`;
}

/** The pagination bar, absent when the results fit on one page. */
function pagebar({ active, pages, query, st }) {
  if (pages <= 1) {
    return "";
  }
  const link = (at, inner) =>
    `<td><a href="/recherche.html?st=${st}&amp;kw=${query}&amp;Page=${at}#resultat">${inner}</a></td>`;

  const cells = [];
  if (active > 1) {
    cells.push(link(active - 1, `<img src="/images/bt-previous.png" alt="&lsaquo;" />`));
  }
  for (let number = 1; number <= pages; number += 1) {
    cells.push(
      number === active ? `<td class="pageactive">${number}</td>` : link(number, String(number)),
    );
  }
  if (active < pages) {
    cells.push(link(active + 1, `<img src="/images/bt-next.png" alt="&rsaquo;" />`));
  }

  return `<tr class="entete"><td colspan="4"><span class="pagebar"><table class="navbar"><tr>${cells.join("\n")}\n</tr></table></span></td></tr>`;
}

/** The whole page, with the chrome the parser has to look past. */
function page(inner) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Recherche - Bide et Musique</title>
</head>
<body>
<div id="entete"><a href="/index.html">Accueil</a> | <a href="/forum.html">Forum</a></div>
<form method="get" action="recherche.html#resultat">
<select name="st" id="recherche">
<option value="1" >Interprète / Nom du morceau</option>
<option value="2" >Interprète</option>
<option value="3" selected="selected">Nom du morceau</option>
</select>
</form>

<div id="resultat">
${inner}
</div>

<div id="footer"><p>Bide &amp; Musique ©2026 - <a href="mailto:contact@example.invalid">contact</a></p></div>
${PAD}
</body>
</html>
`;
}

function resultsTable({ total, query, rows, active = 1, pages = 1, st = 3 }) {
  return page(`
    <table style="width: 100%;" class="bmtable small">
<tr class="normal titre"><td colspan="4" class="sstitre-programmation">Résultat de votre recherche (${total} pour « ${query} »)</td></tr>
${pagebar({ active, pages, query, st })}
${rows.join("\n")}
</table>
`);
}

const SONGS = [
  {
    songId: "1001",
    title: "La valse du photocopieur",
    artistId: "501",
    artist: "Les Bureaux Tristes",
    programming: "Dans la programmation générale",
  },
  {
    songId: "1002",
    title: "Mon tracteur me quitte",
    artistId: "502",
    artist: "Roger Placeholder",
    programming: "Dans les programmes spéciaux",
  },
  {
    songId: "1003",
    title: "Fondue partie",
    artistId: "503",
    artist: "Duo Fictif",
    programming: "Hors classement",
  },
];

const LAST_PAGE_SONGS = [
  {
    songId: "1004",
    title: "Le twist du plombier",
    artistId: "504",
    artist: "Les Siphons",
    programming: "Dans la programmation générale",
  },
  {
    songId: "1005",
    title: "Complainte du parking",
    artistId: "505",
    artist: "Nadine Inventée",
    programming: "Dans les programmes spéciaux",
  },
];

const fixtures = {
  // Three pages of results, sitting on the first.
  "search-page1.html": resultsTable({
    total: 42,
    query: "placeholder",
    pages: 3,
    active: 1,
    rows: SONGS.map((song, index) => row({ index, ...song })),
  }),

  // The last page: a previous link, no next one.
  "search-page3.html": resultsTable({
    total: 42,
    query: "placeholder",
    pages: 3,
    active: 3,
    rows: LAST_PAGE_SONGS.map((song, index) => row({ index, ...song })),
  }),

  // What the site serves for a page past the last one: the last page itself,
  // with no error and the bar still pointing at page 3.
  "search-beyond-last.html": resultsTable({
    total: 42,
    query: "placeholder",
    pages: 3,
    active: 3,
    rows: LAST_PAGE_SONGS.map((song, index) => row({ index, ...song })),
  }),

  // A single page: the site prints no pagination bar at all.
  "search-single-page.html": resultsTable({
    total: 2,
    query: "bino",
    rows: [
      row({
        index: 0,
        songId: "2001",
        title: "Le temps des placeholders",
        artistId: "601",
        artist: "Bino Placeholder et les gosses <em>(alias de Bino Placeholder)</em>",
      }),
      row({
        index: 1,
        songId: "2002",
        title: "Chanson sans alias",
        artistId: "602",
        artist: "Bino Placeholder",
        programming: "Dans les programmes spéciaux",
      }),
    ],
  }),

  // Accents, a non-breaking space and named entities, all in ISO-8859-1 bytes.
  "search-accents.html": resultsTable({
    total: 1,
    query: "dé à coudre",
    rows: [
      row({
        index: 0,
        songId: "3001",
        title: "Où est passé mon dé à coudre&nbsp;?",
        artistId: "701",
        artist: "Les Frères Ébène &amp; Cie",
      }),
    ],
  }),

  // A row with no sleeve thumbnail and no programming bubble.
  "search-bare-row.html": resultsTable({
    total: 1,
    query: "nu",
    rows: [
      row({
        index: 0,
        songId: "4001",
        title: "Morceau sans pochette",
        artistId: "801",
        artist: "Anonyme Placeholder",
        programming: null,
        thumb: false,
      }),
    ],
  }),

  // The middle row carries no link to a song, so it cannot be read.
  "search-broken-row.html": resultsTable({
    total: 3,
    query: "cassé",
    rows: [
      row({
        index: 0,
        songId: "5001",
        title: "Premier morceau",
        artistId: "901",
        artist: "Groupe Un",
      }),
      row({
        index: 1,
        songId: "5002",
        title: "Morceau illisible",
        artistId: "902",
        artist: "Groupe Deux",
        songLink: false,
      }),
      row({
        index: 2,
        songId: "5003",
        title: "Troisième morceau",
        artistId: "903",
        artist: "Groupe Trois",
      }),
    ],
  }),

  // The site states an absence.
  "search-empty.html": page(`
    <p>
        Il n'y a pas de résultat pour la recherche <em class="emph">«&nbsp;zzzqqxwv&nbsp;»</em>
    </p>
`),

  // The site refuses a search with nothing to search for.
  "search-no-query.html": page(`
    <p>
        Il faut rechercher quelque chose !
    </p>
`),

  // A results table announcing matches and holding no row.
  "search-table-no-rows.html": resultsTable({ total: 7, query: "vide", rows: [] }),

  // A page that carries no results block at all.
  "search-no-block.html": `<!DOCTYPE html><html><head><title>Bide et Musique</title></head>
<body><div id="entete">Accueil</div><p>Le site est en maintenance.</p>${PAD}</body></html>
`,
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, html] of Object.entries(fixtures)) {
  writeFileSync(join(OUT_DIR, name), Buffer.from(html, "latin1"));
}
process.stdout.write(`wrote ${Object.keys(fixtures).length} fixtures to ${OUT_DIR}\n`);
