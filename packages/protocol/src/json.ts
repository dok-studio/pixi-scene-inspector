/**
 * Everything crossing the bridge has to survive `JSON.stringify` on one side
 * and `JSON.parse` on the other. This type makes that requirement explicit
 * instead of `any`, which silently lets through functions, `undefined` and
 * circular references.
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
