import { useEffect } from 'react';

/**
 * Marks the document while Alt is held, so number fields can show the scrub
 * cursor before the drag starts (see `globals.css`). The blur listener matters:
 * Alt+Tab leaves the key "down" as far as the page is concerned.
 */
export function useGlobalAltState(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey) document.body.dataset['alt'] = 'true';
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (!event.altKey) delete document.body.dataset['alt'];
    };

    const onBlur = (): void => {
      delete document.body.dataset['alt'];
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
