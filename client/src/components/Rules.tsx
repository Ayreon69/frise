// Les règles, lisibles en une minute et consultables à tout moment.
import { Hand, Layers, ListOrdered, Swords, Trophy } from 'lucide-react';
import { useStore } from '../store';
import { Modal } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <p>
            Chaque carte raconte une invention, un événement, une œuvre… <b>sans sa date</b>. Au centre, la <b>frise</b> commune commence avec une seule carte, date visible. Le but&nbsp;: <b>être le premier à ne plus avoir de carte</b>.
          </p>
        </section>

        <section>
          <h3>
            <Layers size={18} aria-hidden /> La donne
          </h3>
          <p>
            Chacun reçoit <b>6&nbsp;cartes à 2 ou 3 joueurs</b>, 5 à 4 ou 5, 4 de 6 à 8 (l'hôte peut changer ce nombre). On joue chacun son tour, dans l'ordre de la table.
          </p>
        </section>

        <section>
          <h3>
            <Hand size={18} aria-hidden /> À ton tour
          </h3>
          <p>
            Touche une carte de ta main, puis <b>sa place dans la frise</b>&nbsp;: avant la première, entre deux cartes, ou après la dernière. Sa date se dévoile chez tout le monde.
          </p>
          <ul className="rule-list">
            <li>
              <b className="good">Bien placée</b>&nbsp;: elle reste dans la frise, et ta main maigrit.
            </li>
            <li>
              <b className="bad">Mal placée</b>&nbsp;: elle quitte la partie, et tu pioches une nouvelle carte.
            </li>
            <li>Deux cartes de la même année&nbsp;: l'une ou l'autre place est juste.</li>
          </ul>
          <p className="muted small">La frise se lit de haut en bas, de la plus ancienne date à la plus récente.</p>
        </section>

        <section>
          <h3>
            <ListOrdered size={18} aria-hidden /> La fin
          </h3>
          <p>
            Dès que quelqu'un pose sa dernière carte, <b>on finit le tour de table</b>, pour que tout le monde ait joué autant de fois.
          </p>
        </section>

        <section>
          <h3>
            <Swords size={18} aria-hidden /> Le départage
          </h3>
          <p>
            Si plusieurs joueurs n'ont plus de carte à la fin du tour, les autres sont écartés. Les ex æquo <b>piochent une carte chacun</b> et rejouent un tour entre eux, jusqu'à ce qu'un seul réussisse.
          </p>
        </section>

        <section className="rule-win">
          <h3>
            <Trophy size={18} aria-hidden /> Qui gagne&nbsp;?
          </h3>
          <p>Le seul joueur qui n'a plus de carte à la fin d'un tour de table.</p>
        </section>
        <p className="muted small">Inspiré des jeux de frise chronologique. Création de fans, non officielle&nbsp;: cartes et dessins originaux. Chaque date a été vérifiée sur Wikipédia et Wikidata.</p>
      </div>
    </Modal>
  );
}
