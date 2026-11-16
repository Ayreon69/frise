# Frise

**L'imprimerie, avant ou après la boussole ? Glisse chaque carte à sa place dans la frise.**

👉 **Jouer : https://frise-iaom.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu de cartes multijoueur en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
Inspiré des jeux de frise chronologique (création de fans, non officielle) : nom, cartes, dessins et visuels sont propres à ce jeu.

## Règles en bref

- De 2 à 8 joueurs. Chaque carte raconte une invention, une découverte, un événement, une œuvre ou un exploit, **sans sa date**.
- Chacun reçoit 6 cartes à 2 ou 3 joueurs, 5 à 4 ou 5, 4 de 6 à 8. La frise commune commence avec une carte, date visible.
- À son tour, on pose une carte de sa main dans la frise : avant la première, entre deux cartes ou après la dernière. Sa date se dévoile.
  - **Bien placée** : elle reste dans la frise.
  - **Mal placée** : elle quitte la partie, et on pioche une autre carte.
  - Deux cartes de la même année : l'une ou l'autre place est juste.
- Dès que quelqu'un pose sa dernière carte, **on finit le tour de table**. Celui qui n'a plus de carte gagne.
- Plusieurs joueurs sans carte à la fin du tour : les autres sont écartés, et les ex æquo **piochent une carte chacun** pour rejouer un tour entre eux, jusqu'à ce qu'un seul réussisse.

Sont des choix de ce jeu :

- **Huit thèmes** (inventions, sciences et espace, histoire, arts et culture, sport et loisirs, cinéma, jeux vidéo et consoles, mangas et animes) que l'hôte peut retirer, et un nombre de cartes en main réglable de 3 à 6.
- **Le temps par tour est réglable** (30, 60 ou 90 secondes, ou sans limite) ; le temps écoulé, le pilote automatique pose une carte à ta place.
- **La pioche vide se refait** avec les cartes ratées, mélangées.
- **Un joueur absent plus de 20 secondes est remplacé par le pilote automatique** jusqu'à son retour.
- **Aucune aide au calcul** : ni compteur de pioche, ni historique des coups. On voit ce qu'on verrait autour d'une vraie table : la frise, et le nombre de cartes devant chacun.

## Les cartes

450 cartes, des premiers Jeux olympiques antiques (776 av. J.-C.)  à aujourd'hui, dont 158 avant 1900. **Chaque date a été vérifiée une par une** :

- par la date que donne Wikidata pour l'événement et/ou par une phrase datée de l'article Wikipédia (en français, sinon en anglais) cité pour chaque carte ;
- une carte dont la date prête à discussion (deux dates selon les sources, un événement étalé sur plusieurs années) est reformulée pour ne viser qu'un seul moment, ou écartée.

Repères de date des familles ajoutées le 15/11/2026 :

- **Cinéma** : l'année de la première sortie du film (la plus ancienne date de sortie sur Wikidata, confirmée par l'article) ;
- **Jeux vidéo** : la première sortie, tous pays confondus ; **consoles** : la première sortie, avec le pays sur la carte quand les autres pays l'ont reçue plus tard (« au Japon », « aux États-Unis ») ;
- **Champions de League of Legends** : leur arrivée dans le jeu, d'après le wiki League of Legends (`lol:` dans la source), qui reprend les notes de mise à jour ;
- **Animes** : la première diffusion au Japon, écrite sur la carte (« Premier épisode de l'anime … au Japon ») ; pour Hunter x Hunter, la toute première série (1999), pas celle de 2011.

Les films, jeux vidéo et mangas du premier paquet ont rejoint ces familles. Sport et loisirs garde 20 cartes : seul, ce thème se joue à deux avec 3 ou 4 cartes en main.

La liste, ses sources et les décisions prises carte par carte sont dans `data/` (`candidates.json`, `rapport.json`, `candidates-ecrans.json`, `rapport-ecrans.json`, `candidates-avant1900.json`, `rapport-avant1900.json`, `verifier-ecrans.py`, `construire.py`, qui produit `server/cards.ts`).

## Les bots

Ils ne voient que ce qu'un joueur voit : leurs cartes sans date, et la frise dévoilée. Chaque bot a une idée approximative de la date de chaque carte, tirée une fois pour toutes : plus floue pour les époques anciennes que pour les dernières décennies, et plus floue pour un bot novice que pour un expert. Il joue la carte, et la place, dont il est le plus sûr, avec parfois une hésitation.

Mesures sur 1 000 parties par configuration (`npx tsx test/sim.ts 1000`) :

- contre un joueur qui pose au hasard, à deux, chaque niveau gagne presque toujours ; un novice place juste 68 % de ses cartes, un habile 81 %, un expert 88 % ;
- à la même table, l'expert gagne 71 % des parties, l'habile 24 %, le novice 6 % ;
- une partie dure 8 tours de table à deux, 7 à quatre ou cinq, 6 à 6 ou 8 (15 à 36 cartes jouées) ; un départage arrive dans une partie sur cinq à deux, dans trois sur cinq à partir de six.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 1 à 7 bots en un clic
- Deux touches par coup : une carte de sa main, puis sa place dans la frise ; les places s'allument le long du ruban des époques
- La carte se glisse dans la frise, sa date se dévoile chez tout le monde, « Bien vu ! » ou « Raté ! » s'y tamponne ; une carte ratée s'affiche un instant à la place visée, puis s'en va
- La frise défile toute seule jusqu'à la carte posée ; le ruban change de couleur avec les époques
- Écran de victoire, puis les cartes qui restaient à chacun, dates dévoilées, et toute la frise de la partie
- Victoires de la soirée, revanche en un clic
- Réactions, règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique, spectateurs
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3300
npm run dev:client   # interface sur http://localhost:5209
npm test             # cartes, donne, pose, fin de partie, départage, pioche, bots
npm run build && npm run e2e   # parties complètes avec de vrais clients connectés
npx tsx test/sim.ts 1000       # force des bots et durée des parties
```

`FR_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, constantes et règle de placement
- `server/` : Express + Socket.IO, cartes (`cards.ts`, générée), moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que ses propres cartes, sans leur date, et jamais la pioche
- `client/` : React + Vite + Framer Motion. La frise est dans `components/Frise.tsx`, les cartes dans `components/Ui.tsx`, la table dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
