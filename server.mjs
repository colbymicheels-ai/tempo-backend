/* ============================================================================
   TEMPO BACKEND  —  the server that makes the app work "normally"
   ----------------------------------------------------------------------------
   Two jobs, both kept OFF your phone/app where secrets aren't safe:
     • POST /api/coach            -> proxies chat to Claude with YOUR key
     • Garmin connect + sync      -> you sign in once here; we store a TOKEN only

   You do NOT need to edit this file. Just deploy it and set the environment
   variables (see README.md / .env.example). Plain Node — no build step.
   ============================================================================ */
import express from "express";
import cors from "cors";
import fs from "fs";
import { GarminConnect } from "garmin-connect";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));

const MODEL = process.env.MODEL || "claude-haiku-4-5";       // change if your account uses another id
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
const TOKEN_FILE = process.env.TOKEN_FILE || "./garmin-token.json";

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* -------------------------------------------------------------------------
   1) Claude proxy. The app sends { messages:[{role,content}...] }. The first
   user message carries Tempo's persona + your data context — we pass it as the
   system prompt. Returns { text }.
   ------------------------------------------------------------------------- */
app.post("/api/coach", async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
    const incoming = (req.body && req.body.messages) || [];
    let system = "You are Tempo, an expert AI running coach.";
    const msgs = incoming.slice();
    if (msgs.length && msgs[0].role === "user") system = msgs.shift().content;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: msgs.length ? msgs : [{ role: "user", content: "Hello" }],
      }),
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message || "anthropic error" });
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* -------------------------------------------------------------------------
   2) Garmin: token-based. You sign in ONCE on /connect (this server, HTTPS).
   We exchange it for a token, store the TOKEN only, and never keep the
   password. The app just calls auth/start, status, disconnect, sync.

   Note: method names in the `garmin-connect` package can vary slightly by
   version. If a call fails, check that package's README and adjust.
   ------------------------------------------------------------------------- */
function hasToken() { try { return fs.existsSync(TOKEN_FILE); } catch { return false; } }

// Durable fallback: if you set GARMIN_TOKEN (the JSON from the local script) as
// an env var, write it to the token file on boot. Survives Render's disk wipes.
try {
  if (process.env.GARMIN_TOKEN && !hasToken()) {
    fs.writeFileSync(TOKEN_FILE, process.env.GARMIN_TOKEN);
    console.log("Loaded Garmin token from GARMIN_TOKEN env var.");
  }
} catch (e) { console.log("GARMIN_TOKEN load skipped:", String(e)); }

async function clientFromToken() {
  const tok = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  const gc = new GarminConnect({ username: "", password: "" });
  await gc.loadToken(tok.oauth1, tok.oauth2);   // token only — no password
  return gc;
}

// The app opens this URL; it points at our own secure one-time login page.
app.post("/api/garmin/auth/start", (_req, res) => {
  res.json({ authUrl: (PUBLIC_URL || "") + "/connect" });
});

app.get("/api/garmin/status", (_req, res) => res.json({ connected: hasToken() }));

app.post("/api/garmin/disconnect", (_req, res) => {
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
  res.json({ ok: true });
});

// One-time login page, served by YOUR server over HTTPS.
app.get("/connect", (_req, res) => {
  res.set("content-type", "text/html").send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;max-width:420px;margin:48px auto;padding:0 18px;color:#111">
  <h2 style="margin-bottom:4px">Connect Garmin</h2>
  <p style="color:#555;line-height:1.5">Sign in once. This server stores only a revocable token — never your password. Tempo never sees either.</p>
  <form method="post" action="/connect">
    <input name="email" type="email" placeholder="Garmin email" required style="width:100%;padding:11px;margin:6px 0;box-sizing:border-box">
    <input name="password" type="password" placeholder="Garmin password" required style="width:100%;padding:11px;margin:6px 0;box-sizing:border-box">
    <input name="mfa" placeholder="2-factor code (only if you use one)" style="width:100%;padding:11px;margin:6px 0;box-sizing:border-box">
    <button style="width:100%;padding:13px;margin-top:8px;background:#111;color:#fff;border:0;border-radius:8px;font-size:15px">Connect</button>
  </form>
</body>`);
});

app.post("/connect", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const gc = new GarminConnect({ username: req.body.email, password: req.body.password });
    await gc.login();                                  // password used here, then dropped
    const tok = await gc.exportToken();                // { oauth1, oauth2 }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok));  // store TOKEN only
    res.send(`<body style="font-family:system-ui;text-align:center;margin-top:64px;color:#111">
      <div style="font-size:40px">✅</div>
      <h2>Connected</h2>
      <p style="color:#555">Return to Tempo — it detects this automatically. You can close this tab.</p>
    </body>`);
  } catch (e) {
    res.status(401).send(`<body style="font-family:system-ui;text-align:center;margin-top:64px;color:#111">
      <h2>Couldn't sign in</h2>
      <p style="color:#a00">${String(e)}</p>
      <p>If this says <b>429 / Rate limited</b>, sign in from your own computer instead with the
      token method — see <a href="/connect-token">paste a token</a>.</p>
      <p><a href="/connect">Try again</a></p>
    </body>`);
  }
});

/* -------- token paste (the rate-limit-proof path) -------------------------
   Garmin throttles logins from cloud IPs (429). To avoid it, run the small
   get-garmin-token script ON YOUR OWN COMPUTER once (home IP isn't throttled),
   copy the token JSON it prints, and paste it here. The server then uses the
   token and never logs in itself. */
app.get("/connect-token", (_req, res) => {
  res.set("content-type", "text/html").send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;max-width:480px;margin:48px auto;padding:0 18px;color:#111">
  <h2 style="margin-bottom:4px">Paste your Garmin token</h2>
  <p style="color:#555;line-height:1.5">Run the <b>get-garmin-token</b> script on your computer (see the backend README). It prints a block of text starting with <code>{"oauth1"</code>. Paste the whole thing below.</p>
  <form method="post" action="/connect-token">
    <textarea name="token" required placeholder='{"oauth1":{...},"oauth2":{...}}' style="width:100%;height:160px;padding:11px;box-sizing:border-box;font-family:monospace;font-size:12px"></textarea>
    <button style="width:100%;padding:13px;margin-top:8px;background:#111;color:#fff;border:0;border-radius:8px;font-size:15px">Save token</button>
  </form>
</body>`);
});

app.post("/connect-token", express.urlencoded({ extended: true, limit: "1mb" }), (req, res) => {
  try {
    const raw = (req.body.token || "").trim();
    const tok = JSON.parse(raw);                        // validate it's JSON
    if (!tok.oauth1 || !tok.oauth2) throw new Error("Token is missing oauth1/oauth2 — copy the whole printed block.");
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tok));
    res.send(`<body style="font-family:system-ui;text-align:center;margin-top:64px;color:#111">
      <div style="font-size:40px">✅</div>
      <h2>Token saved</h2>
      <p style="color:#555">Return to Tempo and tap <b>Sync now</b>. You can close this tab.</p>
    </body>`);
  } catch (e) {
    res.status(400).send(`<body style="font-family:system-ui;text-align:center;margin-top:64px;color:#111">
      <h2>That didn't look right</h2>
      <p style="color:#a00">${String(e)}</p>
      <p><a href="/connect-token">Try again</a></p>
    </body>`);
  }
});

/* -------- pull your data as a bundle the app's adapter understands -------- */
const safe = async (fn) => { try { return await fn(); } catch { return undefined; } };

app.get("/api/garmin/sync", async (_req, res) => {
  try {
    if (!hasToken()) return res.status(401).json({ error: "not connected" });
    const g = await clientFromToken();
    const today = new Date().toISOString().slice(0, 10);
    const activities = await safe(() => g.getActivities(0, 10));
    const bundle = {
      userProfile: await safe(() => g.getUserProfile()),
      activities: activities || [],
      sleep: await safe(() => g.getSleepData(today)),
      hrv: await safe(() => g.getHeartRateVariability && g.getHeartRateVariability(today)),
      userSummary: await safe(() => g.getUserSummary && g.getUserSummary(today)),
      goal: { label: "Sub-22:00 5K", target: "21:55", goalPace: "4:23", weeksOut: 10 },
    };
    res.json(bundle);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log("Tempo backend listening on :" + port));
