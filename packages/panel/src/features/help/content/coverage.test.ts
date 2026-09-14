import { describe, expect, it } from "vitest";

import { DIAGRAM_CALLOUTS } from "../diagrams/index.js";
import { INLINE_ICONS } from "../inlineIcons.js";
import { en } from "./en.js";
import { HELP } from "./index.js";
import type { Block, HelpContent } from "./types.js";
import { OUTLINE, SECTION_IDS } from "./types.js";

/**
 * The net under the half `tsc` cannot reach.
 *
 * `HelpContent` already makes a missing **section** a build failure, so nothing
 * here checks for one. What the type cannot see is inside a section: a
 * translation that dropped a paragraph, a legend naming a badge the picture
 * does not draw, a card pointing at a section that no longer exists.
 *
 * The shape check is the important one. Two documents with the same sections
 * but different blocks are two different documents, and the way that happens is
 * a block added to `en.ts` in a hurry — which is exactly the thing the type
 * catches for labels and cannot catch here.
 */

const LANGUAGES = Object.entries(HELP) as [string, HelpContent][];

/** What a block *is*, ignoring what it says — the part translation must not change. */
function shapeOf(block: Block): string {
  switch (block.kind) {
    // The id is the address, not the wording, so it is part of the shape: a
    // translation that renamed one would break every link pointing at it.
    case "h":
      return `h:${block.id}`;
    case "rows":
      return `rows:${block.rows.length}`;
    case "steps":
      return `steps:${block.items.length}`;
    case "diagram":
      return `diagram:${block.diagram}:${block.callouts.map((c) => c.n).join(",")}`;
    case "cards":
      return `cards:${block.cards.map((c) => c.goes).join(",")}`;
    default:
      return block.kind;
  }
}

const everyBlock = (content: HelpContent): Block[] =>
  SECTION_IDS.flatMap((id) => content.sections[id].blocks);

/** Every string the page runs through `Prose`, which is where the marks work. */
function everyProse(content: HelpContent): string[] {
  const prose: string[] = [content.hotkeysOff];

  for (const block of everyBlock(content)) {
    if (block.kind === "p" || block.kind === "note") prose.push(block.text);
    if (block.kind === "steps") prose.push(...block.items);
    if (block.kind === "rows")
      for (const row of block.rows) prose.push(row.term, row.text);
    if (block.kind === "cards")
      for (const card of block.cards)
        prose.push(card.title, card.text, card.where);
    if (block.kind === "diagram")
      for (const c of block.callouts) prose.push(c.name, c.text);
    if (block.kind === "image") prose.push(block.title);
  }

  return prose;
}

/** Section ids and heading ids together: everywhere a `#` link can land. */
function everyAnchor(content: HelpContent): Set<string> {
  const anchors = new Set<string>(SECTION_IDS);

  for (const block of everyBlock(content))
    if (block.kind === "h") anchors.add(block.id);

  return anchors;
}

/**
 * The contents list is a second statement of the same set of sections, and the
 * only one that says which of them hang off which. Flattened, it has to be the
 * document itself — in the same order — or the list either loses a section or
 * offers one the page does not have.
 */
describe("the outline", () => {
  it("flattens to the document, in reading order", () => {
    const flat = OUTLINE.flatMap((entry) => [entry.id, ...entry.children]);
    expect(flat).toEqual([...SECTION_IDS]);
  });
});

describe("every language of the help", () => {
  it("says something everywhere the English one does", () => {
    for (const [language, content] of LANGUAGES) {
      expect(content.title, `${language}: title`).not.toBe("");
      expect(content.tagline, `${language}: tagline`).not.toBe("");
      expect(content.contents, `${language}: contents`).not.toBe("");

      for (const id of SECTION_IDS) {
        const section = content.sections[id];
        expect(section.title, `${language}: ${id} title`).not.toBe("");
        expect(
          section.blocks.length,
          `${language}: ${id} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The one a translation gets wrong silently: a paragraph quietly not carried
   * over reads as a finished document in the language that has it.
   */
  it("is built of the same blocks, in the same order", () => {
    const english = everyBlock(en).map(shapeOf);

    for (const [language, content] of LANGUAGES) {
      expect(everyBlock(content).map(shapeOf), language).toEqual(english);
    }
  });

  it("never leaves a row or a card blank", () => {
    for (const [language, content] of LANGUAGES) {
      for (const block of everyBlock(content)) {
        if (block.kind === "rows") {
          for (const row of block.rows) {
            expect(row.term, `${language}: a row has no term`).not.toBe("");
            expect(row.text, `${language}: ${row.term}`).not.toBe("");
          }
        }

        if (block.kind === "cards") {
          for (const card of block.cards) {
            expect(card.title, `${language}: a card has no title`).not.toBe("");
            expect(card.text, `${language}: ${card.title}`).not.toBe("");
            expect(card.where, `${language}: ${card.title} where`).not.toBe("");
          }
        }

        if (block.kind === "image") {
          expect(
            block.title,
            `${language}: ${block.diagram} image has no title`,
          ).not.toBe("");
        }
      }
    }
  });

  /**
   * A legend is only worth anything if it names what the picture actually
   * draws. The diagram is the authority — it is the thing on screen — so the
   * numbers come from `DIAGRAM_CALLOUTS` and the words are checked against it.
   */
  it("names exactly the badges its diagrams draw", () => {
    for (const [language, content] of LANGUAGES) {
      for (const block of everyBlock(content)) {
        if (block.kind !== "diagram") continue;

        const named = block.callouts
          .map((callout) => callout.n)
          .sort((a, b) => a - b);
        const drawn = [...DIAGRAM_CALLOUTS[block.diagram]].sort(
          (a, b) => a - b,
        );

        expect(named, `${language}: ${block.diagram}`).toEqual(drawn);

        for (const callout of block.callouts) {
          expect(
            callout.name,
            `${language}: ${block.diagram} #${callout.n}`,
          ).not.toBe("");
          expect(
            callout.text,
            `${language}: ${block.diagram} #${callout.n}`,
          ).not.toBe("");
        }
      }
    }
  });

  it("only sends a card somewhere the document has", () => {
    for (const [language, content] of LANGUAGES) {
      for (const block of everyBlock(content)) {
        if (block.kind !== "cards") continue;

        for (const card of block.cards) {
          expect(SECTION_IDS, `${language}: ${card.title}`).toContain(
            card.goes,
          );
        }
      }
    }
  });

  /**
   * A backtick marks a quotation of the panel, and the closing one is easy to
   * lose in a translation. An odd count means a code span swallowing the rest
   * of the sentence.
   */
  it("closes every quotation it opens", () => {
    for (const [language, content] of LANGUAGES) {
      for (const text of everyProse(content)) {
        expect(
          (text.match(/`/g) ?? []).length % 2,
          `${language}: ${text}`,
        ).toBe(0);
      }
    }
  });

  /**
   * A `{{token}}` naming no glyph is drawn as written rather than hidden, so
   * nothing on the page breaks — it just reads as a typo to everyone who opens
   * it. This is the check that keeps that from shipping.
   */
  it("draws only glyphs the page has", () => {
    for (const [language, content] of LANGUAGES) {
      for (const text of everyProse(content)) {
        for (const [, name] of text.matchAll(/\{\{(\w+)\}\}/g)) {
          expect(
            Object.keys(INLINE_ICONS),
            `${language}: {{${name}}}`,
          ).toContain(name);
        }
      }
    }
  });

  /**
   * A link inside the document is an address on the page itself, and an address
   * is the one thing a translation must not move. Both halves are checked: that
   * the link is written in a shape `Prose` recognises at all — anything else
   * would be drawn as its own brackets — and that a `#` one lands somewhere.
   */
  it("points every link at something that exists", () => {
    for (const [language, content] of LANGUAGES) {
      const anchors = everyAnchor(content);

      for (const text of everyProse(content)) {
        for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
          // Both groups are mandatory in the pattern — the match is what says so.
          const [whole, , href = ""] = match;

          if (href.startsWith("#")) {
            expect([...anchors], `${language}: ${whole}`).toContain(
              href.slice(1),
            );
          } else {
            expect(href, `${language}: ${whole}`).toMatch(/^https:\/\//);
          }
        }
      }
    }
  });

  /** Two headings at one address means one of them cannot be linked to. */
  it("gives every heading an address of its own", () => {
    for (const [language, content] of LANGUAGES) {
      const ids = everyBlock(content)
        .filter((block) => block.kind === "h")
        .map((block) => block.id);

      expect(new Set(ids).size, `${language}: a heading id is used twice`).toBe(
        ids.length,
      );

      for (const id of ids) {
        expect(
          SECTION_IDS,
          `${language}: ${id} is also a section`,
        ).not.toContain(id);
      }
    }
  });
});
