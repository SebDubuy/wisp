# Post Reddit — Wisp

À poster **une fois la 1.1.0 validée par le Store** : c'est elle qui apporte
l'interface anglaise, le groupe Google et « Trier les onglets en vrac ».

Sur Reddit, passer l'éditeur en **Markdown mode** avant de coller, sinon les
`**gras**` et les listes s'affichent tels quels. Vérifier les règles du sub
(flair « Self-promotion » ou équivalent) avant de publier.

- Extension : https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
- Site : https://wisptab.com
- Code : https://github.com/SebDubuy/wisp

---

## Version anglaise — r/chrome_extensions, r/chrome, r/productivity

### Titres possibles

1. I built a free tab manager that groups tabs across two different searches — and never sends anything anywhere
2. My tab problem was never RAM, it was finding anything. So I built Wisp — feedback welcome
3. Wisp: your tabs group themselves by topic, even across different searches (free, no network calls, code on GitHub)

### Corps du post

I've had 40+ tabs open for as long as I can remember. Chrome already discards inactive tabs on its own, so RAM was never really the issue. The issue was that I couldn't find anything, and didn't dare close anything.

So I built **Wisp**, a Chrome extension that files your tabs by topic and puts idle groups to sleep.

**The part I haven't seen elsewhere: it groups by search session, not just by domain.**
Search "lisbon weekend", later "what to do in lisbon", open results from six different sites — they all land in one group called **Lisbon**, named with *your* words.

The matching is purely lexical (stopwords stripped, then a shared 5-letter stem), so it links "garage" and "garagiste" but will never link "gym" and "Basic Fit". That's the price of never sending your data anywhere.

**What else it does**

- **Groups by site and by category.** Three GitHub tabs become "GitHub". Gmail, Drive and Google Ads become "Google". Amazon, eBay and Etsy become "Shopping".
- **Warns you before it sleeps a group.** An ⏳ appears on the group in your tab strip halfway through, 💤 when it actually sleeps. Go back to it and the marker disappears.
- **Sorts loose tabs in one click.** Whatever can be grouped gets grouped; the rest goes into an **📥 Inbox** group, which keeps sorting itself as matching tabs show up.
- **Archives whole groups.** The group leaves your tab strip and comes back in one click, with its name and colour.
- **Learns your own topics.** It notices which sites you keep opening together and offers to link them. You name it, accept, or decline.

**What it doesn't do**

No content script, no `<all_urls>`, no network calls — not even to me. No account. Five permissions, all visible before you install. The code is public on GitHub if you'd rather check than trust me.

- Chrome Web Store: https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
- Site, with an animated demo: https://wisptab.com
- Code: https://github.com/SebDubuy/wisp

Free, no ads, no tracker. Available in English and French.

**What I'd love feedback on**

1. Does the search grouping fire when you'd expect it to — or does it lump together things you wanted apart?
2. Is the ⏳ → 💤 warning enough, or does a group still fall asleep on you?
3. What would make you uninstall it in the first five minutes? That's the most useful thing you can tell me.

Solo dev here, so honest feedback genuinely shapes what I build next.

---

## Version française — Le Journal du Hacker, r/developpeurs, réseaux

### Titres possibles

1. J'ai fait une extension gratuite qui regroupe les onglets par sujet — même entre deux recherches différentes, et sans rien envoyer
2. Mon problème n'a jamais été la RAM, c'est que je ne retrouvais plus rien. Alors j'ai fait Wisp
3. Wisp : tes onglets se rangent par sujet tout seuls (gratuit, aucun appel réseau, code sur GitHub)

### Corps du post

J'ai une quarantaine d'onglets ouverts depuis aussi longtemps que je me souvienne. Chrome décharge déjà les onglets inactifs tout seul : la mémoire vive n'a jamais été le vrai problème. Le problème, c'est que je ne retrouvais rien et que je n'osais rien fermer.

J'ai donc fait **Wisp**, une extension Chrome qui range les onglets par sujet et endort les groupes dont on ne se sert plus.

**Ce que je n'ai vu nulle part ailleurs : il regroupe par session de recherche, pas seulement par site.**
Cherche « week-end lisbonne », puis plus tard « que faire à lisbonne », ouvre des résultats sur six sites différents : tout se retrouve dans un groupe **Lisbonne**, nommé avec *tes* mots.

Le rapprochement est purement lexical (mots vides retirés, puis racine commune d'au moins 5 lettres) : il rapproche « garage » et « garagiste », mais ne rapprochera jamais « salle de sport » et « Basic Fit ». C'est le prix pour que rien ne sorte du navigateur.

**Ce qu'il fait aussi**

- **Il regroupe par site et par catégorie.** Trois onglets GitHub donnent « GitHub ». Gmail, Drive et Google Ads donnent « Google ». Amazon, Leboncoin et Vinted donnent « Achats ».
- **Il prévient avant d'endormir.** Un ⏳ apparaît sur le groupe dans la barre d'onglets à mi-parcours, 💤 quand il s'endort vraiment. Tu y retournes, le marqueur disparaît.
- **Il trie les onglets en vrac en un clic.** Ce qui peut se regrouper se regroupe ; le reste part dans un groupe **📥 À trier**, qui continue de se trier tout seul à mesure que des onglets du même sujet arrivent.
- **Il archive des groupes entiers.** Le groupe quitte la barre d'onglets et revient d'un clic, avec son nom et sa couleur.
- **Il apprend tes propres sujets.** Il remarque les sites que tu ouvres toujours ensemble et propose de les lier. Tu nommes, tu valides, ou tu refuses.

**Ce qu'il ne fait pas**

Aucun script injecté dans les pages, pas de `<all_urls>`, aucun appel réseau — pas même vers moi. Aucun compte. Cinq autorisations, toutes visibles avant l'installation. Le code est public sur GitHub, pour qui préfère vérifier plutôt que me croire.

- L'extension : https://chromewebstore.google.com/detail/wisp/jmbidfccifncngjkhagpbilhfkmbaohm
- Le site, avec une démo animée : https://wisptab.com
- Le code : https://github.com/SebDubuy/wisp

Gratuit, sans publicité, sans traceur. En français et en anglais.

**Ce sur quoi j'aimerais vraiment des retours**

1. Le regroupement par recherche se déclenche-t-il quand tu t'y attends — ou colle-t-il ensemble des choses que tu voulais séparées ?
2. Le ⏳ → 💤 suffit-il à prévenir, ou un groupe s'endort-il quand même sans que tu t'y attendes ?
3. Qu'est-ce qui te ferait le désinstaller dans les cinq premières minutes ? C'est le retour le plus utile que tu puisses me faire.

Je suis seul sur le projet : des retours francs orientent vraiment la suite.
