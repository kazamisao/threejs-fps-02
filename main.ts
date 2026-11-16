// Kestrel Yard, v2 — a round-based tactical FPS built on three.js (Node 22,
// standard library only; the game itself needs no build step at all).
//
// What is being handed in: the game/ folder beside this file — plain static
// files the browser loads as ES modules, three.js 0.187.0 vendored, no network
// calls — plus the four captures in screenshots/. This program's only job is
// the hand-in: copy both into the output directory and write dossier.json, the
// summary the judge reads, using the vendored make.fun library.
//
// v2 is a look-and-staging round over the complete v1 game (rounds, bots, bomb,
// economy, grenades unchanged in behaviour): a brighter dusk grade — stronger
// key and hemisphere light, ACES tone mapping, a painted ground texture with
// colour-coded zones — rebuilt multi-part weapon view models, bot figures with
// arms, chest rigs and helmets, five new map landmarks (watchtower, trimmed
// container stack, striped barriers, fuel tank), a restaged mid-lane duel for
// the play capture, and one new buy item, the $650 Kevlar Vest.
//
// Run the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all: game/
// counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
