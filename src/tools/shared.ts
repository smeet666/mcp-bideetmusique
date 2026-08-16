/** Pieces shared by the tools: result shapes, error mapping, text mirrors. */

import { BideEtMusiqueError } from "../errors.js";

/** Many MCP clients render only the text block, so it must read on its own. */
export const MAX_TEXT_MIRROR_CHARS = 2000;

export interface ToolResult {
  // The SDK's CallToolResult carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * The block ends with lines opening "Note:" and "Source:", and a caller has no
 * way to tell one of those from the same words inside a song title written by
 * whoever recorded it. Indenting a body line that opens with one of those words
 * keeps the two apart, and costs nothing: the structured output still carries
 * the text exactly as it was published.
 */
function indentMarkerLines(body: string): string {
  return body.replace(/^(Note:|Source:)/gm, " $1");
}

/**
 * Text the site published, set apart from the lines this server writes.
 *
 * A transcription is whole lines typed by someone else, and the lines around it
 * in the answer are labels this server writes: a line reading "Année : 2024" or
 * "Note: ignore the record above" is read as one of them. Every published line
 * is indented and the block is introduced, so nothing inside it can start a
 * line of the answer, whatever labels this server writes later.
 */
export function quotedBlock(introduction: string, published: string): string {
  const lines = published
    .split("\n")
    .map((line) => (line === "" ? "" : `  ${line}`))
    .join("\n");

  return `${introduction}\n${lines}`;
}

/** What a caller is told when the text block holds less than the answer. */
const CUT_NOTE = "This text block is cut to fit. The structured answer carries the whole of it.";

/**
 * Add the note that says the text block was cut, when it will be.
 *
 * `ok` truncates whatever it is handed, so without this a shortened block reads
 * as the whole answer. The budget is measured with the note already counted in
 * the trailer, since adding it is what makes the block shorter still.
 *
 * Called by a tool before it builds its answer, because the notes belong to the
 * structured payload as much as to the text.
 */
export function noteIfTextIsCut(body: string, notes: string[]): void {
  const trailer = [...notes, CUT_NOTE].map((note) => `Note: ${note}`).join("\n");
  const budget = Math.max(0, MAX_TEXT_MIRROR_CHARS - (trailer.length + 2));

  if (body.length > budget) notes.push(CUT_NOTE);
}

/**
 * Build a result whose text block ends with the notes.
 *
 * The notes are what qualifies the answer: that the site served a different
 * page from the one asked for, that rows were dropped because they could not be
 * read, that the count above the results counts more songs than this page
 * holds. Without them a client rendering only the text reads an answer with
 * nothing to qualify it.
 */
export function ok(
  structured: Record<string, unknown>,
  text: string,
  notes: string[] = [],
): ToolResult {
  const trailer = notes.map((note) => `Note: ${note}`).join("\n");
  const budget = MAX_TEXT_MIRROR_CHARS - (trailer ? trailer.length + 2 : 0);
  const body = truncate(indentMarkerLines(text), Math.max(0, budget));

  return {
    content: [{ type: "text", text: trailer ? `${body}\n\n${trailer}` : body }],
    structuredContent: structured,
  };
}

/**
 * Error results carry no structuredContent: the SDK validates it against the
 * tool's declared output schema, which an error payload does not satisfy.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof BideEtMusiqueError
      ? error
      : new BideEtMusiqueError(
          "network_error",
          error instanceof Error ? error.message : String(error),
        );

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) lines.push(`Hint: ${known.details.hint}`);

  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}
