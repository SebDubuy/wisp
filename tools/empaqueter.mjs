// Fabrique le zip à envoyer au Chrome Web Store : dist/wisp-<version>.zip.
// Lancé par `npm run package`, qui passe d'abord TOUS les tests — un test
// rouge arrête tout avant qu'un paquet ne soit produit.
//
// La liste est explicite : n'entre dans le zip que ce que l'extension charge.
// Les tests, les outils, la fiche du Store et la clé privée restent dehors
// par construction, pas par oubli.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Exportée pour tests/paquet.test.mjs, qui la confronte à ce que le manifeste
// fait réellement charger : un fichier oublié ici ne se verrait qu'une fois
// l'extension refusée par le Store.
export const FICHIERS = [
    "manifest.json", "background.js", "popup.html", "popup.js",
    "icon16.png", "icon32.png", "icon48.png", "icon128.png",
    "_locales/en/messages.json", "_locales/fr/messages.json"
];

// Importé par un test : on fournit la liste, on ne fabrique rien.
if (import.meta.url === pathToFileURL(process.argv[1]).href) empaqueter();

function empaqueter() {

    const manquants = FICHIERS.filter(f => !existsSync(f));
    if (manquants.length) {
        console.error(`Fichiers introuvables : ${manquants.join(", ")}`);
        process.exit(1);
    }

    const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
    const sortie = `dist/wisp-${version}.zip`;

    // Le Store refuse un paquet dont la version a déjà été publiée : mieux vaut
    // l'apprendre ici que dans le tableau de bord.
    if (existsSync(sortie)) {
        console.error(`${sortie} existe déjà. Monte "version" dans manifest.json avant d'empaqueter.`);
        process.exit(1);
    }

    mkdirSync("dist", { recursive: true });
    execFileSync("zip", ["-X", "-q", sortie, ...FICHIERS], { stdio: "inherit" });
    console.log(`Paquet prêt : ${sortie} (${FICHIERS.length} fichiers)`);
}
