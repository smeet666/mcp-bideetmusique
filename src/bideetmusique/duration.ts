/**
 * Reading a duration the way the site writes it.
 *
 * A record states its length three ways: hours, minutes and seconds, minutes
 * and seconds, or a single unit on its own. Those are different claims. A
 * record saying "3 m" never stated the seconds, and turning it into 180 without
 * saying so hands a caller a precision the site does not have. So the smallest
 * unit actually stated travels with the number.
 */

/** The finest unit the line actually wrote, which is what its figures are held to. */
function finestUnitWritten(minutes: number | null, seconds: number | null): DurationPrecision {
  if (seconds !== null) {
    return "second";
  }
  if (minutes !== null) {
    return "minute";
  }
  return "hour";
}

export type DurationPrecision = "second" | "minute" | "hour";

export interface Duration {
  /** The value exactly as the site published it. */
  text: string;
  /** Total seconds, or null when nothing could be read. */
  seconds: number | null;
  /** The smallest unit the site stated, null when nothing was readable. */
  precision: DurationPrecision | null;
}

/**
 * A number followed by its unit.
 *
 * The separator is optional, since the site writes both "4 m 16 s" and, on
 * occasion, "4m16s", and a non-breaking space counts as a space. The unit letter
 * must not open a word: without that guard, "1986 sortie originale" would read
 * its 's' as seconds. A digit after the letter is what "4m16s" is made of, so
 * only a following letter disqualifies it.
 */
const PART = /(\d+)\s*([hms])(?![a-z])/gi;

const UNREADABLE: Omit<Duration, "text"> = { seconds: null, precision: null };

export function parseDuration(raw: string | null | undefined): Duration {
  const text = raw ?? "";
  const normalised = text.replace(/ /g, " ").toLowerCase();

  let hours: number | null = null;
  let minutes: number | null = null;
  let seconds: number | null = null;

  PART.lastIndex = 0;
  for (let match = PART.exec(normalised); match !== null; match = PART.exec(normalised)) {
    const value = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(value)) {
      continue;
    }
    // The first statement of a unit wins: a value repeated later in the line
    // belongs to something else, and overwriting would silently prefer it.
    if (match[2] === "h" && hours === null) {
      hours = value;
    }
    if (match[2] === "m" && minutes === null) {
      minutes = value;
    }
    if (match[2] === "s" && seconds === null) {
      seconds = value;
    }
  }

  if (hours === null && minutes === null && seconds === null) {
    return { text, ...UNREADABLE };
  }

  // Values are taken as written. "2 m 90 s" is 210 seconds: the site published
  // that, and correcting it would report a length no record states.
  const total = (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
  const precision: DurationPrecision = finestUnitWritten(minutes, seconds);

  // Past what a number counts exactly, the arithmetic stops meaning the figures
  // the page printed. The line is repeated as published and the seconds are
  // left unstated rather than approximated.
  if (!Number.isSafeInteger(total)) {
    return { text, ...UNREADABLE };
  }

  return { text, seconds: total, precision };
}
