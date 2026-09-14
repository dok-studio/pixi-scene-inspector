import type { Node, PixiAdapter } from '../adapters/types.js';

/**
 * A node written to the page's console, under a caption saying which one.
 *
 * The object alone was hard to find again. A console belonging to a running
 * game already scrolls, and a bare `Sprite {…}` among a hundred lines of the
 * application's own logging says nothing about where it came from or why it is
 * there — least of all after three of them have been sent and the reader is
 * trying to tell them apart.
 *
 * **One call, not two.** The caption and the object go into the same entry, so
 * the object stays on the line that names it: a second `console.log`, or a
 * group around it, can be separated from its object by whatever the game logs
 * in between, and doubles what this adds to a console that is not ours.
 */

/**
 * The panel's own `--primary` (`globals.css`), spelled out because nothing of
 * the panel's stylesheet reaches here — this is the page's console, styled by
 * the browser.
 *
 * White on it in both console themes: a filled badge carries its own contrast,
 * which a coloured word on an unknown background does not.
 */
const BADGE = 'background:#1f78bd;color:#fff;padding:1px 5px;border-radius:3px;font-weight:600';

/**
 * Weight only, and that is deliberate: an unnamed property in a `%c` run falls
 * back to the console's own default rather than to the style before it, so the
 * caption is left in whatever colour the reader's console theme uses for text.
 * A colour of our choosing here would be one that is legible in the light
 * theme or the dark one, and picking either sacrifices the other.
 */
const CAPTION = 'font-weight:600';

/**
 * What the node is called, in the words the tree uses for it — the
 * application's own id where there is one, and the version's name field
 * otherwise (`PixiAdapter.label`). A node with no name is described by its
 * type alone rather than by empty quotes.
 */
function captionOf(adapter: PixiAdapter, node: Node): string {
  const type = adapter.typeOf(node);
  const name = adapter.label(node);

  return name === '' ? type : `${type} “${name}”`;
}

/**
 * @param adapter null for a page whose application has gone — the object is
 * still worth handing over, and there is nothing left to ask what it is.
 */
export function logNode(adapter: PixiAdapter | null, node: Node): void {
  if (adapter === null) {
    console.log('%cScene Inspector', BADGE, node);
    return;
  }

  console.log(`%cScene Inspector%c ${captionOf(adapter, node)}`, BADGE, CAPTION, node);
}
