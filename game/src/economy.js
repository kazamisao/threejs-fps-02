// The economy: money earned each round and spent in the buy menu. One table of
// rules; main.js applies it, hud.js shows it. Prices live with the weapons in
// weapons.js, so this file only decides what a round is worth.
export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  plantReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  maxMoney: 16000,
  armorPrice: 650,
  armorBodyFactor: 0.55,
};

export function roundReward(won, kills, planted) {
  return (won ? ECONOMY.roundWin : ECONOMY.roundLoss)
    + kills * ECONOMY.killReward
    + (planted ? ECONOMY.plantReward : 0);
}
