import { describe, expect, it } from 'vitest';

import { COMMAND_NAMES, HOST_GLOBAL, PROTOCOL_VERSION } from './index.js';
import type { CommandName } from './index.js';

describe('protocol', () => {
  it('declares a contract version', () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  it('has no duplicates in the runtime command list', () => {
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length);
  });

  /**
   * `COMMAND_NAMES` is a runtime copy of the `CommandName` type, and copies
   * drift. This checks the "in the type but missing from the list" direction:
   * the `satisfies` clause in commands.ts catches the opposite one, but not a
   * forgotten command.
   *
   * The map below has to be extended with every new command. That is
   * intentional — one line here is cheaper than a silent `unknown-command`
   * at runtime.
   */
  it('runtime list covers every command in the type', () => {
    const expected: Record<CommandName, true> = {
      'session.status': true,
      'scene.tree': true,
      'scene.propSchema': true,
      'scene.propValues': true,
      'scene.setProp': true,
      'scene.mutate': true,
      'scene.log': true,
      'overlay.config': true,
      'spine.info': true,
      'spine.live': true,
      'spine.events': true,
      'spine.setEventCapture': true,
      'spine.setTrack': true,
      'spine.clearQueue': true,
      'spine.clearTrack': true,
      'spine.clearTracks': true,
      'spine.setTrackTime': true,
      'spine.setTrackParam': true,
      'spine.setLoop': true,
      'spine.setTimeScale': true,
      'spine.createTest': true,
      'spine.setSkin': true,
      'spine.applySetup': true,
        'text.tagStyleFields': true,
      'text.tagStyles': true,
      'text.mutateTag': true,
      'text.styleSnippet': true,
      'assets.list': true,
      'assets.names': true,
      'assets.preview': true,
      'assets.frames': true,
      'assets.users': true,
      'stats.frame': true,
      'stats.textures': true,
      'stats.setRecording': true,
      'stats.record': true,
    };
    expect([...COMMAND_NAMES].sort()).toEqual(Object.keys(expected).sort());
  });

  it('host global name is a valid JS identifier', () => {
    expect(HOST_GLOBAL).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
  });
});
