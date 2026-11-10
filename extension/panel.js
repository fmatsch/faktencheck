// Faktencheck lokal – Seitenleiste.
// Die Prüfung läuft über Chromes eingebaute Prompt API (Gemini Nano) direkt auf dem Gerät.

const MAX_CHARS = 4000;   // mehr passt nicht sinnvoll ins Kontextfenster des lokalen Modells
const MAX_CLAIMS = 5;

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ---------- Texte für das Modell ----------

const PROMPTS = {
  de: {
    system:
      "Du bist ein sorgfältiger, nüchterner Faktenprüfer. Du antwortest auf Deutsch. " +
      "Du bewertest nur überprüfbare Tatsachenbehauptungen, keine Meinungen, Wertungen oder Prognosen. " +
      "Du erfindest keine Quellen, Zahlen oder Zitate. Wenn dein Wissen nicht reicht, die Aussage zu aktuell " +
      "ist oder die Belege nichts dazu sagen, lautet das Urteil \"unverifiable\" – das ist besser als raten.",
    extract: (text, title) =>
      `Aus dem folgenden Text${title ? ` (von der Seite „${title}“)` : ""} sollst du die höchstens ${MAX_CLAIMS} wichtigsten ` +
      "überprüfbaren Tatsachenbehauptungen herausziehen. Formuliere jede als eigenständigen, vollständigen Satz " +
      "(Pronomen durch das Gemeinte ersetzen). Gib zu jeder Behauptung 2–4 Suchbegriffe für ein Lexikon an " +
      "(nur Namen und Substantive, keine ganzen Sätze). Enthält der Text keine überprüfbare Behauptung, " +
      `gib eine leere Liste zurück.\n\nTEXT:\n"""\n${text}\n"""`,
    judge: (claim, evidence) =>
      `Prüfe diese Behauptung:\n"""\n${claim}\n"""\n\n` +
      (evidence
        ? `Belege aus Wikipedia (können unvollständig oder für die Behauptung unerheblich sein):\n${evidence}\n\n` +
          "Stütze dich vorrangig auf diese Belege. Sagen sie nichts zur Behauptung, nutze dein eigenes Wissen " +
          "und senke die Sicherheit.\n\n"
        : "") +
      "Schreibe zuerst in \"reasoning\" in 1–3 kurzen Sätzen, was dafür und was dagegen spricht. " +
      "Wähle dann \"verdict\": true (stimmt), mostly_true (stimmt im Kern), misleading (irreführend oder " +
      "wichtiger Kontext fehlt), mostly_false (überwiegend falsch), false (falsch), unverifiable (nicht prüfbar). " +
      "Gib in \"confidence\" an, wie sicher du bist: low, medium oder high.",
  },
  en: {
    system:
      "You are a careful, sober fact checker. You answer in English. " +
      "You only assess verifiable factual claims, not opinions, value judgements or predictions. " +
      "You never invent sources, numbers or quotes. If your knowledge is insufficient, the claim is too recent " +
      "or the evidence says nothing about it, the verdict is \"unverifiable\" – that is better than guessing.",
    extract: (text, title) =>
      `From the following text${title ? ` (from the page "${title}")` : ""}, extract at most the ${MAX_CLAIMS} most important ` +
      "verifiable factual claims. Phrase each as a complete, self-contained sentence (replace pronouns with what " +
      "they refer to). For each claim give 2–4 encyclopedia search keywords (names and nouns only, no sentences). " +
      `If the text contains no verifiable claim, return an empty list.\n\nTEXT:\n"""\n${text}\n"""`,
    judge: (claim, evidence) =>
      `Check this claim:\n"""\n${claim}\n"""\n\n` +
      (evidence
        ? `Evidence from Wikipedia (may be incomplete or irrelevant to the claim):\n${evidence}\n\n` +
          "Rely primarily on this evidence. If it says nothing about the claim, use your own knowledge and " +
          "lower the confidence.\n\n"
        : "") +
      "First write in \"reasoning\", in 1–3 short sentences, what speaks for and against it. " +
      "Then choose \"verdict\": true, mostly_true, misleading (misleading or missing important context), " +
      "mostly_false, false, unverifiable. State in \"confidence\" how sure you are: low, medium or high.",
  },
};

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      maxItems: MAX_CLAIMS,
      items: {
        type: "object",
        properties: { claim: { type: "string" }, query: { type: "string" } },
        required: ["claim", "query"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
};

const VERDICTS = {
  true: ["Stimmt", "ok"],
  mostly_true: ["Stimmt im Kern", "ok"],
  misleading: ["Irreführend", "warn"],
  mostly_false: ["Überwiegend falsch", "bad"],
  false: ["Falsch", "bad"],
  unverifiable: ["Nicht prüfbar", "unk"],
};
const CONFIDENCE = { low: "geringe Sicherheit", medium: "mittlere Sicherheit", high: "hohe Sicherheit" };

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    reasoning: { type: "string" },
    verdict: { type: "string", enum: Object.keys(VERDICTS) },
    confidence: { type: "string", enum: Object.keys(CONFIDENCE) },
  },
  required: ["reasoning", "verdict", "confidence"],
  additionalProperties: false,
};

// ---------- Einstellungen ----------

const settings = { wiki: false, lang: "de" };

async function loadSettings() {
  Object.assign(settings, await chrome.storage.local.get(Object.keys(settings)));
  $("optWiki").checked = settings.wiki;
  $("optLang").value = settings.lang;
}
$("optWiki").addEventListener("change", e => {
  settings.wiki = e.target.checked;
  chrome.storage.local.set({ wiki: settings.wiki });
});
$("optLang").addEventListener("change", e => {
  settings.lang = e.target.value;
  chrome.storage.local.set({ lang: settings.lang });
});
$("settingsBtn").addEventListener("click", () => {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("settingsBtn").setAttribute("aria-expanded", String(open));
});

// ---------- Lokales Modell ----------

const sessionOptions = lang => ({
  expectedInputs: [{ type: "text", languages: [...new Set([lang, "en"])] }],
  expectedOutputs: [{ type: "text", languages: [lang] }],
});

// Liefert { lang, availability }. Ältere Chrome-Versionen können noch kein Deutsch –
// dann wird auf Englisch ausgewichen statt gar nicht zu prüfen.
async function probeModel() {
  if (!("LanguageModel" in globalThis)) return { lang: null, availability: "unsupported" };
  let best = { lang: null, availability: "unavailable" };
  for (const lang of [...new Set([settings.lang, "en"])]) {
    let availability = "unavailable";
    try { availability = await LanguageModel.availability(sessionOptions(lang)); } catch { /* Sprache unbekannt */ }
    if (availability === "available") return { lang, availability };
    if (availability !== "unavailable" && !best.lang) best = { lang, availability };
  }
  return best;
}

function createSession(lang, extra = {}) {
  return LanguageModel.create({
    ...sessionOptions(lang),
    initialPrompts: [{ role: "system", content: PROMPTS[lang].system }],
    ...extra,
  });
}

function showSetup(kind) {
  const texts = {
    unsupported: [
      "Dieser Browser hat keine eingebaute KI",
      "Faktencheck lokal braucht Google Chrome ab Version 138 auf dem Computer (für Deutsch ab Version 149). " +
      "In anderen Browsern oder auf dem Handy steht das lokale Modell nicht zur Verfügung.",
    ],
    unavailable: [
      "Das lokale KI-Modell läuft auf diesem Gerät nicht",
      "Chrome stellt Gemini Nano nur bereit, wenn das Gerät genug Leistung hat:\n" +
      "• Windows 10/11 oder macOS 13 und neuer\n" +
      "• mindestens 22 GB freier Speicher auf dem Laufwerk des Chrome-Profils\n" +
      "• Grafikchip mit mehr als 4 GB Speicher – oder 16 GB RAM und 4 Prozessorkerne\n\n" +
      "Details zeigt Chrome unter chrome://on-device-internals.",
    ],
    download: [
      "Lokales KI-Modell einmalig laden",
      "Chrome lädt das Modell Gemini Nano einmal herunter (mehrere Gigabyte). Danach läuft jede Prüfung " +
      "ohne Internet direkt auf diesem Gerät.",
    ],
  };
  const [title, text] = texts[kind];
  $("setupTitle").textContent = title;
  $("setupText").textContent = text;
  $("setupBtn").hidden = kind !== "download";
  $("setupProgress").hidden = true;
  $("setup").hidden = false;
}

// Der Download braucht einen Klick (Nutzergeste) – daher ein eigener Knopf.
$("setupBtn").addEventListener("click", async () => {
  const { lang } = await probeModel();
  if (!lang) return showSetup("unavailable");
  $("setupBtn").disabled = true;
  $("setupProgress").hidden = false;
  try {
    const session = await createSession(lang, {
      monitor(m) {
        m.addEventListener("downloadprogress", e => {
          $("setupProgress").value = e.loaded;
          setStatus(`Modell wird geladen … ${Math.round(e.loaded * 100)} %`);
        });
      },
    });
    session.destroy();
    $("setup").hidden = true;
    setStatus("Modell ist bereit.");
    if ($("input").value.trim()) runCheck();
  } catch (err) {
    setStatus(`Das Modell konnte nicht geladen werden: ${err.message}`, true);
  } finally {
    $("setupBtn").disabled = false;
  }
});

// ---------- Wikipedia (nur wenn eingeschaltet) ----------

async function wikiEvidence(query, lang, signal) {
  const api = `https://${lang}.wikipedia.org/w/api.php?format=json&origin=*&action=query`;
  const search = await (await fetch(
    `${api}&list=search&srlimit=2&srsearch=${encodeURIComponent(query)}`, { signal })).json();
  const ids = (search.query?.search || []).map(r => r.pageid);
  if (!ids.length) return [];
  const pages = await (await fetch(
    `${api}&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exlimit=max&pageids=${ids.join("|")}`,
    { signal })).json();
  return ids
    .map(id => pages.query?.pages?.[id])
    .filter(p => p?.extract)
    .map(p => ({ title: p.title, url: p.fullurl, extract: p.extract.replace(/\s+/g, " ").slice(0, 1000) }));
}

// ---------- Ablauf ----------

let controller = null;

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function setBusy(busy) {
  $("checkBtn").disabled = busy;
  $("stopBtn").hidden = !busy;
}

function parseJson(raw) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned);
}

function claimCard(claim) {
  const card = el("article", "card");
  card.append(el("h3", null, claim));
  const pending = el("div", "pending");
  pending.append(el("span", "spinner"), el("span", null, "wird geprüft …"));
  card.append(pending);
  return card;
}

function fillCard(card, claim, result, evidence) {
  card.querySelector(".pending")?.remove();
  const [label, cls] = VERDICTS[result.verdict] || VERDICTS.unverifiable;
  const badges = el("div", "badges");
  badges.append(el("span", `badge ${cls}`, label));
  if (CONFIDENCE[result.confidence]) badges.append(el("span", "conf", CONFIDENCE[result.confidence]));
  card.append(badges, el("p", null, result.reasoning));

  const sources = el("div", "sources");
  if (evidence.length) {
    const row = el("div", null, "Herangezogen: ");
    for (const e of evidence) row.append(link(e.url, `Wikipedia: ${e.title}`));
    sources.append(row);
  }
  const row = el("div", null, "Selbst nachprüfen: ");
  const q = encodeURIComponent(claim);
  row.append(
    link(`https://www.google.com/search?q=${q}`, "Websuche"),
    link(`https://toolbox.google.com/factcheck/explorer/search/${q}`, "Faktenchecks anderer"),
  );
  sources.append(row);
  card.append(sources);
}

function link(href, text) {
  const a = el("a", null, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

async function runCheck() {
  let text = $("input").value.trim();
  if (!text) return setStatus("Bitte zuerst Text markieren oder einfügen.");

  controller?.abort();
  const ctl = controller = new AbortController();
  const { signal } = ctl;
  $("results").replaceChildren();
  $("setup").hidden = true;

  const { lang, availability } = await probeModel();
  if (signal.aborted) return;
  if (availability === "unsupported" || availability === "unavailable") return showSetup(availability);
  if (availability !== "available") return showSetup("download");

  const cut = text.length > MAX_CHARS;
  if (cut) text = text.slice(0, MAX_CHARS);
  const notes = [];
  if (cut) notes.push(`Nur die ersten ${MAX_CHARS} Zeichen wurden geprüft.`);
  if (lang !== settings.lang) notes.push("Diese Chrome-Version kann lokal noch kein Deutsch – die Begründungen sind auf Englisch.");

  setBusy(true);
  setStatus("Behauptungen werden herausgesucht …");
  let base;
  try {
    base = await createSession(lang, { signal });
    const p = PROMPTS[lang];

    const extractor = await base.clone({ signal });
    let claims;
    try {
      const raw = await extractor.prompt(p.extract(text, pageTitle), { responseConstraint: EXTRACT_SCHEMA, signal });
      claims = (parseJson(raw).claims || []).filter(c => c?.claim?.trim()).slice(0, MAX_CLAIMS);
    } finally {
      extractor.destroy();
    }

    if (!claims.length) {
      setStatus(["Im markierten Text steckt keine überprüfbare Tatsachenbehauptung.", ...notes].join(" "));
      return;
    }

    const cards = claims.map(c => claimCard(c.claim));
    $("results").append(...cards);

    for (let i = 0; i < claims.length; i++) {
      setStatus(`Behauptung ${i + 1} von ${claims.length} wird geprüft …`);
      const { claim, query } = claims[i];

      let evidence = [];
      if (settings.wiki) {
        try { evidence = await wikiEvidence(query || claim, lang, signal); }
        catch (err) { if (signal.aborted) throw err; /* ohne Belege weiter */ }
      }
      const evidenceText = evidence.map((e, n) => `[${n + 1}] ${e.title}: ${e.extract}`).join("\n");

      // Jede Behauptung in einer frischen Kopie, damit sich Urteile nicht gegenseitig beeinflussen.
      const judge = await base.clone({ signal });
      try {
        const raw = await judge.prompt(p.judge(claim, evidenceText), { responseConstraint: JUDGE_SCHEMA, signal });
        fillCard(cards[i], claim, parseJson(raw), evidence);
      } finally {
        judge.destroy();
      }
    }
    setStatus([`${claims.length} ${claims.length === 1 ? "Behauptung" : "Behauptungen"} geprüft.`, ...notes].join(" "));
  } catch (err) {
    document.querySelectorAll(".pending").forEach(n => n.closest(".card").remove());
    if (signal.aborted) {
      if (controller === ctl) setStatus("Abgebrochen.");
    } else {
      setStatus(`Die Prüfung ist fehlgeschlagen: ${err.message}`, true);
    }
  } finally {
    base?.destroy();
    if (controller === ctl) setBusy(false);
  }
}

// ---------- Eingaben ----------

let pageTitle = "";

function updateCount() {
  const n = $("input").value.length;
  $("count").textContent = n > MAX_CHARS ? `${n} Zeichen – geprüft werden die ersten ${MAX_CHARS}` : "";
}

$("input").addEventListener("input", () => { pageTitle = ""; updateCount(); });
$("form").addEventListener("submit", e => { e.preventDefault(); runCheck(); });
$("stopBtn").addEventListener("click", () => controller?.abort());

// Übergabe aus dem Kontextmenü (background.js)
function takeRequest(request) {
  if (!request?.text) return;
  chrome.storage.session.remove("request");
  $("input").value = request.text;
  pageTitle = request.title || "";
  updateCount();
  runCheck();
}
chrome.storage.session.onChanged.addListener(changes => {
  if (changes.request?.newValue) takeRequest(changes.request.newValue);
});

(async () => {
  await loadSettings();
  const { request } = await chrome.storage.session.get("request");
  if (request) return takeRequest(request);
  const { availability } = await probeModel();
  if (availability === "unsupported" || availability === "unavailable") showSetup(availability);
  else if (availability !== "available") showSetup("download");
})();
