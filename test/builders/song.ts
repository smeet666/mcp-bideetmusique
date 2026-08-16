/**
 * The markup Bide & Musique serves for one record, built rather than captured.
 *
 * It lives apart from any one test file because several suites need the same
 * page: a reader is only worth testing against the shape the site publishes,
 * and one copy of that shape keeps them from drifting apart.
 */

export const SONG_ID = "1734";
export const SONG_URL = `https://www.bide-et-musique.com/song/${SONG_ID}.html`;

/** The per-song audio endpoint. It sits in every page built here and must never
 * reach the answer, so any field quoting it fails a test rather than shipping. */
export const STREAM_PATH = `/stream_${SONG_ID}.php`;

/** A sentence of the lyrics block that is not a lyric: the rights notice the
 * site prints under the words. It stands in for the block's content, so an
 * output that swallowed the block shows up as this sentence escaping. */
export const RIGHTS_NOTICE =
  "Ces paroles sont publiées en attente d'une autorisation des ayants droit.";

export const LYRICS_HEADING = "Paroles";

/**
 * Lines invented for these tests, carrying what the markup has to survive: an
 * accent served as a byte, three entities, and a blank line between verses.
 */
export const DEFAULT_LYRICS = [
  "Le vent tourne sur la place déserte",
  "Et le c&oelig;ur du carrousel s&rsquo;arrête",
  "",
  "Où vas-tu&nbsp;? demande la nuit",
];

/** The same lines as the answer should carry them. */
export const DEFAULT_LYRICS_TEXT = [
  "Le vent tourne sur la place déserte",
  "Et le cœur du carrousel s’arrête",
  "",
  "Où vas-tu ? demande la nuit",
].join("\n");

// ---------------------------------------------------------------------------
// The markup the site serves, as far as the contract describes it.
// ---------------------------------------------------------------------------

export interface Comments {
  count: number;
  archived?: number | null;
}

export interface LyricsBlock {
  transcriber?: string | null;
  rightsNotice?: boolean;
  /** The lines inside the cell. An empty array prints a cell holding nothing. */
  lines?: string[];
  /**
   * Close the cell with `</tr>` alone, which the site does on the records it
   * credits no transcriber for.
   */
  unterminated?: boolean;
}

export interface RecordOptions {
  id?: string;
  artistId?: string;
  artist?: string;
  title?: string;
  /** Replaces the whole heading paragraph; `null` removes it. */
  heading?: string | null;
  writers?: string[];
  duration?: string | null;
  year?: string | null;
  labels?: string[];
  reference?: string | null;
  presentation?: string | null;
  sleeveCredits?: string[];
  performer?: string | null;
  addedOn?: string | null;
  seeAlso?: Array<{ id: string; name: string }>;
  top50?: string | null;
  favourites?: number | null;
  comments?: Comments | null;
  sleeve?: boolean;
  lyrics?: LyricsBlock | null;
  audio?: boolean;
}

function anchor(href: string, text: string): string {
  return `<a href="${href}">${text}</a>`;
}

function field(label: string, value: string): string {
  return `<tr><td class="informations">${label} : <span class="txtred2">${value}</span></td></tr>`;
}

/**
 * The rows the site prints under a record that carries lyrics.
 *
 * The cell is closed by `</td>` when a transcriber is credited and by `</tr>`
 * alone when none is, so both endings are built here: a reader that waits for
 * `</td>` runs past the cell on the second and swallows the rows below it.
 */
function lyricsRows(lyrics: LyricsBlock): string {
  const lines = lyrics.lines ?? DEFAULT_LYRICS;
  const credit = lyrics.transcriber
    ? `\t\t    <br/><br/> Transcripteur : <span class="txtred">${lyrics.transcriber} </span>`
    : "";
  const body = lines.map((line) => `${line}<br />\r`).join("\n");
  const cell = `<td class="paroles" colspan="2">\n                   ${body}${credit}`;
  const notice =
    lyrics.rightsNotice === false
      ? ""
      : `<tr>\n<td class="autorisation" colspan="2">${RIGHTS_NOTICE}</td>\n</tr>`;

  return `<table class="bmtable">
<tr>
<td colspan="2" bgcolor="#ffd8c7"><p style="margin:4px 0 0 20px;float:left; font: bold 14px Verdana, Arial, Helvetica, sans-serif;">${LYRICS_HEADING}</p></td>
</tr>
<tr>
${cell}${lyrics.unterminated ? "" : "</td>"}
</tr>
${notice}
</table>`;
}

/**
 * A record page. Every optional field is left out when its option is `null` or
 * an empty array, which is how the site prints a record it knows less about.
 *
 * The contract fixes the markup of the heading, the `informations` cells, the
 * `songinfos` block and the sleeve. It fixes none for the favourite count, the
 * comment count or the lyrics block, so those three are reconstructed from the
 * wording it quotes. A test that fails only on one of them is a disagreement
 * about where the value sits on the page, and the page is what settles it.
 */
export function recordPage(options: RecordOptions = {}): string {
  const {
    id = SONG_ID,
    artistId = "8842",
    artist = "Les Vaillants du Dimanche",
    title = "Le Petit Bal des Ampoules",
    writers = ["Odette Vanderplaen", "Régis Bouchonnet"],
    duration = "4 m 16 s",
    year = "1978",
    labels = ["Disques Bouton d'Or"],
    reference = "BO 45-118",
    presentation = null,
    sleeveCredits = [],
    performer = null,
    addedOn = "21/01/2002",
    seeAlso = [],
    top50 = null,
    favourites = null,
    comments = null,
    sleeve = true,
    lyrics = null,
    audio = true,
  } = options;

  // The artist link carries markup inside its title attribute, so an opening
  // tag here does not end at the first `>`.
  const headingParagraph =
    options.heading === null
      ? ""
      : (options.heading ??
        `<p class="titrerosebg"><a href="/artist/${artistId}.html" title="Consulter la fiche de <b>${artist}</b>">${artist}</a> - ${title}</p>`);

  const rows: string[] = [];
  if (performer) rows.push(field("Interprète", anchor("/artist/9001.html", performer)));
  if (writers.length > 0) {
    rows.push(
      field(
        "Auteurs compositeurs",
        writers.map((name, index) => anchor(`/auteur/${400 + index}.html`, name)).join(" - "),
      ),
    );
  }
  if (year) rows.push(field("Année", anchor(`/annee/${year}.html`, year)));
  if (duration) rows.push(field("Durée", duration));
  if (labels.length > 0) {
    rows.push(
      field(
        "Label",
        labels.map((name, index) => anchor(`/label/${700 + index}.html`, name)).join(" - "),
      ),
    );
  }
  if (reference) rows.push(field("Référence", reference));
  if (presentation) rows.push(field("Présentation", presentation));
  if (sleeveCredits.length > 0) {
    rows.push(
      field(
        "Pochette",
        sleeveCredits
          .map((name, index) => anchor(`/pochette/${900 + index}.html`, name))
          .join(" - "),
      ),
    );
  }

  const infos: string[] = [];
  if (addedOn) infos.push(`<p>Ajouté le ${addedOn}</p>`);
  if (seeAlso.length > 0) {
    infos.push(
      `<p>Voir aussi : ${seeAlso
        .map((entry) => anchor(`/artist/${entry.id}.html`, entry.name))
        .join(", ")}</p>`,
    );
  }
  if (top50) infos.push(`<p>Au TOP 50 de B&amp;M : ${top50}</p>`);
  if (favourites !== null && favourites !== undefined) {
    infos.push(
      `<p class="favoris">Cette chanson est dans les favoris de ${anchor(
        `/song/${id}/fans.html`,
        String(favourites),
      )} personnes</p>`,
    );
  }
  if (comments) {
    const archived =
      comments.archived === null || comments.archived === undefined
        ? ""
        : `, dont ${comments.archived} archivé${comments.archived > 1 ? "s" : ""}`;
    infos.push(
      `<p class="commentaires">${anchor(`/song/${id}/commentaires.html`, `${comments.count} commentaire${comments.count > 1 ? "s" : ""}`)}${archived}</p>`,
    );
  }

  const pochette = sleeve
    ? `<div class="pochette-fiche"><a href="/show-image.html?I=/images/pochettes/${id}.jpg&amp;T=pochette"><img src="/images/thumb200/${id}.jpg" alt="Pochette" /></a></div>`
    : "";

  const player = audio
    ? `<audio controls preload="none"><source src="${STREAM_PATH}" type="audio/mpeg" />Votre navigateur ne lit pas l'audio.</audio>`
    : "";

  const lyricsBlock = lyrics ? lyricsRows(lyrics) : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>${title} - Bide et Musique</title>
</head>
<body>
<div id="entete"><a href="/index.html">Accueil</a></div>
<div id="principal">
${headingParagraph}
${pochette}
${player}
<table class="bmtable">
${rows.join("\n")}
</table>
<div id="songinfos">
<p class="titrebleubg">Plus d'infos</p>
${infos.join("\n")}
</div>
${lyricsBlock}
</div>
<div id="footer"><p>Bide &amp; Musique</p></div>
</body>
</html>
`;
}
