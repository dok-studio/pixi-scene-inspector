import theme from '../../packages/panel/tailwind.config.js';

/**
 * The stand builds the panel's CSS, the way the extension does. The theme comes
 * from the panel package; only the content globs are this app's business, and
 * they have to point at the panel's source, since that is where the classes
 * live. `./src` is in as well for the few classes the stand's own chrome uses.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  ...theme,
  content: ['../../packages/panel/src/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
};
