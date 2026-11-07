// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, logo, avatars,
// le mur de la galerie et les cartes (en main, sans date ; dans la frise, en cartel avec sa date).
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CardFamily } from '../../../shared/protocol';
import { FAMILY_SHORT, eraOf, yearParts } from '../lib/text';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

/** Le ruban de la frise, six couleurs pour six époques. */
export function Ribbon({ className }: { className?: string }) {
  return (
    <span className={cls('ribbon', className)} aria-hidden>
      {['antiquite', 'moyen-age', 'moderne', 'xix', 'xx', 'xxi'].map((e) => (
        <i key={e} className={`era-${e}`} />
      ))}
    </span>
  );
}

/** Le titre : « Frise » en grandes capitales à empattements, posé sur le ruban des époques. Sur la table, l'emblème seul. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  if (size === 'sm') {
    return (
      <span className="logo logo-sm" role="img" aria-label="Frise">
        <span className="logo-mark" aria-hidden>
          F<Ribbon />
        </span>
        <span className="logo-name" aria-hidden>
          Frise
        </span>
      </span>
    );
  }
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Frise">
      <span className="logo-word" aria-hidden>
        Frise
      </span>
      <Ribbon className="logo-ribbon" />
    </div>
  );
}

/** Le décor : le mur vert de la galerie, ses lambris et la lumière des spots. */
export function Backdrop({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <div className={cls('backdrop', quiet && 'is-quiet', className)}>
      <div className="wall" aria-hidden />
      <div className="backdrop-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'ink' | 'soft' | 'red' | 'gold'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <div className={cls('segmented', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * « sheet » : sur téléphone, elle monte du bas de l'écran, à portée de pouce.
 */
export function Modal({ open, onClose, title, children, wide, sheet, footer, className }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; sheet?: boolean; footer?: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={cls('modal-back', sheet && 'is-sheet')} onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', sheet && 'is-sheet', className)} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const AVATAR_EMOJI: Record<string, string> = {
  plume: '🪶',
  loupe: '🔍',
  sablier: '⏳',
  boussole: '🧭',
  globe: '🌍',
  ampoule: '💡',
  fusee: '🚀',
  appareil: '📷',
  couronne: '👑',
  palette: '🎨',
  telescope: '🔭',
  parchemin: '📜',
};

export const AVATAR_LABELS: Record<string, string> = {
  plume: 'Plume',
  loupe: 'Loupe',
  sablier: 'Sablier',
  boussole: 'Boussole',
  globe: 'Globe',
  ampoule: 'Ampoule',
  fusee: 'Fusée',
  appareil: 'Appareil photo',
  couronne: 'Couronne',
  palette: 'Palette',
  telescope: 'Télescope',
  parchemin: 'Parchemin',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🪶'}
    </span>
  );
}

/** La date en grand : le nombre, et « av. J.-C. » en petit dessous. */
export function Year({ year, className }: { year: number; className?: string }) {
  const { n, suffix } = yearParts(year);
  return (
    <span className={cls('year', `era-${eraOf(year)}`, n.length <= 2 && 'is-short', className)} aria-label={suffix ? `${n} avant Jésus-Christ` : n}>
      <b>{n}</b>
      {suffix && <small>{suffix}</small>}
    </span>
  );
}

/** Une carte en main : son dessin, son titre, sa famille, et à la place de la date un cartouche vide. */
export function HandTile({
  card,
  selected,
  disabled,
  onClick,
  className,
}: {
  card: { id: number; title: string; emoji: string; family: CardFamily };
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="tile-medal" aria-hidden>
        {card.emoji}
      </span>
      <span className="tile-title">{card.title}</span>
      <span className={cls('tile-fam', `fam-${card.family}`)}>{FAMILY_SHORT[card.family]}</span>
      <span className="tile-date" aria-hidden>
        ?
      </span>
    </>
  );
  const classes = cls('tile', selected && 'is-selected', className);
  if (!onClick) return <span className={classes}>{body}</span>;
  return (
    <button type="button" className={classes} onClick={onClick} disabled={disabled} aria-pressed={selected} onMouseDown={(e) => e.preventDefault()}>
      {body}
    </button>
  );
}

/** Le cartel d'une carte de la frise (sans la date, qui est sur le ruban). */
export function Cartel({ card, note, className }: { card: { title: string; emoji: string; family: CardFamily }; note?: ReactNode; className?: string }) {
  return (
    <span className={cls('cartel', className)}>
      <span className="cartel-medal" aria-hidden>
        {card.emoji}
      </span>
      <span className="cartel-text">
        <span className="cartel-title">{card.title}</span>
        <span className="cartel-meta">
          <span className={cls('tile-fam', `fam-${card.family}`)}>{FAMILY_SHORT[card.family]}</span>
          {note}
        </span>
      </span>
    </span>
  );
}
