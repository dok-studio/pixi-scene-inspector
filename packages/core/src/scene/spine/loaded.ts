/**
 * The skeletons a page has fetched, read off the browser's own record.
 *
 * This is the source that needs nothing from the application. `Assets` lives on
 * the PixiJS module, and a bundled game publishes no module — on a real project
 * the asset store was out of reach on every version, so the skeleton chooser had
 * an empty list and nothing to offer. The browser, meanwhile, has been keeping a
 * list of every file the page fetched the whole time.
 *
 * **What makes it usable is `.atlas`.** A skeleton export is `.json`, which
 * belongs to everyone, or `.skel`, which is Spine's; but the atlas beside it is
 * `.atlas`, an extension Spine uses and nothing else does. So a `.atlas` in the
 * page's history is a skeleton in the page, and the file's own name is the name
 * to show — which is the only readable name a skeleton has anyway, since
 * `SkeletonJson` never fills `SkeletonData.name` in.
 *
 * It is a guess at what the application calls the skeleton, not a fact: a game
 * whose alias differs from its file name will not match. That is why the panel's
 * chooser also takes a typed name. A good guess and an escape hatch beat an
 * empty list.
 *
 * The record is also what makes it possible to answer **what a skeleton the node
 * is not carrying can do**. Choosing one has to be a choice, not an act — the
 * scene must not change until Apply — but the animations to choose from then
 * belong to a skeleton nothing has loaded into the node. They are read out of
 * the export itself, which the same record locates and the browser has already
 * cached; see `animationsOf`.
 */

/** Spine's own two, and nobody else's. `.json` is everyone's, so it is not here. */
const SPINE_FILE = /\.(?:atlas|skel)(?:$|[?#])/i;

/** What an export may be, once its atlas has said a skeleton is here. */
const EXPORT_FILE = /\.(?:json|skel)(?:$|[?#])/i;

/**
 * Names seen so far, kept because the buffer they come from does not keep them.
 *
 * Resource timing holds a couple of hundred entries and drops the oldest; a game
 * that loads a thousand files has long since pushed its skeletons out. The
 * observer below is fed the buffer's current contents when it starts and every
 * entry after that, so what is collected here outlives both.
 */
const seen = new Set<string>();

/**
 * Every url that could be a skeleton export, by the file's own name.
 *
 * Kept apart from `seen` because the two answer different questions: a `.atlas`
 * says a skeleton exists, and the `.json` beside it is where its animations are
 * written down. Only these three extensions are stored, so a game's thousand
 * images cost nothing here.
 */
const exportUrls = new Map<string, string>();

/** And the atlas beside it, which the runtime's own builder needs as well. */
const atlasUrls = new Map<string, string>();

let watching = false;

interface TimingEntry {
  name?: unknown;
}

interface Observer {
  observe: (options: { type: string; buffered: boolean }) => void;
}

interface Root {
  performance?: { getEntriesByType?: (type: string) => TimingEntry[] };
  PerformanceObserver?: new (fn: (list: { getEntries: () => TimingEntry[] }) => void) => Observer;
  fetch?: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}

/** `hero` out of `https://cdn/assets/spine/hero.atlas?v=3` — the file's own name. */
function fileName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const last = path.slice(path.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');

  return dot > 0 ? last.slice(0, dot) : last;
}

function collect(entries: readonly TimingEntry[]): void {
  for (const entry of entries) {
    if (typeof entry.name !== 'string') continue;

    const url = entry.name;
    const name = fileName(url);
    if (name === '') continue;

    if (SPINE_FILE.test(url)) seen.add(name);
    if (/\.atlas(?:$|[?#])/i.test(url) && !atlasUrls.has(name)) atlasUrls.set(name, url);
    // A `.json` is only worth keeping in case an atlas names it later, so it is
    // stored under its own name rather than checked against `seen` now.
    if (EXPORT_FILE.test(url) && !exportUrls.has(name)) exportUrls.set(name, url);
  }
}

/**
 * Starts watching, once.
 *
 * **From `install`, not from the first question.** This was lazy at first, on
 * the reasoning that a page with no Spine should pay nothing for it — and that
 * was wrong in the one case it exists for. The resource-timing buffer holds a
 * couple of hundred entries and **drops the oldest**, so `buffered: true` hands
 * over what is in the buffer *now*: on a game that loads a thousand files
 * before anybody opens DevTools, the skeletons were pushed out long ago and the
 * chooser came up empty. The host is installed at `document_start`, before the
 * page has fetched anything, so subscribing there sees every file the page ever
 * asks for.
 *
 * What it costs a page with no Spine is one observer that tests two extensions
 * and keeps nothing. That is the smaller price of the two.
 */
export function watchLoaded(root: typeof globalThis = globalThis): void {
  watch(root as Root);
}

function watch(root: Root): void {
  if (watching) return;

  const Observer_ = root.PerformanceObserver;
  if (typeof Observer_ !== 'function') return;

  try {
    new Observer_((list) => {
      collect(list.getEntries());
    }).observe({ type: 'resource', buffered: true });

    // Marked only once it took: a page asked before its observer existed is a
    // page that should be asked again, not one written off for the session.
    watching = true;
  } catch {
    // An environment without resource timing. The buffer read below still runs.
  }
}

function refresh(root: Root): void {
  watch(root);

  const timing = root.performance;
  if (typeof timing?.getEntriesByType !== 'function') return;

  try {
    collect(timing.getEntriesByType('resource'));
  } catch {
    // Nothing to add. Whatever the observer has already collected stands.
  }
}

/**
 * @returns the names, in the order they were first seen.
 *
 * The buffer is read as well as observed: `buffered: true` is delivered on a
 * later task, and the first answer should not have to be the empty one.
 */
export function loadedSkeletonNames(root: typeof globalThis = globalThis): readonly string[] {
  refresh(root as Root);

  return [...seen];
}

/** Where the page fetched a skeleton's export from, if it can be told. */
export function exportUrlFor(name: string, root: typeof globalThis = globalThis): string | undefined {
  refresh(root as Root);
  return exportUrls.get(name);
}

/** And its atlas, which the runtime needs to read the export at all. */
export function atlasUrlFor(name: string, root: typeof globalThis = globalThis): string | undefined {
  refresh(root as Root);
  return atlasUrls.get(name);
}

/** What an export said, once it has been read. */
interface Exported {
  animations: string[];
  skins: string[];
  events: string[];
}

const exported = new Map<string, Exported>();
const reading = new Set<string>();

/** What a read that came to nothing leaves behind, so it is not tried again. */
const EMPTY_EXPORT: Exported = { animations: [], skins: [], events: [] };

/**
 * The animation and skin names written in a skeleton export.
 *
 * Plain JSON reading, with no Spine runtime involved — which is the point: this
 * has to work for a skeleton the node is **not** carrying, so there is no
 * `SkeletonData` to ask. A 4.x export lists its skins as objects with names, a
 * 3.8 one as an object keyed by name; both are read, because a game may be on
 * either.
 */
function parse(data: unknown): Exported {
  const root = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;

  const keys = (value: unknown): string[] =>
    typeof value === 'object' && value !== null ? Object.keys(value) : [];

  const skins = root['skins'];

  return {
    animations: keys(root['animations']),
    // A 4.x export lists its skins as objects with names, a 3.8 one as an
    // object keyed by name; both are read, because a game may be on either.
    skins: Array.isArray(skins)
      ? skins.map((skin) => String((skin as { name?: unknown }).name ?? ''))
      : keys(skins),
    events: keys(root['events']),
  };
}

/**
 * A skeleton's own export, read as plain JSON.
 *
 * The last of the three routes in `probe.ts` and the only one that needs no
 * runtime at all — which is also its limit: a binary `.skel` needs the reader
 * the other two have, so this one leaves it alone rather than guessing.
 *
 * The read is asynchronous and this is not, so the first answer is `pending` and
 * the panel asks again shortly. That is the pull model doing what it always
 * does; nothing is pushed at it.
 *
 * @returns null when there is nothing here to read and nothing on the way.
 */
export function animationsOf(
  name: string,
  root: typeof globalThis = globalThis,
): {
  animations: Array<{ name: string; duration: number }>;
  skins: string[];
  events: string[];
  pending: boolean;
} | null {
  const page = root as Root;
  refresh(page);

  const known = exported.get(name);
  if (known !== undefined) {
    return {
      // No durations: they are spread through the timelines, and working them
      // out would mean reading the animation rather than naming it.
      animations: known.animations.map((animation) => ({ name: animation, duration: 0 })),
      skins: [...known.skins],
      events: [...known.events],
      pending: false,
    };
  }

  const url = exportUrls.get(name);
  // A `.skel` is binary; reading it needs the runtime's own reader, which is the
  // one thing this module deliberately does without.
  if (url === undefined || /\.skel(?:$|[?#])/i.test(url)) return null;

  if (!reading.has(name) && typeof page.fetch === 'function') {
    reading.add(name);

    void page
      .fetch(url)
      .then(async (response) => (response.ok ? await response.json() : null))
      .then((data) => {
        // The empty answer is recorded too. A read that fails — gone,
        // cross-origin, not JSON after all — fails for a reason that will not
        // change, and leaving nothing here meant the next poll started the
        // same doomed request, and the one after that, for as long as the
        // section stayed open.
        exported.set(name, data === null ? EMPTY_EXPORT : parse(data));
      })
      .catch(() => {
        exported.set(name, EMPTY_EXPORT);
      })
      .finally(() => reading.delete(name));
  }

  return { animations: [], skins: [], events: [], pending: true };
}
