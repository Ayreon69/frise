// Fin de partie : le tampon du gagnant, le classement avec les cartes qui restaient à chacun (dates dévoilées),
// puis toute la frise de la partie. Victoires de la soirée et revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { ChevronDown, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalPlayer, RoomView } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Cartel, Logo, Year } from '../components/Ui';
import { sfx } from '../lib/sound';
import { eraOf, listing, placeLabel } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const mine = final.players.find((p) => p.id === view.me);
  const winner = final.players.find((p) => p.winner);
  const good = !!mine?.winner;
  const still = reducedMotion();
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.fanfare(good);
    if (still || !good) return;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: 160, spread: 95, origin: { y: 0.3 }, colors: ['#d27a3e', '#b04f74', '#4384c8', '#8268c8', '#2b9c97', '#dcb43c', '#f6efe0'], scalar: 0.9, disableForReducedMotion: true });
    }, 450);
    return () => window.clearTimeout(t);
  }, [good, still]);

  const who = (p: FinalPlayer | undefined) => (!p ? '?' : p.id === view.me ? 'Toi' : p.name);
  const title = good ? 'Tu gagnes !' : `${winner?.name ?? '?'} gagne`;
  const sub = final.tied.length ? 'au départage' : winner ? `${winner.good} carte${winner.good > 1 ? 's' : ''} bien placée${winner.good > 1 ? 's' : ''}` : '';
  let reason = '';
  if (mine && !mine.winner) {
    reason = mine.left.length ? `Il te restait ${mine.left.length} carte${mine.left.length > 1 ? 's' : ''}.` : 'Tu avais posé toutes tes cartes, mais quelqu’un d’autre a gagné le départage.';
  } else if (mine?.winner) reason = final.tied.length ? 'Tu as gagné le départage.' : 'Personne n’a posé toutes ses cartes avant toi.';
  const tied = final.players.filter((p) => final.tied.includes(p.id));

  return (
    <Backdrop quiet>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className={cls('final-hero', good && 'is-good')} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
          {winner && <Avatar avatar={winner.avatar} className="final-avatar" />}
          <motion.div className="stamp is-big" initial={{ scale: 1.7, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -5, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 16, delay: 0.25 }}>
            <b>{title}</b>
            {sub && <small>{sub}</small>}
          </motion.div>
          {reason && <p className="final-reason">{reason}</p>}
          {tied.length > 1 && <p className="muted small">Départage entre {listing(tied.map(who))}.</p>}
        </motion.section>

        <section className="panel final-table">
          <h3>Le classement</h3>
          <ol className="final-list">
            {final.players.map((p, i) => (
              <motion.li key={p.id} className={cls('final-row', p.winner && 'is-winner', p.id === view.me && 'is-me')} initial={{ x: -14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 + i * 0.07 }}>
                <div className="final-line">
                  <span className="final-place">{placeLabel(p.place)}</span>
                  <Avatar avatar={p.avatar} className="final-av" />
                  <span className="final-who">
                    <b className="final-name">{who(p)}</b>
                    <span className="final-stats">
                      {p.good}&nbsp;juste{p.good > 1 ? 's' : ''} · {p.bad}&nbsp;raté{p.bad > 1 ? 's' : ''}
                      {p.gone ? ' · parti' : ''}
                    </span>
                  </span>
                  {p.wins > 0 && (
                    <span className="final-wins" title="Parties gagnées à cette table, ce soir">
                      <Trophy size={13} aria-hidden /> {p.wins}
                    </span>
                  )}
                </div>
                {p.left.length > 0 && (
                  <ul className="final-left" aria-label={`Les cartes qui restaient à ${who(p)}`}>
                    {p.left.map((c) => (
                      <li key={c.id} className={cls('mini', `era-${eraOf(c.year)}`)}>
                        <span aria-hidden>{c.emoji}</span>
                        <span className="mini-title">{c.title}</span>
                        <Year year={c.year} />
                      </li>
                    ))}
                  </ul>
                )}
              </motion.li>
            ))}
          </ol>
          <p className="muted small">Le trophée compte les parties gagnées à cette table ce soir.</p>
        </section>

        <details className="panel final-frise">
          <summary>
            <span>
              La frise de la partie <span className="muted">({final.line.length}&nbsp;cartes)</span>
            </span>
            <ChevronDown size={18} aria-hidden />
          </summary>
          <div className="frise is-static">
            {final.line.map((c) => (
              <div key={c.id} className={cls('frise-row', `era-${eraOf(c.year)}`)}>
                <Year year={c.year} />
                <span className="rail-dot" aria-hidden />
                <Cartel card={c} note={<span className="cartel-by">{c.by === null ? 'carte de départ' : c.by === view.me ? 'par toi' : `par ${who(final.players.find((p) => p.id === c.by))}`}</span>} />
              </div>
            ))}
          </div>
        </details>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
