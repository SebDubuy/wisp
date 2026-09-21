#!/usr/bin/env node
// Génère les clés et signe les licences Wisp Pro.
// La vérification se fait entièrement hors ligne dans l'extension : elle
// n'embarque que la clé PUBLIQUE, donc aucun serveur, et ça marche sans réseau.
//
//   node tools/licence.mjs --keygen              (une seule fois)
//   node tools/licence.mjs --sign client@mail.fr
import { webcrypto as c } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const PRIV = new URL('./licence-privee.json', import.meta.url);

const b64u = buf => Buffer.from(buf).toString('base64url');

if (process.argv.includes('--keygen')) {
    if (existsSync(PRIV)) {
        console.error('licence-privee.json existe déjà — le régénérer invaliderait toutes les licences vendues.');
        process.exit(1);
    }
    const paire = await c.subtle.generateKey(ALGO, true, ['sign', 'verify']);
    const privee = await c.subtle.exportKey('jwk', paire.privateKey);
    const publique = await c.subtle.exportKey('jwk', paire.publicKey);
    writeFileSync(PRIV, JSON.stringify(privee, null, 2));
    console.log('Clé privée écrite dans tools/licence-privee.json — NE JAMAIS la publier.\n');
    console.log('Colle ceci dans background.js, à la place de LICENCE_PUBLIQUE :\n');
    console.log('const LICENCE_PUBLIQUE = ' + JSON.stringify({ kty: publique.kty, crv: publique.crv, x: publique.x, y: publique.y }) + ';');
    process.exit(0);
}

const i = process.argv.indexOf('--sign');
if (i === -1 || !process.argv[i + 1]) {
    console.error('Usage : node tools/licence.mjs --keygen | --sign <email>');
    process.exit(1);
}

const jwk = JSON.parse(readFileSync(PRIV, 'utf8'));
const cle = await c.subtle.importKey('jwk', jwk, ALGO, false, ['sign']);
const charge = JSON.stringify({ e: process.argv[i + 1], d: new Date().toISOString().slice(0, 10) });
const octets = new TextEncoder().encode(charge);
const signature = await c.subtle.sign(SIGN, cle, octets);

console.log(`WISP-${b64u(octets)}.${b64u(signature)}`);
