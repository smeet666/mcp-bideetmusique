/**
 * The six search axes taken two at a time.
 *
 * `search_songs` asks along one axis at a time, so a caller with two criteria
 * makes two calls. What matters then is that the two calls never contaminate
 * each other: two questions, two answers, two labels, and a cache that keeps
 * them apart. The fifteen unordered pairs are generated from the list of axes,
 * and every rule that a cache or a limiter could make order-dependent is
 * checked in both directions.
 *
 * Nothing here reaches the network. The fetch stub answers according to the
 * `st` it is given, so each axis is served its own page, and it records every
 * address it was asked for. Time runs on a fixed epoch through fake timers,
 * because the client paces its requests and a test that waited on the real
 * clock would take minutes and prove nothing more.
 *
 * Songs, performers and labels are invented. The lyrics axis is about which
 * song matched, and no song's words appear anywhere in this file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BideEtMusiqueClient } from "../../src/bideetmusique/client.js";
import { SEARCH_TYPE_LABELS, type SearchType } from "../../src/bideetmusique/urls.js";
import { loadConfig } from "../../src/config.js";
import { runSearchSongs } from "../../src/tools/searchSongs.js";
import type { ToolResult } from "../../src/tools/shared.js";

import {
  ISO_CONTENT_TYPE,
  bytesOf,
  failureOf,
  htmlResponse,
  resultRow,
  resultsPage,
  structured,
  textOfResult,
} from "./helpers.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

/** The axes and the code each one puts in `st`, as the contract states them. */
const AXIS_CODES: Record<SearchType, number> = {
  performer: 2,
  title: 3,
  writer: 4,
  lyrics: 6,
  label: 5,
  year: 7,
};

const AXES = Object.keys(AXIS_CODES) as SearchType[];

/** The one query that is valid on all six axes, the year axis included. */
const QUERY = "1983";

/** A query the year axis has to refuse, and the five others have to search. */
const NOT_A_YEAR = "printemps";

type Pair = [SearchType, SearchType];

/** The fifteen unordered pairs, generated so a seventh axis widens the sweep. */
function unorderedPairs(axes: SearchType[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < axes.length; i += 1) {
    for (let j = i + 1; j < axes.length; j += 1) {
      pairs.push([axes[i]!, axes[j]!]);
    }
  }
  return pairs;
}

/** The same pairs in both directions: the second call is not the first. */
function orderedPairs(axes: SearchType[]): Pair[] {
  return unorderedPairs(axes).flatMap(([one, other]): Pair[] => [
    [one, other],
    [other, one],
  ]);
}

const PAIRS = unorderedPairs(AXES);
const ORDERED = orderedPairs(AXES);
const PAIRS_WITH_YEAR = PAIRS.filter((pair) => pair.includes("year"));

/** One invented record per axis, so a row can only come from its own page. */
const RECORD: Record<
  SearchType,
  { songId: string; title: string; artistId: string; artist: string }
> = {
  performer: {
    songId: "9102",
    title: "Le mambo du photocopieur",
    artistId: "912",
    artist: "Les Cousins Bakélite",
  },
  title: {
    songId: "9103",
    title: "Cha-cha de la cabine téléphonique",
    artistId: "913",
    artist: "Orchestre Pamplemousse",
  },
  writer: {
    songId: "9104",
    title: "La java du garde-barrière",
    artistId: "914",
    artist: "Les Frères Zinzolin",
  },
  lyrics: {
    songId: "9106",
    title: "Le slow du distributeur",
    artistId: "916",
    artist: "Colette Fictive",
  },
  label: {
    songId: "9105",
    title: "La rumba de l'ascenseur",
    artistId: "915",
    artist: "Duo Farandole",
  },
  year: {
    songId: "9107",
    title: "Le twist du calendrier",
    artistId: "917",
    artist: "Les Éphémérides",
  },
};

/** A total per axis, distinct, so a mixed-up count names the axis it came from. */
function totalFor(axis: SearchType): number {
  return 400 + AXIS_CODES[axis];
}

function pageFor(axis: SearchType, query = QUERY): string {
  return resultsPage({
    header: `Résultat de votre recherche (${totalFor(axis)} pour « ${query} »)`,
    rows: [resultRow({ index: 0, ...RECORD[axis] })],
  });
}

const NO_RESULTS_HTML = `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Recherche - Bide et Musique</title></head><body>
<div id="resultat">
    <p>Il n'y a pas de résultat pour la recherche <em class="emph">«&nbsp;${QUERY}&nbsp;»</em></p>
</div>
</body></html>
`;

type Answer = { kind: "html"; html: string } | { kind: "status"; status: number };

const rows = (axis: SearchType, query = QUERY): Answer => ({
  kind: "html",
  html: pageFor(axis, query),
});
const nothing = (): Answer => ({ kind: "html", html: NO_RESULTS_HTML });
const serverError = (): Answer => ({ kind: "status", status: 500 });

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return (input as Request).url;
}

/** Which axis an address asks along, read from the `st` the client wrote. */
function axisOfUrl(url: string): SearchType {
  const st = new URL(url).searchParams.get("st");
  const axis = AXES.find((candidate) => String(AXIS_CODES[candidate]) === st);
  if (!axis) {
    throw new Error(`no axis carries st=${st}: ${url}`);
  }
  return axis;
}

interface Stub {
  urls: string[];
  fetchImpl: typeof fetch;
}

/** A fetch answering per axis, recording every address it was asked for. */
function servingPerAxis(answers: Partial<Record<SearchType, Answer>>): Stub {
  const urls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = urlOf(input);
    urls.push(url);
    const answer = answers[axisOfUrl(url)];
    if (!answer) {
      throw new Error(`the stub holds no page for this axis: ${url}`);
    }
    if (answer.kind === "status") {
      return new Response("", {
        status: answer.status,
        headers: { "content-type": ISO_CONTENT_TYPE },
      });
    }
    return htmlResponse(bytesOf(answer.html));
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

/** Every axis served the page that belongs to it. */
function pagesForAll(query = QUERY): Partial<Record<SearchType, Answer>> {
  return Object.fromEntries(AXES.map((axis) => [axis, rows(axis, query)]));
}

function urlsOn(stub: Stub, axis: SearchType): string[] {
  return stub.urls.filter((url) => axisOfUrl(url) === axis);
}

function clientOver(fetchImpl: typeof fetch): BideEtMusiqueClient {
  return new BideEtMusiqueClient({ config: loadConfig({}), fetchImpl });
}

/**
 * Lets the paced client reach its request and answer, without any wall clock:
 * the promise is created first, the fake clock is then wound forward past the
 * interval and any backoff, and the settled promise is returned.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(120_000);
  return promise;
}

interface SearchArguments {
  query: string;
  search_type: SearchType;
  page?: number;
  limit?: number;
}

function search(client: BideEtMusiqueClient, args: SearchArguments): Promise<ToolResult> {
  return runSearchSongs(client, { page: 1, limit: 20, ...args } as never);
}

/** One search on one axis, through a client the caller keeps between calls. */
function call(client: BideEtMusiqueClient, axis: SearchType, query = QUERY): Promise<ToolResult> {
  return settle(search(client, { query, search_type: axis }));
}

const CACHE_NOTE = /cache|mise en cache|antémémoire/i;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EPOCH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the fifteen pairs themselves", () => {
  it("holds every unordered pair of the six axes, once each, and both directions", () => {
    expect(AXES).toHaveLength(6);
    expect(PAIRS).toHaveLength(15);
    expect(ORDERED).toHaveLength(30);
    expect(new Set(PAIRS.map((pair) => [...pair].sort().join("+"))).size).toBe(15);
    expect(PAIRS_WITH_YEAR).toHaveLength(5);
  });
});

describe("rule 1 — a pair asks two different questions", () => {
  it("builds two addresses differing in st and in nothing else, for every pair", async () => {
    for (const [one, other] of PAIRS) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      await call(client, one);
      await call(client, other);

      const first = new URL(urlsOn(stub, one)[0]!);
      const second = new URL(urlsOn(stub, other)[0]!);
      const label = `${one}/${other}`;

      expect(first.origin + first.pathname, label).toBe(second.origin + second.pathname);
      expect(first.searchParams.get("st"), label).toBe(String(AXIS_CODES[one]));
      expect(second.searchParams.get("st"), label).toBe(String(AXIS_CODES[other]));
      expect(first.searchParams.get("st"), label).not.toBe(second.searchParams.get("st"));

      const withoutSt = (url: URL): string => {
        const params = new URLSearchParams(url.searchParams);
        params.delete("st");
        params.sort();
        return params.toString();
      };
      expect(withoutSt(first), label).toBe(withoutSt(second));
    }
  });
});

describe("rule 2 — a pair names itself", () => {
  it("carries two different search_type values and two different French labels", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = await call(client, one);
      const second = await call(client, other);
      const label = `${one} then ${other}`;

      expect(structured(first).search_type, label).toBe(one);
      expect(structured(second).search_type, label).toBe(other);
      expect(SEARCH_TYPE_LABELS[one], label).not.toBe(SEARCH_TYPE_LABELS[other]);
      expect(textOfResult(first), label).toContain(SEARCH_TYPE_LABELS[one]);
      expect(textOfResult(second), label).toContain(SEARCH_TYPE_LABELS[other]);
    }
  });

  it("never lets an answer carry the label of the other axis of the pair", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = await call(client, one);
      const second = await call(client, other);

      expect(textOfResult(first), `${one} must not claim ${other}`).not.toContain(
        SEARCH_TYPE_LABELS[other],
      );
      expect(textOfResult(second), `${other} must not claim ${one}`).not.toContain(
        SEARCH_TYPE_LABELS[one],
      );
    }
  });
});

describe("rule 3 — nothing is merged", () => {
  it("gives each answer exactly the rows the site served for its own axis", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = structured(await call(client, one));
      const second = structured(await call(client, other));
      const label = `${one} then ${other}`;

      expect(
        first.results.map((row) => row.song_id),
        label,
      ).toEqual([RECORD[one].songId]);
      expect(
        second.results.map((row) => row.song_id),
        label,
      ).toEqual([RECORD[other].songId]);
      expect(first.results[0]!.title, label).toBe(RECORD[one].title);
      expect(second.results[0]!.title, label).toBe(RECORD[other].title);
    }
  });

  it("keeps each total_matches on its own axis", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = structured(await call(client, one));
      const second = structured(await call(client, other));
      const label = `${one} then ${other}`;

      expect(first.total_matches, label).toBe(totalFor(one));
      expect(second.total_matches, label).toBe(totalFor(other));
      expect(first.result_count, label).toBe(1);
      expect(second.result_count, label).toBe(1);
    }
  });
});

describe("rule 4 — the cache does not cross axes", () => {
  it("reaches the site twice, on two different addresses, for the two axes of a pair", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      await call(client, one);
      await call(client, other);
      const label = `${one} then ${other}`;

      expect(stub.urls, label).toHaveLength(2);
      expect(new Set(stub.urls).size, label).toBe(2);
      expect(axisOfUrl(stub.urls[0]!), label).toBe(one);
      expect(axisOfUrl(stub.urls[1]!), label).toBe(other);
    }
  });

  it("serves the second axis its own page rather than the first answer again", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = structured(await call(client, one));
      const second = structured(await call(client, other));
      const label = `${one} then ${other}`;

      expect(second.search_type, label).toBe(other);
      expect(
        second.results.map((row) => row.song_id),
        label,
      ).toEqual([RECORD[other].songId]);
      expect(second.total_matches, label).toBe(totalFor(other));
      expect(second.results[0]!.song_id, label).not.toBe(first.results[0]!.song_id);
      expect(second.total_matches, label).not.toBe(first.total_matches);
    }
  });

  it("marks neither read as cached when the two axes of a pair are asked in turn", async () => {
    for (const [one, other] of ORDERED) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = await settle(client.search({ query: QUERY, searchType: one }));
      const second = await settle(client.search({ query: QUERY, searchType: other }));
      const label = `${one} then ${other}`;

      expect(first.cached, label).toBe(false);
      expect(second.cached, label).toBe(false);
      expect(stub.urls, label).toHaveLength(2);
    }
  });
});

describe("rule 5 — the cache still works within one axis", () => {
  it("reaches the site once for two identical calls on the same axis", async () => {
    for (const axis of AXES) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = structured(await call(client, axis));
      const second = structured(await call(client, axis));

      expect(stub.urls, axis).toHaveLength(1);
      expect(
        second.results.map((row) => row.song_id),
        axis,
      ).toEqual(first.results.map((row) => row.song_id));
      expect(second.total_matches, axis).toBe(first.total_matches);
    }
  });

  it("says in the answer that the second call came from the cache", async () => {
    for (const axis of AXES) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      await call(client, axis);
      const second = structured(await call(client, axis));

      expect(
        second.notes.some((note) => CACHE_NOTE.test(note)),
        axis,
      ).toBe(true);
    }
  });

  it("marks the second read as cached and the first as fresh, on every axis", async () => {
    for (const axis of AXES) {
      const stub = servingPerAxis(pagesForAll());
      const client = clientOver(stub.fetchImpl);
      const first = await settle(client.search({ query: QUERY, searchType: axis }));
      const second = await settle(client.search({ query: QUERY, searchType: axis }));

      expect(first.cached, axis).toBe(false);
      expect(second.cached, axis).toBe(true);
      expect(stub.urls, axis).toHaveLength(1);
    }
  });
});

describe("rule 6 — a refusal on one axis says nothing about another", () => {
  it("refuses a query that is not four digits on the year axis, without reaching the site", async () => {
    for (const [one, other] of PAIRS_WITH_YEAR) {
      const partner = one === "year" ? other : one;
      const stub = servingPerAxis(pagesForAll(NOT_A_YEAR));
      const client = clientOver(stub.fetchImpl);

      const refusal = await settle(
        failureOf(search(client, { query: NOT_A_YEAR, search_type: "year" })),
      );

      expect(refusal.code, `year with ${partner}`).toBe("invalid_input");
      expect(urlsOn(stub, "year"), `year with ${partner}`).toHaveLength(0);
    }
  });

  it("leaves the other axis of the pair an ordinary search, before and after the refusal", async () => {
    for (const [one, other] of PAIRS_WITH_YEAR) {
      const partner = one === "year" ? other : one;

      const afterRefusal = servingPerAxis(pagesForAll(NOT_A_YEAR));
      const clientAfter = clientOver(afterRefusal.fetchImpl);
      await settle(failureOf(search(clientAfter, { query: NOT_A_YEAR, search_type: "year" })));
      const following = structured(await call(clientAfter, partner, NOT_A_YEAR));

      expect(following.search_type, `${partner} after the refusal`).toBe(partner);
      expect(
        following.results.map((row) => row.song_id),
        `${partner} after the refusal`,
      ).toEqual([RECORD[partner].songId]);
      expect(following.total_matches, `${partner} after the refusal`).toBe(totalFor(partner));

      const beforeRefusal = servingPerAxis(pagesForAll(NOT_A_YEAR));
      const clientBefore = clientOver(beforeRefusal.fetchImpl);
      const preceding = structured(await call(clientBefore, partner, NOT_A_YEAR));
      const refusal = await settle(
        failureOf(search(clientBefore, { query: NOT_A_YEAR, search_type: "year" })),
      );

      expect(preceding.results, `${partner} before the refusal`).toHaveLength(1);
      expect(refusal.code, `year after ${partner}`).toBe("invalid_input");
      expect(urlsOn(beforeRefusal, "year"), `year after ${partner}`).toHaveLength(0);
    }
  });
});

describe("rule 7 — an absence on one axis is not an absence on another", () => {
  it("gives the empty axis a zero and a note, and the other axis its rows", async () => {
    for (const [empty, full] of ORDERED) {
      const stub = servingPerAxis({ [empty]: nothing(), [full]: rows(full) });
      const client = clientOver(stub.fetchImpl);
      const nothingFound = structured(await call(client, empty));
      const found = structured(await call(client, full));
      const label = `${empty} empty, ${full} full`;

      expect(nothingFound.total_matches, label).toBe(0);
      expect(nothingFound.results, label).toHaveLength(0);
      expect(
        nothingFound.notes.some((note) =>
          /aucun|pas de r|nothing|no (result|match|song)/i.test(note),
        ),
        label,
      ).toBe(true);

      expect(
        found.results.map((row) => row.song_id),
        label,
      ).toEqual([RECORD[full].songId]);
      expect(found.total_matches, label).toBe(totalFor(full));
    }
  });

  it("lets neither answer claim anything about the other axis", async () => {
    for (const [empty, full] of ORDERED) {
      const stub = servingPerAxis({ [empty]: nothing(), [full]: rows(full) });
      const client = clientOver(stub.fetchImpl);
      const nothingFound = await call(client, empty);
      const found = await call(client, full);

      expect(textOfResult(nothingFound), `${empty} must not claim ${full}`).not.toContain(
        SEARCH_TYPE_LABELS[full],
      );
      expect(textOfResult(found), `${full} must not claim ${empty}`).not.toContain(
        SEARCH_TYPE_LABELS[empty],
      );
      expect(
        structured(found).notes.some((note) =>
          /aucun|pas de r|nothing|no (result|match|song)/i.test(note),
        ),
        `${full} must not carry the absence of ${empty}`,
      ).toBe(false);
    }
  });
});

describe("rule 8 — a failure on one axis does not poison the pair", () => {
  it("answers the other axis normally after the first call failed", async () => {
    for (const [broken, sound] of ORDERED) {
      const stub = servingPerAxis({ [broken]: serverError(), [sound]: rows(sound) });
      const client = clientOver(stub.fetchImpl);
      const label = `${broken} broken, ${sound} sound`;

      const failure = await settle(
        failureOf(search(client, { query: QUERY, search_type: broken })),
      );
      expect(failure.code, label).not.toBe("");

      const answer = structured(await call(client, sound));
      expect(answer.search_type, label).toBe(sound);
      expect(
        answer.results.map((row) => row.song_id),
        label,
      ).toEqual([RECORD[sound].songId]);
      expect(answer.total_matches, label).toBe(totalFor(sound));
    }
  });

  it("never caches the failure: the broken axis is asked again on the next call", async () => {
    for (const [broken, sound] of ORDERED) {
      const stub = servingPerAxis({ [broken]: serverError(), [sound]: rows(sound) });
      const client = clientOver(stub.fetchImpl);
      const label = `${broken} broken, ${sound} sound`;

      await settle(failureOf(search(client, { query: QUERY, search_type: broken })));
      const afterFirst = urlsOn(stub, broken).length;
      await call(client, sound);
      await settle(failureOf(search(client, { query: QUERY, search_type: broken })));

      expect(afterFirst, label).toBeGreaterThan(0);
      expect(urlsOn(stub, broken).length, label).toBeGreaterThan(afterFirst);
    }
  });
});
