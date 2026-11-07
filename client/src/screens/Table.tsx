// La table : en haut, à qui le tour ; puis les joueurs et leurs cartes posées face cachée ; au centre, la frise ;
// en bas, ma main. Je touche une carte, puis sa place dans la frise : la date se dévoile chez tout le monde.
// Sur ordinateur, les joueurs à gauche, la frise au milieu, la main à droite.
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, BookOpen, Flag, LogOut, MoreHorizontal, Smile, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOTES, TAUNTS, type HandCard, type PlayerView, type RoomView } from '../../../shared/protocol';
import { Frise } from '../components/Frise';
import { Avatar, Button, HandTile, Logo, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { deName, listing } from '../lib/text';
import { cls, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

function useWide(): boolean {
  const query = '(min-width: 1000px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Le temps qui reste au tour : un anneau qui se vide. */
function TurnClock({ endsAt, mine }: { endsAt: number; mine: boolean }) {
  const now = useTick(200);
  const total = useRef(0);
  const left = Math.max(0, endsAt - now);
  if (!total.current || left > total.current) total.current = left;
  const frac = total.current ? left / total.current : 0;
  const sec = Math.ceil(left / 1000);
  const last = useRef(0);
  useEffect(() => {
    if (mine && sec > 0 && sec <= 5 && sec !== last.current) {
      last.current = sec;
      sfx.tick();
    }
  }, [sec, mine]);
  return (
    <span className={cls('turn-clock', sec <= 10 && 'is-short')} role="timer" aria-label={`${sec} secondes`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle className="tc-back" cx="18" cy="18" r="15.5" />
        <circle className="tc-front" cx="18" cy="18" r="15.5" style={{ strokeDasharray: `${(frac * 97.4).toFixed(2)} 97.4` }} />
      </svg>
      <b>{sec}</b>
    </span>
  );
}

function CardBacks({ n }: { n: number }) {
  return (
    <span className="backs" aria-label={`${n} carte${n > 1 ? 's' : ''}`}>
      <span className="back-stack" aria-hidden>
        {Array.from({ length: Math.min(n, 3) }, (_, i) => (
          <i key={i} style={{ ['--i' as string]: i }} />
        ))}
      </span>
      <b>{n}</b>
    </span>
  );
}

function PlayerChip({ p, view, turn, emote }: { p: PlayerView; view: RoomView; turn: boolean; emote?: string }) {
  return (
    <li className={cls('chip', turn && 'is-turn', p.id === view.me && 'is-me', p.out && 'is-out', p.autopilot && 'is-auto')} data-player={p.id}>
      <Avatar avatar={p.avatar} className="chip-avatar" />
      <span className="chip-text">
        <span className="chip-name">{p.id === view.me ? 'Toi' : p.name}</span>
        <span className="chip-sub">
          {p.out ? (
            <span className="chip-out">écarté</span>
          ) : (
            <CardBacks n={p.cards ?? 0} />
          )}
          {p.autopilot && <Bot size={13} aria-label="pilote automatique" />}
          {!p.connected && !p.isBot && <WifiOff size={12} aria-label="hors ligne" />}
        </span>
      </span>
      <AnimatePresence>
        {emote && (
          <motion.span key={emote} className="bubble" initial={{ y: 6, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {emote}
          </motion.span>
        )}
      </AnimatePresence>
    </li>
  );
}

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const wide = useWide();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [selected, setSelected] = useState<number | null>(null);
  const [react, setReact] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [sending, setSending] = useState(false);
  const isHost = view.hostId === view.me;
  const hand = g.hand;
  const seated = !!hand;
  const myTurn = seated && g.turn === view.me && g.stage === 'turn';
  const players = g.order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  const meP = players.find((p) => p.id === view.me);
  const turnP = players.find((p) => p.id === g.turn);
  const nameOf = (id: string) => (id === view.me ? 'toi' : view.players.find((p) => p.id === id)?.name ?? '?');

  // Une carte choisie qui n'est plus dans la main est oubliée ; une main d'une seule carte est déjà prise.
  const handIds = hand?.map((c) => c.id).join(',') ?? '';
  useEffect(() => {
    if (!hand) return;
    if (selected !== null && !hand.some((c) => c.id === selected)) setSelected(null);
    if (hand.length === 1 && myTurn && selected === null) setSelected(hand[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handIds, myTurn]);

  // Les sons et les vibrations : mon tour, la date qui se dévoile, le dernier tour.
  const seen = useRef({ n: g.move?.n ?? 0, turn: '', last: g.lastRound, tie: !!g.tiebreak });
  useEffect(() => {
    const s = seen.current;
    const m = g.move;
    if (m && m.n !== s.n && g.stage === 'reveal') {
      s.n = m.n;
      if (m.by !== view.me) sfx.slide();
      const t1 = window.setTimeout(() => sfx.flip(), 420);
      const t2 = window.setTimeout(() => {
        if (m.ok) sfx.good();
        else sfx.bad();
        if (m.by === view.me) vibrate(m.ok ? [30, 40, 30] : 120);
      }, 760);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [g.move, g.stage, view.me]);
  useEffect(() => {
    const s = seen.current;
    const key = `${g.turn}|${g.move?.n ?? 0}`;
    if (myTurn && s.turn !== key) {
      s.turn = key;
      sfx.turn();
      vibrate(40);
    }
  }, [myTurn, g.turn, g.move?.n]);
  useEffect(() => {
    const s = seen.current;
    if ((g.lastRound && !s.last) || (!!g.tiebreak && !s.tie)) sfx.alert();
    s.last = g.lastRound;
    s.tie = !!g.tiebreak;
  }, [g.lastRound, g.tiebreak]);

  // Le joueur dont c'est le tour reste visible dans le bandeau des joueurs.
  const strip = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>(`[data-player="${g.turn}"]`);
    if (!box || !el) return;
    // Le bandeau seul défile (scrollIntoView ferait aussi glisser l'écran entier).
    const r = el.getBoundingClientRect();
    const s = box.getBoundingClientRect();
    if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: box.scrollLeft + r.left - s.left - (s.width - r.width) / 2, behavior: 'smooth' });
    else if (box.scrollHeight > box.clientHeight) box.scrollTo({ top: box.scrollTop + r.top - s.top - (s.height - r.height) / 2, behavior: 'smooth' });
  }, [g.turn]);

  const emoteOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emotes) m.set(e.playerId, e.emoji);
    return m;
  }, [emotes]);

  const place = async (slot: number) => {
    if (selected === null || sending || !myTurn) return;
    setSending(true);
    sfx.slide();
    const card = selected;
    setSelected(null);
    const ok = await send('card:play', { card, slot });
    if (!ok) setSelected(card);
    setSending(false);
  };

  const pick = (c: HandCard) => {
    sfx.pick();
    setSelected((x) => (x === c.id ? null : c.id));
  };

  const armed = myTurn && selected !== null && !sending;
  const m = g.move;
  const revealing = g.stage === 'reveal' && !!m;
  let status: string;
  let tone: 'mine' | 'good' | 'bad' | '' = '';
  if (revealing && m) {
    const who = m.by === view.me ? null : nameOf(m.by);
    if (m.ok) {
      tone = 'good';
      status = who ? `Bien vu pour ${who} !` : 'Bien vu ! La carte reste dans la frise.';
    } else {
      tone = 'bad';
      status = who ? `Raté pour ${who}${m.drew ? ', qui pioche une autre carte' : ''}.` : m.drew ? 'Raté : la carte part, tu en pioches une autre.' : 'Raté : la carte part.';
    }
    if (m.auto) status += m.by === view.me ? ' (posée pour toi, le temps était écoulé)' : ' (posée automatiquement)';
  } else if (!seated) status = 'Tu regardes la partie : tu joueras à la prochaine.';
  else if (meP?.out) status = `Départage entre ${listing((g.tiebreak ?? []).map(nameOf))} : tu regardes la fin.`;
  else if (myTurn) {
    tone = 'mine';
    status = selected !== null ? 'Touche sa place dans la frise.' : 'À toi ! Choisis une carte de ta main.';
  } else status = `Au tour ${deName(turnP?.name ?? '?')}${turnP?.autopilot ? ' (pilote automatique)' : ''}…`;

  // Toi en dernier : « Léa et toi ».
  const tied = g.tiebreak ? [...g.tiebreak].sort((a, b) => Number(a === view.me) - Number(b === view.me)).map(nameOf) : [];
  const bannerText = g.tiebreak
    ? `Départage entre ${listing(tied)} : une carte de plus chacun, et on rejoue un tour.`
    : g.lastRound
      ? `Quelqu'un n'a plus de carte : on finit le tour de table.`
      : null;

  const handView = hand && (
    <section className={cls('hand', myTurn && 'is-mine', !myTurn && 'is-waiting')} aria-label="Ma main">
      <p className={cls('status-line', tone && `is-${tone}`)} aria-live="polite">
        {status}
      </p>
      {hand.length ? (
        <div className="hand-cards">
          <AnimatePresence initial={false}>
            {hand.map((c, i) => (
              <motion.div key={c.id} className="hand-slot" layout initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { delay: i * 0.04 } }} exit={{ y: -60, opacity: 0, scale: 0.8 }}>
                <HandTile card={c} selected={selected === c.id} onClick={() => pick(c)} className={cls(myTurn && 'is-playable')} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="hand-empty">Plus de carte en main.</p>
      )}
    </section>
  );

  const playersView = (
    <ul ref={strip} className="chips" aria-label="Les joueurs">
      {players.map((p) => (
        <PlayerChip key={p.id} p={p} view={view} turn={p.id === g.turn && !p.out} emote={emoteOf.get(p.id)} />
      ))}
    </ul>
  );

  return (
    <div className={cls('table-screen', wide && 'is-wide', myTurn && 'is-my-turn')}>
      <div className="wall" aria-hidden />
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <div className={cls('turn-pill', myTurn && 'is-mine')} aria-live="polite">
          <Avatar avatar={turnP?.avatar ?? 'plume'} className="turn-avatar" />
          <span className="turn-text">
            <small>{g.stage === 'reveal' ? 'La date se dévoile' : 'Au tour de'}</small>
            <b>{g.turn === view.me ? 'Toi !' : turnP?.name ?? '?'}</b>
          </span>
          {g.stage === 'turn' && g.endsAt > 0 && <TurnClock endsAt={g.endsAt} mine={myTurn} />}
        </div>
        <div className="table-tools">
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      {wide ? (
        <div className="table-body">
          <aside className="side side-players">
            <h3 className="side-title">Les joueurs</h3>
            {playersView}
          </aside>
          <main className="table-main">
            <AnimatePresence>{bannerText && <motion.p key={bannerText} className="banner" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{bannerText}</motion.p>}</AnimatePresence>
            <Frise line={g.line} move={g.move} stage={g.stage} armed={armed} onPlace={(s) => void place(s)} nameOf={nameOf} />
          </main>
          <aside className="side side-hand">
            <h3 className="side-title">Ma main</h3>
            {handView ?? <p className="status-line">{status}</p>}
          </aside>
        </div>
      ) : (
        <>
          {playersView}
          <AnimatePresence>{bannerText && <motion.p key={bannerText} className="banner" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>{bannerText}</motion.p>}</AnimatePresence>
          <main className="table-main">
            <Frise line={g.line} move={g.move} stage={g.stage} armed={armed} onPlace={(s) => void place(s)} nameOf={nameOf} />
          </main>
          {handView ?? (
            <section className="hand is-waiting">
              <p className="status-line">{status}</p>
            </section>
          )}
        </>
      )}

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
