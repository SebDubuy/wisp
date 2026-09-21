// Le zip envoyé au Store doit contenir tout ce que l'extension charge — ni
// plus, ni moins. Un fichier oublié ne se voit qu'une fois publié.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { FICHIERS } from "../tools/empaqueter.mjs";

const racine = new URL("../", import.meta.url);
const lire = (chemin) => readFileSync(new URL(chemin, racine), "utf8");

// Tout ce que le manifeste et le popup font charger à Chrome.
function fichiersRequis() {
    const m = JSON.parse(lire("manifest.json"));
    const requis = new Set(["manifest.json", m.background.service_worker, m.action.default_popup]);
    for (const icone of Object.values(m.icons)) requis.add(icone);
    for (const icone of Object.values(m.action.default_icon)) requis.add(icone);
    for (const [, src] of lire(m.action.default_popup).matchAll(/\ssrc="([^"]+)"/g)) requis.add(src);
    if (m.default_locale) {
        for (const langue of readdirSync(new URL("_locales/", racine))) {
            requis.add(`_locales/${langue}/messages.json`);
        }
    }
    return requis;
}

test("le paquet contient tout ce que l'extension charge", () => {
    const manquants = [...fichiersRequis()].filter(f => !FICHIERS.includes(f));
    assert.deepEqual(manquants, []);
});

test("le paquet ne contient rien d'autre, et rien d'introuvable", () => {
    const requis = fichiersRequis();
    assert.deepEqual(FICHIERS.filter(f => !requis.has(f)), [], "fichiers en trop");
    assert.deepEqual(FICHIERS.filter(f => !existsSync(new URL(f, racine))), [], "fichiers absents du disque");
});
