// The look plan, in one place. Dusk industrial yard: cold slate and rust, one amber
// accent for sites, HUD and tracers, one teal for the player's own team. The same
// names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171a20',
  surface: '#232830',
  hairline: '#39404c',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  rust: '#a4552e',
  teal: '#3fb6a8',
  enemy: '#d95f4b',
  site: '#f0a830',
};

export function shade(name) {
  return PALETTE[name];
}
