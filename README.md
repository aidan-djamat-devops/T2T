# T2T — Taipei to Tally 💌

A tiny page for an open background tab: a quote or fun fact, a photo, both clocks and an optional countdown until you meet again.

There's a profile switcher in the top-right corner:

- **Tally**: the page she keeps open.
- **Aidan** (admin, needs your login): add and delete quotes and facts, upload photos, pick exactly which quote or photo she sees, choose how often they change (only the selected one / shuffle / every hour / every day), and set her timezone and the date you'll meet.

Plain HTML, CSS and JavaScript, with [Supabase](https://supabase.com) (free) storing the data online so your changes in Taipei reach her laptop.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css` | The page |
| `app.js` | Profiles, Tally's view, the admin panel |
| `store.js` | Saving and loading (Supabase, or local demo mode) |
| `config.js` | Your Supabase URL and key |
| `content.js` | Starter content for demo mode only |
| `supabase/setup.sql` | Creates the database tables and security rules |

## Demo mode

While `config.js` is empty, everything is saved in your own browser only. That's good for trying it out, but Tally won't see the changes.

## Connect Supabase (about 10 minutes)

1. Make a free account at supabase.com and create a new project (choose a region close to her, e.g. Frankfurt).
2. **SQL Editor** → New query → paste all of `supabase/setup.sql` → **Run**.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Only you should have an account.
4. **Authentication → Users → Add user → Create new user**: your email and a password, with "Auto confirm user" ticked. That's your Aidan login.
5. **Project Settings → API**: copy the Project URL and the `anon` `public` key into `config.js`.

Then open the page, switch to **Aidan**, and sign in.

The anon key is supposed to be public. The rules in `setup.sql` let everyone *read* but only a signed-in user *change* anything, and since sign-ups are off, that's only you.

## Run locally

Double-click `index.html`, or run `python -m http.server` in this folder and open http://localhost:8000.

## Put it online (free) with GitHub Pages

1. Create a GitHub repo (e.g. `t2t`) and push these files.
2. Repo → Settings → Pages → Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. After a minute it's live at `https://<your-username>.github.io/t2t/`.

Send her that link. Her page checks for your changes every 2 minutes and whenever she switches back to the tab.

> Photos uploaded through the admin panel live in Supabase, not in the repo. Anyone who has the link can see the page and its photos.
