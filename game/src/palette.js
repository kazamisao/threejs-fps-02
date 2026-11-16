// The look plan, in one place. Dusk industrial yard: cold slate and rust, one amber
// accent for sites, HUD and tracers, one teal for the player's own team. The same
// names are the CSS custom properties in index.html. v2 lifts every base tone a
// step so the yard reads at a glance under the brighter key light: nothing in the
// scene sits near black any more, and the sky tone below is the fog/background.
export const PALETTE = {
  canvas: '#2b3038',
  surface: '#454f5c',
  hairline: '#6b7684',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  rust: '#c06a35',
  teal: '#3fb6a8',
  enemy: '#d95f4b',
  site: '#f0a830',
  sky: '#5d6c85',
};

export function shade(name) {
  return PALETTE[name];
}
