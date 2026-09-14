import { useCallback, useEffect, useRef, useState } from 'react';

import type { GameHandle, GameStatus } from '../game/createGame.js';
import { createGame } from '../game/createGame.js';
import { Toolbar } from './Toolbar.js';

/**
 * The left half of the stand: the toolbar and the canvas under it.
 *
 * The game is built in an effect and may be built twice — StrictMode does that
 * in development, and so does HMR. Both would otherwise leave two applications
 * racing for one host, which is why an effect that has already been cleaned up
 * destroys whatever its own build returns rather than handing it on.
 */
export function StandPane(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<GameHandle | null>(null);
  const [status, setStatus] = useState<GameStatus | null>(null);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void createGame(element).then((created) => {
      if (cancelled) {
        created.destroy();
        return;
      }

      game.current = created;
      unsubscribe = created.onStatus(setStatus);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      game.current?.destroy();
      game.current = null;
    };
  }, []);

  const setMode = useCallback((mode: 'run' | 'step') => {
    game.current?.setMode(mode);
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    game.current?.setPaused(paused);
  }, []);

  const restart = useCallback(() => {
    game.current?.restart();
  }, []);

  return (
    <div className="stand-pane">
      <Toolbar onModeChange={setMode} onPauseChange={setPaused} onRestart={restart} status={status} />
      <div className="stand-stage" ref={host} />
    </div>
  );
}
