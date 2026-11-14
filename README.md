# Kestrel Yard — a three.js tactical FPS

[![make.fun](https://img.shields.io/badge/make.fun-threejs--fps--02-f0a830)](https://make.fun/c/threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous — with an original map, original names and original art. You and two
ally bots attack two bomb sites in a dusk industrial yard held by three enemy
bots. Win the round by eliminating the other team or by planting the bomb and
letting it blow; lose it if the timer runs out or the bomb is defused. Money
earned each round buys rifles, SMGs and grenades in the buy phase. First to
5 rounds takes the match.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

Desktop Chrome (or any browser with WebGL 2). No build step, no network
request: `game/` is plain static files, three.js 0.187.0 vendored under
`game/vendor/three/`.

| Key | Action |
| --- | --- |
| W A S D / mouse | Move / look (click to capture the mouse) |
| Click | Fire |
| R | Reload |
| Ctrl / C | Crouch |
| Space | Jump |
| E (hold) | Plant the bomb inside a site ring |
| 1 / 2 / 3 | Pistol / rifle / SMG |
| 4 / 5 / 6 | Throw HE / smoke / flash grenade |
| B | Buy menu (buy phase) |

## The game

- **Gunplay** — hitscan weapons with headshot damage (3× body), recoil and a
  spread that grows while you move, so stopping to aim pays. Three weapons:
  Kestrel P9 pistol, Vulture AR rifle, Hornet SMG.
- **Tactics** — a bomb to plant and defuse (3 s plant, 5 s defuse, 45 s fuse),
  round economy ($300/kill, $3,250/round win, $1,900/round loss), a buy menu,
  and HE / smoke / flash grenades. Smoke blocks bot sightlines; a flash blinds
  bots that see the burst.
- **Bots** — patrol routes through the yard, hold site angles, investigate
  gunshots and explosions they hear, and fight with distance falloff and
  movement spread. Enemies converge on a planted bomb to defuse it.
- **Map** — Kestrel Yard: a 44 × 30 m dusk yard with two sites, a mid lane,
  north and south lanes, containers, crates and pillars for cover and
  sightlines.
- **Code** — one job per module (`world`, `player`, `weapons`, `bots`,
  `grenades`, `bomb`, `economy`, `state`, `hud`, `input`, `audio`), a fixed
  60 Hz simulation kept apart from rendering, shared scratch vectors instead
  of per-frame allocation, and all game state in `state.js`.

## Shots

`shots.json` lists the deterministic captures: `?shot=start` (buy phase),
`?shot=play` (mid-round firefight), `?shot=plant` (bomb planted at site A),
`?shot=end` (round won).

## License

MIT — see [LICENSE](LICENSE).
