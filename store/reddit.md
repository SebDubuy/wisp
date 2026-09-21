# Post Reddit — Wisp

Deux versions, à copier-coller telles quelles. Reddit accepte le Markdown ci-dessous.

- Extension : https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
- Site : https://wisptab.netlify.app

---

## Version anglaise — r/chrome_extensions, r/chrome, r/productivity

### Titres possibles

1. I built a tab manager that groups tabs across *two different searches*, not just by domain — looking for feedback
2. My tab problem was never RAM. So I built something that groups tabs by topic instead
3. [Feedback wanted] Wisp — groups your tabs by topic, warns you before it sleeps them

### Corps du post

I've had 40+ tabs open for about as long as I've used Chrome, and my problem was never RAM — Chrome already discards inactive tabs on its own. My problem was that I could never find anything, and I never dared close anything.

So I built **Wisp**. It groups your tabs by topic, then puts inactive groups to sleep.

**What's actually different from the other tab managers**

Most of them group by domain, or ask you to file tabs by hand. Wisp does one thing I haven't found elsewhere: it groups **across a search session**. Search "lisbon weekend", then later "what to do in lisbon", open results from six unrelated sites — they all land in one group named **Lisbon**, because those are the words *you* used.

The matching is purely lexical: stopwords stripped, then a shared stem of at least 5 letters. So it connects "garage" and "garagiste", but it will never connect "gym" and "Basic Fit". That's the deliberate price of never sending anything anywhere.

The rest:

- **It warns you before it sleeps a group.** An hourglass appears on the group in your tab strip at the halfway mark, 💤 when it actually sleeps. Nothing vanishes by surprise, and the marker disappears if you go back.
- **Archiving is separate from sleeping.** Sleeping gives back RAM; archiving gives back attention — the whole group leaves your tab strip and comes back in one click, with its name and its colour.
- **It learns your topics.** It notices which sites you keep opening together and offers to link them. You name the group, you accept, or you decline.

**What it doesn't do:** no content script, no `<all_urls>`, no network calls — not even to me. No account. Five permissions, all visible before you install.

Extension: https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
Site, with an animated demo of the whole loop: https://wisptab.netlify.app

**One heads-up before you click:** the extension's interface is **French only** right now. The site has an English toggle, the popup doesn't. If there's interest here I'll translate it — honestly, that's part of what I'm trying to find out.

**What I'd genuinely like feedback on**

1. Does the search-session grouping fire when you'd want it to — or does it lump together things you wanted apart?
2. Is the ⏳ → 💤 warning enough, or does a group still fall asleep on you unexpectedly?
3. Anything that would make you uninstall it in the first five minutes. That's the most useful thing you can tell me.

It's free, no ads, no tracker, and I'm not planning to charge for it as it stands.

---

## Version française — r/france, r/InformatiqueFR, r/developpeurs, r/webdev_fr

### Titres possibles

1. J'ai fait une extension qui regroupe les onglets par sujet — y compris entre deux recherches différentes. Vos retours ?
2. Mon problème n'a jamais été la RAM, c'est que je ne retrouvais plus rien. J'ai fini par coder l'extension
3. Wisp — range tes onglets par sujet et te prévient avant de les endormir. Je cherche des retours francs

### Corps du post

J'ai une quarantaine d'onglets ouverts en permanence, et mon problème n'a jamais été la mémoire vive : Chrome décharge déjà les onglets inactifs tout seul. Mon problème, c'est que je ne retrouvais rien et que je n'osais rien fermer.

J'ai donc fait **Wisp**. Il regroupe les onglets par sujet, puis endort les groupes dont on ne se sert plus.

**Ce qui change vraiment des autres gestionnaires d'onglets**

La plupart regroupent par domaine, ou demandent de ranger à la main. Wisp fait une chose que je n'ai trouvée nulle part ailleurs : il regroupe **à l'échelle d'une session de recherche**. Cherche « week-end lisbonne », puis plus tard « que faire à lisbonne », ouvre des résultats sur six sites qui n'ont rien à voir — tout se retrouve dans un groupe nommé **Lisbonne**, avec *tes* mots.

Le rapprochement est purement lexical : mots vides retirés, puis racine commune d'au moins 5 lettres. Ça rapproche donc « garage » et « garagiste », mais ça ne rapprochera jamais « salle de sport » et « Basic Fit ». C'est le prix assumé pour qu'aucune donnée ne sorte du navigateur.

Le reste :

- **Il prévient avant d'endormir.** Un sablier apparaît sur le groupe dans la barre d'onglets à mi-parcours, 💤 quand il s'endort vraiment. Rien ne s'évapore par surprise, et le marqueur disparaît si tu y retournes.
- **Archiver n'est pas endormir.** Endormir rend la RAM ; archiver rend l'attention — le groupe entier quitte la barre d'onglets et revient d'un clic, avec son nom et sa couleur.
- **Il apprend tes sujets.** Il observe quels sites reviennent ensemble et propose de les lier. Tu nommes, tu valides, ou tu refuses.

**Ce qu'il ne fait pas :** aucun script injecté dans les pages, pas de `<all_urls>`, aucun appel réseau — pas même vers moi. Aucun compte. Cinq autorisations, toutes visibles avant l'installation.

L'extension : https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
Le site, avec une démo animée de toute la boucle : https://wisptab.netlify.app

**Ce sur quoi j'aimerais vraiment des retours**

1. Est-ce que le regroupement par recherche se déclenche quand tu le voudrais — ou est-ce qu'il colle ensemble des choses que tu voulais séparées ?
2. Est-ce que le ⏳ → 💤 suffit à prévenir, ou est-ce qu'un groupe s'endort quand même sans que tu t'y attendes ?
3. Ce qui te ferait le désinstaller dans les cinq premières minutes. C'est le retour le plus utile que tu puisses me faire.

C'est gratuit, sans publicité et sans traceur, et je ne compte pas le faire payer en l'état.
