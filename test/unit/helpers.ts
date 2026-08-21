/**
 * Shared plumbing for the unit tests.
 *
 * Fixtures live on disk as ISO-8859-1 bytes, which is what the site serves.
 * They are read as a Buffer and decoded through the production decoder, so a
 * decoder that ignores the declared charset shows up as a failing test rather
 * than as a fixture that was already UTF-8.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { createServer } from "../../src/server.js";
import { decodeHtml } from "../../src/bideetmusique/html.js";
import { loadConfig } from "../../src/config.js";
import { BideEtMusiqueError } from "../../src/errors.js";
import type { ToolResult } from "../../src/tools/shared.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export const ISO_CONTENT_TYPE = "text/html; charset=ISO-8859-1";

export function fixtureBytes(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

/** The fixture as the parser sees it: bytes decoded with the served charset. */
export function fixtureHtml(name: string): string {
  return decodeHtml(fixtureBytes(name), ISO_CONTENT_TYPE);
}

/** Markup a test builds inline, encoded the way the site would serve it. */
export function bytesOf(html: string): Buffer {
  return Buffer.from(html, "latin1");
}

export function htmlResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": ISO_CONTENT_TYPE },
  });
}

/** A fetch that fails the test if anything reaches it. */
export const throwingFetch: typeof fetch = () => {
  throw new Error("the network was contacted, and this path must refuse before any request");
};

export function clientServingBytes(bytes: Uint8Array): BideEtMusiqueClient {
  return new BideEtMusiqueClient({
    config: loadConfig({}),
    fetchImpl: async () => htmlResponse(bytes),
  });
}

export function clientServingFixture(name: string): BideEtMusiqueClient {
  return clientServingBytes(fixtureBytes(name));
}

export function clientServingHtml(html: string): BideEtMusiqueClient {
  return clientServingBytes(bytesOf(html));
}

/** A client that cannot reach anything: proves a refusal happened first. */
export function refusingClient(): BideEtMusiqueClient {
  return new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl: throwingFetch });
}

export interface StructuredSearch {
  query: string;
  search_type: string;
  page_requested: number;
  page_served: number | null;
  page_count: number | null;
  has_more_pages: boolean | null;
  total_matches: number | null;
  results: Array<{
    song_id: string;
    title: string;
    url: string;
    artist: { id: string; name: string; alias_of: string | null; url: string };
    image_url: string | null;
    programming: string | null;
  }>;
  result_count: number;
  rows_on_page: number;
  source: string;
  notes: string[];
}

export function structured(result: ToolResult): StructuredSearch {
  if (!result.structuredContent) {
    throw new Error("the tool returned no structuredContent");
  }
  return result.structuredContent as unknown as StructuredSearch;
}

export function textOfResult(result: ToolResult): string {
  return result.content.map((block) => block.text).join("\n");
}

/**
 * A failure, however the layer chose to express it: a thrown
 * BideEtMusiqueError or a ToolResult carrying `isError`. Both are contractual;
 * an empty successful result is not.
 */
export async function failureOf(run: Promise<ToolResult>): Promise<{ code: string; text: string }> {
  let result: ToolResult;
  try {
    result = await run;
  } catch (error) {
    if (error instanceof BideEtMusiqueError) {
      return { code: error.code, text: error.message };
    }
    throw error;
  }
  if (!result.isError) {
    throw new Error(`expected a failure, got a result: ${textOfResult(result).slice(0, 200)}`);
  }
  const text = textOfResult(result);
  const match = /\[([a-z_]+)\]/.exec(text);
  return { code: match?.[1] ?? "", text };
}

/** The code carried by a thrown BideEtMusiqueError, for the parser tests. */
export function codeOfThrown(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof BideEtMusiqueError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected a BideEtMusiqueError, nothing was thrown");
}

/** Builders mirroring the markup the site serves, for cases no fixture covers. */
export function resultRow(options: {
  index?: number;
  songId: string;
  title: string;
  artistId: string;
  artist: string;
  programming?: string | null;
  thumb?: boolean;
  songLink?: boolean;
}): string {
  const {
    index = 0,
    songId,
    title,
    artistId,
    artist,
    programming = "Dans la programmation générale",
    thumb = true,
    songLink = true,
  } = options;

  const bubble = programming
    ? `<td class="category"><a href="/program/in_program/${songId}.html"><img src="/images/bulle-green.png" alt="${programming}" title="${programming}" /></a></td>`
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

export function resultsPage(options: { header?: string | null; rows: string[] }): string {
  const header =
    options.header === null
      ? ""
      : `<tr class="normal titre"><td colspan="4" class="sstitre-programmation">${
          options.header ?? "Résultat de votre recherche (1 pour « placeholder »)"
        }</td></tr>`;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Recherche - Bide et Musique</title>
</head>
<body>
<div id="entete"><a href="/index.html">Accueil</a></div>
<div id="resultat">
    <table style="width: 100%;" class="bmtable small">
${header}
${options.rows.join("\n")}
</table>
</div>
<div id="footer"><p>Bide &amp; Musique</p></div>
</body>
</html>
`;
}

export const SEARCH_URL = "https://www.bide-et-musique.com/recherche.html?kw=placeholder&st=3";

/** A server talking to an in-memory client, with the network stubbed out. */
export async function connectServer(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer({ config: loadConfig({}), fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-bideetmusique-tests", version: "0.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return client;
}
