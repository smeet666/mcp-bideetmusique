import { describe, expect, it } from "vitest";

import {
  fieldValues,
  linkedValues,
  splitValues,
} from "../../src/bideetmusique/multivalue.js";

const NBSP = " ";

/** An anchor in the shape the site serves it, with its query string escaped. */
function anchor(name: string, keyword = name): string {
  return `<a href="/recherche.html?st=4&amp;kw=${keyword.replace(/ /g, "+")}">${name}</a>`;
}

describe("linkedValues", () => {
  describe("rule 1 — one entry per anchor, decoded, trimmed, in printed order", () => {
    it("returns the anchor texts in the order the site printed them", () => {
      const html = `${anchor("Jean-Pierre Lang")} - ${anchor("Alice Dona")}`;
      expect(linkedValues(html)).toEqual(["Jean-Pierre Lang", "Alice Dona"]);
    });

    it("returns the ten writers of a heavily credited record in printed order", () => {
      const names = [
        "Alice Dona",
        "Boris Vian",
        "Charles Aznavour",
        "Danyel Gérard",
        "Eddy Marnay",
        "Frank Gérald",
        "Georges Garvarentz",
        "Hubert Giraud",
        "Isabelle Aubret",
        "Jean-Pierre Lang",
      ];
      const html = names.map((n) => anchor(n)).join(" / ");
      expect(linkedValues(html)).toEqual(names);
    });

    it("trims the whitespace an anchor prints around a name", () => {
      expect(linkedValues(`<a href="/x">  Alice Dona\n</a>`)).toEqual([
        "Alice Dona",
      ]);
    });

    it("drops anchors carrying no text", () => {
      const html = `<a href="/x"></a>${anchor("Alice Dona")}<a href="/y">   </a>`;
      expect(linkedValues(html)).toEqual(["Alice Dona"]);
    });

    it("strips the markup printed inside an anchor", () => {
      expect(
        linkedValues(`<a href="/x">Charles <em>Aznavour</em></a>`),
      ).toEqual(["Charles Aznavour"]);
      expect(
        linkedValues(`<a href="/x"><strong>Boris</strong> <i>Vian</i></a>`),
      ).toEqual(["Boris Vian"]);
    });

    it("returns an empty list for a fragment holding no anchor", () => {
      expect(linkedValues("Alice Dona - Boris Vian")).toEqual([]);
      expect(linkedValues("")).toEqual([]);
    });

    it("reads a single anchor as a one-entry list", () => {
      expect(linkedValues(anchor("Barclay"))).toEqual(["Barclay"]);
    });

    it("reads the two anchors of a co-released record", () => {
      const html = `${anchor("Barclay")} / ${anchor("Philips")}`;
      expect(linkedValues(html)).toEqual(["Barclay", "Philips"]);
    });
  });

  describe("rule 8 — entities are decoded and a non-breaking space inside a name survives", () => {
    it("decodes an ampersand printed as an entity", () => {
      expect(linkedValues(`<a href="/x">Sacha &amp; Co</a>`)).toEqual([
        "Sacha & Co",
      ]);
    });

    it("decodes a non-breaking space to U+00A0 and keeps it inside the name", () => {
      expect(linkedValues(`<a href="/x">Jean&nbsp;Ferrat</a>`)).toEqual([
        `Jean${NBSP}Ferrat`,
      ]);
    });

    it("keeps a literal non-breaking space inside a name rather than collapsing it", () => {
      expect(linkedValues(`<a href="/x">Jean${NBSP}Ferrat</a>`)).toEqual([
        `Jean${NBSP}Ferrat`,
      ]);
    });

    it("decodes the other entities the site prints in names", () => {
      expect(linkedValues(`<a href="/x">L&#39;Affaire Louis&#39;Trio</a>`)).toEqual(
        ["L'Affaire Louis'Trio"],
      );
      expect(linkedValues(`<a href="/x">Fran&ccedil;ois B&eacute;ranger</a>`)).toEqual(
        ["François Béranger"],
      );
      expect(linkedValues(`<a href="/x">&lt;Anonyme&gt;</a>`)).toEqual([
        "<Anonyme>",
      ]);
    });
  });
});

describe("splitValues", () => {
  describe("rule 2 — splits on the separators the site uses, trims, drops empty parts", () => {
    it("splits on a slash, a spaced hyphen, a comma and a semicolon", () => {
      expect(splitValues("Alice Dona / Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues("Alice Dona - Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues("Alice Dona,Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues("Alice Dona;Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
    });

    it("trims the whitespace around each part", () => {
      expect(splitValues("  Alice Dona ,  Boris Vian  ")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues("Alice Dona ; Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
    });

    it("drops the empty parts a trailing or doubled separator leaves", () => {
      expect(splitValues("Alice Dona / Boris Vian / ")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues(", Alice Dona,, Boris Vian,")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(splitValues("Alice Dona ; ; Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
    });

    it("splits a list mixing several separators", () => {
      expect(
        splitValues("Alice Dona / Boris Vian - Eddy Marnay, Hubert Giraud"),
      ).toEqual(["Alice Dona", "Boris Vian", "Eddy Marnay", "Hubert Giraud"]);
    });

    it("splits ten writers published as one string", () => {
      const names = [
        "Alice Dona",
        "Boris Vian",
        "Charles Aznavour",
        "Danyel Gérard",
        "Eddy Marnay",
        "Frank Gérald",
        "Georges Garvarentz",
        "Hubert Giraud",
        "Isabelle Aubret",
        "Jean-Pierre Lang",
      ];
      expect(splitValues(names.join(" / "))).toEqual(names);
    });
  });

  describe("rule 3 — a hyphen inside a name is not a separator", () => {
    it("reads 'Jean-Pierre Lang' as one value", () => {
      expect(splitValues("Jean-Pierre Lang")).toEqual(["Jean-Pierre Lang"]);
    });

    it("keeps the hyphenated names of a list intact while splitting the list", () => {
      expect(splitValues("Jean-Pierre Lang / Marie-José Neuville")).toEqual([
        "Jean-Pierre Lang",
        "Marie-José Neuville",
      ]);
      expect(splitValues("Jean-Pierre Lang, Marie-Paule Belle")).toEqual([
        "Jean-Pierre Lang",
        "Marie-Paule Belle",
      ]);
    });

    it("separates only on a hyphen carrying a space on both sides", () => {
      expect(splitValues("Rose - Marie")).toEqual(["Rose", "Marie"]);
      expect(splitValues("Alice -Dona")).toEqual(["Alice -Dona"]);
      expect(splitValues("Alice- Dona")).toEqual(["Alice- Dona"]);
      expect(splitValues("Jean-Pierre-Lang")).toEqual(["Jean-Pierre-Lang"]);
    });
  });

  describe("rule 4 — a comma splits, because that is what the site's punctuation says", () => {
    it("reads 'Aznavour, Charles' as two values", () => {
      expect(splitValues("Aznavour, Charles")).toEqual([
        "Aznavour",
        "Charles",
      ]);
    });

    it("reads an inverted name list as one value per comma-separated part", () => {
      expect(splitValues("Aznavour, Charles, Vian, Boris")).toEqual([
        "Aznavour",
        "Charles",
        "Vian",
        "Boris",
      ]);
    });
  });

  describe("rule 6 — a single value stays a one-entry array", () => {
    it("wraps a lone name in an array rather than returning it bare", () => {
      const values = splitValues("Boris Vian");
      expect(Array.isArray(values)).toBe(true);
      expect(values).toEqual(["Boris Vian"]);
    });
  });

  describe("rule 7 — an empty or whitespace-only string gives an empty list", () => {
    it("returns [] rather than a list holding an empty string", () => {
      for (const raw of ["", " ", "\n\t", "   "]) {
        expect(splitValues(raw)).toEqual([]);
      }
    });

    // Red on purpose. Rule 7 makes a whitespace-only fragment an empty list and
    // a non-breaking space is whitespace; rule 8 preserves a non-breaking space,
    // which the reader applies here to a fragment holding no name at all. The
    // two rules disagree only on this fragment, and the contract states no
    // winner, so the test asserts rule 7 and stays failing until it does.
    it("returns [] for a fragment made of a non-breaking space alone", () => {
      expect(splitValues(NBSP)).toEqual([]);
      expect(splitValues(`${NBSP}${NBSP}`)).toEqual([]);
    });

    it("returns [] for a string made of separators alone", () => {
      for (const raw of [",", " / ", " - ", ";", " , ; "]) {
        expect(splitValues(raw)).toEqual([]);
      }
    });
  });
});

describe("fieldValues", () => {
  describe("rule 5 — anchors win when the fragment has any, the split text otherwise", () => {
    it("returns the anchors of a fragment that publishes them", () => {
      const html = `${anchor("Alice Dona")} - ${anchor("Boris Vian")}`;
      expect(fieldValues(html)).toEqual(["Alice Dona", "Boris Vian"]);
    });

    it("returns the anchors only, inventing no entry for the text between them", () => {
      const html = `Paroles : ${anchor("Alice Dona")} et musique de ${anchor("Boris Vian")} (1967)`;
      expect(fieldValues(html)).toEqual(["Alice Dona", "Boris Vian"]);
    });

    it("keeps an anchor whole even when its own text carries a comma", () => {
      expect(fieldValues(anchor("Aznavour, Charles", "Aznavour"))).toEqual([
        "Aznavour, Charles",
      ]);
    });

    it("splits the text of a fragment carrying no anchor", () => {
      expect(fieldValues("Alice Dona / Boris Vian")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
      expect(fieldValues("Jean-Pierre Lang")).toEqual(["Jean-Pierre Lang"]);
      expect(fieldValues("Aznavour, Charles")).toEqual([
        "Aznavour",
        "Charles",
      ]);
    });

    it("splits the text of a fragment whose markup carries no anchor", () => {
      expect(fieldValues("<em>Alice Dona</em> - <em>Boris Vian</em>")).toEqual([
        "Alice Dona",
        "Boris Vian",
      ]);
    });

    it("returns the ten anchored writers of a heavily credited record", () => {
      const names = [
        "Alice Dona",
        "Boris Vian",
        "Charles Aznavour",
        "Danyel Gérard",
        "Eddy Marnay",
        "Frank Gérald",
        "Georges Garvarentz",
        "Hubert Giraud",
        "Isabelle Aubret",
        "Jean-Pierre Lang",
      ];
      expect(fieldValues(names.map((n) => anchor(n)).join(", "))).toEqual(names);
    });

    it("returns the two anchored labels of a co-released record", () => {
      const html = `${anchor("Barclay")} / ${anchor("Philips")}`;
      expect(fieldValues(html)).toEqual(["Barclay", "Philips"]);
    });
  });

  describe("rule 6 — a single value stays a one-entry array, never a bare string and never null", () => {
    it("returns a one-entry array for a lone anchor", () => {
      const values = fieldValues(anchor("Barclay"));
      expect(Array.isArray(values)).toBe(true);
      expect(values).toEqual(["Barclay"]);
    });

    it("returns a one-entry array for a lone unanchored name", () => {
      const values = fieldValues("Barclay");
      expect(Array.isArray(values)).toBe(true);
      expect(values).toEqual(["Barclay"]);
    });
  });

  describe("rule 7 — an empty or whitespace-only fragment gives an empty list", () => {
    it("returns [] rather than a list holding an empty string", () => {
      for (const raw of ["", " ", "\n  \t", "<em> </em>", `<a href="/x"></a>`]) {
        expect(fieldValues(raw)).toEqual([]);
      }
    });
  });

  describe("rule 8 — entities are decoded and a non-breaking space inside a name survives", () => {
    it("decodes the entities of an anchored value", () => {
      expect(fieldValues(`<a href="/x">Sacha &amp; Co</a>`)).toEqual([
        "Sacha & Co",
      ]);
      expect(fieldValues(`<a href="/x">Jean&nbsp;Ferrat</a>`)).toEqual([
        `Jean${NBSP}Ferrat`,
      ]);
    });

    it("decodes the entities of an unanchored value while splitting it", () => {
      expect(fieldValues("Sacha &amp; Co / Boris Vian")).toEqual([
        "Sacha & Co",
        "Boris Vian",
      ]);
      expect(fieldValues("Jean&nbsp;Ferrat, Boris Vian")).toEqual([
        `Jean${NBSP}Ferrat`,
        "Boris Vian",
      ]);
    });
  });
});
