// Domaines et sujets : de quelle adresse on tire quel nom de groupe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerWisp } from "./charger.mjs";

const w = chargerWisp();

test("un suffixe composé ne devient pas le domaine de base", () => {
    // Sans COMPOUND_SUFFIXES, amazon.co.uk donnait « co.uk », donc un groupe « Co ».
    assert.equal(w.getBaseDomain("amazon.co.uk"), "amazon.co.uk");
    assert.equal(w.getBaseDomain("shop.amazon.co.uk"), "amazon.co.uk");
    assert.equal(w.getBaseDomain("docs.github.com"), "github.com");
});

test("un groupe porte un nom lisible, pas une adresse", () => {
    assert.equal(w.prettyTopic("github.com"), "GitHub");
    assert.equal(w.prettyTopic("stackoverflow.com"), "Stack Overflow");
    assert.equal(w.prettyTopic("monsite.fr"), "Monsite");
});

test("seules les pages web http(s) ont un sujet", () => {
    assert.equal(w.getTopic("chrome://extensions"), null);
    assert.equal(w.getTopic("chrome-extension://abc/popup.html"), null);
    assert.equal(w.getTopic("file:///Users/moi/a.pdf"), null);
    assert.equal(w.getTopic("pas une url"), null);
    assert.equal(w.getTopic("https://www.github.com/anthropics"), "GitHub");
});

test("une recherche n'est pas un sujet en soi", () => {
    assert.equal(w.getTopic("https://www.google.com/search?q=lisbonne"), null);
    assert.equal(w.getTopic("https://duckduckgo.com/?q=lisbonne"), null);
});

test("les services Google sont des sujets distincts", () => {
    // mail.google.com et gemini.google.com partagent google.com mais ne sont
    // pas le même sujet : c'est la raison d'être de SERVICE_HOSTS.
    assert.equal(w.getTopic("https://mail.google.com/mail/u/0"), "Gmail");
    assert.equal(w.getTopic("https://gemini.google.com/app"), "Gemini");
    assert.equal(w.getTopic("https://docs.google.com/document/d/1"), "Google Docs");
});

test("le mapping manuel de l'utilisateur prime sur tout", () => {
    w.evaluer(`LINKED_DOMAINS = { "vinted.fr": "Pokémon TCG", "cardmarket.com": "Pokémon TCG" }`);
    try {
        assert.equal(w.getTopic("https://www.vinted.fr/items/1"), "Pokémon TCG");
        assert.equal(w.getTopic("https://www.cardmarket.com/fr"), "Pokémon TCG");
    } finally {
        w.evaluer(`LINKED_DOMAINS = {}`);
    }
});
