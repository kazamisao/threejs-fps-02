// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, killfeed,
// bomb status, plant progress and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the play / buy callbacks out. Every setter
// is cached, so the DOM is only written when a value actually changes.
const COPY = {
  start: {
    title: 'Kestrel Yard',
    copy: 'A dusk yard, two bomb sites, one bomb. Plant it or clear the other team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Kestrel Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Watch the round play out.',
    action: 'Keep watching',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const timer = $('timer');
  const roundLabel = $('round-label');
  const scoreValue = $('score-value');
  const moneyValue = $('money-value');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bombStatus = $('bomb-status');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const grenades = $('grenades');
  const armor = $('armor');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const flash = $('flash');
  let hitTimer = 0;
  let bannerTimer = 0;
  const cache = {};

  function setText(el, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      setText(healthValue, 'hp', String(v));
      if (cache.hpFill !== v) {
        cache.hpFill = v;
        healthFill.style.width = `${v}%`;
        healthFill.classList.toggle('low', v <= 30);
      }
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timer, 'timer', text);
      timer.classList.toggle('buy', phase === 'buy');
      timer.classList.toggle('danger', phase === 'live' && s <= 10);
    },
    setRound(round, won, lost) {
      setText(roundLabel, 'round', `ROUND ${round}`);
      setText(scoreValue, 'score', `${won} : ${lost}`);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value.toLocaleString('en-US')}`);
      setText(buyMoney, 'buyMoney', `$${value.toLocaleString('en-US')}`);
    },
    setArmor(worn) {
      if (cache.armor === worn) return;
      cache.armor = worn;
      armor.hidden = !worn;
    },
    setGrenades(g) {
      setText(grenades, 'grenades', `4 HE ${g.he} · 5 SMOKE ${g.smoke} · 6 FLASH ${g.flash}`);
    },
    setBomb(text) {
      setText(bombStatus, 'bomb', text);
      bombStatus.hidden = text === '';
    },
    setPlant(progress) {
      if (progress <= 0) { plantBar.hidden = true; return; }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, ms = 2600) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    flashScreen() {
      flash.classList.add('on');
      setTimeout(() => flash.classList.remove('on'), 120);
      setTimeout(() => flash.classList.add('blind'), 120);
      setTimeout(() => flash.classList.remove('blind'), 2600);
    },
    showBuy(show) { buyMenu.hidden = !show; },
    setBuyAffordability(money, owned) {
      for (const button of buyMenu.querySelectorAll('[data-price]')) {
        const price = Number(button.dataset.price);
        const id = button.dataset.item;
        const isOwned = owned && owned[id];
        button.disabled = !isOwned && price > money;
        button.classList.toggle('owned', Boolean(isOwned));
      }
    },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showMatchOverlay(won, scoreText) {
      title.textContent = won ? 'Match won — Kestrel Yard is yours' : 'Match lost — the yard holds';
      copy.textContent = `Final score ${scoreText}. First to 5 rounds takes the match.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
    showRoundOverlay(won, reason, scoreText) {
      title.textContent = won ? 'Round won' : 'Round lost';
      copy.textContent = `${reason} — ${scoreText}`;
      play.textContent = 'Next round';
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-item]');
        if (button) handler(button.dataset.item);
      });
    },
  };
}
