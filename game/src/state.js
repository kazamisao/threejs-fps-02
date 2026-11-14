// The game state, in one place. main.js is the only writer; every other module
// reads what it needs through this object and never keeps its own copy of a
// number the HUD shows.
export function createState() {
  return {
    phase: 'buy', // buy | live | over | match
    round: 1,
    roundTime: 15, // buy phase counts down from 15, live rounds from 100
    roundsWon: 0,
    roundsLost: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    health: 100,
    alive: true,
    grenades: { he: 0, smoke: 0, flash: 0 },
    owned: { pistol: true, rifle: false, smg: false },
    plantedThisRound: false,
    matchWinner: null,
    winner: null, // 'player' | 'enemy' | null for the round that just ended
    endReason: '',
    noises: [],
  };
}

export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const WIN_ROUNDS = 5;
