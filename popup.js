// Couleurs des tabGroups Chrome, en hex, pour refléter dans le popup la
// pastille que l'utilisateur voit dans sa barre d'onglets.
const GROUP_COLORS = {
    grey: "#9aa0a6", blue: "#8ab4f8", red: "#f28b82", yellow: "#fdd663",
    green: "#81c995", pink: "#ff8bcb", purple: "#c58af9", cyan: "#78d9ec",
    orange: "#fcad70"
};

const SLEEP_PREFIX = "💤 ";
const WAIT_PREFIX = "⏳ ";

let PRO = { monetisation: false, pro: false, limite: 3 };
let FILTRE = "";

let SETTINGS = { waitMin: 30, ghostMin: 60, minTabsToGroup: 3, whitelist: "", linkedDomains: {} };

function topicOf(title) {
    const t = title || "";
    if (t.startsWith(SLEEP_PREFIX)) return t.slice(SLEEP_PREFIX.length);
    if (t.startsWith(WAIT_PREFIX)) return t.slice(WAIT_PREFIX.length);
    return t;
}

function clamp(value, fallback, min) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n >= min ? n : fallback;
}

function whitelistEntries() {
    return SETTINGS.whitelist.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function formatDelay(min) {
    if (min < 1) return "moins d'une minute";
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const rest = Math.round(min % 60);
    return rest ? `${h} h ${rest} min` : `${h} h`;
}

// ----------------------- Lecture de l'état réel -----------------------

async function describeGroup(group, allTabs, stamps, now) {
    const tabs = allTabs.filter(t => t.groupId === group.id);
    const wl = whitelistEntries();

    if (group.title && group.title.startsWith(SLEEP_PREFIX)) {
        return { state: "sleeping", label: `Endormi · ${tabs.length} onglets`, action: "wake" };
    }
    if (!group.title) {
        return { state: "safe", label: "Sans titre — Wisp l'ignore", action: null };
    }
    if (tabs.some(t => t.active)) {
        return { state: "active", label: `Ouvert sous tes yeux · ${tabs.length} onglets`, action: "sleep" };
    }
    if (tabs.some(t => wl.some(site => (t.url || "").toLowerCase().includes(site)))) {
        return { state: "safe", label: "Protégé par ta whitelist", action: null };
    }

    const lastActivity = Math.max(...tabs.map(t => stamps[`t_${t.id}`] || 0), 0);
    if (lastActivity === 0) {
        return { state: "safe", label: "Pas encore mesuré (clique un onglet)", action: "sleep" };
    }

    const idleMin = (now - lastActivity) / 60000;
    const remaining = SETTINGS.ghostMin - idleMin;
    const waiting = group.title.startsWith(WAIT_PREFIX);

    if (remaining <= 0) {
        return { state: "waiting", label: "S'endort au prochain passage", action: "sleep" };
    }
    return {
        state: waiting ? "waiting" : "",
        label: `${waiting ? "⏳ " : ""}Dort dans ${formatDelay(remaining)}`,
        action: "sleep"
    };
}

function renderGroup(group, info) {
    const row = document.createElement('div');
    row.className = 'group';

    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = GROUP_COLORS[group.color] || GROUP_COLORS.grey;

    const body = document.createElement('div');
    body.className = 'group-body';

    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = topicOf(group.title) || "Groupe sans nom";

    const state = document.createElement('div');
    state.className = `group-state ${info.state}`;
    state.textContent = info.label;

    body.append(name, state);
    row.append(dot, body);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (info.action) {
        actions.append(actionButton(
            info.action === "wake" ? "Réveiller" : "Dormir",
            { type: info.action === "wake" ? "wakeNow" : "sleepNow", groupId: group.id }
        ));
    }
    if (group.title) {
        const archive = document.createElement('button');
        archive.className = 'ghost';
        archive.textContent = "Archiver";
        archive.title = "Ferme le groupe en le gardant restaurable";
        archive.addEventListener('click', async () => {
            archive.disabled = true;
            const r = await chrome.runtime.sendMessage({ type: "archiveGroup", groupId: group.id });
            if (r && r.raison === "plafond") {
                archive.textContent = "Plafond atteint";
                archive.disabled = false;
            }
            await render();
        });
        actions.append(archive);
    }

    if (actions.children.length) row.append(actions);
    return row;
}

// Tous les boutons du popup font la même chose : envoyer un ordre au
// background, puis redessiner à partir de l'état réel.
function actionButton(label, message) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        await chrome.runtime.sendMessage(message);
        await render();
    });
    return btn;
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Une archive correspond si son sujet, ou n'importe lequel de ses onglets,
// contient les mots cherchés. Sur les adresses aussi : on se souvient parfois
// du site sans se souvenir du titre.
function archiveMatches(entry, filtre) {
    if (!filtre) return true;
    const mots = filtre.toLowerCase().split(/\s+/).filter(Boolean);
    const foin = [
        entry.topic,
        ...entry.tabs.map(t => `${t.title || ""} ${t.url || ""}`)
    ].join(" ").toLowerCase();
    return mots.every(m => foin.includes(m));
}

function renderArchive(entry, windowId) {
    const row = document.createElement('div');
    row.className = 'archive';

    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = GROUP_COLORS[entry.color] || GROUP_COLORS.grey;

    const body = document.createElement('div');
    body.className = 'group-body';

    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = entry.topic;

    const state = document.createElement('div');
    state.className = 'group-state';
    state.textContent = `${entry.tabs.length} onglets · archivé le ${formatDate(entry.savedAt)}`;

    body.append(name, state);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(actionButton("Restaurer", {
        type: "restoreArchive", archiveId: entry.id, windowId
    }));
    const del = actionButton("Oublier", { type: "deleteArchive", archiveId: entry.id });
    del.className = 'ghost';
    actions.append(del);

    row.append(dot, body, actions);
    return row;
}

// Wisp propose, il n'impose pas : le nom du sujet reste éditable avant de lier.
function frenchList(items) {
    if (items.length <= 1) return items[0] || "";
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

async function renderSuggestion() {
    const box = document.getElementById('suggestion');
    const suggestion = await chrome.runtime.sendMessage({ type: "getSuggestion" });
    box.textContent = '';

    if (!suggestion) {
        box.hidden = true;
        return;
    }
    box.hidden = false;

    const text = document.createElement('p');
    const who = document.createElement('strong');
    who.textContent = frenchList(suggestion.labels);
    text.append("💡 ", who, suggestion.name
        ? " reviennent souvent ensemble. Les ranger sous un même sujet ?"
        : " reviennent souvent ensemble. Sous quel nom les ranger ?");

    const input = document.createElement('input');
    input.type = 'text';
    input.value = suggestion.name;
    input.placeholder = 'Nomme ce sujet';
    input.setAttribute('aria-label', 'Nom du sujet');

    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';

    const link = document.createElement('button');
    link.textContent = "Lier";
    // Au-delà de deux domaines sans métier reconnu, Wisp ne propose plus de nom :
    // une concaténation de marques fait un titre illisible. On attend le tien.
    link.disabled = !suggestion.name.trim();
    input.addEventListener('input', () => { link.disabled = !input.value.trim(); });
    link.addEventListener('click', async () => {
        link.disabled = true;
        await chrome.runtime.sendMessage({
            type: "linkCluster", keys: suggestion.keys, topic: input.value, id: suggestion.id
        });
        await render();
    });

    const no = document.createElement('button');
    no.className = 'ghost';
    no.textContent = "Non merci";
    no.addEventListener('click', async () => {
        no.disabled = true;
        await chrome.runtime.sendMessage({ type: "dismissSuggestion", id: suggestion.id });
        await render();
    });

    actions.append(link, no);
    box.append(text, input, actions);
}

async function render() {
    const list = document.getElementById('groupList');
    list.textContent = '';

    const [groups, allTabs] = await Promise.all([
        chrome.tabGroups.query({}),
        chrome.tabs.query({})
    ]);

    // Compteurs du haut
    const sleepingIds = groups
        .filter(g => g.title && g.title.startsWith(SLEEP_PREFIX))
        .map(g => g.id);
    const count = allTabs.filter(t => sleepingIds.includes(t.groupId)).length;
    document.getElementById('ghostCount').textContent = count;

    // Les archives, elles, sont un chiffre mesuré — contrairement à l'ancienne
    // estimation RAM qui n'était qu'un 50 Mo/onglet codé en dur.
    const { archives } = await chrome.storage.local.get({ archives: [] });
    const archiveList = Array.isArray(archives) ? archives : [];
    document.getElementById('archiveCount').textContent = archiveList.length;

    const fresh = await chrome.storage.local.get({ linkedDomains: {} });
    SETTINGS.linkedDomains = fresh.linkedDomains || {};
    document.getElementById('linkedDomains').value = Object.entries(SETTINGS.linkedDomains)
        .map(([domain, topic]) => `${domain} = ${topic}`)
        .join('\n');

    const win = await chrome.windows.getCurrent();
    const archiveSection = document.getElementById('archiveSection');
    const archiveNode = document.getElementById('archiveList');
    const champ = document.getElementById('archiveSearch');
    archiveNode.textContent = '';
    archiveSection.hidden = archiveList.length === 0;
    document.getElementById('proBadge').hidden = !(PRO.monetisation && PRO.pro);

    // La recherche n'apparaît que lorsqu'elle sert à quelque chose.
    champ.hidden = archiveList.length < 4;

    const visibles = archiveList.filter(e => archiveMatches(e, FILTRE));
    for (const entry of visibles) {
        archiveNode.append(renderArchive(entry, win.id));
    }

    const note = document.getElementById('archiveNote');
    if (FILTRE) {
        note.textContent = visibles.length
            ? `${visibles.length} archive${visibles.length > 1 ? 's' : ''} sur ${archiveList.length}`
            : `Rien pour « ${FILTRE} » dans tes ${archiveList.length} archives`;
    } else {
        note.textContent = (!PRO.monetisation || PRO.pro)
            ? 'Fermés, mais gardés au chaud. Restaurables en un clic.'
            : `Fermés, mais gardés au chaud. ${archiveList.length} sur ${PRO.limite} en version gratuite.`;
    }

    const lock = document.getElementById('lockNote');
    if (PRO.monetisation && !PRO.pro && archiveList.length >= PRO.limite) {
        lock.hidden = false;
        lock.textContent = '';
        const p = document.createElement('span');
        p.append('Tes ', document.createElement('strong'), ' archives gratuites sont prises. ');
        p.querySelector('strong').textContent = String(PRO.limite);
        p.append('Wisp Pro les débloque toutes, avec la recherche dedans — achat unique, clé vérifiée sur ta machine.');
        lock.append(p);
    } else {
        lock.hidden = true;
    }

    // Le mode focus n'a de sens qu'avec plusieurs groupes à départager.
    await renderSuggestion();

    const sweepBtn = document.getElementById('sweepBtn');
    sweepBtn.disabled = false;
    sweepBtn.textContent = "Ranger les onglets ouverts";

    const focusBtn = document.getElementById('focusBtn');
    focusBtn.hidden = groups.filter(g => g.windowId === win.id).length < 2;
    focusBtn.disabled = false; // il a pu être désactivé par un clic précédent

    document.getElementById('rule').textContent =
        `Un groupe s'endort quand aucun de ses onglets n'a été touché depuis ` +
        `${formatDelay(SETTINGS.ghostMin)}. Il t'avertit d'un ⏳ à ${formatDelay(SETTINGS.waitMin)}.`;

    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent =
            `Aucun groupe pour l'instant. Wisp en crée un dès que ` +
            `${SETTINGS.minTabsToGroup} onglets du même site sont ouverts — ` +
            `ou fais-le toi-même : sélectionne des onglets, clic droit, ` +
            `« Wisp : regrouper les onglets sélectionnés ».`;
        list.append(empty);
        return;
    }

    const now = Date.now();
    const stamps = await chrome.storage.session.get(allTabs.map(t => `t_${t.id}`));
    for (const group of groups) {
        const info = await describeGroup(group, allTabs, stamps, now);
        list.append(renderGroup(group, info));
    }
}

// ----------------------- Réglages -----------------------

document.addEventListener('DOMContentLoaded', async () => {
    const stored = await chrome.storage.local.get(SETTINGS);
    // Mêmes garde-fous que dans background.js : une clé à null (champ vidé lors
    // d'un enregistrement passé) ne doit pas casser l'affichage.
    SETTINGS = {
        waitMin: clamp(stored.waitMin, 30, 1),
        ghostMin: clamp(stored.ghostMin, 60, 1),
        minTabsToGroup: clamp(stored.minTabsToGroup, 3, 2),
        whitelist: typeof stored.whitelist === "string" ? stored.whitelist : "",
        linkedDomains: (stored.linkedDomains && typeof stored.linkedDomains === "object")
            ? stored.linkedDomains : {}
    };

    document.getElementById('waitMin').value = SETTINGS.waitMin;
    document.getElementById('ghostMin').value = SETTINGS.ghostMin;
    document.getElementById('minTabsToGroup').value = SETTINGS.minTabsToGroup;
    document.getElementById('whitelist').value = SETTINGS.whitelist;

    // linkedDomains est stocké en objet { domaine: "Sujet" }, affiché en texte
    // "domaine.com = Sujet", une ligne par entrée.
    document.getElementById('linkedDomains').value = Object.entries(SETTINGS.linkedDomains)
        .map(([domain, topic]) => `${domain} = ${topic}`)
        .join('\n');

    PRO = await chrome.runtime.sendMessage({ type: "getPro" })
        || { monetisation: false, pro: false, limite: 3 };
    // Tant que la monétisation dort, l'interface n'en dit pas un mot.
    document.getElementById('proField').hidden = !PRO.monetisation;
    majEtatLicence();

    document.getElementById('archiveSearch').addEventListener('input', async (e) => {
        FILTRE = e.target.value.trim();
        await render();
        // Le champ est reconstruit à chaque rendu : on lui rend le focus et le texte.
        const champ = document.getElementById('archiveSearch');
        champ.value = FILTRE;
        champ.focus();
    });

    document.getElementById('licenceBtn').addEventListener('click', async () => {
        const champ = document.getElementById('licenceKey');
        const etat = document.getElementById('licenceState');
        if (PRO.pro) {
            await chrome.runtime.sendMessage({ type: "clearLicence" });
            PRO = { pro: false, limite: PRO.limite };
            champ.value = '';
            majEtatLicence();
            await render();
            return;
        }
        const r = await chrome.runtime.sendMessage({ type: "activateLicence", cle: champ.value });
        if (r && r.ok) {
            PRO = { pro: true, limite: PRO.limite, email: r.email };
            majEtatLicence();
            await render();
        } else {
            etat.textContent = "Clé refusée. Vérifie qu'elle est copiée en entier, sans espace.";
            etat.style.color = '#f87171';
        }
    });

    document.getElementById('sweepBtn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Rangement…";
        await chrome.runtime.sendMessage({ type: "sweepNow" });
        await render();
    });

    document.getElementById('focusBtn').addEventListener('click', async (e) => {
        e.target.disabled = true;
        const win = await chrome.windows.getCurrent();
        await chrome.runtime.sendMessage({ type: "focusNow", windowId: win.id });
        await render();
    });

    await render();
});

function majEtatLicence() {
    const etat = document.getElementById('licenceState');
    const bouton = document.getElementById('licenceBtn');
    const champ = document.getElementById('licenceKey');
    if (!PRO.monetisation) return;
    if (PRO.pro) {
        etat.textContent = PRO.email ? `Pro activé — ${PRO.email}` : 'Pro activé.';
        etat.style.color = '#4ade80';
        bouton.textContent = 'Désactiver';
        champ.placeholder = '••••••••';
    } else {
        etat.textContent = "Achat unique. La clé est vérifiée sur ta machine, sans aucun appel réseau.";
        etat.style.color = '';
        bouton.textContent = 'Activer';
    }
}

// Un champ vidé donne NaN, que chrome.storage sérialise en null. Or get() ne
// renvoie sa valeur par défaut que si la CLE est absente, pas si elle vaut null :
// le background retomberait à un seuil de 0 et endormirait tout. On borne ici.
function readNumber(id, fallback, min) {
    const n = Math.trunc(Number(document.getElementById(id).value));
    return Number.isFinite(n) && n >= min ? n : fallback;
}

document.getElementById('saveBtn').addEventListener('click', () => {
    const ghostMin = readNumber('ghostMin', 60, 1);
    // Une attente plus longue que le sommeil n'aurait aucun sens : le ⏳
    // n'apparaîtrait jamais.
    const waitMin = Math.min(readNumber('waitMin', 30, 1), ghostMin);
    const minTabsToGroup = readNumber('minTabsToGroup', 3, 2);
    const whitelist = document.getElementById('whitelist').value.toLowerCase();

    const linkedDomains = {};
    document.getElementById('linkedDomains').value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(line => {
            const [domain, topic] = line.split('=').map(s => s.trim());
            if (domain && topic) linkedDomains[domain.toLowerCase()] = topic;
        });

    chrome.storage.local.set(
        { waitMin, ghostMin, minTabsToGroup, whitelist, linkedDomains },
        () => {
            const btn = document.getElementById('saveBtn');
            btn.textContent = "✅ Enregistré !";
            setTimeout(() => window.close(), 800);
        }
    );
});
