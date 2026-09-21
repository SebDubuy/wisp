# Fiche Chrome Web Store — Wisp

Tout ce qui suit est à copier-coller dans le formulaire. Les `[crochets]` sont à remplir.

---

## Nom
Wisp — regroupe tes onglets par sujet

## Description courte (132 caractères max)
Regroupe tes onglets par sujet automatiquement, et endort les groupes inactifs. Tout reste dans ton navigateur.

## Catégorie
Productivité

## Langue
Français

---

## Description détaillée

Tu as quarante onglets ouverts. Le problème n'est pas ta mémoire vive : Chrome décharge déjà les onglets inactifs tout seul. Le problème, c'est que tu ne retrouves rien et que tu n'oses rien fermer.

Wisp s'occupe de ça.

**Il regroupe, tout seul**
Trois pages du même site deviennent un groupe nommé lisiblement — « Leboncoin », pas « leboncoin.fr ». Et deux recherches sur un même sujet se rejoignent : « week-end lisbonne » puis « que faire à lisbonne » forment un groupe **Lisbonne**, nommé avec tes propres mots.

**Il prévient avant d'endormir**
À mi-parcours, un sablier apparaît sur le groupe dans ta barre d'onglets. Tu vois le sommeil arriver, et le marqueur disparaît si tu y retournes. Rien ne s'évapore par surprise.

**Il libère la mémoire, et l'attention**
Endormir un groupe rend la RAM. L'archiver rend l'attention : le groupe entier quitte ta barre d'onglets et revient d'un clic, avec son nom et sa couleur.

**Il apprend tes sujets, sans rien envoyer**
Ouvre Amazon, Leboncoin et Vinted en même temps : ils se rangent sous « Achats ». Pour le reste, Wisp observe simplement quels sites reviennent ensemble et te propose de les lier. Tu nommes, tu valides, ou tu refuses.

**Ce que Wisp ne fait pas**
Il ne lit pas le contenu de tes pages. Il n'injecte aucun script. Il ne contacte aucun serveur — pas même le mien. Il n'y a pas de compte à créer, et l'extension fonctionne hors ligne.

Gratuit, sans publicité, sans traceur.

---

## Justification des permissions

**tabs** — Wisp lit l'adresse et le titre des onglets ouverts pour déterminer leur sujet et décider dans quel groupe les ranger. Il ne lit jamais le contenu des pages : l'extension ne demande pas `<all_urls>` et n'injecte aucun script.

**tabGroups** — Créer les groupes, les nommer d'après le sujet détecté, les replier et les déplier. C'est la fonction principale de l'extension.

**storage** — Enregistrer les réglages, les sujets liés et les groupes archivés dans le stockage local du navigateur, sur la machine de l'utilisateur. Aucune donnée n'est transmise.

**alarms** — Vérifier une fois par minute quels groupes n'ont plus d'activité récente, afin de les marquer puis de les endormir.

**contextMenus** — Ajouter une entrée « Wisp : regrouper les onglets sélectionnés » au menu du clic droit, pour les cas que la détection automatique ne couvre pas.

**Usage à distance du code** : non. Tout le code est inclus dans le paquet.

---

## Confidentialité (formulaire « Data usage »)

Coche **aucune** des cases de collecte de données, puis les trois attestations :
- Je ne vends pas les données des utilisateurs à des tiers
- Je n'utilise pas les données à des fins étrangères à la fonction principale
- Je n'utilise pas les données pour évaluer la solvabilité ou accorder des prêts

URL de la politique de confidentialité : `https://wisptab.com/confidentialite.html`

---


---

# Marche à suivre, dans l'ordre

## 0. Le compte (une fois)
`chrome.google.com/webstore/devconsole` → 5 $ par carte, une seule fois.
Vérifie ton adresse de contact dans **Account** : sans ça, l'envoi est bloqué à la fin.

## 1. Nouvel élément
Bouton **Add new item** → dépose `wisp-1.0.0.zip`.
Le manifeste est lu automatiquement : nom, version et icônes se remplissent seuls.

## 2. Onglet « Store listing »
- **Description courte** et **Description détaillée** : les textes plus haut
- **Category** : Productivity
- **Language** : Français
- **Screenshots** : les cinq fichiers de `store/`, dans l'ordre 1 à 5 — en **français** ; pour la fiche **anglaise**, ceux de `store/en/`
- **Régénérer tous les visuels** (captures, tuile, bannière, fr + en) : `store/visuels/generer.cjs`. Le modèle lit le CSS réel du popup et les messages réels de `_locales` : à relancer après tout changement de texte ou de style du popup, pour que les captures ne mentent pas
- **Small promo tile** : `tuile-440x280.png`
- **Support email** : ton adresse
- **Website** : ton adresse Netlify

## 3. Onglet « Privacy » — c'est ici qu'on bloque le plus
- **Single purpose** : une seule phrase, obligatoire. Colle celle ci-dessous.
- **Permission justification** : un champ PAR permission, tous obligatoires. Textes plus haut.
- **Are you using remote code?** → **No, I am not using remote code**
- **Data usage** : ne coche AUCUNE case de collecte, puis coche les **trois attestations**
- **Privacy policy URL** : `https://wisptab.com/confidentialite.html`

## 4. Onglet « Distribution »
- **Visibility** : Public
- **Distribution** : All regions
- Gratuit, rien à configurer côté paiement

## 5. Envoi
**Submit for review**. Compte quelques jours, parfois plus pour un premier dépôt
avec la permission `tabs`. Tu recevras un mail, accepté ou refusé avec le motif.

---

## Single purpose (à coller tel quel)

Wisp regroupe automatiquement les onglets ouverts par sujet, en s'appuyant sur leur domaine et sur la recherche dont ils sont issus, puis met en veille les groupes restés inactifs afin de libérer de la mémoire.

---

## Les cinq erreurs qui font recaler

1. Un champ de justification de permission laissé vide
2. L'URL de politique de confidentialité inaccessible : dépose le site AVANT
3. Les trois attestations de la section Data usage non cochées
4. Une capture qui n'est ni 1280×800 ni 640×400
5. L'adresse de contact du compte non vérifiée

---

## À remplir avant l'envoi

- [x] Déployer `site/` sur Netlify → https://wisptab.netlify.app
- [x] URL de confidentialité : https://wisptab.netlify.app/confidentialite.html
- [ ] Ajouter `"homepage_url": "https://wisptab.netlify.app" (fait)` dans manifest.json
- [ ] Domaine wisptab.com acheté (2026-09-21) : le brancher sur Netlify, puis mettre à jour l'URL du site et de la confidentialité dans le tableau de bord du Store (`homepage_url` du manifeste : fait, part avec la 1.1.0)
- [ ] Remplacer `[TON EMAIL]` dans site/confidentialite.html
- [ ] Remplacer les liens `#` de la landing par l'URL du Web Store, une fois publiée (cherche `data-todo`)
