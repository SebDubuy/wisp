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

// Texte dans la langue du navigateur. Repli sur la clé : un oubli se voit.
function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

// « 1 onglet », « 4 onglets » : les deux langues accordent au singulier.
function tabsCount(n) {
    return t(n === 1 ? "tabsCountOne" : "tabsCountMany", [String(n)]);
}

// Remplit le HTML : chaque élément porte sa clé dans data-i18n, et ses
// attributs dans data-i18n-placeholder / -title / -aria-label.
function applyI18n() {
    document.documentElement.lang = chrome.i18n.getUILanguage();
    for (const el of document.querySelectorAll("[data-i18n]")) {
        el.textContent = t(el.dataset.i18n);
    }
    for (const attr of ["placeholder", "title", "aria-label"]) {
        const cle = `i18n${attr.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}`;
        for (const el of document.querySelectorAll(`[data-i18n-${attr}]`)) {
            el.setAttribute(attr, t(el.dataset[cle]));
        }
    }
}

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
    if (min < 1) return t("delayLessThanMinute");
    if (min < 60) return t("delayMinutes", [String(Math.round(min))]);
    const h = Math.floor(min / 60);
    const rest = Math.round(min % 60);
    return rest
        ? t("delayHoursMinutes", [String(h), String(rest)])
        : t("delayHours", [String(h)]);
}

// ----------------------- Lecture de l'état réel -----------------------

async function describeGroup(group, allTabs, stamps, now) {
    const tabs = allTabs.filter(t => t.groupId === group.id);
    const wl = whitelistEntries();

    if (group.title && group.title.startsWith(SLEEP_PREFIX)) {
        return { state: "sleeping", label: t("stateSleeping", [tabsCount(tabs.length)]), action: "wake" };
    }
    if (!group.title) {
        return { state: "safe", label: t("stateUntitled"), action: null };
    }
    if (tabs.some(t => t.active)) {
        return { state: "active", label: t("stateActive", [tabsCount(tabs.length)]), action: "sleep" };
    }
    if (tabs.some(t => wl.some(site => (t.url || "").toLowerCase().includes(site)))) {
        return { state: "safe", label: t("stateWhitelisted"), action: null };
    }

    const lastActivity = Math.max(...tabs.map(t => stamps[`t_${t.id}`] || 0), 0);
    if (lastActivity === 0) {
        return { state: "safe", label: t("stateUnmeasured"), action: "sleep" };
    }

    const idleMin = (now - lastActivity) / 60000;
    const remaining = SETTINGS.ghostMin - idleMin;
    const waiting = group.title.startsWith(WAIT_PREFIX);

    if (remaining <= 0) {
        return { state: "waiting", label: t("stateSleepsNext"), action: "sleep" };
    }
    return {
        state: waiting ? "waiting" : "",
        label: `${waiting ? WAIT_PREFIX : ""}${t("stateSleepsIn", [formatDelay(remaining)])}`,
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
    name.textContent = topicOf(group.title) || t("unnamedGroup");

    const state = document.createElement('div');
    state.className = `group-state ${info.state}`;
    state.textContent = info.label;

    body.append(name, state);
    row.append(dot, body);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (info.action) {
        actions.append(actionButton(
            t(info.action === "wake" ? "actionWake" : "actionSleep"),
            { type: info.action === "wake" ? "wakeNow" : "sleepNow", groupId: group.id }
        ));
    }
    if (group.title) {
        const archive = document.createElement('button');
        archive.className = 'ghost';
        archive.textContent = t("actionArchive");
        archive.title = t("actionArchiveTitle");
        archive.addEventListener('click', async () => {
            archive.disabled = true;
            const r = await chrome.runtime.sendMessage({ type: "archiveGroup", groupId: group.id });
            if (r && r.raison === "plafond") {
                archive.textContent = t("archiveLimitReached");
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
    return new Date(ts).toLocaleDateString(chrome.i18n.getUILanguage(), { day: 'numeric', month: 'short' });
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
    state.textContent = t("archiveMeta", [tabsCount(entry.tabs.length), formatDate(entry.savedAt)]);

    body.append(name, state);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(actionButton(t("actionRestore"), {
        type: "restoreArchive", archiveId: entry.id, windowId
    }));
    const del = actionButton(t("actionForget"), { type: "deleteArchive", archiveId: entry.id });
    del.className = 'ghost';
    actions.append(del);

    row.append(dot, body, actions);
    return row;
}

// Wisp propose, il n'impose pas : le nom du sujet reste éditable avant de lier.
// « A, B et C » / « A, B and C ».
function listOf(items) {
    if (items.length <= 1) return items[0] || "";
    return t("listLast", [items.slice(0, -1).join(", "), items[items.length - 1]]);
}

async function renderSuggestion() {
    const box = document.getElementById('suggestion');
    const suggestion = await chrome.runtime.sendMessage({ type: "getSuggestion" });
    box.textContent = ''; // après la réponse : la boîte ne se vide pas en attendant

    if (!suggestion) {
        box.hidden = true;
        return;
    }
    box.hidden = false;

    const text = document.createElement('p');
    const who = document.createElement('strong');
    who.textContent = listOf(suggestion.labels);
    text.append("💡 ", who, " " + t(suggestion.name ? "suggestionNamed" : "suggestionUnnamed"));

    const input = document.createElement('input');
    input.type = 'text';
    input.value = suggestion.name;
    input.placeholder = t("suggestionPlaceholder");
    input.setAttribute('aria-label', t("suggestionAria"));

    const actions = document.createElement('div');
    actions.className = 'suggestion-actions';

    const link = document.createElement('button');
    link.textContent = t("suggestionLink");
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
    no.textContent = t("suggestionDismiss");
    no.addEventListener('click', async () => {
        no.disabled = true;
        await chrome.runtime.sendMessage({ type: "dismissSuggestion", id: suggestion.id });
        await render();
    });

    actions.append(link, no);
    box.append(text, input, actions);
}

// Le rendu construit tout hors de la page, puis remplace d'un coup. Vider la
// liste d'abord, puis attendre les réponses de Chrome avant de la remplir,
// laissait le popup rétrécir et regrandir : il « sursautait » à chaque clic.
async function render() {
    const list = document.getElementById('groupList');

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
    archiveSection.hidden = archiveList.length === 0;
    document.getElementById('proBadge').hidden = !(PRO.monetisation && PRO.pro);

    // La recherche n'apparaît que lorsqu'elle sert à quelque chose.
    champ.hidden = archiveList.length < 4;

    const visibles = archiveList.filter(e => archiveMatches(e, FILTRE));
    archiveNode.replaceChildren(...visibles.map(entry => renderArchive(entry, win.id)));

    const note = document.getElementById('archiveNote');
    if (FILTRE) {
        note.textContent = visibles.length
            ? t(visibles.length > 1 ? "archivesFilterMany" : "archivesFilterOne",
                [String(visibles.length), String(archiveList.length)])
            : t("archivesFilterNone", [FILTRE, String(archiveList.length)]);
    } else {
        note.textContent = (!PRO.monetisation || PRO.pro)
            ? t("archivesNote")
            : t("archivesNoteFree", [String(archiveList.length), String(PRO.limite)]);
    }

    const lock = document.getElementById('lockNote');
    if (PRO.monetisation && !PRO.pro && archiveList.length >= PRO.limite) {
        lock.hidden = false;
        lock.textContent = '';
        const p = document.createElement('span');
        p.append(t("lockBefore") + " ", document.createElement('strong'), " " + t("lockAfter") + " ");
        p.querySelector('strong').textContent = String(PRO.limite);
        p.append(t("lockPitch"));
        lock.append(p);
    } else {
        lock.hidden = true;
    }

    // Le mode focus n'a de sens qu'avec plusieurs groupes à départager.
    await renderSuggestion();

    // Le bouton annonce ce qu'il va faire : « Trier les 7 onglets en vrac ».
    // Sans rien en vrac, il se grise au lieu de promettre un travail inexistant.
    // Même définition que isLoose() dans background.js.
    const enVrac = allTabs.filter(tab => tab.windowId === win.id && tab.groupId === -1 &&
        !tab.pinned && /^https?:/.test(tab.url || "")).length;
    const sweepBtn = document.getElementById('sweepBtn');
    sweepBtn.disabled = enVrac === 0;
    sweepBtn.textContent = enVrac === 0
        ? t("sortButtonNone")
        : t(enVrac === 1 ? "sortButtonOne" : "sortButtonMany", [String(enVrac)]);

    const focusBtn = document.getElementById('focusBtn');
    focusBtn.hidden = groups.filter(g => g.windowId === win.id).length < 2;
    focusBtn.disabled = false; // il a pu être désactivé par un clic précédent

    document.getElementById('rule').textContent =
        t("ruleText", [formatDelay(SETTINGS.ghostMin), formatDelay(SETTINGS.waitMin)]);

    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = t("emptyGroups", [String(SETTINGS.minTabsToGroup), t("contextMenuGroup")]);
        list.replaceChildren(empty);
        return;
    }

    const now = Date.now();
    const stamps = await chrome.storage.session.get(allTabs.map(t => `t_${t.id}`));
    const rows = [];
    for (const group of groups) {
        const info = await describeGroup(group, allTabs, stamps, now);
        rows.push(renderGroup(group, info));
    }
    list.replaceChildren(...rows);
}

// ----------------------- Réglages -----------------------

document.addEventListener('DOMContentLoaded', async () => {
    applyI18n();
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
            etat.textContent = t("licenceRefused");
            etat.style.color = '#f87171';
        }
    });

    // Le bouton annonce son résultat : « ✅ 3 onglets rangés · 7 dans « À trier » ».
    // Puis, 2,5 s plus tard, un rendu neuf lui rend son libellé (et son compte).
    document.getElementById('sweepBtn').addEventListener('click', async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = t("sortRunning");
        const win = await chrome.windows.getCurrent();
        const r = await chrome.runtime.sendMessage({ type: "sortLoose", windowId: win.id }) || {};
        await render();
        const parts = [];
        if (r.ranges) parts.push(t(r.ranges === 1 ? "sortResultGroupedOne" : "sortResultGroupedMany", [String(r.ranges)]));
        if (r.aTrier) parts.push(t("sortResultInbox", [String(r.aTrier)]));
        btn.disabled = true;
        btn.textContent = parts.length ? `✅ ${parts.join(" · ")}` : t("sortResultNothing");
        setTimeout(render, 2500);
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
        etat.textContent = PRO.email ? t("licenceActiveEmail", [PRO.email]) : t("licenceActive");
        etat.style.color = '#4ade80';
        bouton.textContent = t("licenceDeactivate");
        champ.placeholder = '••••••••';
    } else {
        etat.textContent = t("licenceIntro");
        etat.style.color = '';
        bouton.textContent = t("licenceActivate");
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
            btn.textContent = t("saved");
            setTimeout(() => window.close(), 800);
        }
    );
});
