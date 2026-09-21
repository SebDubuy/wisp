// ===================== WISP — background.js =====================
// Concept : on ne regarde plus "ce tab est resté X minutes sans bouger",
// on regarde "ce GROUPE (sujet) est resté X minutes sans activité".
// Le classement en groupe se fait par sujet, pas par timer.

let WAIT_MIN = 30;      // réservé : indicateur ⏳ avant le sommeil (pas encore utilisé)
let GHOST_MIN = 60;     // avant que le groupe entier soit endormi (discard)
let MIN_TABS_TO_GROUP = 3; // nb d'onglets sur le même sujet avant création auto d'un groupe
let WHITELIST = [];
let LINKED_DOMAINS = {}; // ex: { "cardmarket.com": "Pokémon TCG", "vinted.fr": "Pokémon TCG" }

const SLEEP_PREFIX = "💤 ";
const WAIT_PREFIX = "⏳ ";
const ALARM_NAME = "checkGroups";
const SETTINGS_KEYS = ["waitMin", "ghostMin", "minTabsToGroup", "whitelist", "linkedDomains"];

// Palette officielle des tabGroups Chrome. "grey" est volontairement exclu
// (trop proche d'un groupe non stylé) et sert de dernier recours.
const PALETTE = ["cyan", "purple", "orange", "green", "pink", "blue", "yellow", "red"];

// Texte dans la langue du navigateur (_locales/fr ou en, anglais par défaut).
// Repli sur la clé elle-même : un message manquant se voit au lieu de
// produire un titre de groupe vide.
function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

// Hôtes multi-services : le domaine de base ne veut rien dire. mail.google.com
// et gemini.google.com ne sont pas le même sujet, même s'ils partagent google.com.
const SERVICE_HOSTS = {
    "mail.google.com": "Gmail",
    "drive.google.com": "Google Drive",
    "docs.google.com": "Google Docs",
    "sheets.google.com": "Google Sheets",
    "calendar.google.com": t("serviceCalendar"),
    "meet.google.com": "Google Meet",
    "photos.google.com": "Google Photos",
    "gemini.google.com": "Gemini",
    "chat.google.com": "Google Chat",
    "ads.google.com": "Google Ads",
    "analytics.google.com": "Google Analytics",
    "search.google.com": "Google Search Console",
    "console.cloud.google.com": "Google Cloud",
    "keep.google.com": "Google Keep"
};

// Moteurs de recherche et portails : une recherche n'est PAS un sujet EN SOI.
// Sans ça, chercher "figma" sur Google rangerait l'onglet dans un groupe
// "google.com". Ces hôtes restent donc exclus du regroupement PAR DOMAINE —
// mais groupBySearchSession peut les rattacher à un sujet via leur requête.
const NEVER_GROUP = new Set([
    "google.com", "www.google.com",
    "bing.com", "duckduckgo.com", "lite.duckduckgo.com",
    "ecosia.org", "qwant.com", "yahoo.com", "search.yahoo.com",
    "baidu.com", "yandex.com", "startpage.com", "search.brave.com",
    "newtab", "extensions", "settings"
]);

function toPositiveInt(value, fallback, min = 1) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n >= min ? n : fallback;
}

async function init() {
    const data = await chrome.storage.local.get({
        waitMin: 30,
        ghostMin: 60,
        minTabsToGroup: 3,
        whitelist: "",
        linkedDomains: {}
    });
    // Durci : une valeur nulle/NaN en storage (champ de popup vidé) ne doit pas
    // faire retomber les seuils à 0 et endormir tous les groupes au 1er passage.
    WAIT_MIN = toPositiveInt(data.waitMin, 30);
    GHOST_MIN = toPositiveInt(data.ghostMin, 60);
    MIN_TABS_TO_GROUP = toPositiveInt(data.minTabsToGroup, 3, 2);
    WHITELIST = typeof data.whitelist === "string"
        ? data.whitelist.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];
    LINKED_DOMAINS = (data.linkedDomains && typeof data.linkedDomains === "object")
        ? data.linkedDomains
        : {};
    await refreshPro();
    updateBadge();
}
init();

// Ne réagir qu'aux vrais changements de réglages. Les horodatages d'activité
// vivent dans storage.session : sans ce filtre, chaque clic d'onglet relançait
// init() + updateBadge() et maintenait le service worker éveillé en continu.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!SETTINGS_KEYS.some(k => k in changes)) return;
    init();
});

// ----------------------- Utilitaires -----------------------

// Approximation de liste de suffixes publics. Sans ça, "amazon.co.uk" donnait
// le domaine de base "co.uk" — donc un groupe nommé "Co".
const COMPOUND_SUFFIXES = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
    "co.jp", "co.kr", "co.nz", "co.in", "co.za", "co.il",
    "com.au", "net.au", "org.au", "com.br", "com.mx", "com.ar",
    "com.tr", "com.cn", "com.sg", "com.hk"
]);

function getBaseDomain(host) {
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join(".");
    return COMPOUND_SUFFIXES.has(lastTwo)
        ? parts.slice(-3).join(".")
        : lastTwo;
}

// La casse et l'espacement d'une marque ne se devinent pas depuis son domaine :
// "github.com" ne donne pas "GitHub" par algorithme. Cette table couvre les
// sites courants, prettyTopic() se débrouille pour tout le reste.
const BRAND_NAMES = {
    "github.com": "GitHub", "gitlab.com": "GitLab", "stackoverflow.com": "Stack Overflow",
    "youtube.com": "YouTube", "linkedin.com": "LinkedIn", "tiktok.com": "TikTok",
    "figma.com": "Figma", "dribbble.com": "Dribbble", "behance.net": "Behance",
    "notion.so": "Notion", "airtable.com": "Airtable", "linear.app": "Linear",
    "chatgpt.com": "ChatGPT", "openai.com": "OpenAI", "claude.ai": "Claude",
    "anthropic.com": "Anthropic", "huggingface.co": "Hugging Face",
    "producthunt.com": "Product Hunt", "npmjs.com": "npm", "vercel.com": "Vercel",
    "stackblitz.com": "StackBlitz", "codepen.io": "CodePen", "devto.to": "DEV",
    "x.com": "X", "reddit.com": "Reddit", "wikipedia.org": "Wikipédia",
    "leboncoin.fr": "Leboncoin", "cardmarket.com": "Cardmarket", "vinted.fr": "Vinted",
    "amazon.fr": "Amazon", "amazon.com": "Amazon", "ebay.fr": "eBay", "ebay.com": "eBay",
    "aliexpress.com": "AliExpress", "cdiscount.com": "Cdiscount", "fnac.com": "Fnac",
    "backmarket.fr": "Back Market", "laredoute.fr": "La Redoute", "etsy.com": "Etsy",
    "booking.com": "Booking", "airbnb.fr": "Airbnb", "airbnb.com": "Airbnb",
    "sncf-connect.com": "SNCF Connect", "tripadvisor.fr": "Tripadvisor",
    "getyourguide.fr": "GetYourGuide", "lottiefiles.com": "LottieFiles",
    "jitter.video": "Jitter", "ycombinator.com": "Hacker News", "mistral.ai": "Mistral",
    "elevenlabs.io": "ElevenLabs", "perplexity.ai": "Perplexity"
};

// Transforme un domaine en nom lisible : "github.com" -> "GitHub",
// "monsite.fr" -> "Monsite". Un groupe porte un sujet, pas une adresse.
function prettyTopic(domain) {
    if (BRAND_NAMES[domain]) return BRAND_NAMES[domain];
    const label = domain.split(".")[0];
    if (!label) return domain;
    return label.charAt(0).toUpperCase() + label.slice(1);
}

// Sous quelle clé ranger cet onglet, et sous quel nom l'afficher par défaut.
// C'est la brique commune à getTopic() et à la détection de co-occurrence :
// les deux doivent s'accorder sur la clé, sinon on suggérerait de lier des
// domaines que le regroupement n'utilise pas.
function topicIdentity(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return null;
    }
    // Pas de groupe sur chrome://, chrome-extension://, file://, about:blank…
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const host = parsed.hostname.replace(/^www\./, "");
    if (!host) return null;
    const base = getBaseDomain(host);
    // Les services passent AVANT l'exclusion : google.com figure dans
    // NEVER_GROUP, et le tester d'abord rendait mail.google.com et
    // gemini.google.com muets — SERVICE_HOSTS n'était jamais atteint.
    if (SERVICE_HOSTS[host]) return { host, base, key: host, label: SERVICE_HOSTS[host] };
    if (NEVER_GROUP.has(host) || NEVER_GROUP.has(base)) return null;

    return { host, base, key: base, label: prettyTopic(base) };
}

function labelForKey(key) {
    return SERVICE_HOSTS[key] || prettyTopic(key);
}

// Donne le "sujet" d'un onglet, ou null s'il ne doit pas être groupé.
function getTopic(url) {
    const id = topicIdentity(url);
    if (!id) return null;
    // Le mapping manuel de l'utilisateur prime sur tout le reste.
    return LINKED_DOMAINS[id.host] || LINKED_DOMAINS[id.base] || id.label;
}

// Le paramètre d'URL qui porte la requête, selon le moteur.
const SEARCH_QUERY_PARAMS = {
    "google.com": "q", "bing.com": "q", "duckduckgo.com": "q",
    "ecosia.org": "q", "qwant.com": "q", "startpage.com": "q",
    "brave.com": "q", "yahoo.com": "p", "search.yahoo.com": "p",
    "baidu.com": "wd", "yandex.com": "text"
};

// Si l'URL est une page de résultats, rend la requête tapée. Sinon null.
function searchQueryOf(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.replace(/^www\./, "");
    const param = SEARCH_QUERY_PARAMS[host] || SEARCH_QUERY_PARAMS[getBaseDomain(host)];
    if (!param) return null;
    const query = (parsed.searchParams.get(param) || "").trim();
    return query.length >= 3 ? query.toLowerCase() : null;
}

// La requête devient le titre du groupe : ce sont les mots de l'utilisateur,
// donc un bien meilleur nom de sujet que n'importe quelle heuristique.
function prettyQuery(query) {
    const clean = query.replace(/\s+/g, " ").trim();
    const short = clean.length > 32 ? `${clean.slice(0, 31)}…` : clean;
    return short.charAt(0).toUpperCase() + short.slice(1);
}

// Mots creux d'une requête : ils disent comment on cherche, pas ce qu'on cherche.
// Sans ce filtre, "meilleur garage comparatif" et "trouver garagiste" n'auraient
// aucun mot en commun, et donneraient deux groupes au lieu d'un.
const QUERY_STOPWORDS = new Set([
    "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
    "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes",
    "son", "sa", "ses", "notre", "nos", "votre", "vos", "leur", "leurs",
    "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
    "que", "qui", "quoi", "dont", "quand", "comment", "pourquoi", "combien",
    "quel", "quelle", "quels", "quelles", "est", "sont", "etre", "avoir",
    "pour", "par", "sur", "sous", "dans", "avec", "sans", "chez", "vers",
    "entre", "depuis", "and", "the", "for", "with",
    "plus", "moins", "tres", "trop", "bien", "mal", "pas", "non", "oui",
    "meilleur", "meilleure", "meilleurs", "meilleures", "bon", "bonne",
    "comparatif", "comparaison", "comparer", "test", "tests", "avis",
    "prix", "tarif", "tarifs", "gratuit", "promo", "solde", "soldes",
    "trouver", "cherche", "chercher", "acheter", "louer", "faire", "fait",
    "guide", "top", "liste", "idee", "idees", "exemple", "exemples",
    // Anglais : une recherche se tape dans n'importe quelle langue, quelle que
    // soit celle du navigateur. Sans eux, « what is react » et « what is vue »
    // fusionnaient sous « What », « best laptop » et « best shoes » sous « Best ».
    "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
    "are", "was", "were", "been", "being", "does", "did", "can", "could",
    "should", "would", "will", "you", "your", "his", "her", "its", "our",
    "their", "they", "them", "she", "him", "this", "that", "these", "those",
    "not", "yes", "very", "too", "more", "most", "less", "much", "many",
    "some", "any", "all", "from", "into", "about", "near", "over", "under",
    "between", "without", "best", "better", "good", "cheap", "cheapest",
    "free", "review", "reviews", "versus", "compare", "comparison", "price",
    "prices", "deal", "deals", "sale", "buy", "find", "get", "make", "list",
    "idea", "ideas", "example", "examples", "tutorial", "online"
]);

function normalizeWord(word) {
    return word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Les mots porteurs d'une requête, dans l'ordre où ils ont été tapés.
function keywordsOf(query) {
    return (query || "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(w => w.length >= 3 && !/^\d+$/.test(w))
        .filter(w => !QUERY_STOPWORDS.has(normalizeWord(w)));
}

// Deux mots désignent le même sujet s'ils sont identiques, ou s'ils partagent
// une racine d'au moins 5 lettres : "garage" et "garagiste", "vélo" et "vélos".
function sameWord(a, b) {
    const x = normalizeWord(a);
    const y = normalizeWord(b);
    if (x === y) return true;
    if (x.length < 5 || y.length < 5) return false;
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    return i >= 5;
}

// Le nom de sujet le plus court est le meilleur : "garage" plutôt que "garagiste".
function shortestVariant(word, candidateLists) {
    let best = word;
    for (const list of candidateLists) {
        for (const candidate of list) {
            if (sameWord(candidate, word) &&
                normalizeWord(candidate).length < normalizeWord(best).length) {
                best = candidate;
            }
        }
    }
    return best;
}

// Décide sous quel sujet ranger un onglet de recherche, et avec lesquels.
// Deux recherches différentes qui partagent un mot porteur fusionnent sous ce
// mot ; à défaut, les onglets nés de la même requête gardent la requête entière.
function planSearchGroup(query, siblings) {
    const mine = keywordsOf(query);

    let best = null;
    for (const word of mine) {
        const members = siblings.filter(s => keywordsOf(s.query).some(w => sameWord(w, word)));
        if (!members.length) continue;
        if (!best || members.length > best.members.length) best = { word, members };
    }

    // Si toutes les recherches sont identiques, la requête entière reste le
    // meilleur titre — la réduire aux mots porteurs l'abîmerait.
    if (best && best.members.some(m => m.query !== query)) {
        const memberKeywords = best.members.map(m => keywordsOf(m.query));
        const shared = mine.filter(w => memberKeywords.every(ks => ks.some(k => sameWord(k, w))));
        const words = (shared.length ? shared : [best.word])
            .map(w => shortestVariant(w, memberKeywords));
        return {
            topic: prettyQuery(words.join(" ")),
            tabIds: best.members.map(m => m.tab.id),
            merged: true
        };
    }

    const same = siblings.filter(s => s.query === query);
    if (!same.length) return null;
    return { topic: prettyQuery(query), tabIds: same.map(m => m.tab.id), merged: false };
}

// Un groupe existant accueille-t-il déjà ce sujet ? On compare sur les mots
// porteurs, pour qu'une nouvelle recherche « hôtel lisbonne » rejoigne « Lisbonne ».
function groupFitsQuery(group, myKeywords) {
    const title = topicOfGroup(group);
    if (!title) return false;
    const titleWords = keywordsOf(title);
    if (!titleWords.length) return false;
    return titleWords.every(t => myKeywords.some(k => sameWord(k, t)));
}

function isWhitelisted(url) {
    const lower = (url || "").toLowerCase();
    return WHITELIST.some(site => lower.includes(site));
}

function isSleeping(group) {
    return Boolean(group.title && group.title.startsWith(SLEEP_PREFIX));
}

function isWaiting(group) {
    return Boolean(group.title && group.title.startsWith(WAIT_PREFIX));
}

// Le titre d'un groupe porte son etat en prefixe. On retire le marqueur pour
// retrouver le sujet nu.
function topicOfGroup(group) {
    const title = group.title || "";
    if (title.startsWith(SLEEP_PREFIX)) return title.slice(SLEEP_PREFIX.length);
    if (title.startsWith(WAIT_PREFIX)) return title.slice(WAIT_PREFIX.length);
    return title;
}

// Choisit une couleur encore libre dans la fenêtre, pour que deux groupes
// voisins ne se ressemblent pas.
async function pickColor(windowId) {
    try {
        const groups = await chrome.tabGroups.query({ windowId });
        const used = new Set(groups.map(g => g.color));
        const free = PALETTE.find(c => !used.has(c));
        return free || PALETTE[groups.length % PALETTE.length];
    } catch (e) {
        return PALETTE[0];
    }
}

async function updateBadge() {
    try {
        const groups = await chrome.tabGroups.query({});
        const groupIds = groups.filter(isSleeping).map(g => g.id);
        const allTabs = await chrome.tabs.query({});
        const count = allTabs.filter(t => groupIds.includes(t.groupId)).length;
        chrome.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
        chrome.action.setBadgeBackgroundColor({ color: "#38bdf8" });
    } catch (e) { /* silencieux */ }
}

// ----------------------- Activité : timestamp fiable -----------------------
// On horodate un onglet dès qu'il devient actif OU dès qu'il finit de charger.
// storage.session (et non local) : les horodatages sont vidés à chaque session,
// donc un ID d'onglet recyclé après redémarrage n'hérite pas d'une vieille date.

async function stampActivity(tabId) {
    try {
        await chrome.storage.session.set({ [`t_${tabId}`]: Date.now() });
    } catch (e) { /* silencieux */ }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await stampActivity(activeInfo.tabId);
    await wakeTabIfSleeping(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        await stampActivity(tabId);
        await stampSearchQuery(tab);
        await maybeAutoGroup(tab);
    }
});

// Une page de résultats est elle-même porteuse de sa requête. Sans ça, seuls
// les onglets OUVERTS DEPUIS une recherche comptaient : taper deux recherches
// à la suite dans la barre d'adresse ne produisait jamais de groupe, puisque
// aucun onglet n'avait d'onglet d'origine.
async function stampSearchQuery(tab) {
    const query = searchQueryOf(tab.url || "");
    if (!query) return;
    try {
        await chrome.storage.session.set({ [`q_${tab.id}`]: query });
    } catch (e) { /* silencieux */ }
}

// Un onglet ouvert depuis une page de résultats hérite de la requête. C'est le
// seul lien entre trois articles qui n'ont ni domaine ni mot commun.
chrome.tabs.onCreated.addListener(async (tab) => {
    if (!tab.openerTabId) return;
    try {
        const opener = await chrome.tabs.get(tab.openerTabId);
        const query = searchQueryOf(opener.url || "");
        if (query) await chrome.storage.session.set({ [`q_${tab.id}`]: query });
    } catch (e) { /* l'onglet d'origine a pu disparaître */ }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove([`t_${tabId}`, `q_${tabId}`]).catch(() => {});
});

// ----------------------- Réveil -----------------------

async function wakeGroup(groupId) {
    try {
        const group = await chrome.tabGroups.get(groupId);
        if (!isSleeping(group) && !isWaiting(group)) return;
        await chrome.tabGroups.update(group.id, {
            title: topicOfGroup(group),
            collapsed: false
        });
    } catch (e) { /* le groupe a pu disparaître entre-temps */ }
}

async function wakeTabIfSleeping(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.groupId || tab.groupId === -1) return;
        await wakeGroup(tab.groupId);
    } catch (e) { /* le tab a pu disparaître entre-temps */ }
}

// ----------------------- Groupement automatique par sujet -----------------------

async function maybeAutoGroup(tab) {
    if (!tab.url || tab.pinned || isWhitelisted(tab.url)) return;
    if (tab.groupId && tab.groupId !== -1) return; // déjà dans un groupe

    // Une session de recherche prime sur le domaine : trois articles ouverts
    // depuis "énergies renouvelables" forment un sujet, alors qu'ils n'ont
    // aucun domaine en commun et ne se regrouperaient jamais autrement.
    if (await groupBySearchSession(tab)) return;

    const topic = getTopic(tab.url);
    if (!topic) return;

    // Un groupe portant déjà ce sujet existe ? On le rejoint direct.
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const existingTopicGroup = existingGroups.find(g => topicOfGroup(g) === topic);

    if (existingTopicGroup) {
        await chrome.tabs.group({ groupId: existingTopicGroup.id, tabIds: tab.id });
        // Le groupe reçoit un onglet vivant : il ne doit plus être marqué endormi,
        // sinon la patrouille le saute définitivement.
        await wakeGroup(existingTopicGroup.id);
        return;
    }

    const win = await chrome.windows.get(tab.windowId, { populate: true });
    const sameTopicTabs = win.tabs.filter(t =>
        t.id !== tab.id &&
        t.groupId === -1 &&
        !t.pinned &&
        t.url &&
        getTopic(t.url) === topic
    );

    // Sinon, on regroupe seulement si le seuil est atteint (évite de créer
    // un groupe pour 1 ou 2 onglets isolés)
    const candidateIds = [tab.id, ...sameTopicTabs.map(t => t.id)];
    if (candidateIds.length >= MIN_TABS_TO_GROUP) {
        const color = await pickColor(tab.windowId);
        const groupId = await chrome.tabs.group({ tabIds: candidateIds });
        await chrome.tabGroups.update(groupId, { title: topic, color });
        return;
    }

    // Dernier recours : le métier connu. Vinted, Amazon, AliExpress et Cdiscount
    // n'ont aucun domaine commun, mais relèvent tous d'« Achats ».
    await groupByCategory(tab);
}

// Regroupe par catégorie du lexique. Contrairement à la suggestion du popup,
// ce chemin n'écrit RIEN dans LINKED_DOMAINS : il forme le groupe, point. Le
// mapping permanent reste une décision de l'utilisateur.
function categoryOfUrl(url) {
    const id = topicIdentity(url || "");
    if (!id) return null;
    // Un sujet défini à la main prime toujours sur le lexique.
    if (LINKED_DOMAINS[id.host] || LINKED_DOMAINS[id.base]) return null;
    return categoryOf(id.key);
}

async function groupByCategory(tab) {
    const category = categoryOfUrl(tab.url);
    if (!category) return false;

    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const existing = groups.find(g => topicOfGroup(g) === category);
    if (existing) {
        await chrome.tabs.group({ groupId: existing.id, tabIds: tab.id });
        await wakeGroup(existing.id);
        return true;
    }

    const win = await chrome.windows.get(tab.windowId, { populate: true });
    const mates = (win.tabs || []).filter(t =>
        t.id !== tab.id && t.groupId === -1 && !t.pinned &&
        categoryOfUrl(t.url) === category
    );

    const tabIds = [tab.id, ...mates.map(t => t.id)];
    if (tabIds.length < MIN_TABS_TO_GROUP) return false;

    const color = await pickColor(tab.windowId);
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: category, color });
    return true;
}

async function groupBySearchSession(tab) {
    const own = await chrome.storage.session.get(`q_${tab.id}`);
    const query = own[`q_${tab.id}`];
    if (!query) return false;

    const win = await chrome.windows.get(tab.windowId, { populate: true });
    const loose = (win.tabs || []).filter(t =>
        t.id !== tab.id && t.groupId === -1 && !t.pinned && t.url
    );
    const keys = loose.map(t => `q_${t.id}`);
    const stamps = keys.length ? await chrome.storage.session.get(keys) : {};
    const siblings = loose
        .map(t => ({ tab: t, query: stamps[`q_${t.id}`] }))
        .filter(s => s.query);

    // Un groupe porte-t-il déjà ce sujet ? On le rejoint, avec les onglets
    // isolés qui relèvent du même sujet.
    const mine = keywordsOf(query);
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const existing = groups.find(g =>
        topicOfGroup(g) === prettyQuery(query) || groupFitsQuery(g, mine)
    );
    if (existing) {
        const alsoFits = siblings
            .filter(s => keywordsOf(s.query).some(w => mine.some(m => sameWord(m, w))))
            .map(s => s.tab.id);
        await chrome.tabs.group({ groupId: existing.id, tabIds: [tab.id, ...alsoFits] });
        await wakeGroup(existing.id);
        return true;
    }

    const plan = planSearchGroup(query, siblings);
    if (!plan) return false;

    const tabIds = [tab.id, ...plan.tabIds];
    // Deux recherches DIFFÉRENTES qui convergent sur un même mot sont un signal
    // bien plus fort que deux onglets partageant un domaine : deux suffisent.
    // Une même requête répétée reste soumise au seuil choisi par l'utilisateur.
    const needed = plan.merged ? 2 : MIN_TABS_TO_GROUP;
    if (tabIds.length < needed) return false;

    const color = await pickColor(tab.windowId);
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: plan.topic, color });
    return true;
}

// Wisp ne réagissait qu'au CHARGEMENT d'un onglet. Les onglets déjà ouverts au
// moment où l'extension démarre n'étaient donc jamais examinés : on pouvait
// avoir quatre sites d'achat sous les yeux sans qu'aucun groupe n'apparaisse.
// Rend le nombre d'onglets rangés, pour que le popup puisse le dire : un
// bouton qui ne répond rien semble cassé, même quand il n'y avait rien à faire.
//
// Chaque onglet est traité isolément. Un try/catch englobant abandonnait tout
// le balayage à la première erreur, en silence. Et seules les fenêtres
// normales sont parcourues : Chrome refuse de grouper un onglet d'une fenêtre
// d'application (PWA) ou de popup, et c'était justement l'erreur typique.
async function sweepExistingTabs() {
    let wins;
    try {
        wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    } catch (e) {
        return 0;
    }
    // Relevé des onglets libres AVANT de grouper : un onglet peut être rangé
    // par le passage d'un autre, il doit pourtant compter.
    const libres = wins.flatMap(w => (w.tabs || []).filter(t => t.groupId === -1).map(t => t.id));

    for (const id of libres) {
        try {
            // L'instantané vieillit à mesure qu'on groupe : on relit l'onglet.
            const tab = await chrome.tabs.get(id).catch(() => null);
            if (!tab || (tab.groupId && tab.groupId !== -1)) continue;
            await maybeAutoGroup(tab);
        } catch (e) {
            console.warn("Wisp : onglet non rangé", id, e && e.message);
        }
    }

    let ranges = 0;
    for (const id of libres) {
        const tab = await chrome.tabs.get(id).catch(() => null);
        if (tab && tab.groupId !== -1) ranges++;
    }
    return ranges;
}

// ----------------------- Patrouille : sommeil au niveau du GROUPE -----------------------
// En MV3 le service worker redémarre à chaque événement. Recréer l'alarme à
// chaque démarrage remettait son compteur à zéro en boucle : elle ne se
// déclenchait jamais sur un navigateur actif. On ne la crée que si absente.

async function ensureAlarm() {
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}
ensureAlarm();
chrome.runtime.onStartup.addListener(() => {
    ensureAlarm();
    sweepExistingTabs();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;

    const now = Date.now();
    const groups = await chrome.tabGroups.query({});

    for (const group of groups) {
        if (!group.title || isSleeping(group)) continue;

        const tabs = await chrome.tabs.query({ groupId: group.id });
        if (tabs.length === 0) continue;
        if (tabs.some(t => t.active)) continue; // un onglet du groupe est visible -> on ne touche pas
        // La whitelist protège aussi à l'endormissement, pas seulement au groupement.
        if (tabs.some(t => isWhitelisted(t.url))) continue;

        const stamps = await chrome.storage.session.get(tabs.map(t => `t_${t.id}`));
        const lastActivity = Math.max(...tabs.map(t => stamps[`t_${t.id}`] || 0), 0);
        if (lastActivity === 0) continue; // pas encore de donnée fiable, on attend le prochain cycle

        const diffMin = (now - lastActivity) / 1000 / 60;
        // Garde-fou : une attente plus longue que le sommeil n'a aucun sens.
        const waitAt = Math.min(WAIT_MIN, GHOST_MIN);

        if (diffMin > GHOST_MIN) {
            await sleepGroup(group, tabs);
        } else if (diffMin > waitAt && !isWaiting(group)) {
            // Marqueur ⏳ : le groupe est en sursis, l'utilisateur voit venir.
            await setGroupTitle(group.id, `${WAIT_PREFIX}${topicOfGroup(group)}`);
        } else if (diffMin <= waitAt && isWaiting(group)) {
            // L'activité a repris avant l'échéance : on retire le sursis.
            await setGroupTitle(group.id, topicOfGroup(group));
        }
    }
    await recordCooccurrence();
    updateBadge();
});

async function setGroupTitle(groupId, title) {
    try {
        await chrome.tabGroups.update(groupId, { title });
    } catch (e) { /* le groupe a pu disparaître entre-temps */ }
}

async function sleepGroup(group, tabs) {
    try {
        // topicOfGroup, pas group.title : sinon un groupe déjà en ⏳ devient "💤 ⏳ Sujet".
        await chrome.tabGroups.update(group.id, {
            title: `${SLEEP_PREFIX}${topicOfGroup(group)}`,
            collapsed: true
        });
        for (const tab of tabs) {
            chrome.tabs.discard(tab.id).catch(() => {});
        }
    } catch (e) { /* silencieux */ }
}

// ----------------------- Suggestion de sujets -----------------------
// Personne ne remplit un mapping à la main. Wisp propose donc lui-même, par
// deux chemins : ce qu'il SAIT (des domaines de même métier ouverts ensemble,
// proposé tout de suite) et ce qu'il OBSERVE (des domaines qui reviennent
// ensemble au fil des sessions). Aucun appel réseau : tout reste local.

const SUGGEST_MIN_SESSIONS = 3; // plages horaires distinctes avant de proposer
const MAX_PAIRS = 300;
const MAX_DOMAINS_PER_WINDOW = 15; // borne l'explosion combinatoire des paires
const MAX_CLUSTER = 4;

// Lexique de métiers. C'est une table en dur, pas de la sémantique : elle sert
// uniquement à proposer un nom de sujet crédible ("Design" plutôt que
// "Figma + Dribbble"). L'utilisateur reste libre de le réécrire.
const CATEGORY_HINTS = {
    "figma.com": "design", "dribbble.com": "design", "behance.net": "design",
    "awwwards.com": "design", "mobbin.com": "design", "coolors.co": "design",
    "unsplash.com": "design", "canva.com": "design", "framer.com": "design",
    "webflow.com": "design", "pinterest.fr": "design", "pinterest.com": "design",
    "jitter.video": "design", "fontshare.com": "design", "lottiefiles.com": "design",

    "github.com": "dev", "gitlab.com": "dev", "stackoverflow.com": "dev",
    "npmjs.com": "dev", "codepen.io": "dev", "stackblitz.com": "dev",
    "vercel.com": "dev", "netlify.com": "dev", "replit.com": "dev",
    "mozilla.org": "dev", "caniuse.com": "dev", "docker.com": "dev",
    "nodejs.org": "dev", "python.org": "dev", "rust-lang.org": "dev",

    // Les services Google se rangent ensemble ; chacun garde son propre groupe
    // dès qu'il atteint seul le seuil (trois onglets Gmail donnent « Gmail »).
    // Gemini reste en « ai », avec ChatGPT et Claude : c'est là qu'on le cherche.
    "mail.google.com": "google", "drive.google.com": "google", "docs.google.com": "google",
    "sheets.google.com": "google", "calendar.google.com": "google", "meet.google.com": "google",
    "photos.google.com": "google", "chat.google.com": "google", "ads.google.com": "google",
    "analytics.google.com": "google", "search.google.com": "google",
    "console.cloud.google.com": "google", "keep.google.com": "google",

    "chatgpt.com": "ai", "claude.ai": "ai", "gemini.google.com": "ai",
    "openai.com": "ai", "anthropic.com": "ai", "huggingface.co": "ai",
    "perplexity.ai": "ai", "midjourney.com": "ai", "mistral.ai": "ai",
    "elevenlabs.io": "ai", "runwayml.com": "ai", "suno.com": "ai",

    "x.com": "news", "reddit.com": "news", "linkedin.com": "news",
    "ycombinator.com": "news", "producthunt.com": "news",
    "medium.com": "news", "substack.com": "news",

    "youtube.com": "video", "vimeo.com": "video", "twitch.tv": "video",
    "dailymotion.com": "video",

    "amazon.fr": "shopping", "amazon.com": "shopping", "ebay.fr": "shopping",
    "ebay.com": "shopping", "leboncoin.fr": "shopping", "vinted.fr": "shopping",
    "cardmarket.com": "shopping", "aliexpress.com": "shopping", "cdiscount.com": "shopping",
    "fnac.com": "shopping", "darty.com": "shopping", "boulanger.com": "shopping",
    "decathlon.fr": "shopping", "ikea.com": "shopping", "zalando.fr": "shopping",
    "laredoute.fr": "shopping", "rakuten.com": "shopping", "backmarket.fr": "shopping",
    "temu.com": "shopping", "shein.com": "shopping", "etsy.com": "shopping",
    "asos.com": "shopping", "zara.com": "shopping",

    "booking.com": "travel", "airbnb.fr": "travel", "airbnb.com": "travel",
    "skyscanner.fr": "travel", "kayak.fr": "travel", "tripadvisor.fr": "travel",
    "sncf-connect.com": "travel", "ryanair.com": "travel", "easyjet.com": "travel",
    "expedia.fr": "travel", "hotels.com": "travel", "getyourguide.fr": "travel",

    "notion.so": "work", "airtable.com": "work", "linear.app": "work",
    "slack.com": "work", "trello.com": "work", "asana.com": "work",
    "monday.com": "work", "clickup.com": "work"
};

// Le nom affiché d'une catégorie, dans la langue du navigateur. Le lexique
// ne porte que des identifiants : le français produit exactement les titres
// de la 1.0.0 (« Achats », « IA »…), sans quoi chaque utilisateur existant
// verrait naître un doublon à côté de ses groupes.
function categoryOf(key) {
    const id = CATEGORY_HINTS[key];
    return id ? t(`category_${id}`) : null;
}

function pairKey(a, b) {
    return [a, b].sort().join("|");
}

function alreadyLinked(key) {
    return Boolean(LINKED_DOMAINS[key]);
}

function frenchList(items) {
    if (items.length <= 1) return items[0] || "";
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

async function getDismissed() {
    const { dismissedSuggestions } = await chrome.storage.local.get({ dismissedSuggestions: [] });
    return new Set(Array.isArray(dismissedSuggestions) ? dismissedSuggestions : []);
}

// --- Suggestion : l'habitude observée, autour d'une graine et non par contagion ---
async function habitSuggestion(dismissed) {
    const { cooccurrence } = await chrome.storage.local.get({ cooccurrence: {} });
    const adjacency = new Map();
    const strength = new Map();

    for (const [key, entry] of Object.entries(cooccurrence || {})) {
        if (!entry || entry.count < SUGGEST_MIN_SESSIONS) continue;
        const [a, b] = key.split("|");
        if (alreadyLinked(a) || alreadyLinked(b)) continue;
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
        strength.set(key, entry.count);
    }

    let best = null;
    for (const [seed, neighbours] of adjacency) {
        // Chaque membre doit avoir été observé avec LA GRAINE elle-même, pas
        // seulement avec un maillon de la chaîne. Les composantes connexes
        // enflaient par contagion : A-B, B-C, C-D formait une grappe de quatre
        // où A et D ne s'étaient jamais croisés — d'où des sujets fourre-tout.
        const ranked = [...neighbours].sort((x, y) =>
            (strength.get(pairKey(seed, y)) || 0) - (strength.get(pairKey(seed, x)) || 0)
        );
        const keys = [seed, ...ranked.slice(0, MAX_CLUSTER - 1)].sort();
        if (keys.length < 2) continue;

        const id = `habit:${keys.join("|")}`;
        if (dismissed.has(id)) continue;

        const score = keys.reduce(
            (sum, k) => sum + (k === seed ? 0 : (strength.get(pairKey(seed, k)) || 0)), 0);
        const better = !best
            || keys.length > best.keys.length
            || (keys.length === best.keys.length && score > best.score);
        if (better) best = { id, keys, score };
    }
    if (!best) return null;

    const labels = best.keys.map(labelForKey);
    const categories = new Set(best.keys.map(categoryOf).filter(Boolean));
    const known = categories.size === 1 && best.keys.every(k => categoryOf(k));

    // Deux marques concaténées restent lisibles. Au-delà, le titre devient une
    // bouillie du genre "GitHub + Graphiste + Jitter + Motion" — qui finit dans
    // la barre d'onglets ET dans les réglages. Mieux vaut demander le nom.
    const name = known
        ? [...categories][0]
        : (best.keys.length === 2 ? labels.join(" + ") : "");

    return { id: best.id, name, keys: best.keys, labels, source: "habit" };
}

// Le lexique n'est plus proposé : groupByCategory() l'applique déjà tout seul.
// Le proposer en plus n'ajoutait rien de visible et écrivait dans les réglages
// des lignes qui répétaient mot pour mot ce que le lexique fait déjà.
// La suggestion ne sert donc plus qu'à ce que Wisp ne sait PAS : les sujets
// propres à l'utilisateur, repérés par co-occurrence.
async function bestSuggestion() {
    return habitSuggestion(await getDismissed());
}

async function recordCooccurrence() {
    const wins = await chrome.windows.getAll({ populate: true });
    // Une paire ne compte qu'une fois par heure. Sinon un onglet laissé ouvert
    // toute la journée simulerait 480 "rencontres" et déclencherait n'importe quoi.
    const bucket = Math.floor(Date.now() / 3600000);
    const { cooccurrence } = await chrome.storage.local.get({ cooccurrence: {} });
    const store = (cooccurrence && typeof cooccurrence === "object") ? cooccurrence : {};
    let touched = false;

    for (const win of wins) {
        const keys = new Set();
        for (const tab of win.tabs || []) {
            const id = topicIdentity(tab.url || "");
            if (id) keys.add(id.key);
            if (keys.size >= MAX_DOMAINS_PER_WINDOW) break;
        }
        const list = [...keys];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const key = pairKey(list[i], list[j]);
                const entry = store[key] || { count: 0, lastBucket: -1 };
                if (entry.lastBucket === bucket) continue;
                entry.count += 1;
                entry.lastBucket = bucket;
                store[key] = entry;
                touched = true;
            }
        }
    }

    if (!touched) return;
    await chrome.storage.local.set({ cooccurrence: prunePairs(store) });
}

function prunePairs(store) {
    const entries = Object.entries(store);
    if (entries.length <= MAX_PAIRS) return store;
    entries.sort((a, b) => b[1].count - a[1].count);
    return Object.fromEntries(entries.slice(0, MAX_PAIRS));
}

async function linkCluster(keys, topic, suggestionId) {
    const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
    if (list.length < 2) return;
    // Un sujet sans nom ne vaut pas mieux que pas de sujet du tout : on refuse
    // plutôt que de fabriquer une concaténation que personne ne veut voir.
    const name = (topic || "").trim();
    if (!name) return;

    const { linkedDomains } = await chrome.storage.local.get({ linkedDomains: {} });
    const next = { ...(linkedDomains || {}) };
    for (const key of list) {
        // Si le lexique donne déjà ce sujet à ce domaine, la ligne serait un
        // doublon sans effet : on l'omet pour garder les réglages lisibles.
        if (categoryOf(key) === name) continue;
        next[key] = name;
    }
    await chrome.storage.local.set({ linkedDomains: next });

    // On n'attend pas que storage.onChanged rappelle init() : regrouper tout de
    // suite exige que getTopic() connaisse déjà le nouveau mapping.
    LINKED_DOMAINS = next;
    if (suggestionId) await dismissSuggestion(suggestionId);
    await regroupTopic(name);
}

async function dismissSuggestion(id) {
    const { dismissedSuggestions } = await chrome.storage.local.get({ dismissedSuggestions: [] });
    const list = Array.isArray(dismissedSuggestions) ? dismissedSuggestions : [];
    if (!list.includes(id)) list.push(id);
    await chrome.storage.local.set({ dismissedSuggestions: list });
}

// Lier des domaines ne sert à rien si les onglets déjà ouverts restent
// éparpillés : on rassemble immédiatement, fenêtre par fenêtre.
async function regroupTopic(topic) {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const win of wins) {
        const tabs = (win.tabs || []).filter(t =>
            t.url && !t.pinned && getTopic(t.url) === topic
        );
        if (tabs.length < 2) continue;

        const groups = await chrome.tabGroups.query({ windowId: win.id });
        const existing = groups.find(g => topicOfGroup(g) === topic);
        const tabIds = tabs.map(t => t.id);

        if (existing) {
            await chrome.tabs.group({ groupId: existing.id, tabIds });
        } else {
            const color = await pickColor(win.id);
            const groupId = await chrome.tabs.group({ tabIds });
            await chrome.tabGroups.update(groupId, { title: topic, color });
        }
    }
}

// ----------------------- Wisp Pro : licence vérifiée hors ligne -----------------------
// Achat unique, pas d'abonnement : l'extension n'embarque que la clé PUBLIQUE
// et vérifie la signature elle-même. Aucun serveur, aucun appel réseau — la
// promesse « rien ne sort du navigateur » tient donc aussi pour le payant.

// L'interrupteur. À false, Wisp est entièrement gratuit : aucun plafond,
// aucune mention de licence dans l'interface. Tout le mécanisme reste en
// place et se rallume en repassant cette seule constante à true — le jour où
// l'usage réel dira quoi vendre, ce qu'aucune intuition ne peut dire avant.
const MONETISATION_ACTIVE = false;

const LICENCE_PUBLIQUE = {"kty":"EC","crv":"P-256","x":"UIK_01S0WyFDGYKIp8_hQgcZSrzjQHLTgQ1DpU94Z8E","y":"NR93TpEcKM9qkYTT9KpKuvpCsSB-1MeqN_Z2pGG9WdE"};
const FREE_ARCHIVE_LIMIT = 3;

let PRO = false; // cache mémoire, revalidé à chaque démarrage du worker

function fromB64u(txt) {
    const b64 = txt.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - b64.length % 4) % 4));
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}

async function verifyLicence(cle) {
    const m = /^WISP-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec((cle || "").trim());
    if (!m) return null;
    try {
        const pub = await crypto.subtle.importKey(
            "jwk", LICENCE_PUBLIQUE, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        const charge = fromB64u(m[1]);
        const ok = await crypto.subtle.verify(
            { name: "ECDSA", hash: "SHA-256" }, pub, fromB64u(m[2]), charge);
        if (!ok) return null;
        return JSON.parse(new TextDecoder().decode(charge));
    } catch (e) {
        return null;
    }
}

async function refreshPro() {
    const { licence } = await chrome.storage.local.get({ licence: "" });
    PRO = licence ? Boolean(await verifyLicence(licence)) : false;
    return PRO;
}

async function activateLicence(cle) {
    const infos = await verifyLicence(cle);
    if (!infos) return { ok: false };
    await chrome.storage.local.set({ licence: cle.trim() });
    PRO = true;
    return { ok: true, email: infos.e, depuis: infos.d };
}

// ----------------------- Archivage : libérer l'attention, pas la RAM -----------------------
// Endormir garde le groupe sous les yeux. Archiver le fait disparaître de la
// barre d'onglets tout en le gardant restaurable en un clic — c'est ce qui
// permet de descendre sous les 40 onglets sans rien perdre.

const MAX_ARCHIVES = 50;

async function getArchives() {
    const { archives } = await chrome.storage.local.get({ archives: [] });
    return Array.isArray(archives) ? archives : [];
}

async function archiveGroup(groupId) {
    const group = await chrome.tabGroups.get(groupId);
    const tabs = await chrome.tabs.query({ groupId });
    if (tabs.length === 0) return { ok: false, raison: "vide" };

    const dejaLa = await getArchives();
    if (MONETISATION_ACTIVE && !PRO && dejaLa.length >= FREE_ARCHIVE_LIMIT) {
        return { ok: false, raison: "plafond", limite: FREE_ARCHIVE_LIMIT };
    }

    const entry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        topic: topicOfGroup(group) || t("unnamedGroup"),
        color: group.color,
        savedAt: Date.now(),
        tabs: tabs.map(t => ({ url: t.url, title: t.title || t.url }))
    };

    const archives = [entry, ...dejaLa];
    await chrome.storage.local.set({ archives: archives.slice(0, MAX_ARCHIVES) });

    // Fermer tous les onglets d'une fenêtre ferme la fenêtre. On laisse un
    // onglet vierge derrière si le groupe était tout ce qu'elle contenait.
    const win = await chrome.windows.get(group.windowId, { populate: true });
    if (win.tabs.length === tabs.length) {
        await chrome.tabs.create({ windowId: group.windowId });
    }
    await chrome.tabs.remove(tabs.map(t => t.id));
    return { ok: true };
}

async function restoreArchive(archiveId, windowId) {
    const archives = await getArchives();
    const entry = archives.find(a => a.id === archiveId);
    if (!entry) return;

    const created = [];
    for (const t of entry.tabs) {
        try {
            const tab = await chrome.tabs.create({ windowId, url: t.url, active: false });
            created.push(tab.id);
        } catch (e) { /* URL devenue invalide, on saute */ }
    }
    if (created.length) {
        const groupId = await chrome.tabs.group({ tabIds: created });
        await chrome.tabGroups.update(groupId, {
            title: entry.topic,
            color: entry.color || await pickColor(windowId),
            collapsed: true
        });
    }
    await chrome.storage.local.set({ archives: archives.filter(a => a.id !== archiveId) });
}

async function deleteArchive(archiveId) {
    const archives = await getArchives();
    await chrome.storage.local.set({ archives: archives.filter(a => a.id !== archiveId) });
}

// ----------------------- Mode focus -----------------------
// Un clic : tout sauf le sujet en cours se replie et s'endort.

async function focusOnActiveGroup(windowId) {
    const [active] = await chrome.tabs.query({ active: true, windowId });
    const keepId = active ? active.groupId : -1;
    const groups = await chrome.tabGroups.query({ windowId });

    for (const group of groups) {
        if (group.id === keepId) {
            await wakeGroup(group.id);
            continue;
        }
        const tabs = await chrome.tabs.query({ groupId: group.id });
        // La whitelist et les groupes déjà endormis : on replie, sans discard.
        if (isSleeping(group) || tabs.some(t => isWhitelisted(t.url))) {
            await chrome.tabGroups.update(group.id, { collapsed: true }).catch(() => {});
            continue;
        }
        if (tabs.length) await sleepGroup(group, tabs);
    }
}

// ----------------------- Pilotage depuis le popup -----------------------
// Le popup affiche l'état réel des groupes et permet d'agir tout de suite,
// sans attendre le prochain passage de l'alarme.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "sleepNow") {
        (async () => {
            try {
                const group = await chrome.tabGroups.get(msg.groupId);
                const tabs = await chrome.tabs.query({ groupId: msg.groupId });
                if (!isSleeping(group)) await sleepGroup(group, tabs);
                await updateBadge();
                sendResponse({ ok: true });
            } catch (e) {
                sendResponse({ ok: false });
            }
        })();
        return true; // réponse asynchrone
    }

    if (msg.type === "wakeNow") {
        (async () => {
            await wakeGroup(msg.groupId);
            const tabs = await chrome.tabs.query({ groupId: msg.groupId });
            // Réveiller, c'est aussi repartir d'un compteur neuf.
            await Promise.all(tabs.map(t => stampActivity(t.id)));
            await updateBadge();
            sendResponse({ ok: true });
        })();
        return true;
    }

    if (msg.type === "archiveGroup") {
        (async () => {
            try {
                const r = await archiveGroup(msg.groupId);
                await updateBadge();
                sendResponse(r || { ok: true });
            } catch (e) {
                sendResponse({ ok: false, raison: "erreur" });
            }
        })();
        return true;
    }

    if (msg.type === "getPro") {
        (async () => {
            const { licence } = await chrome.storage.local.get({ licence: "" });
            const infos = licence ? await verifyLicence(licence) : null;
            sendResponse({ monetisation: MONETISATION_ACTIVE,
                           pro: Boolean(infos), email: infos ? infos.e : null,
                           limite: FREE_ARCHIVE_LIMIT });
        })();
        return true;
    }

    if (msg.type === "activateLicence") {
        activateLicence(msg.cle).then(sendResponse);
        return true;
    }

    if (msg.type === "clearLicence") {
        chrome.storage.local.remove("licence").then(() => {
            PRO = false;
            sendResponse({ ok: true });
        });
        return true;
    }

    if (msg.type === "restoreArchive") {
        (async () => {
            try {
                await restoreArchive(msg.archiveId, msg.windowId);
                await updateBadge();
                sendResponse({ ok: true });
            } catch (e) {
                sendResponse({ ok: false });
            }
        })();
        return true;
    }

    if (msg.type === "deleteArchive") {
        (async () => {
            await deleteArchive(msg.archiveId);
            sendResponse({ ok: true });
        })();
        return true;
    }

    if (msg.type === "getSuggestion") {
        bestSuggestion().then(sendResponse).catch(() => sendResponse(null));
        return true;
    }

    if (msg.type === "linkCluster") {
        (async () => {
            try {
                await linkCluster(msg.keys, msg.topic, msg.id);
                sendResponse({ ok: true });
            } catch (e) {
                sendResponse({ ok: false });
            }
        })();
        return true;
    }

    if (msg.type === "dismissSuggestion") {
        dismissSuggestion(msg.id).then(() => sendResponse({ ok: true }));
        return true;
    }

    if (msg.type === "sweepNow") {
        sweepExistingTabs().then((ranges) => {
            updateBadge();
            sendResponse({ ok: true, ranges });
        });
        return true;
    }

    if (msg.type === "focusNow") {
        (async () => {
            try {
                await focusOnActiveGroup(msg.windowId);
                await updateBadge();
                sendResponse({ ok: true });
            } catch (e) {
                sendResponse({ ok: false });
            }
        })();
        return true;
    }
});

// ----------------------- Regroupement manuel (menu contextuel) -----------------------
// Pour les cas que l'auto-détection ne peut pas deviner (domaines différents,
// pas de mot commun) : sélection multiple d'onglets -> clic droit -> "Regrouper".

chrome.runtime.onInstalled.addListener(async () => {
    // removeAll d'abord : onInstalled se déclenche aussi à chaque rechargement
    // de l'extension, et create() sur un id existant lève une erreur.
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: "wisp-group-selection",
        title: t("contextMenuGroup"),
        contexts: ["all"]
    });
    ensureAlarm();
    sweepExistingTabs();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "wisp-group-selection") return;
    const highlighted = await chrome.tabs.query({ windowId: tab.windowId, highlighted: true });
    if (highlighted.length < 2) return;
    const color = await pickColor(tab.windowId);
    const groupId = await chrome.tabs.group({ tabIds: highlighted.map(t => t.id) });
    await chrome.tabGroups.update(groupId, { title: t("newGroupTitle"), color });
});
