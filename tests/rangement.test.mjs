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
    const titres = () => [...groupes.values()].map(g => g.title).sort();
    const groupeDe = (id) => onglets.get(id).groupId;
    return { chrome, titres, groupeDe };
}

const web = (id, url) => ({ id, url });

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
