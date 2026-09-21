// Traduction : Wisp parle la langue du navigateur — français pour un Chrome
// en français, anglais partout ailleurs. Ces tests gardent les deux langues
// complètes, cohérentes, et le français identique à la 1.0.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { chargerWisp } from "./charger.mjs";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const messages = (langue) => JSON.parse(lire(`_locales/${langue}/messages.json`));
const LANGUES = ["fr", "en"];

// Toutes les clés que le code demande, où qu'elles soient.
function clesUtilisees() {
    const cles = new Set();
    for (const fichier of ["popup.js", "background.js"]) {
        for (const m of lire(fichier).matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) cles.add(m[1]);
    }
    for (const m of lire("popup.html").matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)) cles.add(m[1]);
    for (const m of lire("manifest.json").matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) cles.add(m[1]);
    // Les catégories sont demandées par préfixe + identifiant.
    for (const id of ["design", "dev", "ai", "news", "video", "shopping", "travel", "work"]) {
        cles.add(`category_${id}`);
    }
    return cles;
}

test("le manifeste est localisé, avec l'anglais par défaut", () => {
    const manifeste = JSON.parse(lire("manifest.json"));
    assert.equal(manifeste.default_locale, "en");
    assert.equal(manifeste.name, "__MSG_extName__");
    assert.equal(manifeste.description, "__MSG_extDescription__");
    for (const langue of LANGUES) {
        assert.ok(existsSync(new URL(`../_locales/${langue}/messages.json`, import.meta.url)), langue);
    }
});

test("le français et l'anglais ont exactement les mêmes clés", () => {
    const fr = Object.keys(messages("fr")).sort();
    const en = Object.keys(messages("en")).sort();
    assert.deepEqual(fr.filter(k => !en.includes(k)), [], "présentes en fr, absentes en en");
    assert.deepEqual(en.filter(k => !fr.includes(k)), [], "présentes en en, absentes en fr");
});

test("chaque clé demandée par le code existe, et aucune n'est morte", () => {
    const utilisees = clesUtilisees();
    const definies = new Set(Object.keys(messages("en")));
    assert.deepEqual([...utilisees].filter(k => !definies.has(k)), [], "clés manquantes");
    // Une clé choisie par une condition — t(n === 1 ? "a" : "b") — échappe au
    // motif t("…") : pour les clés mortes, il suffit qu'elle figure en chaîne.
    const code = ["popup.js", "background.js"].map(lire).join("\n");
    const mortes = [...definies].filter(k => !utilisees.has(k) && !code.includes(`"${k}"`));
    assert.deepEqual(mortes, [], "clés jamais utilisées");
});

test("les deux langues attendent les mêmes valeurs à insérer", () => {
    for (const [cle, entree] of Object.entries(messages("fr"))) {
        const autre = messages("en")[cle];
        const trous = (e) => Object.values(e.placeholders || {}).map(p => p.content).sort();
        assert.deepEqual(trous(entree), trous(autre), cle);
        // Tout $NOM$ du texte doit être déclaré, sinon Chrome l'affiche tel quel.
        for (const e of [entree, autre]) {
            const declares = Object.keys(e.placeholders || {}).map(n => n.toLowerCase());
            for (const [, nom] of e.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)) {
                assert.ok(declares.includes(nom.toLowerCase()), `${cle} : $${nom}$ non déclaré`);
            }
        }
    }
});

test("le popup n'a plus de texte en dur", () => {
    // Tout élément qui porte du texte doit le tenir d'une clé de traduction.
    const html = lire("popup.html").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script[\s\S]*?<\/script>/g, "");
    const TOLERES = new Set(["Wisp", "Pro", "0"]);
    const fautifs = [];
    for (const [, texte] of html.matchAll(/>([^<>]+)</g)) {
        const propre = texte.trim();
        if (propre && !TOLERES.has(propre)) fautifs.push(propre);
    }
    assert.deepEqual(fautifs, []);
    for (const [, attr] of html.matchAll(/\s(placeholder|title|aria-label)="[^"]+"/g)) {
        assert.fail(`attribut ${attr} en dur : passer par data-i18n-${attr}`);
    }
});

test("popup.js ne contient plus de texte français", () => {
    const code = lire("popup.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const litteraux = [...code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map(m => m[2]);
    const francais = litteraux.filter(s =>
        /[àâçéèêëîïôûùü]/i.test(s) || /\b(onglets?|groupes?|fr-FR|moins d'une)\b/i.test(s));
    assert.deepEqual(francais, []);
});

test("les catégories françaises restent celles de la 1.0.0, à l'octet près", () => {
    // Wisp retrouve un groupe existant par son titre. Changer « Achats » d'un
    // seul caractère donnerait un doublon à chaque utilisateur français.
    const fr = messages("fr");
    const labels = ["design", "dev", "ai", "news", "video", "shopping", "travel", "work"]
        .map(id => fr[`category_${id}`].message);
    assert.deepEqual(labels, ["Design", "Dev", "IA", "Veille", "Vidéo", "Achats", "Voyage", "Travail"]);
});

test("les catégories et les services suivent la langue du navigateur", () => {
    const fr = chargerWisp({ langue: "fr" });
    const en = chargerWisp({ langue: "en" });
    assert.equal(fr.categoryOfUrl("https://www.amazon.fr/dp/1"), "Achats");
    assert.equal(en.categoryOfUrl("https://www.amazon.fr/dp/1"), "Shopping");
    assert.equal(fr.categoryOfUrl("https://claude.ai/new"), "IA");
    assert.equal(en.categoryOfUrl("https://claude.ai/new"), "AI");
    assert.equal(fr.getTopic("https://calendar.google.com/r"), "Google Agenda");
    assert.equal(en.getTopic("https://calendar.google.com/r"), "Google Calendar");
    assert.equal(fr.categoryOfUrl("https://github.com/x"), "Dev", "identique dans les deux langues");
});

test("la substitution des valeurs fonctionne dans les deux langues", () => {
    const fr = chargerWisp({ langue: "fr" });
    const en = chargerWisp({ langue: "en" });
    assert.equal(fr.chrome.i18n.getMessage("delayMinutes", ["12"]), "12 min");
    assert.equal(en.chrome.i18n.getMessage("delayMinutes", ["12"]), "12 min");
    assert.equal(fr.chrome.i18n.getMessage("tabsCountMany", ["4"]), "4 onglets");
    assert.equal(en.chrome.i18n.getMessage("tabsCountMany", ["4"]), "4 tabs");
});
