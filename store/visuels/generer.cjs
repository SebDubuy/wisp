// Génère les visuels du Chrome Web Store, en français et en anglais.
//
//   store/*.png      → français (captures 1-5, tuile, bannière)
//   store/en/*.png   → anglais
//
// Le modèle (modele.html) reçoit le CSS RÉEL du popup et les messages RÉELS
// de _locales : les captures ne peuvent pas contredire l'extension. Relancer
// ce script après tout changement de texte ou de style du popup.
//
// Il faut patchright (ou playwright) et Node 20+. Sur ce Mac, Node 18 étant
// trop ancien, on emprunte celui de VS Code :
//   ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app/Contents/MacOS/Code" store/visuels/generer.cjs
// avec PATCHRIGHT_DIR pointant sur un dossier qui contient node_modules/patchright.
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require("fs");
const { join } = require("path");
const os = require("os");
const { createRequire } = require("module");

const RACINE = join(__dirname, "..", "..");
const SCENES = ["1-regroupe", "2-groupes", "3-suggestion", "4-archives", "5-vie-privee",
                "tuile-440x280", "banniere-1400x560"];

function navigateur() {
    const bases = [process.env.PATCHRIGHT_DIR, RACINE].filter(Boolean).map(d => join(d, "/"));
    for (const base of bases) {
        for (const nom of ["patchright", "playwright"]) {
            try { return createRequire(base)(nom).chromium; } catch { /* suivant */ }
        }
    }
    throw new Error("patchright ou playwright introuvable (voir PATCHRIGHT_DIR)");
}

(async () => {
    const modele = readFileSync(join(__dirname, "modele.html"), "utf8");
    const popup = readFileSync(join(RACINE, "popup.html"), "utf8");
    const css = popup.match(/<style>([\s\S]*?)<\/style>/)[1];
    const logo = "data:image/png;base64," + readFileSync(join(RACINE, "icon128.png")).toString("base64");
    const temp = mkdtempSync(join(os.tmpdir(), "wisp-visuels-"));

    const chromium = navigateur();
    // channel "chromium" : le Chromium complet en mode sans fenêtre, déjà installé
    // par les autres vérifications (le « headless shell » ne l'est pas forcément).
    const nav = await chromium.launch({ headless: true, channel: "chromium" });
    for (const langue of ["fr", "en"]) {
        const messages = JSON.parse(readFileSync(join(RACINE, "_locales", langue, "messages.json"), "utf8"));
        const page = modele.replace("/*DONNEES*/",
            `const LANGUE = ${JSON.stringify(langue)};\n` +
            `const MESSAGES = ${JSON.stringify(messages)};\n` +
            `const POPUP_CSS = ${JSON.stringify(css)};\n` +
            `const LOGO = ${JSON.stringify(logo)};`);
        const fichier = join(temp, `modele-${langue}.html`);
        writeFileSync(fichier, page);
        const sortie = langue === "fr" ? join(RACINE, "store") : join(RACINE, "store", langue);
        mkdirSync(sortie, { recursive: true });

        for (const scene of SCENES) {
            const [l, h] = scene.startsWith("tuile") ? [440, 280] : scene.startsWith("banniere") ? [1400, 560] : [1280, 800];
            const onglet = await nav.newPage({ viewport: { width: l, height: h }, deviceScaleFactor: 1 });
            const erreurs = [];
            onglet.on("pageerror", e => erreurs.push(e.message));
            await onglet.goto(`file://${fichier}#${scene}`);
            await onglet.waitForSelector("body[data-pret]", { timeout: 20000 });
            // Le texte AFFICHÉ, popup compris (il vit dans un Shadow DOM) : pas le
            // code du modèle, qui contient lui-même le marqueur ⟦clé⟧.
            const affiche = await onglet.evaluate(() => {
                const scene = document.getElementById("scene");
                return scene.innerText + [...scene.querySelectorAll(".popup-hote")]
                    .map(h => h.shadowRoot.textContent).join(" ");
            });
            if (erreurs.length || affiche.includes("⟦")) {
                throw new Error(`${langue}/${scene} : ${erreurs.join(" ; ") || "message manquant (⟦clé⟧)"}`);
            }
            await onglet.screenshot({ path: join(sortie, `${scene}.png`), clip: { x: 0, y: 0, width: l, height: h } });
            await onglet.close();
            console.log(`${langue}/${scene}.png`);
        }
    }
    await nav.close();
})().catch(e => { console.error("ÉCHEC", e.message); process.exit(1); });
