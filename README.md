# Connect Tempo to Garmin — step by step (no coding)

This folder **is** the backend. You don't edit any code — you just put this
folder online once. Plan ~20–30 minutes the first time. When you're done,
Tempo signs into Garmin and syncs by itself.

You'll create 3 free things: a **GitHub** account (to hold the files), a
**Render** account (to run them), and you'll need your **Anthropic API key**
(for the AI). Have your Garmin login handy too.

---

## Step 1 — Get your Anthropic API key
1. Go to **console.anthropic.com** → sign in → **API Keys**.
2. **Create Key**, copy it (starts with `sk-ant-`). Paste it somewhere safe for a minute.

## Step 2 — Put this folder on GitHub (no git needed)
1. Go to **github.com**, sign up / sign in.
2. Click **New repository** → name it `tempo-backend` → **Create repository**.
3. **First, rename one file:** on your computer, change **`server.mjs.txt`** to
   **`server.mjs`** (just remove the `.txt`). It was shipped as `.txt` only so it
   could ride along in the download — Node needs it named `server.mjs`.
4. On the new repo page click **“uploading an existing file”**.
5. Open this `tempo-backend` folder and **drag in**:
   `package.json`, `server.mjs`, `render.yaml`, `.env.example`, `.gitignore`,
   and this `README.md`. (Don't upload a `.env` or `garmin-token.json` — there shouldn't be any.)
6. Click **Commit changes**.

## Step 3 — Deploy on Render
1. Go to **render.com**, sign up (use “Sign in with GitHub” — easiest).
2. Click **New +** → **Blueprint**.
3. Pick your `tempo-backend` repo. Render reads `render.yaml` and fills in the setup.
4. It will ask for the secret values. Set:
   - **ANTHROPIC_API_KEY** = the key from Step 1
   - **PUBLIC_URL** = leave blank for now (you'll set it in Step 4)
5. Click **Apply / Create**. Wait for it to say **Live** (a few minutes).
6. Copy your service URL at the top — it looks like
   `https://tempo-backend-xxxx.onrender.com`.

## Step 4 — Tell the backend its own address
1. In Render → your service → **Environment**.
2. Set **PUBLIC_URL** to the URL you copied (e.g. `https://tempo-backend-xxxx.onrender.com`).
3. **Save changes** → it redeploys. Wait for **Live** again.
4. Quick test: open `https://YOUR-URL/api/health` in a browser — you should see `{"ok":true}`.

## Step 5 — Connect it in Tempo
1. Open Tempo → **Connect** (sidebar) → **Connect backend**.
2. Paste your Render URL → **Save**. You'll see “Backend connected.”
3. Tap **Sign in with Garmin**. A tab opens to *your* `/connect` page.
4. Enter your **Garmin email + password** there once (and a 2-factor code if you use one).
   → You see ✅ Connected. Your password is used only on that page and never stored — only a revocable token is kept.
5. Back in Tempo it flips to **Garmin connected**. Tap **Sync now** anytime to pull your runs, and chat is live everywhere.

---

## Good to know
- **Free tier sleeps.** Render's free service spins down when idle; the first
  request after a nap is slow (~30s), then fast. It may also forget the Garmin
  token on a cold start — if so, just tap **Sign in with Garmin** again. To make
  it permanent, upgrade the Render instance (or add a persistent disk and set
  `TOKEN_FILE` to a path on it).
- **Two-factor (MFA):** enter the code on the `/connect` page. If Garmin blocks
  the login, temporarily disabling MFA for setup is the simplest fix.
- **Model name:** if the AI errors, your Anthropic account may use a different
  model id — set the `MODEL` env var in Render to one your account supports.
- **Garmin changes:** third-party Garmin login occasionally breaks when Garmin
  updates their site; the `garmin-connect` package usually ships a fix. The
  file-import path in Tempo always works as a fallback.
- **Keep your URL private.** Anyone with it could read your data. For more
  safety, change `ALLOWED_ORIGIN` from `*` to your app's address later.

## Stuck?
Hand this whole folder plus `../BACKEND-SETUP.md` to a developer or to Claude
Code — it's a complete, runnable spec and a 10-minute job for someone technical.
