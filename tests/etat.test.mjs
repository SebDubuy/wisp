// L'état d'un groupe vit dans son titre, et les réglages sont bornés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerWisp } from "./charger.mjs";

const w = chargerWisp();

test("le préfixe du titre dit l'état du groupe", () => {
    assert.ok(w.isSleeping({ title: "💤 Lisbonne" }));
    assert.ok(!w.isSleeping({ title: "Lisbonne" }));
    assert.ok(w.isWaiting({ title: "⏳ Lisbonne" }));
    assert.ok(!w.isSleeping({}), "un groupe sans titre n'est pas endormi");
});

test("le sujet nu se retrouve sous n'importe quel préfixe", () => {
    assert.equal(w.topicOfGroup({ title: "💤 Lisbonne" }), "Lisbonne");
    assert.equal(w.topicOfGroup({ title: "⏳ Lisbonne" }), "Lisbonne");
    assert.equal(w.topicOfGroup({ title: "Lisbonne" }), "Lisbonne");
    assert.equal(w.topicOfGroup({}), "");
});

test("un réglage vidé ou absurde retombe sur sa valeur par défaut", () => {
    // Un champ vidé donne NaN, que chrome.storage sérialise en null. Sans ce
    // garde-fou, le seuil tombait à 0 et tout s'endormait au premier passage.
    assert.equal(w.toPositiveInt(null, 30), 30);
    assert.equal(w.toPositiveInt("abc", 30), 30);
    assert.equal(w.toPositiveInt(0, 30), 30);
    assert.equal(w.toPositiveInt(-5, 30), 30);
    assert.equal(w.toPositiveInt("45", 30), 45);
    assert.equal(w.toPositiveInt(1, 3, 2), 3, "le minimum est respecté");
});
