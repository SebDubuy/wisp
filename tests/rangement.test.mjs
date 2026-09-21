// Le bouton « Ranger les onglets ouverts » : il balaie toutes les fenêtres,
// ne s'arrête pas au premier accroc, et dit ce qu'il a fait.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerWisp } from "./charger.mjs";

// Un faux navigateur minimal : des fenêtres, des onglets, des groupes. Il
// reproduit la règle de Chrome qui fait échouer le balayage dans la vraie
// vie : on ne groupe pas un onglet d'une fenêtre d'application ou de popup.
function fauxNavigateur(fenetres) {
    const onglets = new Map();
    const groupes = new Map();
    let prochainGroupe = 100;
    for (const f of fenetres) {
        for (const o of f.onglets) {
            onglets.set(o.id, { groupId: -1, pinned: false, active: false, windowId: f.id, ...o });
        }
    }
    const typeDe = (id) => fenetres.find(f => f.id === id).type || "normal";
    const ongletsDe = (id) => [...onglets.values()].filter(o => o.windowId === id).map(o => ({ ...o }));

    const chrome = {
        windows: {
            getAll: async ({ windowTypes } = {}) => fenetres
                .filter(f => !windowTypes || windowTypes.includes(f.type || "normal"))
                .map(f => ({ id: f.id, type: f.type || "normal", tabs: ongletsDe(f.id) })),
            get: async (id) => ({ id, type: typeDe(id), tabs: ongletsDe(id) })
        },
        tabs: {
            get: async (id) => ({ ...onglets.get(id) }),
            query: async (q = {}) => [...onglets.values()]
                .filter(o => (q.groupId === undefined || o.groupId === q.groupId) &&
                             (q.windowId === undefined || o.windowId === q.windowId))
                .map(o => ({ ...o })),
            group: async ({ tabIds, groupId }) => {
                const ids = [].concat(tabIds);
                const fenetre = onglets.get(ids[0]).windowId;
                if (typeDe(fenetre) !== "normal") {
                    throw new Error("Tabs can only be moved to and from normal windows.");
                }
                const id = groupId ?? prochainGroupe++;
                if (!groupes.has(id)) groupes.set(id, { id, windowId: fenetre, title: "", color: "grey" });
                for (const o of ids) onglets.get(o).groupId = id;
                return id;
            }
        },
        tabGroups: {
            query: async (q = {}) => [...groupes.values()]
                .filter(g => q.windowId === undefined || g.windowId === q.windowId)
                .map(g => ({ ...g })),
            get: async (id) => ({ ...groupes.get(id) }),
            update: async (id, props) => ({ ...Object.assign(groupes.get(id), props) })
        }
    };
    // Un onglet qui s'ouvre après coup, libre, dans une fenêtre donnée.
    const ajouter = (fenetre, o) => {
        fenetres.find(f => f.id === fenetre).onglets.push(o);
        onglets.set(o.id, { groupId: -1, pinned: false, active: false, windowId: fenetre, ...o });
    };
    // Chrome supprime un groupe dès qu'il n'a plus d'onglet.
    const titres = () => [...groupes.values()]
        .filter(g => [...onglets.values()].some(o => o.groupId === g.id))
        .map(g => g.title).sort();
    const groupeDe = (id) => onglets.get(id).groupId;
    return { chrome, titres, groupeDe, ajouter };
}

const web = (id, url) => ({ id, url });
// Les objets nés dans le contexte vm ont un autre Object.prototype.
const nu = (x) => JSON.parse(JSON.stringify(x));

test("le rangement regroupe les onglets libres d'un même sujet", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [
        web(1, "https://github.com/a"), web(2, "https://github.com/b"), web(3, "https://github.com/c")
    ] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    assert.equal(await w.sweepExistingTabs(), 3, "il rend le nombre d'onglets rangés");
    assert.deepEqual(nav.titres(), ["GitHub"]);
});

test("rien à ranger : le rangement le dit par un zéro", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [web(1, "https://github.com/a"), web(2, "https://notion.so/x")] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    assert.equal(await w.sweepExistingTabs(), 0);
});

test("une fenêtre d'application ne bloque pas le rangement des autres", async () => {
    // Chrome refuse de grouper dans une fenêtre d'application (PWA, popup).
    // Le balayage ne doit ni s'y risquer, ni abandonner les fenêtres suivantes.
    const nav = fauxNavigateur([
        { id: 1, type: "app", onglets: [
            web(1, "https://notion.so/a"), web(2, "https://notion.so/b"), web(3, "https://notion.so/c")
        ] },
        { id: 2, onglets: [
            web(4, "https://github.com/a"), web(5, "https://github.com/b"), web(6, "https://github.com/c")
        ] }
    ]);
    const w = chargerWisp({ chrome: nav.chrome });
    assert.equal(await w.sweepExistingTabs(), 3);
    assert.deepEqual(nav.titres(), ["GitHub"]);
    assert.equal(nav.groupeDe(1), -1, "la fenêtre d'application est laissée intacte");
});

test("une erreur sur un onglet n'interrompt pas le balayage", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [
        web(1, "https://github.com/a"), web(2, "https://github.com/b"), web(3, "https://github.com/c")
    ] }]);
    const lireVrai = nav.chrome.tabs.get;
    // Un onglet fermé entre l'instantané et sa relecture : tabs.get échoue.
    nav.chrome.tabs.get = async (id) => { if (id === 1) throw new Error("No tab with id: 1"); return lireVrai(id); };
    const w = chargerWisp({ chrome: nav.chrome });
    await w.sweepExistingTabs();
    assert.notEqual(nav.groupeDe(2), -1, "les onglets suivants sont quand même examinés");
});

test("Gmail, Drive et Google Ads forment un groupe Google", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [
        web(1, "https://mail.google.com/mail/u/0/#inbox"),
        web(2, "https://drive.google.com/drive/shared-drives"),
        web(3, "https://ads.google.com/aw/overview"),
        web(4, "https://gemini.google.com/app")
    ] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    await w.sweepExistingTabs();
    assert.deepEqual(nav.titres(), ["Google"]);
    assert.equal(nav.groupeDe(4), -1, "Gemini reste dans la catégorie IA");
});

test("les services Google ont un nom, et une catégorie", () => {
    const fr = chargerWisp({ langue: "fr" });
    const en = chargerWisp({ langue: "en" });
    assert.equal(fr.getTopic("https://ads.google.com/aw/overview"), "Google Ads");
    assert.equal(fr.categoryOfUrl("https://ads.google.com/aw/overview"), "Google");
    assert.equal(en.categoryOfUrl("https://mail.google.com/mail/u/0"), "Google");
    assert.equal(fr.categoryOfUrl("https://gemini.google.com/app"), "IA");
    assert.equal(fr.getTopic("https://www.google.com/search?q=x"), null, "la recherche reste exclue");
});

// ------------------------------------------------------------------
// « Trier les onglets en vrac » : ce qui peut se regrouper se regroupe, le
// reste part dans « 📥 À trier », que Wisp continue de trier ensuite.

test("le tri range ce qu'il peut et met le reste dans « À trier »", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [
        web(1, "https://github.com/a"), web(2, "https://github.com/b"), web(3, "https://github.com/c"),
        web(4, "https://notion.so/x"), web(5, "https://fr.wikipedia.org/wiki/Lisbonne"),
        web(6, "chrome://newtab/"), { id: 7, url: "https://youtube.com/", pinned: true }
    ] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    const r = await w.sortLooseTabs(1);
    assert.deepEqual(nu(r), { ranges: 3, aTrier: 2 });
    assert.deepEqual(nav.titres(), ["GitHub", "📥 À trier"]);
    assert.equal(nav.groupeDe(6), -1, "une page du navigateur n'est pas « en vrac »");
    assert.equal(nav.groupeDe(7), -1, "un onglet épinglé reste épinglé");
});

test("sans onglet en vrac, le tri ne crée aucun groupe « À trier »", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [web(1, "chrome://newtab/")] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    assert.deepEqual(nu(await w.sortLooseTabs(1)), { ranges: 0, aTrier: 0 });
    assert.deepEqual(nav.titres(), []);
});

test("« À trier » ne concerne que la fenêtre d'où l'on trie", async () => {
    const nav = fauxNavigateur([
        { id: 1, onglets: [web(1, "https://notion.so/x")] },
        { id: 2, onglets: [web(2, "https://figma.com/y")] }
    ]);
    const w = chargerWisp({ chrome: nav.chrome });
    await w.sortLooseTabs(1);
    assert.notEqual(nav.groupeDe(1), -1);
    assert.equal(nav.groupeDe(2), -1, "l'autre fenêtre n'est pas touchée");
});

test("un second tri remplit le « À trier » existant au lieu d'en créer un autre", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [web(1, "https://notion.so/x")] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    await w.sortLooseTabs(1);
    nav.ajouter(1, web(2, "https://figma.com/y"));
    assert.deepEqual(nu(await w.sortLooseTabs(1)), { ranges: 0, aTrier: 1 });
    assert.deepEqual(nav.titres(), ["📥 À trier"]);
    assert.equal(nav.groupeDe(1), nav.groupeDe(2), "les deux onglets partagent le même « À trier »");
});

test("un onglet de « À trier » rejoint son sujet dès qu'il en a l'occasion", async () => {
    // github/a dort dans « À trier ». Deux autres onglets GitHub arrivent :
    // les trois forment « GitHub », au lieu que le premier reste coincé.
    const nav = fauxNavigateur([{ id: 1, onglets: [web(1, "https://github.com/a"), web(2, "https://notion.so/x")] }]);
    const w = chargerWisp({ chrome: nav.chrome });
    await w.sortLooseTabs(1);
    const aTrier = nav.groupeDe(1);
    await nav.chrome.tabGroups.update(aTrier, { title: "💤 📥 À trier" }); // même endormi
    nav.ajouter(1, web(3, "https://github.com/b"));
    nav.ajouter(1, web(4, "https://github.com/c"));
    await w.maybeAutoGroup(await nav.chrome.tabs.get(4));
    assert.deepEqual(nav.titres(), ["GitHub", "💤 📥 À trier"]);
    assert.equal(nav.groupeDe(1), nav.groupeDe(4), "l'onglet a quitté « À trier » pour « GitHub »");
    assert.equal(nav.groupeDe(2), aTrier, "Notion, sans partenaire, reste à trier");
});

test("une recherche contenant « trier » ne rejoint pas « À trier »", () => {
    const w = chargerWisp();
    assert.equal(w.groupFitsQuery({ title: "📥 À trier" }, w.keywordsOf("trier ses déchets")), false);
});

test("en anglais, le groupe s'appelle « Inbox »", async () => {
    const nav = fauxNavigateur([{ id: 1, onglets: [web(1, "https://notion.so/x")] }]);
    const w = chargerWisp({ langue: "en", chrome: nav.chrome });
    await w.sortLooseTabs(1);
    assert.deepEqual(nav.titres(), ["📥 Inbox"]);
});
