// T2T — Tally's page + Aidan's admin profile.

const store = window.T2T_STORE;
const $ = (id) => document.getElementById(id);
const MY_TZ = "Asia/Taipei";

// Categories: label on Tally's page + short tag in the admin list.
const KINDS = {
  lief:      { label: "Voor jou",    tag: "Lief" },
  motivatie: { label: "Onthoud dit", tag: "Motivatie" },
  fact:      { label: "Wist je dat", tag: "Fun fact" },
  baka:      { label: "Baka",        tag: "Baka" },
  quote:     { label: "Quote",       tag: "Quote" },
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
  const quote = currentQuote();
  const photo = currentPhoto();

  const key = [quote?.id, quote?.text, photo?.id, photo?.caption].join("|");
  if (!force && key === lastShownKey) return;
  const swapped = lastShownKey !== "" && key !== lastShownKey;
  lastShownKey = key;
  if (swapped) {
    for (const id of ["daily", "photo"]) {
      $(id).classList.remove("swap");
      void $(id).offsetWidth;
      $(id).classList.add("swap");
    }
  }

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
  const counter = $("counter-text");
  const withHearts = heartsAvailable();
  counter.replaceChildren();
  if (daysLeft !== null && daysLeft > 0) counter.append(el("strong", { textContent: daysLeft }), daysLeft === 1 ? "day until we meet" : "days until we meet");
  else if (daysLeft === 0) counter.append(el("strong", { textContent: "Today!" }), "we meet again");
  else {
    if (!withHearts) counter.append(el("strong", { textContent: "♥" }));
    counter.append(data.settings.footer_text || "thinking of you");
  }
  renderHearts();
}

// ---------- hearts: Tally can swap the quote + photo a few times a day ----------

const isPinned = (list, mode, id) => mode === "pinned" && list.some((x) => sameId(x.id, id));
const quotePinned = () => isPinned(data.quotes, data.settings.quote_mode, data.settings.pinned_quote_id);
const photoPinned = () => isPinned(data.photos, data.settings.photo_mode, data.settings.pinned_photo_id);

// What she swapped to today (if anything). A pinned item always wins;
// in "every hour" mode a swap lasts until the next hour.
function heartOverride(list, mode, id) {
  const h = data.hearts;
  if (!h || h.day !== dayNumber() || id == null || mode === "pinned") return null;
  if (mode === "hourly" && Math.floor(Date.parse(h.set_at) / 3600000) !== Math.floor(Date.now() / 3600000)) return null;
  return list.find((x) => sameId(x.id, id)) || null;
}

function currentQuote() {
  const s = data.settings;
  return heartOverride(data.quotes, s.quote_mode, data.hearts?.quote_id) || choose(data.quotes, s.quote_mode, s.pinned_quote_id, 1);
}
function currentPhoto() {
  const s = data.settings;
  return heartOverride(data.photos, s.photo_mode, data.hearts?.photo_id) || choose(data.photos, s.photo_mode, s.pinned_photo_id, 2);
}

const heartsMax = () => data.settings.hearts_per_day || 2;
const heartsUsed = () => (data.hearts && data.hearts.day === dayNumber() ? data.hearts.used : 0);
function heartsAvailable() {
  const canQuote = !quotePinned() && data.quotes.length > 1;
  const canPhoto = !photoPinned() && data.photos.length > 1;
  return canQuote || canPhoto;
}

const randomOf = (list) => list[Math.floor(Math.random() * list.length)];

// New quote from a DIFFERENT category, and a different photo.
function pickSwap() {
  const q = currentQuote(), p = currentPhoto();
  let quote = null, photo = null;
  if (!quotePinned() && data.quotes.length > 1) {
    const otherKind = data.quotes.filter((x) => x.kind !== q?.kind);
    const otherQuote = data.quotes.filter((x) => !sameId(x.id, q?.id));
    quote = randomOf(otherKind.length ? otherKind : otherQuote);
  }
  if (!photoPinned() && data.photos.length > 1) {
    photo = randomOf(data.photos.filter((x) => !sameId(x.id, p?.id)));
  }
  return { quote, photo };
}

let heartBusy = false;
function renderHearts(popIndex = -1) {
  const box = $("hearts");
  box.hidden = !heartsAvailable();
  if (box.hidden) return;
  const max = heartsMax();
  const left = Math.max(0, max - heartsUsed());
  box.replaceChildren(...Array.from({ length: max }, (_, i) => {
    const full = i < left;
    return el("button", {
      class: "heart-btn" + (full ? "" : " used") + (i === popIndex ? " pop" : ""),
      textContent: "♥",
      disabled: !full,
      title: full ? `Surprise me (${left} left today)` : "Used — new hearts tomorrow",
      ariaLabel: full ? `Surprise me, ${left} left today` : "Heart used",
      onclick: (e) => { e.stopPropagation(); useHeart(); },
    });
  }));
}

async function useHeart() {
  if (heartBusy) return;
  const { quote, photo } = pickSwap();
  if (!quote && !photo) return;
  heartBusy = true;
  try {
    const before = heartsMax() - heartsUsed();
    data.hearts = await store.useHeart(quote?.id ?? null, photo?.id ?? null, dayNumber());
    renderHearts(before - 1); // the heart that just turned grey pops
    renderTally();
  } catch (err) {
    console.error(err);
    toast(/no hearts/i.test(err.message) ? "No hearts left today — new ones tomorrow ♥" : (err.message || "Couldn't do that"), true);
    reload().catch(() => {});
  } finally {
    heartBusy = false;
  }
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
  const showingQuote = currentQuote();
  const showingPhoto = currentPhoto();
  $("hearts-status").textContent = heartsAvailable()
    ? `❤️ Tally used ${heartsUsed()} of ${heartsMax()} hearts today`
    : "❤️ Hearts are hidden while both the quote and the photo are pinned";
  $("reset-hearts").hidden = !(heartsAvailable() && heartsUsed() > 0);

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
    $("set-footer").value = s.footer_text || "";
    $("set-hearts").value = String(s.hearts_per_day || 2);
  }

  renderMusicAdmin();
}

// ---------- music ----------

const audio = new Audio();
audio.preload = "none";
let musicOn = false;       // what Tally chose (remembered in this browser)
let musicBlocked = false;  // browser refused to start without a click
let queue = [];
let queueIndex = 0;
let herVolume = null;      // Tally's own slider setting (0–100); null = use Aidan's default
try {
  musicOn = localStorage.getItem("t2t-music") === "on";
  const v = localStorage.getItem("t2t-volume");
  if (v !== null && !isNaN(v)) herVolume = Number(v);
} catch {}

const volumePercent = () => herVolume ?? data.settings.music_volume ?? 25;

function wantedQueue() {
  const songs = data.songs || [];
  if (!songs.length) return [];
  if (data.settings.music_mode === "single") {
    return [songs.find((s) => sameId(s.id, data.settings.music_song_id)) || songs[0]];
  }
  return songs;
}

async function playMusic() {
  if (!queue.length) return;
  if (!audio.src) audio.src = queue[queueIndex].url;
  try {
    await audio.play();
    musicBlocked = false;
  } catch {
    musicBlocked = true; // needs a click first (browser autoplay rule)
  }
  updateMusicButton();
}

function syncMusic() {
  const next = wantedQueue();
  audio.volume = Math.min(1, Math.max(0, volumePercent() / 100));
  if (next.map((s) => s.id).join() !== queue.map((s) => s.id).join()) {
    const current = queue[queueIndex];
    queue = next;
    const keep = current ? queue.findIndex((s) => sameId(s.id, current.id)) : -1;
    if (keep >= 0) {
      queueIndex = keep; // song still in the list: keep playing it
    } else {
      queueIndex = 0;
      audio.pause();
      audio.removeAttribute("src");
      if (musicOn && queue.length) playMusic();
    }
  }
  audio.loop = queue.length === 1;
  if (!queue.length) audio.pause();
  updateMusicButton();
}

function updateMusicButton() {
  const btn = $("music-btn");
  btn.hidden = !queue.length;
  btn.classList.toggle("on", musicOn);
  btn.classList.toggle("waiting", musicOn && musicBlocked && audio.paused);
  btn.setAttribute("aria-pressed", String(musicOn));
  const label = musicOn ? "Music off" : "Music on";
  btn.setAttribute("aria-label", label);
  btn.title = musicOn && musicBlocked ? "Click to start the music" : label;

  // Now playing bar under Tally's card
  const bar = $("now-playing");
  const playing = !audio.paused;
  showNowPlaying(queue.length > 0 && profile !== "aidan" && musicOn);
  bar.classList.toggle("playing", playing);
  $("np-label").textContent = playing ? "Now playing" : musicOn && musicBlocked ? "Click to start" : "Music paused";
  $("np-title").textContent = queue[queueIndex]?.title || "Untitled song";
  $("np-skip").hidden = queue.length < 2;
  if (document.activeElement !== $("np-volume")) $("np-volume").value = musicOn ? volumePercent() : 0;
  paintVolume();
}

// Only visible while Tally has the music turned on; fades in and out.
let barHideTimer;
function showNowPlaying(show) {
  const bar = $("now-playing");
  const visible = !bar.hidden && !bar.classList.contains("fade-out");
  if (show === visible) return;
  clearTimeout(barHideTimer);
  if (show) {
    bar.classList.remove("fade-out");
    bar.hidden = false;
    bar.classList.remove("fade-in");
    void bar.offsetWidth; // restart the animation
    bar.classList.add("fade-in");
  } else {
    bar.classList.remove("fade-in");
    bar.classList.add("fade-out");
    barHideTimer = setTimeout(() => {
      bar.hidden = true;
      bar.classList.remove("fade-out");
    }, 250);
  }
}

function setMusicOn(on) {
  musicOn = on;
  try { localStorage.setItem("t2t-music", on ? "on" : "off"); } catch {}
  if (on) playMusic();
  else { audio.pause(); updateMusicButton(); }
}

audio.addEventListener("play", updateMusicButton);
audio.addEventListener("pause", updateMusicButton);

audio.addEventListener("ended", () => {
  if (queue.length < 2) return;
  queueIndex = (queueIndex + 1) % queue.length;
  audio.src = queue[queueIndex].url;
  audio.play().catch(() => {});
});

$("music-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  // Already "on" but the browser blocked it: this click starts it.
  if (musicOn && audio.paused) return playMusic();
  setMusicOn(!musicOn);
});

// Tally's volume slider: 0 turns the music off, sliding up turns it on.
// Skip: jump to a random other song from the playlist (only for her, nothing is saved).
$("np-skip").addEventListener("click", (e) => {
  e.stopPropagation();
  if (queue.length < 2) return;
  let next;
  do { next = Math.floor(Math.random() * queue.length); } while (next === queueIndex);
  queueIndex = next;
  audio.src = queue[queueIndex].url;
  if (musicOn) playMusic();
  else updateMusicButton();
});

// Colour the part of the slider line left of the knob.
function paintVolume() {
  $("np-volume").style.setProperty("--fill", $("np-volume").value + "%");
}

$("np-volume").addEventListener("click", (e) => e.stopPropagation());
$("np-volume").addEventListener("input", (e) => {
  paintVolume();
  const v = Number(e.target.value);
  if (v === 0) {
    if (musicOn) setMusicOn(false);
    return;
  }
  herVolume = v;
  try { localStorage.setItem("t2t-volume", String(v)); } catch {}
  audio.volume = v / 100;
  if (!musicOn || audio.paused) setMusicOn(true);
});

// If she left the music on last time, her first click anywhere starts it again.
document.addEventListener("click", () => {
  if (musicOn && musicBlocked && audio.paused) playMusic();
});

function renderMusicAdmin() {
  const s = data.settings;
  const songs = data.songs || [];
  $("music-mode").value = s.music_mode || "playlist";
  if (document.activeElement !== $("music-volume")) $("music-volume").value = s.music_volume ?? 25;
  $("music-volume-label").textContent = $("music-volume").value + "%";

  if (!songs.length) {
    $("song-list").replaceChildren(el("li", { class: "muted", textContent: "No songs yet — upload an mp3 above." }));
    return;
  }
  const playing = wantedQueue();
  $("song-list").replaceChildren(...songs.map((song) => {
    const isSelected = s.music_mode === "single" && sameId(song.id, playing[0]?.id);
    return el("li", { class: isSelected ? "selected" : "" },
      el("div", { class: "item-text" },
        el("span", { class: "tag", textContent: "♪" }),
        el("span", { textContent: song.title || "Untitled song" }),
      ),
      el("div", { class: "item-actions" },
        isSelected
          ? el("span", { class: "now", textContent: "✓ Selected" })
          : el("button", { class: "small", textContent: "Play only this", onclick: () =>
              run(() => store.saveSettings({ music_song_id: song.id, music_mode: "single" }), "Tally now hears this song") }),
        el("button", { class: "small danger", textContent: "Delete", onclick: () => {
          if (confirm("Delete this song?")) run(() => store.deleteSong(song), "Deleted");
        } }),
      ),
    );
  }));
}

$("music-mode").addEventListener("change", (e) =>
  run(() => store.saveSettings({ music_mode: e.target.value }), "Saved"));

$("music-volume").addEventListener("input", (e) => {
  $("music-volume-label").textContent = e.target.value + "%";
  audio.volume = e.target.value / 100; // hear it right away if it's playing here
});
$("music-volume").addEventListener("change", (e) =>
  run(() => store.saveSettings({ music_volume: Number(e.target.value) }), "Volume saved"));

$("song-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const file = $("song-file").files[0];
  if (!file) return;
  const btn = $("song-form").querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Uploading…";
  const title = $("song-title").value.trim() || file.name.replace(/\.[^.]+$/, "");
  run(async () => {
    await store.addSong(file, title);
    $("song-form").reset();
  }, "Song added").finally(() => {
    btn.disabled = false;
    btn.textContent = "Upload";
  });
});

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

$("reset-hearts").addEventListener("click", () =>
  run(() => store.resetHearts(), "Tally has all her hearts again ♥"));

$("settings-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const tz = $("set-tz").value.trim() || "Europe/Amsterdam";
  if (!validTz(tz)) return toast(`"${tz}" isn't a timezone — try something like Europe/Amsterdam`, true);
  run(() => store.saveSettings({
    her_city: $("set-city").value.trim() || "Tally",
    her_timezone: tz,
    reunion_date: $("set-reunion").value || null,
    footer_text: $("set-footer").value.trim() || "thinking of you",
    hearts_per_day: Number($("set-hearts").value),
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
  updateMusicButton();
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
  syncMusic();
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
