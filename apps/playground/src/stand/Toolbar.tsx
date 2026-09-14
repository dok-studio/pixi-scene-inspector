import type { GameStatus } from '../game/createGame.js';

/**
 * The strip above the canvas.
 *
 * Everything that is not steering lives here rather than on a key, because the
 * panel's own hotkeys listen on `window` and filter only form fields — a stand
 * that bound `R` to restart would be fighting the inspector for it. The arrows
 * are safe, and they are all the game takes.
 *
 * Styled with the stand's own classes rather than the panel's Tailwind tokens,
 * so switching the panel's theme for a screenshot leaves the game's side alone.
 */
export function Toolbar({
  status,
  onModeChange,
  onPauseChange,
  onRestart,
}: {
  status: GameStatus | null;
  onModeChange: (mode: 'run' | 'step') => void;
  onPauseChange: (paused: boolean) => void;
  onRestart: () => void;
}): JSX.Element {
  // Matches the game's own default until the first status arrives.
  const mode = status?.mode ?? 'step';
  const paused = status?.paused ?? false;

  return (
    <div className="stand-toolbar">
      <span className="stand-title">Snake</span>

      <span className="stand-stat">
        score <b>{status?.score ?? 0}</b>
      </span>
      <span className="stand-stat">
        length <b>{status?.length ?? 0}</b>
      </span>

      <div className="stand-group">
        <button
          className={mode === 'run' ? 'stand-button is-on' : 'stand-button'}
          onClick={() => {
            onModeChange('run');
          }}
          type="button"
        >
          Run
        </button>
        <button
          className={mode === 'step' ? 'stand-button is-on' : 'stand-button'}
          onClick={() => {
            onModeChange('step');
          }}
          type="button"
        >
          Step
        </button>
      </div>

      <button
        className={paused ? 'stand-button is-on' : 'stand-button'}
        onClick={() => {
          onPauseChange(!paused);
        }}
        type="button"
      >
        {paused ? 'Paused' : 'Pause'}
      </button>

      <button className="stand-button" onClick={onRestart} type="button">
        Restart
      </button>

      <span className="stand-spacer" />

      {status?.spine === false && <span className="stand-warn">no skeleton</span>}
      <span className="stand-stat">
        fps <b>{status?.fps ?? 0}</b>
      </span>
      <span className="stand-hint">
        {mode === 'step' ? 'arrows step one cell' : 'arrows steer'}
      </span>
    </div>
  );
}
