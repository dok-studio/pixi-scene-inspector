/**
 * The numbers the game is built out of.
 *
 * The board is a fixed **square** of 32px cells and the stage is scaled to fit
 * the pane rather than resized to it: a screenshot taken twice should frame the
 * same thing both times, which a layout that reflows with the window cannot
 * promise.
 */

export const COLS = 15;
export const ROWS = 15;
export const CELL = 32;

export const ARENA_WIDTH = COLS * CELL;
export const ARENA_HEIGHT = ROWS * CELL;

/** One discrete move. The loop is fixed-step; rendering interpolates between. */
export const STEP_MS = 140;

/** How long the death animation holds the scene before a restart is offered. */
export const DYING_MS = 1200;

/** Where the snake starts, and how long it starts. */
export const START_LENGTH = 4;

export const SCORE_PER_BERRY = 10;

/**
 * The bar across the top: the logo and the score, on their own ground.
 *
 * A band of its own rather than an overlay on the board. Floating over the
 * playfield, the score and the title were both run through by the snake on its
 * first lap along the top row — and reading a number the snake is crossing is
 * exactly what a screenshot should not have to do.
 */
export const TOPBAR_HEIGHT = 74;

/** The gap between the bar and the board, so the two read as separate things. */
export const TOPBAR_GAP = 22;

/**
 * Breathing room around the whole stage.
 *
 * Generous on purpose: the frame is drawn outside the board and glows further
 * still, and a board pressed against the edge of its pane looks cramped however
 * good the border is.
 */
export const MARGIN = 34;

/** Where the board sits inside the design area. */
export const ARENA_X = MARGIN;
export const ARENA_Y = TOPBAR_HEIGHT + TOPBAR_GAP;

export const DESIGN_WIDTH = ARENA_WIDTH + MARGIN * 2;
export const DESIGN_HEIGHT = ARENA_Y + ARENA_HEIGHT + MARGIN;
