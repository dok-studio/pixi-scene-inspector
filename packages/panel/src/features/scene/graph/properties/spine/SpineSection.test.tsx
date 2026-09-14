// @vitest-environment happy-dom
import type {
  CommandName,
  CommandParams,
  CommandResult,
  SpineInfo,
  SpineLive,
  SpineTrack,
} from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '../../../../../transport/client.js';
import { forgetSetups } from './setups.js';
import { SpineSection } from './SpineSection.js';

/**
 * The one rule this section exists to keep: **nothing starts an animation
 * except Play.**
 *
 * It is worth rendering to check because it cannot be checked anywhere else.
 * `AnimationState.setAnimation` starts an animation the moment it is called, so
 * "chosen but not started" is a state only the panel can hold — and the version
 * before this one did not, which is why adding a track grabbed the skeleton's
 * first animation and ran it looping.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const INFO: SpineInfo = {
  skins: ['default', 'alt'],
  animations: [
    { name: 'walk', duration: 1.5 },
    { name: 'jump', duration: 0.8 },
  ],
  events: ['footstep'],
  pending: false,
  skeletons: ['circle', 'circle-small'],
  canChangeSkeleton: true,
};

function track(overrides: Partial<SpineTrack> = {}): SpineTrack {
  return {
    index: 0,
    animation: 'walk',
    loop: true,
    time: 0.25,
    duration: 1.5,
    timeScale: 1,
    alpha: 1,
    mixDuration: 0.2,
    mixTime: 0,
    mixingFrom: null,
    complete: false,
    queue: [],
    ...overrides,
  };
}

function liveWith(tracks: SpineTrack[]): SpineLive {
  return {
    tracks,
    timeScale: 1,
    skin: 'default',
    skeleton: 'circle',
  };
}

/** The node the page reports having built for a test tab. */
const TEST_NODE = 99;

interface Sent {
  cmd: CommandName;
  params: unknown;
}

/** Serves a live state the test can change between one poll and the next. */
/** What the page answers, where a case needs it to answer differently. */
interface Page {
  info: SpineInfo;
  /** What `spine.createTest` gives back — null where it cannot build. */
  built: { id: number } | null;
}

const PAGE: Page = { info: INFO, built: { id: TEST_NODE } };

function fakeClient(
  live: { current: SpineLive },
  sent: Sent[],
  asked: unknown[] = [],
  page: Page = PAGE,
): Client {
  const client: Client = {
    call<K extends CommandName>(cmd: K, params: CommandParams<K>): Promise<CommandResult<K>> {
      if (cmd === 'spine.info') {
        asked.push(params);
        return Promise.resolve(page.info as CommandResult<K>);
      }
      if (cmd === 'spine.live') return Promise.resolve(live.current as CommandResult<K>);
      if (cmd === 'spine.events') {
        return Promise.resolve({ entries: [], dropped: 0, cursor: 0 } as CommandResult<K>);
      }

      sent.push({ cmd, params });

      // Building a test Spine answers with the node it put in the scene; the
      // panel needs that id to poll and to address it afterwards.
      if (cmd === 'spine.createTest') {
        return Promise.resolve(page.built as CommandResult<K>);
      }

      return Promise.resolve(undefined as CommandResult<K>);
    },
    send(cmd, params) {
      sent.push({ cmd, params });
    },
  };

  return client;
}

describe('SpineSection', () => {
  let container: HTMLElement;
  let root: Root;
  let sent: Sent[];
  let asked: unknown[];
  let live: { current: SpineLive };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    sent = [];
    asked = [];
    live = { current: liveWith([]) };
    forgetSetups();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    forgetSetups();
  });

  const show = async (
    initial: SpineLive,
    page: Page = PAGE,
    visible = true,
  ): Promise<void> => {
    live.current = initial;

    await act(async () => {
      root.render(
        <SpineSection client={fakeClient(live, sent, asked, page)} id={1} visible={visible} />,
      );
      await Promise.resolve();
    });
    // The info resource and the live loop each settle a promise of their own.
    await act(async () => {
      await Promise.resolve();
    });
  };

  /** Waits out one turn of the section's own loop, so a changed page shows. */
  const poll = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
  };

  const click = (element: HTMLElement): void => {
    act(() => {
      element.click();
    });
  };

  /*
   * Queried against the document rather than the container: Radix draws a
   * popover into a portal, which is a sibling of what this test mounted into.
   */
  const button = (title: string): HTMLButtonElement => {
    const found = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`);
    if (found === null) throw new Error(`No button titled ${title}`);
    return found;
  };

  const buttonStarting = (text: string): HTMLButtonElement => {
    const found = [...document.body.querySelectorAll('button')].find(
      (element) => element.textContent?.startsWith(text) === true,
    );
    if (found === undefined) throw new Error(`No button starting with ${text}`);
    return found;
  };

  const ADD = 'Add an empty track. Nothing starts until Play.';
  const ADD_TEST = 'Build a second Spine beside this one, to try things on';
  const PLAY = 'Start the chosen animation';

  /** Opens the one track row's picker and chooses an animation by name. */
  const chooseAnimation = (name: string): void => {
    // By title, because the skin chooser is a popover trigger too and comes
    // first in the document.
    const picker = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose an animation"], button[aria-label="Chosen — press Play to start it"]',
    );
    if (picker === null) throw new Error('No animation picker');

    click(picker);
    click(buttonStarting(name));
  };

  const typeInto = (label: string, value: string): void => {
    const field = [...container.querySelectorAll('label')]
      .find((element) => element.textContent?.startsWith(label) === true)
      ?.querySelector('input');
    if (field === undefined || field === null) throw new Error(`No ${label} field`);

    act(() => {
      // Through the prototype's setter: React tracks the instance property, so
      // assigning to it directly leaves the change looking like no change.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  };

  const rows = (): number => container.querySelectorAll('button[aria-label="Remove this track"]').length;

  it('shows the skeleton and the track it is running', async () => {
    await show(liveWith([track()]));

    expect(container.textContent).toContain('circle');
    expect(container.textContent).toContain('walk');
    expect(rows()).toBe(1);
  });

  /**
   * The complaint this section was rebuilt around. Adding a track used to send
   * `spine.setTrack` with the skeleton's first animation and `loop: true`, so a
   * track appeared already running something nobody had chosen.
   */
  it('adds a track without sending anything at all', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    click(button(ADD));

    expect(sent).toEqual([]);
    expect(rows()).toBe(2);
  });

  it('leaves Play with nothing to do until an animation is chosen', async () => {
    await show(liveWith([]));

    click(button(ADD));

    expect(button(PLAY).disabled).toBe(true);
  });

  it('does not start the animation when one is picked', async () => {
    await show(liveWith([]));
    click(button(ADD));
    sent.length = 0;

    chooseAnimation('jump');

    expect(sent).toEqual([]);
  });

  /**
   * And then exactly one call, carrying the numbers set beforehand — because
   * the entry they belong to does not exist until this call makes it.
   */
  it('starts the chosen animation on Play, at the speed already set', async () => {
    await show(liveWith([]));
    click(button(ADD));
    chooseAnimation('jump');
    typeInto('speed', '0.5');

    sent.length = 0;
    click(button(PLAY));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.cmd).toBe('spine.setTrack');
    expect(sent[0]?.params).toMatchObject({
      track: 0,
      animation: 'jump',
      loop: false,
      params: { timeScale: 0.5 },
    });
  });

  /**
   * A track added here is a track being tried, and an animation you have not
   * seen yet is one to watch once and look at the end of. Looping hides that
   * ending, and it used to be on before anybody chose it.
   */
  it('adds a track with looping off', async () => {
    await show(liveWith([]));

    click(button(ADD));

    const loop = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Repeat the animation"]',
    );
    expect(loop?.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * The index decides the order tracks are applied in — a higher one draws over
   * a lower one — so it is a control, not a label. Nothing in Spine renames an
   * entry, so a running one is cleared and started again on its new index.
   */
  it('moves a running track to the index typed into it', async () => {
    await show(liveWith([track({ index: 0, animation: 'walk' })]));
    sent.length = 0;

    typeInto('#', '2');

    expect(sent).toEqual([
      { cmd: 'spine.clearTrack', params: { id: 1, track: 0 } },
      {
        cmd: 'spine.setTrack',
        params: {
          id: 1,
          track: 2,
          animation: 'walk',
          loop: true,
          params: { timeScale: 1, alpha: 1, mixDuration: 0.2 },
        },
      },
    ]);
  });

  /**
   * Writing over the other row would merge two into one, and the one that lost
   * would be the one nobody was editing.
   */
  it('refuses an index another track is on, and stays put', async () => {
    await show(liveWith([track({ index: 0 }), track({ index: 1, animation: 'jump' })]));
    sent.length = 0;

    typeInto('#', '1');

    expect(sent).toEqual([]);
    // The field goes back to what the row actually is.
    const field = document.body.querySelector<HTMLInputElement>('label[aria-label="Track index"] input');
    expect(field?.value).toBe('0');
  });

  /** The one string here that is nowhere else on screen to select with a mouse. */
  it('offers the animation name for copying', async () => {
    await show(liveWith([track({ animation: 'walk' })]));

    const copy = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy the animation name"]',
    );

    expect(copy).not.toBeNull();
    expect(copy?.disabled).toBe(false);
  });

  /**
   * Going through `setAnimation` to change `loop` builds a new `TrackEntry` and
   * drops the playhead to zero, so the animation restarted for no reason the
   * user could see. It is a flag on the entry, and it is written as one.
   */
  it('changes looping in place rather than restarting the track', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    click(button('Repeat the animation'));

    expect(sent).toEqual([
      { cmd: 'spine.setLoop', params: { id: 1, track: 0, loop: false } },
    ]);
  });

  /**
   * A pause is a speed of zero, and the next poll reports that as the track's
   * speed — so unless the panel holds what it was, Resume can only offer to
   * carry on at a standstill. This is the whole reason a running track has a
   * draft at all.
   */
  it('resumes at the speed it was paused from', async () => {
    await show(liveWith([track({ timeScale: 0.5 })]));
    sent.length = 0;

    click(button('Pause'));

    expect(sent).toEqual([
      { cmd: 'spine.setTrackParam', params: { id: 1, track: 0, key: 'timeScale', value: 0 } },
    ]);

    // What the page now reports, which is what would otherwise be resumed to.
    live.current = liveWith([track({ timeScale: 0 })]);
    await poll();
    sent.length = 0;

    click(button('Resume'));

    expect(sent).toEqual([
      { cmd: 'spine.setTrackParam', params: { id: 1, track: 0, key: 'timeScale', value: 0.5 } },
    ]);
  });

  it('removes a running track by clearing it, and an added row by forgetting it', async () => {
    await show(liveWith([track()]));

    click(button(ADD));
    expect(rows()).toBe(2);
    sent.length = 0;

    // The added row is the second one, and nothing in the page knows about it.
    const removes = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Remove this track"]',
    );
    click(removes[1] as HTMLButtonElement);

    expect(sent).toEqual([]);
    expect(rows()).toBe(1);

    click(button('Remove this track'));
    expect(sent).toEqual([{ cmd: 'spine.clearTrack', params: { id: 1, track: 0 } }]);
  });

  /**
   * The host lives in the inspected page and is installed there once: rebuild
   * the extension without reloading the page, and the panel is talking to the
   * host from before the rebuild. It answers the shape it knew, and a field
   * added since is simply missing — which took the whole panel down with
   * "Cannot read properties of undefined (reading 'length')" on a real game.
   */
  it('draws against a host older than itself rather than falling over', async () => {
    const older = {
      // What the host answered two builds ago: no `skeletons`, no
      // `assetsReadable`, and tracks with no `queue`.
      info: { skeleton: 'circle', skins: ['default'], animations: [{ name: 'walk', duration: 1 }] },
      live: { tracks: [{ index: 0, animation: 'walk', loop: true, time: 0, duration: 1 }] },
    };

    const client: Client = {
      call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
        // Cast through `unknown`: the whole point is a shape this build's
        // types no longer describe.
        if (cmd === 'spine.info') return Promise.resolve(older.info as unknown as CommandResult<K>);
        if (cmd === 'spine.live') return Promise.resolve(older.live as unknown as CommandResult<K>);
        return Promise.resolve(undefined as CommandResult<K>);
      },
      send() {},
    };

    await act(async () => {
      root.render(<SpineSection client={client} id={1} visible />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Skeleton');
    expect(container.textContent).toContain('walk');
  });

  /**
   * A test gets a Spine of its own, and until it is asked for a skeleton it has
   * none. Adding a tab must therefore touch nothing at all: the whole point of
   * a test is that the game's node is left as it was.
   */
  it('adds an empty tab without sending anything', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    click(button(ADD_TEST));

    expect(sent).toEqual([]);
    // Two tabs now, and the empty one is the one open.
    expect(document.body.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });

  /** No Spine yet, so there is nothing to draw tracks or a log for. */
  it('shows a tab with no Spine as one question and nothing else', async () => {
    await show(liveWith([track()]));

    click(button(ADD_TEST));

    expect(container.textContent).toContain('skeleton');
    expect(container.textContent).not.toContain('Add track');
    expect(container.textContent).not.toContain('Info');
  });

  /**
   * Choosing the skeleton is what builds the Spine — there is nothing to stage,
   * because the node being built is the panel's own.
   */
  it('builds the test Spine when a skeleton is chosen', async () => {
    await show(liveWith([track()]));
    click(button(ADD_TEST));
    sent.length = 0;

    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(sent).toContainEqual({
      cmd: 'spine.createTest',
      params: { id: 1, skeleton: 'circle-small' },
    });
  });

  /**
   * The scene has room for one Spine in that place, so showing one is a choice
   * of one — and the game's own node goes back to what it *was*, not to `true`.
   */
  it('shows one Spine at a time, and hides the rest', async () => {
    await show(liveWith([track()]));
    click(button(ADD_TEST));

    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    await act(async () => {
      await Promise.resolve();
    });

    const shown = sent.filter((one) => one.cmd === 'scene.setProp');
    expect(shown).toContainEqual({
      cmd: 'scene.setProp',
      params: { id: 1, key: 'visible', value: false },
    });
    expect(shown).toContainEqual({
      cmd: 'scene.setProp',
      params: { id: 99, key: 'visible', value: true },
    });
  });

  /**
   * A Spine the game had deliberately hidden must not come back on because the
   * inspector looked at it. What the panel took away is what it gives back.
   */
  it('gives the original back the visibility it found, not true', async () => {
    await show(liveWith([track()]), PAGE, false);
    click(button(ADD_TEST));
    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    await act(async () => {
      await Promise.resolve();
    });
    sent.length = 0;

    const original = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Show this one instead"]',
    );
    if (original === null) throw new Error('No tab to switch to');
    click(original);

    expect(sent).toContainEqual({
      cmd: 'scene.setProp',
      params: { id: 1, key: 'visible', value: false },
    });
  });

  /** The game's own node is not the panel's to take out of the scene. */
  it('offers no way to close the original', async () => {
    await show(liveWith([track()]));
    click(button(ADD_TEST));

    const closers = document.body.querySelectorAll(
      'button[aria-label="Take this test Spine out of the scene"]',
    );
    expect(closers).toHaveLength(1);
  });

  it('takes the test Spine out of the scene when its tab is closed', async () => {
    await show(liveWith([track()]));
    click(button(ADD_TEST));
    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    await act(async () => {
      await Promise.resolve();
    });
    sent.length = 0;

    click(button('Take this test Spine out of the scene'));

    expect(sent).toContainEqual({
      cmd: 'scene.mutate',
      params: { kind: 'delete', id: 99 },
    });
  });

  /** Opens a test tab and gives it a skeleton to build. */
  const buildTest = async (name: string): Promise<void> => {
    click(button(ADD_TEST));
    click(button('Change which skeleton this node carries'));
    click(buttonStarting(name));
    await act(async () => {
      await Promise.resolve();
    });
  };

  /**
   * A skeleton built here answers to no name of its own — `SkeletonJson` never
   * fills `SkeletonData.name` in — so the tab shows what it asked for. Reading
   * the node instead showed the original's name on a tab carrying another
   * skeleton entirely.
   */
  it('names a test tab after the skeleton it was told to build', async () => {
    await show(liveWith([track()]));

    await buildTest('circle-small');

    const row = container.querySelector('button[aria-label="Change which skeleton this node carries"]');
    expect(row?.textContent).toContain('circle-small');
  });

  /**
   * Changing the skeleton of the game's own node needs the game's own method,
   * and most have none. A test Spine needs nothing of the sort: it is ours, and
   * the answer to another skeleton is another one of ours.
   */
  it('lets a test tab choose a skeleton the application could not change', async () => {
    const fixed = { ...PAGE, info: { ...INFO, canChangeSkeleton: false } };
    await show(liveWith([track()]), fixed);

    expect(container.textContent).toContain('offers no way to change the skeleton');

    click(button(ADD_TEST));

    expect(button('Change which skeleton this node carries')).not.toBeNull();
  });

  /**
   * On v6 and v7 there is nothing that builds a `SkeletonData`, so a skeleton
   * the asset store is not already holding cannot be had. A click that appears
   * to do nothing is the one answer worse than the refusal.
   */
  it('says so when the page cannot build the skeleton asked for', async () => {
    await show(liveWith([track()]), { ...PAGE, built: null });

    await buildTest('circle-small');

    expect(container.textContent).toContain('Could not build');
  });

  /**
   * Choosing a skeleton is a choice, not an act. Changing it on its own rebuilds
   * the animation state, so the node ends up carrying nothing and drawing
   * nothing — which is what happened, and why it goes down with the tracks
   * behind it or not at all.
   */
  it('chooses a skeleton without touching the scene', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));

    expect(sent).toEqual([]);
    expect(button('Put this setup on the skeleton')).toBeDefined();
  });

  it('puts the skeleton down with the whole setup behind it, on Apply', async () => {
    await show(liveWith([track()]));
    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    sent.length = 0;

    click(button('Put this setup on the skeleton'));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.cmd).toBe('spine.applySetup');
    expect(sent[0]?.params).toMatchObject({ id: 1, skeleton: 'circle-small' });
  });

  /**
   * The lists belong to the skeleton being chosen, not to the one loaded. Asking
   * about the node's own after a change is what showed the previous skeleton's
   * animations on a freshly added track.
   */
  it('asks about the skeleton it has chosen, not the one on the node', async () => {
    await show(liveWith([track()]));
    asked.length = 0;

    click(button('Change which skeleton this node carries'));
    click(buttonStarting('circle-small'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(asked.at(-1)).toMatchObject({ id: 1, skeleton: 'circle-small' });
  });

  /**
   * The one part that is only read: what the skeleton contains, as opposed to
   * what it is doing.
   */
  it('lists what the skeleton contains', async () => {
    await show(liveWith([track()]));

    const info = [...document.body.querySelectorAll('div')].find(
      (element) => element.textContent === 'Info',
    );
    expect(info).toBeDefined();
    expect(container.textContent).toContain('footstep');
  });

  /**
   * An absent list says "this skeleton has no events" more plainly than a
   * present and empty one does.
   */
  it('draws no events row for a skeleton that keys none', async () => {
    const client: Client = {
      call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
        if (cmd === 'spine.info') {
          return Promise.resolve({ ...INFO, events: [] } as CommandResult<K>);
        }
        if (cmd === 'spine.live') return Promise.resolve(liveWith([track()]) as CommandResult<K>);
        return Promise.resolve(undefined as CommandResult<K>);
      },
      send() {},
    };

    await act(async () => {
      root.render(<SpineSection client={client} id={1} visible />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('animations');
    expect(container.textContent).not.toContain('events');
  });

/**
   * One skin, because that is what a skeleton wears: `setSkin` takes one and
   * reports one back. Choosing another replaces it rather than adding to it.
   */
  it('wears one skin, and swaps it for another', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    // The first click opens the chooser, whose trigger reads what is worn.
    click(buttonStarting('default'));
    click(buttonStarting('alt'));

    expect(sent).toEqual([{ cmd: 'spine.setSkin', params: { id: 1, skin: 'alt' } }]);
  });

  /** And it can wear none: a skeleton with no skin is a state the runtime has. */
  it('undresses the skeleton when nothing is chosen', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    click(buttonStarting('default'));
    click(buttonStarting('—'));

    expect(sent).toEqual([{ cmd: 'spine.setSkin', params: { id: 1, skin: null } }]);
  });

  /**
   * The listener in the page is a cost, so it exists only while the log does —
   * the same rule the render hook keeps.
   */
  it('starts capturing events only when the log is opened', async () => {
    await show(liveWith([track()]));
    sent.length = 0;

    expect(sent.some((one) => one.cmd === 'spine.setEventCapture')).toBe(false);

    const header = [...container.querySelectorAll('div')].find(
      (element) => element.textContent === 'Events',
    );
    if (header === undefined) throw new Error('No Events header');

    await act(async () => {
      header.click();
      await Promise.resolve();
    });

    expect(sent.find((one) => one.cmd === 'spine.setEventCapture')?.params).toMatchObject({
      on: true,
    });
  });
});
