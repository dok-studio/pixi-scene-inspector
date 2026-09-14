import { useEffect, useState } from 'react';
import { FaCheck as CheckIcon, FaRegCopy as ClipboardIcon } from 'react-icons/fa6';

import { Button } from './button.js';
import { Hint } from './tooltip.js';

/**
 * Ported from the previous project's `CopyToClipboardButton`: the icon becomes
 * a tick for two seconds, which is the whole confirmation — a panel this small
 * has nowhere to put a toast.
 *
 * The write is fire-and-forget and its failure is swallowed: a clipboard the
 * browser refuses is not something the panel can do anything about, and an
 * unhandled rejection in a DevTools page is noise in someone else's console.
 */
export function CopyButton({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => {
      setCopied(false);
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <Hint text={title}>
      <Button
        variant="outline"
        size="xs"
        className="px-1"
        disabled={value === ''}
        onClick={(event) => {
          // The button is drawn inside a section header too, and a header is a
          // fold: without this, copying would also close what was copied.
          event.stopPropagation();

          void navigator.clipboard?.writeText(value).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
      </Button>
    </Hint>
  );
}
