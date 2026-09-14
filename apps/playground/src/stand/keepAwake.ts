/**
 * Makes the page claim to be visible, always.
 *
 * `useResource` skips a tick while `document.hidden` is true — DevTools in the
 * background has no business poking the inspected page, and that is right for
 * the extension. On this stand it is not: a tab driven by browser automation
 * reports itself hidden, the shell never gets its first `session.status`, and
 * `screenFor` leaves it on `connecting` forever. It looks exactly like a broken
 * build, and it cost a long detour once already.
 *
 * On always rather than behind a flag or a query parameter. This stand exists
 * to be driven and photographed; a build that only works when a human happens
 * to be looking at it is the wrong default.
 */
export function keepAwake(): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}
