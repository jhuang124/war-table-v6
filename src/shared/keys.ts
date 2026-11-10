// v6: every localStorage key this build writes, namespaced per release. Each version is deployed to its own path on
// the same origin (jhuang124.github.io/war-table-v5/, /war-table-v6/), and localStorage is per origin, so a
// shared key let versions read (and overwrite) each other's saves and settings. Bump the namespace with a release
// whose rules or state shape change.

export const KEY_NS = 'risk3d.v6.';

export const STORAGE_KEYS = {
  /** The GameState (src/game/storage.ts SaveFile). */
  save: `${KEY_NS}save`,
  /** UI meta next to the save, and the last new-game setup. */
  ui: `${KEY_NS}ui`,
  settings: `${KEY_NS}settings`,
  /** One boot-time instruction across a reload (src/game/controller.ts). */
  boot: `${KEY_NS}boot`,
  rotateHint: `${KEY_NS}rotateHint`,
  homeHint: `${KEY_NS}homeHint`,
} as const;
