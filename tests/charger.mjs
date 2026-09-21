// Charge le VRAI background.js dans Node, avec un faux objet `chrome`.
// On teste le code tel qu'il part dans l'extension : aucune copie, aucune
// réécriture en module. Les déclarations `function` de premier niveau
// deviennent des propriétés du contexte ; les `let`/`const` restent
// joignables via evaluer(), qui partage la même portée globale.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../background.js", import.meta.url), "utf8");

// chrome.i18n, branché sur les VRAIS fichiers _locales/<langue>/messages.json.
// Reproduit la résolution de Chrome : $NOM$ renvoie au placeholder « nom »
// (insensible à la casse), dont le contenu « $1 » prend la 1re substitution.
// Un fichier absent donne des messages vides : getMessage rend alors "".
function fauxI18n(langue) {
    let messages = {};
    try {
        messages = JSON.parse(readFileSync(
            new URL(`../_locales/${langue}/messages.json`, import.meta.url), "utf8"));
    } catch { /* pas encore de traduction pour cette langue */ }
    return {
        getMessage(cle, substitutions) {
            const entree = messages[cle];
            if (!entree) return "";
            const valeurs = substitutions === undefined ? [] : [].concat(substitutions).map(String);
            const places = Object.fromEntries(Object.entries(entree.placeholders || {})
                .map(([nom, p]) => [nom.toLowerCase(), p.content]));
            return entree.message
                .replace(/\$([A-Za-z0-9_@]+)\$/g, (tout, nom) => {
                    const contenu = places[nom.toLowerCase()];
                    return contenu === undefined ? tout
                        : contenu.replace(/\$(\d)/g, (_, i) => valeurs[i - 1] ?? "");
                })
                .replace(/\$\$/g, "$");
        },
        getUILanguage: () => langue
    };
}

// Un `chrome` qui accepte n'importe quel appel. Chaque maillon est une
// fonction : chrome.tabs.onUpdated.addListener(...) comme
// chrome.storage.local.get({...}) passent sans erreur.
function fauxChrome(langue) {
    const i18n = fauxI18n(langue);
    const noeud = (chemin) => new Proxy(function () {}, {
        get(_, prop) {
            if (prop === "then") return undefined; // jamais « thenable »
            if (chemin.length === 1 && prop === "i18n") return i18n;
            return noeud([...chemin, String(prop)]);
        },
        apply(_, __, args) {
            const dernier = chemin[chemin.length - 1];
            if (dernier === "addListener") return undefined;
            if (dernier === "get" && chemin.includes("storage")) {
                // storage.get({ clé: défaut }) rend les défauts, comme Chrome
                // quand la clé est absente.
                const demande = args[0];
                return Promise.resolve(
                    demande && typeof demande === "object" && !Array.isArray(demande)
                        ? { ...demande } : {});
            }
            if (dernier === "query" || dernier === "getAll") return Promise.resolve([]);
            return Promise.resolve(undefined);
        }
    });
    return noeud(["chrome"]);
}

export function chargerWisp({ langue = "fr" } = {}) {
    const contexte = vm.createContext({
        chrome: fauxChrome(langue),
        console, URL, URLSearchParams, TextEncoder, TextDecoder,
        crypto: webcrypto, atob, btoa, structuredClone,
        setTimeout, clearTimeout
    });
    vm.runInContext(SOURCE, contexte, { filename: "background.js" });
    contexte.evaluer = (code) => vm.runInContext(code, contexte);
    return contexte;
}
