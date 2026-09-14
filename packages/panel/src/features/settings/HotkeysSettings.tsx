import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button.js';
import { Separator } from '../../components/ui/separator.js';
import { Switch } from '../../components/ui/switch.js';
import { useT } from '../../i18n/index.js';
import type { HotkeyAction, HotkeyBinding } from './hotkeys.js';
import {
  HOTKEY_LABEL_KEYS,
  formatBinding,
  setHotkey,
  setHotkeysEnabled,
  useHotkeys,
  useHotkeysEnabled,
} from './hotkeys.js';

/**
 * The Hotkeys tab: one row per action, each with a button that records the
 * next key pressed rather than a picklist — there is no fixed set of keys to
 * choose among, only whatever the keyboard sends.
 *
 * Its own small component rather than the `PropertyGrid` the other tabs use:
 * that grid's rows are node properties crossing the bridge (`key` is a path
 * into a node, see `protocol/src/model.ts`), and a hotkey is neither.
 */

const ACTIONS: readonly HotkeyAction[] = ['picker', 'highlight', 'wrapBox', 'axes', 'transform', 'counts'];

/** `code`s a binding never ends on — the modifier is still being held down. */
const MODIFIER_CODES = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
]);

export function HotkeysSettings() {
  const t = useT();
  const hotkeys = useHotkeys();
  const enabled = useHotkeysEnabled();
  const [recording, setRecording] = useState<HotkeyAction | null>(null);

  useEffect(() => {
    if (recording === null) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();

      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }

      // Still waiting for the key the modifier is going to be held with.
      if (MODIFIER_CODES.has(event.code)) return;

      const binding: HotkeyBinding = {
        code: event.code,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
      };
      setHotkey(recording, binding);
      setRecording(null);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [recording]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="text-xs">{t('settings.hotkeys.enabled')}</span>
        <Switch className="bg-border h-5" checked={enabled} onCheckedChange={setHotkeysEnabled} />
      </div>

      <Separator />

      {/* Left as editable while turned off: someone re-enabling them later
          should not have to redo the rebinding they came here to do first. */}
      <div className={enabled ? undefined : 'opacity-50'}>
        {ACTIONS.map((action) => (
          <div key={action} className="flex items-center justify-between gap-2 py-1">
            <span className="text-xs">{t(HOTKEY_LABEL_KEYS[action])}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 min-w-24 text-xs"
              onClick={() => {
                setRecording(action);
              }}
            >
              {recording === action ? t('settings.hotkeys.press') : formatBinding(hotkeys[action])}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
