// La frise commune, de haut en bas, de la plus ancienne date à la plus récente. Chaque carte est un cartel accroché
// au ruban des époques. Quand on tient une carte et que c'est son tour, les places libres s'allument entre les cartes.
// À la révélation, la carte posée montre sa date : juste, elle reste ; fausse, elle s'affiche un instant en rouge puis s'en va.
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { LineCard, Move, Stage } from '../../../shared/protocol';
import { eraOf } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { Cartel, Year } from './Ui';

function Stamp({ ok }: { ok: boolean }) {
  return (
    <motion.span
      className={cls('stamp', ok ? 'is-good' : 'is-bad')}
      initial={{ scale: 1.8, rotate: ok ? -16 : 14, opacity: 0 }}
      animate={{ scale: 1, rotate: ok ? -8 : 7, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 15, delay: 0.75 }}
      aria-hidden
    >
      {ok ? <Check size={15} strokeWidth={3.2} /> : <X size={15} strokeWidth={3.2} />}
      {ok ? 'Bien vu !' : 'Raté !'}
    </motion.span>
  );
}

function Row({ card, fresh, wrong, note, era }: { card: LineCard; fresh?: boolean; wrong?: boolean; note?: ReactNode; era: string }) {
  const still = reducedMotion();
  return (
    <motion.div
      layout={!still}
      className={cls('frise-row', `era-${era}`, fresh && 'is-fresh', wrong && 'is-wrong')}
      data-card={card.id}
      initial={fresh ? { opacity: 0, x: 60, scale: 0.92 } : false}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, height: 0, marginTop: 0, marginBottom: 0, transition: { duration: 0.4 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      <Year year={card.year} className={fresh ? 'is-revealing' : undefined} />
      <span className="rail-dot" aria-hidden />
      <Cartel card={card} note={note} className={fresh ? 'is-fresh' : undefined} />
      {fresh && <Stamp ok={!wrong} />}
    </motion.div>
  );
}

export function Frise({
  line,
  move,
  stage,
  armed,
  onPlace,
  nameOf,
}: {
  line: LineCard[];
  move: Move | null;
  stage: Stage;
  /** Une carte est en main et c'est son tour : les places s'allument. */
  armed: boolean;
  onPlace: (slot: number) => void;
  nameOf: (id: string) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const revealing = stage === 'reveal' && !!move;
  const ghost = revealing && move && !move.ok ? move : null;
  const lastMove = useRef(0);

  // À chaque coup, la frise défile jusqu'à la carte posée, chez tout le monde.
  useEffect(() => {
    if (!move || move.n === lastMove.current) return;
    lastMove.current = move.n;
    const t = window.setTimeout(() => {
      const el = box.current?.querySelector<HTMLElement>(`[data-card="${move.card.id}"]`);
      // On ne fait défiler que la frise : scrollIntoView ferait aussi glisser l'écran entier.
      const sc = el?.closest<HTMLElement>('.table-main');
      if (!el || !sc) return;
      const r = el.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      sc.scrollTo({ top: sc.scrollTop + r.top - s.top - (s.height - r.height) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [move]);

  const items: ReactNode[] = [];
  const slot = (i: number) => {
    const prev = line[i - 1];
    const next = line[i];
    const from = prev ? eraOf(prev.year) : next ? eraOf(next.year) : 'xx';
    const to = next ? eraOf(next.year) : from;
    items.push(
      <div key={`s${i}`} className={cls('slot-wrap', `from-${from}`, `to-${to}`, armed && 'is-armed', i === 0 && 'is-first', i === line.length && 'is-last')}>
        {armed ? (
          <button type="button" className="slot" onClick={() => onPlace(i)} onMouseDown={(e) => e.preventDefault()} aria-label={prev && next ? `Placer entre ${prev.title} et ${next.title}` : prev ? `Placer après ${prev.title}` : `Placer avant ${next?.title ?? 'tout'}`}>
            <span>{i === 0 ? 'Avant tout' : i === line.length ? 'Après tout' : 'Ici'}</span>
          </button>
        ) : (
          <span className="slot-gap" aria-hidden />
        )}
      </div>,
    );
  };
  for (let i = 0; i <= line.length; i++) {
    if (ghost && ghost.slot === i) {
      items.push(<Row key={`g${ghost.n}`} card={ghost.card} fresh wrong era={eraOf(ghost.card.year)} note={<span className="cartel-by">par {nameOf(ghost.by)}</span>} />);
    }
    slot(i);
    if (i < line.length) {
      const c = line[i];
      const fresh = revealing && move!.ok && move!.card.id === c.id;
      const recent = !!move && move.ok && move.card.id === c.id;
      items.push(
        <Row
          key={c.id}
          card={c}
          fresh={fresh}
          era={eraOf(c.year)}
          note={c.by === null ? <span className="cartel-by">carte de départ</span> : recent ? <span className="cartel-by">par {nameOf(c.by)}</span> : undefined}
        />,
      );
    }
  }

  return (
    <motion.div ref={box} layoutScroll className={cls('frise', armed && 'is-armed')} aria-label="La frise">
      <div className="frise-end is-top">
        <span>Plus ancien</span>
      </div>
      <AnimatePresence initial={false}>{items}</AnimatePresence>
      <div className="frise-end is-bottom">
        <span>Plus récent</span>
      </div>
    </motion.div>
  );
}
