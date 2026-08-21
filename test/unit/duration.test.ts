import { describe, expect, it } from "vitest";

import { parseDuration, type DurationPrecision } from "../../src/bideetmusique/duration.js";

const NBSP = " ";

describe("parseDuration", () => {
  describe("rule 1 — minutes and seconds read as a total, at second precision", () => {
    it("reads '4 m 16 s' as 256 seconds stated to the second", () => {
      expect(parseDuration("4 m 16 s")).toEqual({
        text: "4 m 16 s",
        seconds: 256,
        precision: "second",
      });
    });

    it("keeps the published text exactly as received", () => {
      expect(parseDuration("  4 m   16 s  ").text).toBe("  4 m   16 s  ");
    });

    it("reads the other minute-and-second durations of the collection", () => {
      const cases: Array<[string, number]> = [
        ["1 m 1 s", 61],
        ["2 m 30 s", 150],
        ["3 m 59 s", 239],
        ["10 m 0 s", 600],
        ["12 m 45 s", 765],
      ];
      for (const [raw, seconds] of cases) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds,
          precision: "second",
        });
      }
    });
  });

  describe("rule 2 — a duration stating only minutes stays a minute-precision claim", () => {
    it("reads '3 m' as 180 seconds the record never claimed to the second", () => {
      expect(parseDuration("3 m")).toEqual({
        text: "3 m",
        seconds: 180,
        precision: "minute",
      });
    });

    it("reads the neighbouring minute-only durations at minute precision", () => {
      const cases: Array<[string, number]> = [
        ["1 m", 60],
        ["4 m", 240],
        ["59 m", 3540],
        ["90 m", 5400],
      ];
      for (const [raw, seconds] of cases) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds,
          precision: "minute",
        });
      }
    });

    it("reads a stated zero minute as zero seconds at minute precision", () => {
      expect(parseDuration("0 m")).toEqual({
        text: "0 m",
        seconds: 0,
        precision: "minute",
      });
    });
  });

  describe("rule 3 — a duration stating only seconds is a second-precision claim", () => {
    it("reads '24 s' as 24 seconds stated to the second", () => {
      expect(parseDuration("24 s")).toEqual({
        text: "24 s",
        seconds: 24,
        precision: "second",
      });
    });

    it("reads the neighbouring second-only durations at second precision", () => {
      const cases: Array<[string, number]> = [
        ["1 s", 1],
        ["59 s", 59],
        ["60 s", 60],
        ["125 s", 125],
      ];
      for (const [raw, seconds] of cases) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds,
          precision: "second",
        });
      }
    });
  });

  describe("rule 4 — hours count into the total and precision follows the smallest unit stated", () => {
    it("reads '1 h 2 m 3 s' as 3723 seconds at second precision", () => {
      expect(parseDuration("1 h 2 m 3 s")).toEqual({
        text: "1 h 2 m 3 s",
        seconds: 3723,
        precision: "second",
      });
    });

    it("reads '1 h' as 3600 seconds at hour precision", () => {
      expect(parseDuration("1 h")).toEqual({
        text: "1 h",
        seconds: 3600,
        precision: "hour",
      });
    });

    it("reads '1 h 30 m' as 5400 seconds at minute precision", () => {
      expect(parseDuration("1 h 30 m")).toEqual({
        text: "1 h 30 m",
        seconds: 5400,
        precision: "minute",
      });
    });

    it("reads the neighbouring hour durations", () => {
      const cases: Array<[string, number, DurationPrecision]> = [
        ["2 h", 7200, "hour"],
        ["1 h 59 m", 7140, "minute"],
        ["1 h 59 m 59 s", 7199, "second"],
        ["1 h 0 m 0 s", 3600, "second"],
        ["1 h 0 m", 3600, "minute"],
      ];
      for (const [raw, seconds, precision] of cases) {
        expect(parseDuration(raw)).toEqual({ text: raw, seconds, precision });
      }
    });
  });

  describe("rule 5 — spacing, case and non-breaking spaces do not change the reading", () => {
    it("reads '4m16s', '4 M 16 S' and '  4 m   16 s  ' the same way", () => {
      for (const raw of ["4m16s", "4 M 16 S", "  4 m   16 s  ", "4M16S"]) {
        expect(parseDuration(raw).seconds).toBe(256);
        expect(parseDuration(raw).precision).toBe("second");
        expect(parseDuration(raw).text).toBe(raw);
      }
    });

    it("reads a non-breaking space between a number and its unit as an ordinary space", () => {
      const cases = [`4${NBSP}m 16${NBSP}s`, `4 m${NBSP}16 s`, `4${NBSP}m${NBSP}16${NBSP}s`];
      for (const raw of cases) {
        expect(parseDuration(raw).seconds).toBe(256);
        expect(parseDuration(raw).precision).toBe("second");
      }
    });

    it("reads case and spacing variants of the shorter forms", () => {
      expect(parseDuration("3M").seconds).toBe(180);
      expect(parseDuration("3M").precision).toBe("minute");
      expect(parseDuration(`24${NBSP}S`).seconds).toBe(24);
      expect(parseDuration("1H2M3S").seconds).toBe(3723);
      expect(parseDuration(" 1 H 30 M ").seconds).toBe(5400);
      expect(parseDuration(" 1 H 30 M ").precision).toBe("minute");
    });
  });

  describe("rule 6 — nothing is normalised into a larger unit", () => {
    it("reads '59 m 59 s' as 3599 seconds without rolling into an hour", () => {
      expect(parseDuration("59 m 59 s")).toEqual({
        text: "59 m 59 s",
        seconds: 3599,
        precision: "second",
      });
    });

    it("keeps 90 minutes at 5400 seconds and minute precision", () => {
      expect(parseDuration("90 m")).toEqual({
        text: "90 m",
        seconds: 5400,
        precision: "minute",
      });
    });

    it("keeps minutes at or above 60 as written", () => {
      const cases: Array<[string, number]> = [
        ["60 m", 3600],
        ["61 m", 3660],
        ["120 m", 7200],
      ];
      for (const [raw, seconds] of cases) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds,
          precision: "minute",
        });
      }
    });

    it("keeps minutes at or above 60 as written when seconds follow", () => {
      expect(parseDuration("90 m 30 s")).toEqual({
        text: "90 m 30 s",
        seconds: 5430,
        precision: "second",
      });
    });
  });

  describe("rule 7 — seconds at or above 60 are taken as the site wrote them", () => {
    it("reads '2 m 90 s' as 210 seconds instead of correcting the site", () => {
      expect(parseDuration("2 m 90 s")).toEqual({
        text: "2 m 90 s",
        seconds: 210,
        precision: "second",
      });
    });

    it("reads the neighbouring overflowing seconds as written", () => {
      const cases: Array<[string, number]> = [
        ["0 m 75 s", 75],
        ["1 m 60 s", 120],
        ["4 m 120 s", 360],
        ["1 h 0 m 90 s", 3690],
      ];
      for (const [raw, seconds] of cases) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds,
          precision: "second",
        });
      }
    });
  });

  describe("rule 8 — an unreadable duration gives null, and no zero is invented", () => {
    it("gives null seconds and null precision for every unreadable form", () => {
      for (const raw of ["", " ", "inconnue", "n/a", "—", "m s", "?", "-"]) {
        expect(parseDuration(raw)).toEqual({
          text: raw,
          seconds: null,
          precision: null,
        });
      }
    });

    it("holds an empty text for a missing value", () => {
      expect(parseDuration(null)).toEqual({
        text: "",
        seconds: null,
        precision: null,
      });
      expect(parseDuration(undefined)).toEqual({
        text: "",
        seconds: null,
        precision: null,
      });
    });

    it("gives null for units carrying no number", () => {
      for (const raw of ["m", "s", "h", "h m s", " m  s ", "M S"]) {
        expect(parseDuration(raw).seconds).toBeNull();
        expect(parseDuration(raw).precision).toBeNull();
      }
    });

    it("keeps the unreadable text as received, whitespace included", () => {
      expect(parseDuration("  inconnue  ").text).toBe("  inconnue  ");
    });
  });

  describe("rule 9 — a stated zero is a value, distinct from an absence", () => {
    it("reads '0 m 0 s' as zero seconds at second precision", () => {
      expect(parseDuration("0 m 0 s")).toEqual({
        text: "0 m 0 s",
        seconds: 0,
        precision: "second",
      });
    });

    it("reads '0 s' as zero seconds at second precision", () => {
      expect(parseDuration("0 s")).toEqual({
        text: "0 s",
        seconds: 0,
        precision: "second",
      });
    });

    it("tells a stated zero apart from a duration the site never stated", () => {
      const stated = parseDuration("0 m 0 s");
      const absent = parseDuration("inconnue");
      expect(stated.seconds).toBe(0);
      expect(stated.precision).toBe("second");
      expect(absent.seconds).toBeNull();
      expect(absent.precision).toBeNull();
    });
  });

  describe("rule 10 — a bare number carries no unit and cannot be read", () => {
    it("gives null for '216', which says nothing about seconds or minutes", () => {
      expect(parseDuration("216")).toEqual({
        text: "216",
        seconds: null,
        precision: null,
      });
    });

    it("gives null for the neighbouring bare numbers", () => {
      for (const raw of ["0", "3", "216 ", " 4 16 ", "4:16"]) {
        expect(parseDuration(raw).seconds).toBeNull();
        expect(parseDuration(raw).precision).toBeNull();
      }
    });
  });
});
