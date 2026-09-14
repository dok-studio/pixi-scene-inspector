import { describe, expect, it } from 'vitest';

import { SECTION_IDS } from '../features/help/content/types.js';
import { HELP_SECTIONS, HELP_TABS } from './helpSections.js';

/**
 * The two ends of a link that nothing else checks.
 *
 * The `?` in the bar sends a fragment to a document in another file, and a
 * fragment that names nothing fails silently: the page opens, at the top, as if
 * that were what was asked for. So the map is held to both ends — every tab has
 * a section, and every section it names is one the document has.
 */
describe('where the help button lands', () => {
  it('has a section for every tab the bar can be on', () => {
    for (const tab of HELP_TABS) {
      expect(Object.keys(HELP_SECTIONS), tab).toContain(tab);
    }
  });

  it('names only sections the document has', () => {
    for (const [tab, section] of Object.entries(HELP_SECTIONS)) {
      expect(SECTION_IDS, `${tab} → #${section}`).toContain(section);
    }
  });

  it('sends no two tabs to the same place', () => {
    const sections = Object.values(HELP_SECTIONS);

    expect(new Set(sections).size).toBe(sections.length);
  });
});
