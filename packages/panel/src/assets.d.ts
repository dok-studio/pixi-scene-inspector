/**
 * The panel is built as source by whichever bundler consumes it (Vite in
 * apps/chrome today), so an image import resolves to a URL string at build
 * time. This is the type-level half of that contract for `tsc -b`, which
 * otherwise has no bundler in the loop to explain what `*.svg` means.
 */
declare module '*.svg' {
  const src: string;
  export default src;
}
