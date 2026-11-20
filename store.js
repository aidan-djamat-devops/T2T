// T2T data store.
// Two versions with the same functions:
//  - Supabase: shared online, used when config.js is filled in.
//  - Local: saved in this browser only (demo mode), seeded from content.js.

const DEFAULT_SETTINGS = {
  quote_mode: "daily",
  photo_mode: "daily",
  pinned_quote_id: null,
  pinned_photo_id: null,
  her_city: "Tally",
  her_timezone: "Europe/Amsterdam",
  reunion_date: null,
  footer_text: "thinking of you",
  music_mode: "playlist",
  music_song_id: null,
  music_volume: 25,
  hearts_per_day: 2,
};

const MAX_SONG_MB = 20;
function checkSong(file) {
  if (!file.type.startsWith("audio/")) throw new Error("That isn't an audio file — use an mp3.");
  if (file.size > MAX_SONG_MB * 1024 * 1024) throw new Error(`Song is too big (max ${MAX_SONG_MB} MB).`);
}

// Shrink big phone photos before saving (max 1600px, JPEG).
async function resizeImage(file, maxSize = 1600) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  } catch {
    return file; // format the browser can't decode (e.g. HEIC): keep the original
  }
}

function createSupabaseStore(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const publicUrl = (path, bucket = "photos") => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const check = ({ data, error }) => { if (error) throw error; return data; };

  return {
    mode: "supabase",
    needsLogin: true,

    async load() {
      const [quotes, photos, settings, songs, hearts] = await Promise.all([
        sb.from("quotes").select("*").order("created_at"),
        sb.from("photos").select("*").order("created_at"),
        sb.from("settings").select("*").eq("id", 1).maybeSingle(),
        sb.from("songs").select("*").order("created_at"),
        sb.from("heart_state").select("*").eq("id", 1).maybeSingle(),
      ]);
      // Songs are optional: if add-music.sql hasn't been run yet, the page still works.
      if (songs.error) console.warn("No songs table yet:", songs.error.message);
      if (hearts.error) console.warn("No hearts table yet:", hearts.error.message);
      return {
        quotes: check(quotes),
        photos: check(photos).map((p) => ({ ...p, url: publicUrl(p.path) })),
        songs: (songs.data || []).map((s) => ({ ...s, url: publicUrl(s.path, "music") })),
        settings: { ...DEFAULT_SETTINGS, ...(check(settings) || {}) },
        hearts: hearts.data || null,
      };
    },

    async isLoggedIn() {
      const { data } = await sb.auth.getSession();
      return !!data.session;
    },
    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email, password }));
    },
    async signOut() { await sb.auth.signOut(); },

    async addQuote(q) { check(await sb.from("quotes").insert(q)); },
    async deleteQuote(id) { check(await sb.from("quotes").delete().eq("id", id)); },

    async addPhoto(file, caption) {
      const blob = await resizeImage(file);
      const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "img");
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      check(await sb.storage.from("photos").upload(path, blob, { contentType: blob.type }));
      check(await sb.from("photos").insert({ path, caption }));
    },
    async updatePhoto(id, patch) { check(await sb.from("photos").update(patch).eq("id", id)); },
    async deletePhoto(photo) {
      check(await sb.from("photos").delete().eq("id", photo.id));
      await sb.storage.from("photos").remove([photo.path]);
    },

    async addSong(file, title) {
      checkSong(file);
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      check(await sb.storage.from("music").upload(path, file, { contentType: file.type }));
      check(await sb.from("songs").insert({ path, title }));
    },
    // The database decides what "today" is and refuses when the hearts are used up.
    async useHeart(quoteId, photoId) {
      return check(await sb.rpc("use_heart", { p_quote_id: quoteId, p_photo_id: photoId }));
    },

    // Give Tally her hearts back for today (keeps what she swapped to on screen).
    async resetHearts() {
      const rows = check(await sb.from("heart_state").update({ used: 0 }).eq("id", 1).select());
      if (!rows.length) throw new Error("Not allowed yet — run supabase/allow-heart-reset.sql first.");
    },

    async deleteSong(song) {
      check(await sb.from("songs").delete().eq("id", song.id));
      await sb.storage.from("music").remove([song.path]);
    },

    async saveSettings(patch) { check(await sb.from("settings").update(patch).eq("id", 1)); },
  };
}

function createLocalStore() {
  const KEY = "t2t-local-data";

  function seed() {
    let id = 1;
    const c = window.T2T_SETTINGS || {};
    return {
      quotes: [
        ...(window.T2T_QUOTES || []).map((q) => ({ id: id++, kind: "quote", author: null, ...q })),
        ...(window.T2T_FACTS || []).map((text) => ({ id: id++, kind: "fact", text, author: null })),
      ],
      photos: (window.T2T_PHOTOS || []).map((p) => ({ id: id++, url: "photos/" + p.file, caption: p.caption || null })),
      settings: {
        ...DEFAULT_SETTINGS,
        her_city: c.herCity || DEFAULT_SETTINGS.her_city,
        her_timezone: c.herTimezone || DEFAULT_SETTINGS.her_timezone,
        reunion_date: c.reunionDate || null,
      },
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return seed();
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      throw new Error("This browser's storage is full — try a smaller photo, or connect Supabase.");
    }
  }

  const newId = () => Date.now() + Math.floor(Math.random() * 1000);
  const update = (fn) => { const d = read(); fn(d); write(d); };

  return {
    mode: "local",
    needsLogin: false,

    async load() { return { songs: [], hearts: null, ...read() }; },
    async isLoggedIn() { return true; },
    async signIn() {},
    async signOut() {},

    async addQuote(q) { update((d) => d.quotes.push({ id: newId(), ...q })); },
    async deleteQuote(id) {
      update((d) => {
        d.quotes = d.quotes.filter((q) => q.id !== id);
        if (d.settings.pinned_quote_id === id) d.settings.pinned_quote_id = null;
      });
    },

    async addPhoto(file, caption) {
      const blob = await resizeImage(file, 1000);
      const url = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      update((d) => d.photos.push({ id: newId(), url, caption }));
    },
    async updatePhoto(id, patch) {
      update((d) => Object.assign(d.photos.find((p) => p.id === id) || {}, patch));
    },
    async deletePhoto(photo) {
      update((d) => {
        d.photos = d.photos.filter((p) => p.id !== photo.id);
        if (d.settings.pinned_photo_id === photo.id) d.settings.pinned_photo_id = null;
      });
    },

    async useHeart(quoteId, photoId, today) {
      let result;
      update((d) => {
        const h = d.hearts && d.hearts.day === today ? d.hearts : { day: today, used: 0 };
        if (h.used >= (d.settings.hearts_per_day || 2)) throw new Error("No hearts left today");
        d.hearts = { day: today, used: h.used + 1, quote_id: quoteId, photo_id: photoId, set_at: new Date().toISOString() };
        result = d.hearts;
      });
      return result;
    },

    async resetHearts() {
      update((d) => { if (d.hearts) d.hearts.used = 0; });
    },

    async addSong() {
      throw new Error("Music needs Supabase — songs are too big to store in the browser.");
    },
    async deleteSong() {},

    async saveSettings(patch) { update((d) => Object.assign(d.settings, patch)); },
  };
}

window.T2T_STORE = (() => {
  const cfg = window.T2T_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) return createSupabaseStore(cfg);
  return createLocalStore();
})();
