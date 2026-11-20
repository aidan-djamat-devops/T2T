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
};

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
  const publicUrl = (path) => sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
  const check = ({ data, error }) => { if (error) throw error; return data; };

  return {
    mode: "supabase",
    needsLogin: true,

    async load() {
      const [quotes, photos, settings] = await Promise.all([
        sb.from("quotes").select("*").order("created_at"),
        sb.from("photos").select("*").order("created_at"),
        sb.from("settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      return {
        quotes: check(quotes),
        photos: check(photos).map((p) => ({ ...p, url: publicUrl(p.path) })),
        settings: { ...DEFAULT_SETTINGS, ...(check(settings) || {}) },
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

    async load() { return read(); },
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

    async saveSettings(patch) { update((d) => Object.assign(d.settings, patch)); },
  };
}

window.T2T_STORE = (() => {
  const cfg = window.T2T_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) return createSupabaseStore(cfg);
  return createLocalStore();
})();
