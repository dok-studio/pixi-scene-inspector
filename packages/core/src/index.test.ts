import type {
  CommandName,
  RequestEnvelope,
  ResponseEnvelope,
  SceneTreePayload,
} from '@scene-inspector/protocol';
import { HOST_GLOBAL, PROTOCOL_VERSION } from '@scene-inspector/protocol';
import { describe, expect, it, vi } from 'vitest';

import { install } from './index.js';

/**
 * The page side end to end: `install` on a window, a serialized envelope in, a
 * serialized envelope out. Everything below — detection, adapter, registry,
 * tree — is exercised through the one entry point the extension actually uses.
 *
 * What this covers that the unit tests do not is the wiring itself: that the
 * registry survives between calls (so ids are stable), and that detection is
 * re-run per call rather than captured at install time.
 */

type Fake = Record<string, unknown>;

function sprite(label: string): Fake {
  return {
    renderPipeId: 'sprite',
    label,
    children: [],
    visible: true,
    alpha: 1,
    position: { x: 0, y: 0 },
  };
}

function container(label: string, children: Fake[]): Fake {
  return {
    includeInBuild: true,
    measurable: true,
    _didLocalTransformChangeId: 0,
    label,
    children,
    visible: true,
  };
}

function pixiPage(): Fake {
  const stage = container('', [container('world', [sprite('hero')])]);
  return { __PIXI_APP__: { stage, renderer: { renderPipes: {} } } };
}

/**
 * A page that records what it fetched, as every browser does.
 *
 * The buffer it hands over is deliberately empty: the point of the case below
 * is *when* the subscription happens, not what is in it. A real one drops its
 * oldest entries, so a game that has loaded a thousand files by the time anyone
 * opens DevTools has already forgotten the ones that name its skeletons.
 */
function recordingPage(): { page: Fake; observed: Array<{ type: string; buffered: boolean }> } {
  const observed: Array<{ type: string; buffered: boolean }> = [];
  const page = pixiPage();

  page['performance'] = { getEntriesByType: () => [] };
  page['PerformanceObserver'] = class {
    observe(options: { type: string; buffered: boolean }): void {
      observed.push(options);
    }
  };

  return { page, observed };
}

let nextId = 1;

function call<K extends CommandName>(
  page: Fake,
  cmd: K,
  params: RequestEnvelope<K>['params'],
): ResponseEnvelope<K> {
  const host = page[HOST_GLOBAL] as { call(raw: string): string };
  const envelope: RequestEnvelope<K> = { v: PROTOCOL_VERSION, id: nextId++, cmd, params };

  return JSON.parse(host.call(JSON.stringify(envelope))) as ResponseEnvelope<K>;
}

function treeOf(page: Fake, rev?: number) {
  const response = call(page, 'scene.tree', rev === undefined ? {} : { rev });
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
}

function nodesOf(page: Fake, rev?: number): SceneTreePayload['nodes'] {
  const result = treeOf(page, rev);
  if ('unchanged' in result) throw new Error('expected data, got unchanged');
  return result.data.nodes;
}

describe('install', () => {
  it('answers scene.tree with the page’s graph', () => {
    const page = pixiPage();
    install(page);

    expect(nodesOf(page).map((node) => node.name)).toEqual(['', 'world', 'hero']);
  });

  /**
   * The registry lives in the session, not in the call. If it were rebuilt per
   * request, every poll would renumber the tree and the panel would lose its
   * selection and its expanded rows on every tick.
   */
  it('keeps node ids stable between calls', () => {
    const page = pixiPage();
    install(page);

    expect(nodesOf(page).map((n) => n.id)).toEqual(nodesOf(page).map((n) => n.id));
  });

  it('answers unchanged when handed back the revision it just gave out', () => {
    const page = pixiPage();
    install(page);
    const first = treeOf(page);

    expect(treeOf(page, first.rev)).toEqual({ rev: first.rev, unchanged: true });
  });

  /**
   * A destroyed application is still sitting in the global that found it, and
   * its renderer still looks like one — but there is nothing left to read. The
   * not-detected screen exists for exactly this, and reporting "connected" put
   * an empty scene under a panel that claimed to be working.
   */
  it('reports a destroyed application as not connected', () => {
    const page = pixiPage();
    install(page);

    const before = call(page, 'session.status', {});
    if (!before.ok) throw new Error('expected a status');
    expect(before.result.connected).toBe(true);

    const app = page['__PIXI_APP__'] as { stage: Record<string, unknown> };
    app.stage['destroyed'] = true;

    const after = call(page, 'session.status', {});
    if (!after.ok) throw new Error('expected a status');
    expect(after.result.connected).toBe(false);
    expect(after.result.source).toBeNull();
  });

  /**
   * The panel is not remounted across a navigation, so it needs to be told
   * that the ids it holds have been handed out again to different things.
   */
  it('gives each install a generation of its own, steady between calls', () => {
    const first = pixiPage();
    install(first);

    const second = pixiPage();
    install(second);

    const a = call(first, 'session.status', {});
    const b = call(second, 'session.status', {});
    if (!a.ok || !b.ok) throw new Error('expected a status');

    expect(a.result.generation).not.toBe(0);
    expect(a.result.generation).not.toBe(b.result.generation);

    const again = call(first, 'session.status', {});
    if (!again.ok) throw new Error('expected a status');
    expect(again.result.generation).toBe(a.result.generation);
  });

  it('reports an empty tree on a page with no PixiJS', () => {
    const page: Fake = {};
    install(page);

    expect(nodesOf(page)).toEqual([]);
  });

  /**
   * Detection is deliberately not cached, so an application created after the
   * inspector was installed is picked up on the next poll — no reload, no
   * separate "connect" step.
   */
  it('picks up an application that appears after install', () => {
    const page: Fake = {};
    install(page);
    expect(nodesOf(page)).toEqual([]);

    page['__PIXI_APP__'] = pixiPage()['__PIXI_APP__'];

    expect(nodesOf(page).map((node) => node.name)).toEqual(['', 'world', 'hero']);
  });

  /**
   * Properties end to end: the id comes out of the tree, goes back in through
   * `propValues`, and a write through `setProp` lands on the node the panel
   * was looking at. This is the whole editing path, minus React.
   */
  describe('properties', () => {
    function selectHero(page: Fake): number {
      const hero = nodesOf(page).find((node) => node.name === 'hero');
      if (hero === undefined) throw new Error('hero missing from the tree');
      return hero.id;
    }

    it('describes a node type', () => {
      const page = pixiPage();
      install(page);
      const response = call(page, 'scene.propSchema', { type: 'Sprite' });

      expect(response.ok && response.result.map((section) => section.id)).toContain('general');
    });

    it('reads the values the panel asks for, by tree id', () => {
      const page = pixiPage();
      install(page);
      const response = call(page, 'scene.propValues', {
        id: selectHero(page),
        keys: ['alpha', 'position'],
      });

      expect(response.ok && 'data' in response.result && response.result.data).toEqual({
        alpha: 1,
        position: { x: 0, y: 0 },
      });
    });

    it('writes a value onto the node the id refers to', () => {
      const page = pixiPage();
      install(page);

      call(page, 'scene.setProp', { id: selectHero(page), key: 'alpha', value: 0.25 });

      const response = call(page, 'scene.propValues', { id: selectHero(page), keys: ['alpha'] });
      expect(response.ok && 'data' in response.result && response.result.data).toEqual({
        alpha: 0.25,
      });
    });

    it('writes one component of a transform', () => {
      const page = pixiPage();
      install(page);

      call(page, 'scene.setProp', {
        id: selectHero(page),
        key: 'position',
        value: { x: 5, y: 7 },
      });

      const response = call(page, 'scene.propValues', { id: selectHero(page), keys: ['position'] });
      expect(response.ok && 'data' in response.result && response.result.data).toEqual({
        position: { x: 5, y: 7 },
      });
    });

    it('answers unchanged for a node that is standing still', () => {
      const page = pixiPage();
      install(page);
      const id = selectHero(page);
      const first = call(page, 'scene.propValues', { id, keys: ['alpha'] });
      if (!first.ok) throw new Error('first read failed');

      const second = call(page, 'scene.propValues', { id, keys: ['alpha'], rev: first.result.rev });
      expect(second.ok && second.result).toEqual({ rev: first.result.rev, unchanged: true });
    });

    it('reports no values for an id that is not in the scene', () => {
      const page = pixiPage();
      install(page);
      const response = call(page, 'scene.propValues', { id: 9999, keys: ['alpha'] });

      expect(response.ok && 'data' in response.result && response.result.data).toEqual({});
    });

    it('refuses a write the schema does not declare, without failing the call', () => {
      const page = pixiPage();
      install(page);
      const response = call(page, 'scene.setProp', {
        id: selectHero(page),
        key: 'renderPipeId',
        value: 'graphics',
      });

      expect(response.ok).toBe(true);
      expect(nodesOf(page).find((node) => node.name === 'hero')?.type).toBe('Sprite');
    });

    /**
     * The point of the command is the **object**, not a reading of it: what
     * reaches the console has to be the very node the page is drawing, or the
     * console is showing a copy that stops being true the moment the scene
     * moves. Hence an identity check rather than a shape match — and the
     * caption in front of it must not have cost it its place in the same entry
     * (`logNode`).
     */
    it('logs the node itself, not a reading of it', () => {
      const page = pixiPage();
      install(page);
      const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        call(page, 'scene.log', { id: selectHero(page) });

        const stage = (page['__PIXI_APP__'] as { stage: { children: Fake[] } }).stage;
        const hero = (stage.children[0] as { children: Fake[] }).children[0];
        const args = logged.mock.calls[0] ?? [];

        expect(args[args.length - 1]).toBe(hero);
        expect(String(args[0])).toContain('Sprite “hero”');
      } finally {
        logged.mockRestore();
      }
    });

    it('writes nothing for an id the scene no longer has, and still answers', () => {
      const page = pixiPage();
      install(page);
      const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      try {
        const response = call(page, 'scene.log', { id: 9999 });

        expect(response.ok).toBe(true);
        expect(logged).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    });
  });

  it('still answers session.status', () => {
    const page = pixiPage();
    install(page);
    const response = call(page, 'session.status', {});

    // Written as a shape match rather than a property read: the linter forbids
    // touching `.major` outside the adapters, and a blunt rule that needs no
    // exceptions is worth more than a tidier assertion here.
    expect(response.ok && response.result).toMatchObject({ connected: true, major: 8 });
  });

  /**
   * The host is installed at `document_start`, before the page has fetched
   * anything — which is the only moment from which the whole of what it fetches
   * can be seen. Subscribing on the first question instead meant subscribing
   * after the buffer had already dropped the files that mattered, and the
   * skeleton chooser came up empty on exactly the games it exists for.
   */
  it('starts watching what the page fetches at install, not at the first question', () => {
    const { page, observed } = recordingPage();

    install(page);

    expect(observed).toEqual([{ type: 'resource', buffered: true }]);
  });
});
