// T2T — Tally's page + Aidan's admin profile.

const store = window.T2T_STORE;
const $ = (id) => document.getElementById(id);
const MY_TZ = "Asia/Taipei";

// Categories: label on Tally's page + short tag in the admin list.
const KINDS = {
  lief:      { label: "💕 Lief & persoonlijk",        tag: "Lief" },
  motivatie: { label: "💪 Motivatie & wijsheid",      tag: "Motivatie" },
  fact:      { label: "🧠 Fun fact & random gedachte", tag: "Fun fact" },
  baka:      { label: "🤪 Baka & gekkigheid",          tag: "Baka" },
  quote:     { label: "Quote",                        tag: "Quote" },
};
const kindOf = (k) => KINDS[k] || KINDS.quote;

let data = { quotes: [], photos: [], settings: {} };
let profile = "tally";
let lastShownKey = "";
// Shuffle: a random starting point per page open; clicking the quote moves it on.
let shuffleSlot = Math.floor(Math.random() * 1e6);

try { profile = localStorage.getItem("t2t-profile") || "tally"; } catch {}

// ---------- helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else node[k] = v;
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("error", isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3000);
}

async function run(action, okMsg) {
  try {
    await action();
    await reload();
    if (okMsg) toast(okMsg);
  } catch (err) {
    console.error(err);
    toast(err.message || "Something went wrong", true);
  }
}

const herTz = () => data.settings.her_timezone || "Europe/Amsterdam";
const validTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// Day number in Tally's timezone, so "daily" flips at her midnight.
function dayNumber() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: herTz(), year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return Math.floor(Date.parse(parts + "T00:00:00Z") / 86400000);
}

function slotFor(mode) {
  if (mode === "hourly") return Math.floor(Date.now() / 3600000);
  if (mode === "shuffle") return shuffleSlot;
  return dayNumber();
}

// Pick one item for the current time slot. Same slot -> same pick.
function choose(list, mode, pinnedId, salt) {
  if (!list.length) return null;
  if (mode === "pinned") {
    const pinned = list.find((x) => sameId(x.id, pinnedId));
    if (pinned) return pinned;
  }
  const x = Math.abs(Math.sin(slotFor(mode) * 9301 + salt * 49297) * 233280);
  return list[Math.floor(x) % list.length];
}

// ---------- Tally's page ----------

function renderTally(force = false) {
  const s = data.settings;
  const quote = choose(data.quotes, s.quote_mode, s.pinned_quote_id, 1);
  const photo = choose(data.photos, s.photo_mode, s.pinned_photo_id, 2);

  const key = [quote?.id, quote?.text, photo?.id, photo?.caption].join("|");
  if (!force && key === lastShownKey) return;
  lastShownKey = key;

  if (quote) {
    $("daily-label").textContent = kindOf(quote.kind).label;
    $("daily-text").textContent = quote.text;
    $("daily-author").textContent = quote.author ? "— " + quote.author : "";
  } else {
    $("daily-label").textContent = "";
    $("daily-text").textContent = "Thinking of you ♥";
    $("daily-author").textContent = "";
  }
  $("daily").classList.toggle("clickable", s.quote_mode === "shuffle");

  const fig = $("photo");
  if (photo) {
    fig.classList.remove("empty");
    $("photo-img").onerror = () => fig.classList.add("empty");
    $("photo-img").src = photo.url;
    $("photo-img").alt = photo.caption || "Us";
    $("photo-caption").textContent = photo.caption || "";
  } else {
    fig.classList.add("empty");
    $("photo-caption").textContent = "";
  }
}

function renderClocks() {
  const fmt = (tz) => new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  $("date").textContent = new Date().toLocaleDateString("en-GB", { timeZone: herTz(), weekday: "long", day: "numeric", month: "long" });
  $("me-time").textContent = fmt(MY_TZ);
  $("her-city").textContent = data.settings.her_city || "Tally";
  $("her-time").textContent = fmt(herTz());

  const r = data.settings.reunion_date;
  const daysLeft = r ? Math.ceil((new Date(r + "T00:00:00") - new Date()) / 86400000) : null;
  const counter = $("counter");
  counter.replaceChildren();
  if (daysLeft !== null && daysLeft > 0) counter.append(el("strong", { textContent: daysLeft }), daysLeft === 1 ? "day until we meet" : "days until we meet");
  else if (daysLeft === 0) counter.append(el("strong", { textContent: "Today!" }), "we meet again");
  else counter.append(el("strong", { textContent: "♥" }), "thinking of you");
}

$("daily").addEventListener("click", () => {
  if (data.settings.quote_mode !== "shuffle") return;
  shuffleSlot++;
  renderTally();
});

// ---------- Aidan's admin page ----------

async function renderAdmin() {
  $("demo-notice").hidden = store.mode !== "local";
  const loggedIn = await store.isLoggedIn();
  $("login-form").hidden = loggedIn;
  $("admin-panel").hidden = !loggedIn;
  $("sign-out").hidden = !(loggedIn && store.needsLogin);
  if (!loggedIn) return;

  const s = data.settings;
  $("quote-mode").value = s.quote_mode;
  $("photo-mode").value = s.photo_mode;

  // What Tally sees right now, so it can be highlighted.
  const showingQuote = choose(data.quotes, s.quote_mode, s.pinned_quote_id, 1);
  const showingPhoto = choose(data.photos, s.photo_mode, s.pinned_photo_id, 2);

  // Quotes list
  $("quote-list").replaceChildren(...[...data.quotes].reverse().map((q) => {
    const isPinned = sameId(q.id, s.pinned_quote_id) && s.quote_mode === "pinned";
    return el("li", { class: isPinned ? "selected" : "" },
      el("div", { class: "item-text" },
        el("span", { class: "tag " + q.kind, textContent: kindOf(q.kind).tag }),
        el("span", { textContent: q.text }),
        q.author ? el("span", { class: "muted", textContent: " — " + q.author }) : null,
        sameId(q.id, showingQuote?.id) && s.quote_mode !== "pinned" ? el("span", { class: "now", textContent: "showing now" }) : null,
      ),
      el("div", { class: "item-actions" },
        isPinned
          ? el("span", { class: "now", textContent: "✓ Showing" })
          : el("button", { class: "small", textContent: "Show this", onclick: () =>
              run(() => store.saveSettings({ pinned_quote_id: q.id, quote_mode: "pinned" }), "Tally now sees this quote") }),
        el("button", { class: "small danger", textContent: "Delete", onclick: () => {
          if (confirm("Delete this quote?")) run(() => store.deleteQuote(q.id), "Deleted");
        } }),
      ),
    );
  }));

  // Photo grid
  const grid = $("photo-grid");
  if (!data.photos.length) {
    grid.replaceChildren(el("p", { class: "muted", textContent: "No photos yet — upload one above." }));
  } else {
    grid.replaceChildren(...[...data.photos].reverse().map((p) => {
      const isPinned = sameId(p.id, s.pinned_photo_id) && s.photo_mode === "pinned";
      const isShowing = sameId(p.id, showingPhoto?.id);
      const caption = el("input", { value: p.caption || "", placeholder: "Caption" });
      caption.addEventListener("change", () =>
        run(() => store.updatePhoto(p.id, { caption: caption.value.trim() || null }), "Caption saved"));
      return el("div", { class: "thumb" + (isPinned ? " selected" : "") },
        el("img", { src: p.url, alt: p.caption || "" }),
        isShowing ? el("span", { class: "badge", textContent: isPinned ? "✓ Selected" : "Showing now" }) : null,
        caption,
        el("div", { class: "item-actions" },
          isPinned ? null : el("button", { class: "small", textContent: "Show this", onclick: () =>
            run(() => store.saveSettings({ pinned_photo_id: p.id, photo_mode: "pinned" }), "Tally now sees this photo") }),
          el("button", { class: "small danger", textContent: "Delete", onclick: () => {
            if (confirm("Delete this photo?")) run(() => store.deletePhoto(p), "Deleted");
          } }),
        ),
      );
    }));
  }

  // Settings form (don't overwrite while you're typing in it)
  if (!$("settings-form").contains(document.activeElement)) {
    $("set-city").value = s.her_city || "";
    $("set-tz").value = s.her_timezone || "";
    $("set-reunion").value = s.reunion_date || "";
  }
}

$("quote-mode").addEventListener("change", (e) => {
  const mode = e.target.value;
  const patch = { quote_mode: mode };
  // Choosing "only the selected one" without a selection: keep what's showing now.
  if (mode === "pinned" && !data.quotes.some((q) => sameId(q.id, data.settings.pinned_quote_id))) {
    patch.pinned_quote_id = choose(data.quotes, data.settings.quote_mode, null, 1)?.id ?? null;
  }
  run(() => store.saveSettings(patch), "Saved");
});

$("photo-mode").addEventListener("change", (e) => {
  const mode = e.target.value;
  const patch = { photo_mode: mode };
  if (mode === "pinned" && !data.photos.some((p) => sameId(p.id, data.settings.pinned_photo_id))) {
    patch.pinned_photo_id = choose(data.photos, data.settings.photo_mode, null, 2)?.id ?? null;
  }
  run(() => store.saveSettings(patch), "Saved");
});

$("quote-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("quote-text").value.trim();
  if (!text) return;
  const q = { text, author: $("quote-author").value.trim() || null, kind: $("quote-kind").value };
  run(async () => {
    await store.addQuote(q);
    $("quote-form").reset();
  }, "Added");
});

$("photo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const file = $("photo-file").files[0];
  if (!file) return;
  const btn = $("photo-form").querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  run(async () => {
    await store.addPhoto(file, $("photo-caption-input").value.trim() || null);
    $("photo-form").reset();
  }, "Photo added").finally(() => {
    btn.disabled = false;
    btn.textContent = "Upload";
  });
});

$("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const tz = $("set-tz").value.trim() || "Europe/Amsterdam";
  if (!validTz(tz)) return toast(`"${tz}" isn't a timezone — try something like Europe/Amsterdam`, true);
  run(() => store.saveSettings({
    her_city: $("set-city").value.trim() || "Tally",
    her_timezone: tz,
    reunion_date: $("set-reunion").value || null,
  }), "Settings saved");
});

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  try {
    await store.signIn($("login-email").value, $("login-password").value);
    $("login-password").value = "";
    await renderAdmin();
  } catch (err) {
    $("login-error").textContent = err.message || "Couldn't sign in";
  }
});

$("sign-out").addEventListener("click", async () => {
  await store.signOut();
  setProfile("tally");
});

// ---------- profile switcher ----------

function setProfile(p) {
  profile = p;
  try { localStorage.setItem("t2t-profile", p); } catch {}
  const isAidan = p === "aidan";
  $("tally-view").hidden = isAidan;
  $("admin-view").hidden = !isAidan;
  $("switcher-name").textContent = isAidan ? "Aidan" : "Tally";
  $("switcher-avatar").textContent = isAidan ? "A" : "T";
  $("switcher-avatar").classList.toggle("admin", isAidan);
  closeMenu();
  render();
}

function closeMenu() {
  $("switcher-menu").hidden = true;
  $("switcher-btn").setAttribute("aria-expanded", "false");
}

$("switcher-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = $("switcher-menu").hidden;
  $("switcher-menu").hidden = !open;
  $("switcher-btn").setAttribute("aria-expanded", String(open));
});
$("switcher-menu").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-profile]");
  if (btn) setProfile(btn.dataset.profile);
});
document.addEventListener("click", closeMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

// ---------- start ----------

function render() {
  renderClocks();
  if (profile === "aidan") renderAdmin();
  else renderTally(true);
}

async function reload() {
  data = await store.load();
  if (!validTz(herTz())) data.settings.her_timezone = "Europe/Amsterdam";
  render();
}

(async () => {
  try {
    await reload();
  } catch (err) {
    console.error(err);
    toast("Couldn't load the page data: " + (err.message || err), true);
  }
  setProfile(profile);
})();

// Clocks + hourly/daily changes.
setInterval(() => {
  renderClocks();
  if (profile === "tally") renderTally();
}, 20000);

// Pick up changes Aidan made from Taipei without Tally needing to refresh.
setInterval(() => {
  if (profile === "tally") reload().catch(() => {});
}, 2 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && profile === "tally") reload().catch(() => {});
});
