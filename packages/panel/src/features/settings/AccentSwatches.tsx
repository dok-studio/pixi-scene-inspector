import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { Hint } from '../../components/ui/tooltip.js';
import type { MessageKey } from '../../i18n/index.js';
import { useT } from '../../i18n/index.js';
import { ACCENT_SWATCH_COLOR, ACCENT_THEMES, type AccentTheme } from './accentTheme.js';

/**
 * The name each swatch answers to, as a key rather than a word — the store
 * holds the English name as its value, so only what is shown is translated.
 */
const ACCENT_LABEL_KEYS: Record<AccentTheme, MessageKey> = {
  Blue: 'settings.accent.Blue',
  Yellow: 'settings.accent.Yellow',
  Red: 'settings.accent.Red',
  Green: 'settings.accent.Green',
};

/**
 * The panel's own accent, picked as a colour rather than named in a `select`
 * — there is nothing to read here that the swatch itself does not already
 * say. The same single-select group `Segmented` uses, so the row already
 * behaves like every other choice in this panel: arrow keys move it, and one
 * of the four is always pressed.
 *
 * Laid out as one more row of the grid below it — same label width, same
 * height — even though it draws itself: a label the eye has already lined up
 * against eleven rows of `Fill` and `Outline` should not suddenly sit
 * somewhere else for the twelfth.
 */
export function AccentSwatches({
  value,
  onChange,
}: {
  value: AccentTheme;
  onChange: (next: AccentTheme) => void;
}) {
  const t = useT();

  return (
    <div className="flex min-h-7 min-w-0 items-center gap-4">
      <span className="text-foreground w-[11ch] flex-none break-words text-xs leading-tight">
        {t('settings.colorTheme')}
      </span>

      <ToggleGroupPrimitive.Root
        type="single"
        value={value}
        // Clicking the pressed swatch asks to select nothing, and an accent is
        // never unset: the store holds one of these whatever happens here.
        onValueChange={(next) => {
          if (next !== '') onChange(next as AccentTheme);
        }}
        className="flex gap-2"
      >
        {ACCENT_THEMES.map((theme) => (
          <Hint key={theme} text={t(ACCENT_LABEL_KEYS[theme])}>
            <ToggleGroupPrimitive.Item
              value={theme}
              className="ring-offset-background h-5 w-5 flex-none rounded-full outline-none transition-shadow aria-checked:ring-2 aria-checked:ring-foreground aria-checked:ring-offset-2 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              style={{ backgroundColor: ACCENT_SWATCH_COLOR[theme] }}
            />
          </Hint>
        ))}
      </ToggleGroupPrimitive.Root>
    </div>
  );
}
