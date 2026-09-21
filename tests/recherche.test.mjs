// Sessions de recherche : la singularité de Wisp. Deux recherches différentes
// sur un même sujet doivent se retrouver dans un seul groupe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerWisp } from "./charger.mjs";

const w = chargerWisp();
const onglet = (id, query) => ({ tab: { id }, query });
// Les objets nés dans le contexte vm ont un autre Array.prototype :
// on les repasse dans notre monde avant de comparer en profondeur.
const nu = (x) => JSON.parse(JSON.stringify(x));

test("la requête se lit dans l'URL des moteurs courants", () => {
    assert.equal(w.searchQueryOf("https://www.google.com/search?q=Week-end+Lisbonne"), "week-end lisbonne");
    assert.equal(w.searchQueryOf("https://duckduckgo.com/?q=garage+paris"), "garage paris");
    assert.equal(w.searchQueryOf("https://search.yahoo.com/search?p=lisbonne"), "lisbonne");
    assert.equal(w.searchQueryOf("https://github.com/search?q=wisp"), null);
});

test("une requête de moins de 3 caractères est du bruit", () => {
    assert.equal(w.searchQueryOf("https://www.google.com/search?q=ab"), null);
});

test("les mots creux disparaissent, les mots porteurs restent", () => {
    assert.deepEqual(nu(w.keywordsOf("meilleur garage comparatif")), ["garage"]);
    assert.deepEqual(nu(w.keywordsOf("trouver garagiste")), ["garagiste"]);
    assert.deepEqual(nu(w.keywordsOf("que faire à lisbonne")), ["lisbonne"]);
});

test("une racine commune de 5 lettres fait le même mot", () => {
    assert.ok(w.sameWord("garage", "garagiste"));
    assert.ok(w.sameWord("panneaux", "panneau"));
    assert.ok(w.sameWord("Hôtel", "hotel"));
    assert.ok(!w.sameWord("gare", "garage"), "moins de 5 lettres : pas de racine");
    assert.ok(!w.sameWord("salle", "basic"));
});

test("deux recherches différentes fusionnent sous leur mot commun", () => {
    const plan = w.planSearchGroup("que faire à lisbonne", [onglet(1, "week-end lisbonne")]);
    assert.deepEqual(nu(plan), { topic: "Lisbonne", tabIds: [1], merged: true });
});

test("le titre prend la variante la plus courte du mot", () => {
    const plan = w.planSearchGroup("trouver garagiste", [onglet(1, "meilleur garage comparatif")]);
    assert.equal(plan.topic, "Garage");
    assert.equal(plan.merged, true);
});

test("des recherches identiques gardent la requête entière comme titre", () => {
    const plan = w.planSearchGroup("week-end lisbonne", [onglet(1, "week-end lisbonne")]);
    assert.deepEqual(nu(plan), { topic: "Week-end lisbonne", tabIds: [1], merged: false });
});

test("sans rien en commun, pas de groupe", () => {
    assert.equal(w.planSearchGroup("garage paris", [onglet(1, "recette crêpes")]), null);
});

test("une nouvelle recherche rejoint le groupe dont elle contient le titre", () => {
    const mots = w.keywordsOf("hôtel lisbonne");
    assert.ok(w.groupFitsQuery({ title: "Lisbonne" }, mots));
    assert.ok(w.groupFitsQuery({ title: "💤 Lisbonne" }, mots), "même endormi");
    assert.ok(!w.groupFitsQuery({ title: "Porto" }, mots));
    assert.ok(!w.groupFitsQuery({ title: "" }, mots), "un groupe sans titre est ignoré");
});

// Les recherches se tapent dans n'importe quelle langue, quelle que soit
// celle du navigateur : les mots creux anglais doivent disparaître aussi.
test("les mots creux anglais disparaissent", () => {
    assert.deepEqual(nu(w.keywordsOf("how to find the best cheap hotel")), ["hotel"]);
    assert.deepEqual(nu(w.keywordsOf("what is the best laptop review")), ["laptop"]);
});

test("deux recherches anglaises sans vrai sujet commun ne fusionnent pas", () => {
    assert.equal(w.planSearchGroup("what is react", [onglet(1, "what is vue")]), null);
    assert.equal(w.planSearchGroup("best laptop 2026", [onglet(1, "best running shoes")]), null);
    assert.equal(w.planSearchGroup("how to cook rice", [onglet(1, "how to fix a bike")]), null);
});

test("deux recherches anglaises sur un même sujet fusionnent", () => {
    assert.equal(w.planSearchGroup("lisbon weekend", [onglet(1, "what to do in lisbon")]).topic, "Lisbon");
    assert.equal(w.planSearchGroup("best garage near me", [onglet(1, "cheap mechanic garage")]).topic, "Garage");
});
