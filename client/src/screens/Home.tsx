// Accueil : une petite frise où une carte vient se glisser et dévoile sa date ; pseudo + avatar,
// créer / rejoindre une table, jouer contre des bots, règles.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Check, House, LogIn, MessageSquare, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, type CardFamily } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Backdrop, Button, Cartel, Logo, Year } from '../components/Ui';
import { eraOf } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const BOTS_KEY = 'fr.bots';
const MAX_BOTS = MAX_PLAYERS - 1;
const MIN_BOTS = MIN_PLAYERS - 1;

function savedBots(): number {
  try {
    const n = Number(localStorage.getItem(BOTS_KEY));
    return n >= MIN_BOTS && n <= MAX_BOTS ? n : 3;
  } catch {
    return 3;
  }
}

type Demo = { title: string; emoji: string; family: CardFamily; year: number };
/** Les exemples de l'accueil : deux cartes déjà posées, et celle qui vient se glisser entre elles. */
const DEMOS: { line: [Demo, Demo]; card: Demo }[] = [
  {
    line: [
      { title: 'Prise de la Bastille', emoji: '🏴', family: 'histoire', year: 1789 },
      { title: 'Premier vol motorisé des frères Wright', emoji: '🛩️', family: 'inventions', year: 1903 },
    ],
    card: { title: 'Inauguration de la tour Eiffel', emoji: '🗼', family: 'histoire', year: 1889 },
  },
  {
    line: [
      { title: 'Naufrage du Titanic', emoji: '🛟', family: 'histoire', year: 1912 },
      { title: 'Premiers pas d’un humain sur la Lune', emoji: '🌕', family: 'sciences', year: 1969 },
    ],
    card: { title: 'Fleming découvre la pénicilline', emoji: '🧫', family: 'sciences', year: 1928 },
  },
  {
    line: [
      { title: 'Assassinat de Jules César', emoji: '🔪', family: 'histoire', year: -44 },
      { title: 'Christophe Colomb atteint l’Amérique', emoji: '⛵', family: 'histoire', year: 1492 },
    ],
    card: { title: 'Le Vésuve ensevelit Pompéi', emoji: '🌋', family: 'histoire', year: 79 },
  },
];

/** La frise de l'accueil : la carte arrive, se pose au milieu, sa date apparaît, puis on passe à l'exemple suivant. */
function HeroFrise() {
  const still = reducedMotion();
  const [i, setI] = useState(0);
  const [step, setStep] = useState(still ? 2 : 0);
  useEffect(() => {
    if (still) return;
    const t = window.setTimeout(
      () => {
        if (step < 2) setStep(step + 1);
        else {
          setStep(0);
          setI((x) => (x + 1) % DEMOS.length);
        }
      },
      step === 0 ? 1300 : step === 1 ? 900 : 2600,
    );
    return () => window.clearTimeout(t);
  }, [step, still]);
  const d = DEMOS[i];
  const row = (c: Demo, key: string, extra?: string, hideYear?: boolean) => (
    <div key={key} className={cls('frise-row', `era-${eraOf(c.year)}`, extra)}>
      {hideYear ? (
        <span className="year is-hidden">
          <b>?</b>
        </span>
      ) : (
        <Year year={c.year} className={extra === 'is-fresh' ? 'is-revealing' : undefined} />
      )}
      <span className="rail-dot" />
      <Cartel card={c} />
    </div>
  );
  return (
    <div className="hero-frise" aria-hidden>
      {row(d.line[0], `${i}a`)}
      <AnimatePresence mode="popLayout">
        {step >= 1 ? (
          <motion.div key={`${i}c`} initial={{ x: 80, opacity: 0, height: 0 }} animate={{ x: 0, opacity: 1, height: 'auto' }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 24 }}>
            {row(d.card, `${i}c`, 'is-fresh', step < 2)}
            {step === 2 && (
              <motion.span className="stamp is-good hero-stamp" initial={{ scale: 1.8, rotate: -16, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 15 }}>
                <Check size={15} strokeWidth={3.2} /> Bien vu&nbsp;!
              </motion.span>
            )}
          </motion.div>
        ) : (
          <motion.div key={`${i}s`} className="hero-gap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span>?</span>
          </motion.div>
        )}
      </AnimatePresence>
      {row(d.line[1], `${i}b`)}
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(savedBots);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('fr:url', sync);
    return () => window.removeEventListener('fr:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const changeBots = (d: number) => {
    const n = Math.max(MIN_BOTS, Math.min(MAX_BOTS, bots + d));
    setBots(n);
    try {
      localStorage.setItem(BOTS_KEY, String(n));
    } catch {
      /* stockage indisponible */
    }
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Backdrop className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=frise">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Des inventions, des batailles, des films… <b>sans leur date</b>. Glisse chaque carte à sa place dans la frise : <b>le premier qui n’a plus de carte gagne</b>.
        </p>
        <HeroFrise />
      </header>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre&nbsp;!
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Hypatie"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="bots-row">
              <Button className="bots-go" icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : `Jouer contre ${bots} bot${bots > 1 ? 's' : ''}`}
              </Button>
              <div className="stepper" role="group" aria-label="Nombre de bots">
                <button type="button" className="icon-btn" aria-label="Un bot de moins" disabled={bots <= MIN_BOTS} onClick={() => changeBots(-1)}>
                  <Minus size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Un bot de plus" disabled={bots >= MAX_BOTS} onClick={() => changeBots(1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        Inspiré des jeux de frise chronologique. Création de fans, non officielle&nbsp;; cartes et dessins originaux, dates vérifiées une à une.
      </footer>
    </Backdrop>
  );
}
