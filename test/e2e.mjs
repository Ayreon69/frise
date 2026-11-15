// Test de bout en bout sur le serveur compilé, en mode accéléré (FR_FAST=1 : révélations éclair, 1,5 s par tour).
// Partie 1 : 4 humains (socket.io) + 2 bots. Une spectatrice arrive en route, Bob se déconnecte puis reprend sa place,
//   une session volée est refusée, Chloé quitte la table (pilote automatique), Dan ne joue jamais (le temps joue pour lui).
// Partie 2 : revanche à 8 (table pleine), 3 cartes chacun, un seul thème.
// À chaque état reçu, on vérifie qu'aucune information cachée ne fuit : ni date d'une carte en main, ni main d'un autre,
// ni pioche ; qu'aucun état n'arrive pour rien ; et on rejoue chaque coup à partir de ce qui est dévoilé :
// juste ou faux selon la frise d'avant, frise rangée, nombres de cartes, classement final.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), FR_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

// Recopié de la règle, pour ne pas dépendre du code testé : une date égale à sa voisine convient des deux côtés.
const fits = (line, slot, year) => (slot === 0 || line[slot - 1].year <= year) && (slot === line.length || year <= line[slot].year);

const PLAYER_KEYS = 'autopilot,avatar,cards,connected,id,isBot,isHost,name,out,seat,status,wins';
const GAME_KEYS = 'endsAt,hand,lastRound,line,move,order,stage,tiebreak,turn';
const HAND_KEYS = 'emoji,family,id,title';
const LINE_KEYS = 'by,emoji,family,id,title,year';
const stats = { states: 0, gestures: 0, moves: 0, ok: 0, auto: 0, refused: new Map(), tiebreaks: 0 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keys = (o) => Object.keys(o).sort().join(',');

/** Ce que chaque carte dévoilée a montré comme date : elle ne doit jamais changer. */
const yearOf = new Map();
/** Les cartes vues dans la main de chacun : personne d'autre ne doit les voir en main. */
const handOwner = new Map();

function client(name, { avatar = 'plume', mode = 'actif' } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, avatar, mode, view: null, session: null, inFlight: 0, actedAt: 0, playedFor: -1 };
  socket.on('state', (v) => {
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    void play(c);
  });
  socket.on('disconnect', () => (c.view = null));
  c.call = (event, payload = {}) => {
    c.inFlight++;
    c.actedAt = performance.now();
    stats.gestures++;
    return new Promise((res) =>
      socket.emit(event, payload, (r) => {
        c.inFlight--;
        c.actedAt = performance.now();
        if (!r.ok) stats.refused.set(r.error, (stats.refused.get(r.error) ?? 0) + 1);
        if (r.error === 'Erreur inattendue du serveur.') fail(`${event} : erreur du serveur`);
        res(r);
      }),
    );
  };
  c.timer = setInterval(() => void play(c), 60);
  return c;
}

const connected = (c) => new Promise((r) => (c.socket.connected ? r() : c.socket.once('connect', r)));
async function waitFor(what, test, ms = 6000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (test()) return;
    await pause(15);
  }
  fail(`attente trop longue : ${what}`);
}

const shown = (v) => JSON.stringify({ ...v, serverNow: 0 });

function audit(c, prev, v) {
  stats.states++;
  const json = JSON.stringify(v);
  for (const word of ['"token"', '"deck"', '"discard"', '"hands"', '"skill', '"brain', '"belief', '"autoAt"', '"revealUntil"']) {
    if (json.includes(word)) fail(`la vue de ${c.name} contient ${word}`);
  }
  // En partie, tout est public sauf les mains : un état identique au précédent trahirait un geste caché.
  if (prev?.phase === 'playing' && v.phase === 'playing' && shown(prev) === shown(v) && c.inFlight === 0 && performance.now() - c.actedAt > 40) {
    fail(`${c.name} reçoit un état sans rien de neuf (${v.game?.stage})`);
  }
  for (const p of v.players) if (keys(p) !== PLAYER_KEYS) fail(`un joueur vu avec ${keys(p)}`);
  if (v.phase !== 'finished' && v.final) fail('un tableau final avant la fin');
  if (v.phase !== 'playing') {
    if (v.game) fail('une partie visible hors jeu');
    if (v.players.some((p) => p.seat !== null || p.cards !== null)) fail('un siège ou des cartes hors jeu');
    if (v.phase === 'finished') checkFinal(c, v);
    return;
  }
  const g = v.game;
  if (keys(g) !== GAME_KEYS) fail(`une partie vue avec ${keys(g)}`);
  const me = v.players.find((p) => p.id === v.me);
  const seated = g.order.includes(v.me);
  if (seated !== !!g.hand) fail(`${c.name} : main visible ${!!g.hand} pour un siège ${seated}`);
  if (g.hand) {
    if (me.cards !== g.hand.length) fail(`${c.name} : ${me.cards} cartes annoncées, ${g.hand.length} en main`);
    for (const h of g.hand) {
      if (keys(h) !== HAND_KEYS) fail(`une carte en main vue avec ${keys(h)} (date dévoilée ?)`);
      const owner = handOwner.get(h.id);
      // Une carte ratée repart dans la pioche quand elle est vide : elle peut changer de main, jamais être dans deux à la fois.
      if (owner && owner !== v.me && c.view.players.find((p) => p.id === owner)?.cards && otherHolds(owner, h.id)) fail(`la carte ${h.id} est dans deux mains`);
      handOwner.set(h.id, v.me);
    }
  }
  for (const p of v.players) {
    if (g.order.includes(p.id) ? p.cards === null || p.seat === null : p.cards !== null) fail(`cartes de ${p.name} mal annoncées`);
  }
  // La frise : rangée, des dates qui ne changent jamais.
  for (let i = 0; i < g.line.length; i++) {
    const card = g.line[i];
    if (keys(card) !== LINE_KEYS) fail(`une carte de la frise vue avec ${keys(card)}`);
    if (i && g.line[i - 1].year > card.year) fail('une frise mal rangée');
    if (yearOf.has(card.id) && yearOf.get(card.id) !== card.year) fail(`la carte ${card.id} a changé de date`);
    yearOf.set(card.id, card.year);
  }
  if (g.hand && !g.move && g.hand.length !== dealt) fail(`${c.name} a ${g.hand.length} cartes au départ au lieu de ${dealt}`);
  if (g.stage === 'turn' && g.move === null && g.line.length !== 1 && !prev?.game) fail('une partie qui commence avec plusieurs cartes');
  // Le coup qui vient d'être joué : on le rejoue sur la frise d'avant.
  const m = g.move;
  if (m && prev?.phase === 'playing' && prev.game && prev.game.move?.n !== m.n) {
    if (m.n !== (prev.game.move?.n ?? 0) + 1) fail(`${c.name} a sauté un coup (${prev.game.move?.n} → ${m.n})`);
    const before = prev.game.line;
    if (m.by !== prev.game.turn) fail(`${m.by} a joué hors de son tour`);
    if (fits(before, m.slot, m.card.year) !== m.ok) fail(`coup ${m.n} : jugé ${m.ok ? 'juste' : 'faux'} à tort`);
    const expected = m.ok ? [...before.slice(0, m.slot), m.card, ...before.slice(m.slot)] : before;
    if (expected.map((x) => x.id).join() !== g.line.map((x) => x.id).join()) fail(`coup ${m.n} : la frise ne suit pas`);
    const was = prev.players.find((p) => p.id === m.by).cards;
    const now = v.players.find((p) => p.id === m.by).cards;
    // Un départage qui commence (ou continue) donne une carte à chacun de ses joueurs dans le même état.
    const base = m.ok ? was - 1 : was;
    if (now !== base && !(g.tiebreak?.includes(m.by) && now === base + 1)) fail(`coup ${m.n} : ${was} → ${now} cartes pour ${m.by}`);
    if (m.by === v.me && g.hand?.some((h) => h.id === m.card.id)) fail('la carte posée est restée en main');
    if (c === watcher) {
      stats.moves++;
      if (m.ok) stats.ok++;
      if (m.auto) stats.auto++;
    }
  }
  if (g.tiebreak && !prev?.game?.tiebreak && c === watcher) stats.tiebreaks++;
}

const all = [];
/** Cartes en main au départ, selon la table et le réglage. */
let dealt = 4;
function otherHolds(owner, id) {
  return all.some((x) => x.view?.me === owner && x.view.game?.hand?.some((h) => h.id === id));
}

function checkFinal(c, v) {
  const f = v.final;
  if (!f) fail('une fin sans tableau');
  const winners = f.players.filter((p) => p.winner);
  if (winners.length !== 1) fail(`${winners.length} gagnants`);
  if (winners[0].left.length) fail('le gagnant avait encore des cartes');
  if (winners[0].place !== 1) fail('le gagnant n’est pas premier');
  for (const p of f.players) for (const card of p.left) if (keys(card) !== LINE_KEYS) fail('une carte restante sans sa date');
  const good = f.players.reduce((s, p) => s + p.good, 0);
  if (good !== f.line.length - 1) fail(`${good} cartes justes pour une frise de ${f.line.length}`);
  for (let i = 1; i < f.line.length; i++) if (f.line[i - 1].year > f.line[i].year) fail('frise finale mal rangée');
  // Le classement : à part le gagnant (et le départage), moins de cartes, meilleure place.
  const rest = f.players.filter((p) => !p.winner && !f.tied.includes(p.id));
  for (const a of rest) for (const b of rest) if (a.left.length < b.left.length && a.place >= b.place) fail(`classement : ${a.name} devant ${b.name} ?`);
}

/** Un joueur au hasard : une carte et une place au hasard, une fois par tour. */
async function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing' || c.mode !== 'actif' || c.inFlight) return;
  const g = v.game;
  if (g.stage !== 'turn' || g.turn !== v.me || !g.hand?.length) return;
  const key = `${g.move?.n ?? 0}`;
  if (c.playedFor === key) return;
  c.playedFor = key;
  await pause(Math.random() * 120);
  if (c.view !== v) return;
  const card = pick(g.hand).id;
  const slot = Math.floor(Math.random() * (g.line.length + 1));
  await c.call('card:play', { card, slot });
}

// ───────────── Partie 1 ─────────────
const ana = client('Ana', { avatar: 'loupe' });
const bob = client('Bob', { avatar: 'globe' });
const chloe = client('Chloé', { avatar: 'fusee' });
const dan = client('Dan', { avatar: 'palette', mode: 'absent' });
all.push(ana, bob, chloe, dan);
let watcher = ana;
await Promise.all(all.map(connected));

const created = await ana.call('room:create', { name: 'Ana', avatar: 'loupe' });
if (!created.ok) fail(`création : ${created.error}`);
ana.session = created.data;
const code = created.data.code;
if ((await ana.call('game:start')).ok) fail('une partie lancée seul');
for (const c of [bob, chloe, dan]) {
  const res = await c.call('room:join', { code, name: c.name, avatar: c.avatar });
  if (!res.ok) fail(`${c.name} : ${res.error}`);
  c.session = res.data;
}
if ((await bob.call('card:play', { card: 1, slot: 0 })).ok) fail('une carte posée dans le salon');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
if ((await bob.call('room:settings', { hand: 3 })).ok) fail('un invité a changé les réglages');
if ((await ana.call('room:settings', { families: [] })).ok) fail('aucun thème accepté');
if (!(await ana.call('room:addBot')).ok || !(await ana.call('room:addBot')).ok) fail('bots refusés');
await waitFor('6 joueurs au salon', () => ana.view?.players.length === 6);
if (!(await ana.call('game:start')).ok) fail('lancement refusé');
await waitFor('la partie', () => all.every((c) => c.view?.phase === 'playing'));

// Une carte hors de son tour, une carte d'un autre, une place inconnue.
{
  const g = ana.view.game;
  const other = all.find((c) => c.view.me !== g.turn) ?? bob;
  if ((await other.call('card:play', { card: other.view.game.hand[0].id, slot: 0 })).ok && other.view.me !== g.turn) fail('une carte posée hors de son tour');
}

// Une spectatrice arrive : elle voit la frise, sans main, et ne peut rien poser.
const eve = client('Ève', { avatar: 'sablier' });
all.push(eve);
await connected(eve);
const joined = await eve.call('room:join', { code, name: 'Ève', avatar: 'sablier' });
if (!joined.ok) fail(`spectatrice : ${joined.error}`);
eve.session = joined.data;
await waitFor('la vue de la spectatrice', () => eve.view?.game && eve.view.game.hand === null);
if ((await eve.call('card:play', { card: 1, slot: 0 })).ok) fail('la spectatrice a posé une carte');

await pause(300);
// Bob se déconnecte, puis revient avec sa session ; Chloé tente de prendre sa place avec un faux jeton.
bob.socket.disconnect();
await pause(400);
bob.socket.connect();
await connected(bob);
const back = await bob.call('room:join', { code, playerId: bob.session.playerId, token: bob.session.token, resumeOnly: true });
if (!back.ok) fail(`reprise refusée : ${back.error}`);
await waitFor('Bob revient', () => bob.view?.phase === 'playing' && bob.view.game.hand !== null);
const intruder = client('Intrus');
await connected(intruder);
if ((await intruder.call('room:join', { code, playerId: bob.session.playerId, token: 'faux', resumeOnly: true })).ok) fail('une session volée a été acceptée');
intruder.socket.disconnect();
clearInterval(intruder.timer);

// Chloé quitte la table : le pilote automatique la remplace.
await chloe.call('room:leave');
clearInterval(chloe.timer);
await waitFor('le pilote de Chloé', () => ana.view?.phase !== 'playing' || ana.view.players.find((p) => p.id === chloe.session.playerId)?.autopilot);

await waitFor('la fin de la partie 1', () => ana.view?.phase === 'finished', 120_000);
await waitFor('tout le monde voit la fin', () => [ana, bob, dan, eve].every((c) => c.view?.phase === 'finished'));
const f1 = ana.view.final;
console.log(`✓ partie 1 : ${f1.line.length} cartes dans la frise, ${f1.rounds} tours de table, gagnant ${f1.players.find((p) => p.winner).name}${f1.tied.length ? ' (départage)' : ''}`);
if (f1.players.length !== 6) fail(`${f1.players.length} joueurs au classement`);

// ───────────── Partie 2 : revanche à 8 ─────────────
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await ana.call('game:restart')).ok) fail('revanche refusée');
await waitFor('le salon', () => ana.view?.phase === 'lobby');
for (const c of all) c.playedFor = -1;
dan.mode = 'actif';
if (!(await ana.call('room:settings', { hand: 3, families: ['cinema'], turn: 30 })).ok) fail('réglages refusés');
while (ana.view.players.filter((p) => p.status !== 'spectator').length < 8) {
  if (!(await ana.call('room:addBot')).ok) fail('bot refusé');
  await pause(30);
}
if ((await ana.call('room:addBot')).ok) fail('un 9e joueur accepté');
watcher = eve;
dealt = 3;
if (!(await ana.call('game:start')).ok) fail('lancement de la revanche refusé');
await waitFor('la revanche', () => [ana, bob, dan, eve].every((c) => c.view?.phase === 'playing'));
for (const card of ana.view.game.line) if (card.family !== 'cinema') fail('une carte hors thème');
await waitFor('la fin de la partie 2', () => ana.view?.phase === 'finished', 120_000);
const f2 = ana.view.final;
for (const card of f2.line) if (card.family !== 'cinema') fail('une carte hors thème dans la frise');
console.log(`✓ partie 2 : ${f2.players.length} joueurs, ${f2.line.length} cartes, gagnant ${f2.players.find((p) => p.winner).name}${f2.tied.length ? ' (départage)' : ''}`);

// L'hôte part : un autre humain prend la main.
await ana.call('room:leave');
await waitFor('le nouvel hôte', () => bob.view && bob.view.hostId !== ana.session.playerId && [bob, dan, eve].some((c) => c.session.playerId === bob.view.hostId));

console.log(`✓ ${stats.states} états vérifiés, ${stats.gestures} gestes, ${stats.moves} coups suivis (${stats.ok} justes, ${stats.auto} automatiques), ${stats.tiebreaks} départage(s)`);
if (stats.refused.size) console.log('  refus :', [...stats.refused].map(([k, n]) => `${k} ×${n}`).join(' · '));
for (const c of all) {
  clearInterval(c.timer);
  c.socket.disconnect();
}
server.kill();
process.exit(0);
