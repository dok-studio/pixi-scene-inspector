import theme from '../../packages/panel/tailwind.config.js';

/**
 * The extension builds the panel's CSS. The theme comes from the panel package;
 * only the content globs are the app's business — they have to point at the
 * panel's source, since that is where the classes live.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  ...theme,
  content: ['../../packages/panel/src/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
};
