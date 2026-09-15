import animate from 'tailwindcss-animate';

/**
 * The panel's design tokens.
 *
 * Ported from the previous project (`packages/frontend/tailwind.config.js`) so
 * that the interface keeps the look it was tuned to. The apps that build CSS —
 * the playground now, the extension from M9 — import this and add their own
 * `content` globs, exactly as `devtool-local` and `devtool-chrome` did there.
 *
 * The `instruction-*` colours are not carried over: they belong to the
 * Rendering tab, which is out of scope for this product.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        raised: 'hsl(var(--raised))',
        sunken: 'hsl(var(--sunken))',
        'raised-border': 'hsl(var(--raised-border))',
        'frame-outline': 'hsl(var(--frame-outline))',
        hint: 'hsl(var(--hint))',
        'control-on': 'hsl(var(--control-on))',
        field: 'hsl(var(--field))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};
