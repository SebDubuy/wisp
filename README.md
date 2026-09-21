# Wisp 🌫️

**Wisp** est une extension Chrome qui regroupe automatiquement tes onglets par sujet, puis te laisse les endormir ou les ranger — sans jamais les perdre.

Le vrai problème d'un mur de 40 onglets n'est pas la RAM : c'est que tu ne retrouves rien et que tu n'oses rien fermer. Wisp traite ça.

## Le concept

Contrairement à un suspender classique (qui endort onglet par onglet, sur un simple minuteur), Wisp raisonne par **groupe** :

1. **Regroupement automatique** — dès que plusieurs onglets partagent un domaine (ou un domaine que tu as lié à un même sujet), ils se rangent ensemble dans un groupe nommé, avec une couleur distincte de ses voisins. Le groupe porte un nom lisible — « GitHub », pas `github.com`
2. **Sommeil au niveau du groupe** — un groupe ne s'endort que si aucun de ses onglets n'a été actif depuis un moment, pas onglet par onglet. Consulter brièvement un autre sujet entre-temps ne le met pas en veille par erreur
3. **Avertissement avant le sommeil** — à mi-parcours, le groupe se préfixe d'un ⏳ dans ta barre d'onglets : tu vois venir, rien ne disparaît par surprise
4. **Réveil groupé** — cliquer sur un onglet du groupe réveille tout le groupe d'un coup
5. **Archivage** — un groupe entier quitte la barre d'onglets sans rien perdre : il reste restaurable en un clic depuis le popup
6. **Mode focus** — un bouton, et tout sauf le sujet en cours se replie et s'endort

## Les sessions de recherche

Tu cherches « énergies renouvelables », tu ouvres trois articles depuis les résultats. Trois domaines différents, rien en commun — sauf l'intention.

Wisp voit tes recherches de deux façons : les onglets ouverts *depuis* une page de résultats, et les pages de résultats elles-mêmes. Dans les deux cas, la requête devient le nom du groupe.

Et quand tu creuses avec d'autres mots, il recoud : « week-end lisbonne » puis « que faire à lisbonne » atterrissent dans un seul groupe **Lisbonne**. Wisp retire les mots qui disent comment tu cherches (`meilleur`, `comparatif`, `trouver`, `prix`…), garde ceux qui disent quoi, et retient celui que tes recherches ont en commun — une racine de cinq lettres suffit, donc « garagiste » et « garage » se rejoignent sous **Garage**.

Deux recherches différentes qui convergent suffisent à créer le groupe — c'est une intention claire. Une même recherche répétée, elle, attend ton seuil habituel.

Ce chemin passe avant le regroupement par domaine. Chercher « github actions » et ouvrir trois pages GitHub donne un groupe « Github actions » — le sujet réel — plutôt qu'un fourre-tout « GitHub ».

## Ce que Wisp ne groupe jamais tout seul

- **Les moteurs de recherche** (Google, Bing, DuckDuckGo…) — une recherche n'est pas un sujet. Chercher « figma » sur Google ne doit pas ranger l'onglet dans un groupe « google.com »
- **Les pages internes du navigateur** (`chrome://`, nouvel onglet, extensions)
- **Les onglets épinglés** et les sites de ta whitelist

À l'inverse, les hôtes qui abritent plusieurs services distincts sont séparés : `mail.google.com` devient « Gmail », `gemini.google.com` devient « Gemini » — pas un seul fourre-tout « google.com ».

## Ce que Wisp ne fait pas (encore)

- Pas de détection sémantique par IA — le regroupement se fait par domaine et par mapping manuel de domaines liés, tout en local
- Les onglets sans domaine commun **ni** filiation de recherche (ouverts un par un, tapés à la main) ne se regroupent pas seuls : utilise le clic droit → "Wisp : regrouper les onglets sélectionnés"
- Wisp ne distingue pas encore ses propres groupes de ceux que tu crées à la main : un groupe que tu as nommé toi-même peut aussi être mis en veille

## Domaines liés, sans les remplir à la main

Wisp propose lui-même, par deux chemins :

- **Ce qu'il sait** — ouvre Vinted, Amazon, AliExpress et Cdiscount : ils se rangent tout seuls sous **Achats**, alors qu'ils n'ont aucun domaine commun. C'est un lexique de métiers en dur, pas de l'IA — il couvre Design, Dev, IA, Veille, Vidéo, Achats, Voyage et Travail, soit une centaine de sites.
- **Ce qu'il observe** — pour tout le reste, il compte quels domaines reviennent ensemble au fil des sessions, et propose la grappe entière quand le motif se confirme.

Dans les deux cas tu peux réécrire le nom avant de valider, et les onglets déjà ouverts se rassemblent aussitôt. Une paire n'est comptée qu'une fois par heure, pour qu'un onglet oublié toute la journée ne fausse pas la mesure. Rien ne sort du navigateur.

## Et les onglets déjà ouverts ?

Wisp examine un onglet quand il finit de charger. Ceux qui étaient déjà là avant l'installation ne bougent donc pas tout seuls : ouvre le popup et clique **Ranger les onglets ouverts**. C'est fait aussi automatiquement à l'installation et au démarrage de Chrome.

## Installation

1. Ouvre `chrome://extensions`
2. Active le **mode développeur**
3. Clique **Charger l'extension non empaquetée** et sélectionne ce dossier

## Réglages (popup)

Le popup s'ouvre sur **l'état réel de tes groupes** : lesquels existent, dans combien de temps chacun s'endort, et de quoi agir tout de suite sans attendre le minuteur — endormir, réveiller, archiver, ou basculer en mode focus. Les archives et les réglages suivent en dessous.

| Réglage | Description |
|---|---|
| Nb d'onglets avant regroupement auto | Combien d'onglets du même domaine doivent être ouverts avant qu'un groupe se crée tout seul |
| Attente (⏳) / Sommeil (💤) | Minutes avant le préfixe ⏳ d'avertissement, puis avant la mise en veille du groupe |
| Domaines liés | Domaines différents qu'on sait appartenir au même sujet (ex: `cardmarket.com = Pokémon TCG`) |
| Whitelist | Sites jamais mis en veille |

## Tech

Vanilla JS, Manifest V3. Permissions minimales : `tabs`, `tabGroups`, `storage`, `alarms`, `contextMenus` — pas d'accès `<all_urls>`, aucune donnée ne sort du navigateur.
