// Charge le VRAI background.js dans Node, avec un faux objet `chrome`.
// On teste le code tel qu'il part dans l'extension : aucune copie, aucune
// réécriture en module. Les déclarations `function` de premier niveau
// deviennent des propriétés du contexte ; les `let`/`const` restent
// joignables via evaluer(), qui partage la même portée globale.
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../background.js", import.meta.url), "utf8");

// Un `chrome` qui accepte n'importe quel appel. Chaque maillon est une
// fonction : chrome.tabs.onUpdated.addListener(...) comme
// chrome.storage.local.get({...}) passent sans erreur.
function fauxChrome() {
    const noeud = (chemin) => new Proxy(function () {}, {
        get(_, prop) {
            if (prop === "then") return undefined; // jamais « thenable »
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

export function chargerWisp() {
    const contexte = vm.createContext({
        chrome: fauxChrome(),
        console, URL, URLSearchParams, TextEncoder, TextDecoder,
        crypto: webcrypto, atob, btoa, structuredClone,
        setTimeout, clearTimeout
    });
    vm.runInContext(SOURCE, contexte, { filename: "background.js" });
    contexte.evaluer = (code) => vm.runInContext(code, contexte);
    return contexte;
}
