# BrowserSkill with Cloudflare Clef AI & Account Pooling for DeepSeek Harness ⚡

Enhancement for `@wxg-prc-cpg/browser-skill-dsh-plugin` in **DeepSeek Harness (DSH)**, powered by **Cloudflare Clef Decision Models** (`clef-omni`, `clef-flash`, `clef`), **Multi-Account Failover Pooling**, and an **Autonomous Ultrafast Local Loop** inspired by [`browser-use/jev-ultrafast`](https://github.com/browser-use/jev-ultrafast).

---

## 🚀 Key Highlights

* **50× Faster Browser Automation (<5s vs ~4 min):** Replaces repetitive multi-turn LLM chat round-trips with local autonomous execution and single-roundtrip speculative action heads.
* **Cloudflare Clef Decision Models:**
  * `@cf/cloudflare/clef-omni` (Recommended): Full multimodal decision model with visual comprehension.
  * `@cf/cloudflare/clef-flash`: Ultra-fast, lowest latency (~150ms).
  * `@cf/cloudflare/clef`: Standard 27B multimodal decision model.
  * **$0 Output Tokens:** Clef models do not charge for output tokens!
* **Multi-Account Pooling & Failover:**
  * Pool multiple Cloudflare Workers AI accounts.
  * **Auto-Cooldown on HTTP 429:** When an account hits a burst rate limit, it cools down for 60s while the request instantly fails over to the next available account.
  * **Daily Quota Guard:** Automatically fails over when an account exhausts its free tier quota.
* **Interactive Settings UI in DSH:**
  * Directly integrated into DeepSeek Harness Settings (`Settings → Browser & Clef AI`).
  * Live **⚡ Test & Validate** button with real-time latency diagnostics.
  * Manage model selection and account credentials visually.

---

### ⚡ DSH Tool: `browser_clef`
Directly available to AI agents in DeepSeek Harness conversations:
- **`browser_clef({ action: "goal", goal: "...", url: "..." })`**: Autonomous goal loop with Cloudflare Clef.
- **`browser_clef({ action: "triage" })`**: <200ms page structure classification and next-step recommendation.
- **`browser_clef({ action: "status" })`**: Real-time pool status, cooldowns, and request counts.
- **`browser_clef({ action: "inspect_instagram", username: "..." })`**: Instant Instagram profile engagement and content analysis.

## 🛠️ Architecture: Reflex & Cortex

```
┌─────────────────────────────────────────────────────────────┐
│                 REFLEX ENGINE (Cloudflare Clef)             │
│        Sub-second state triage, routing, and selection      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Trigger: Text Input / Deep Logic
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 CORTEX ENGINE (Primary Agent)               │
│          Form typing (polished, no slop) & synthesis        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation & Setup

### Option 1: Link in DeepSeek Harness Profile

1. Clone this repository into your workspace:
   ```bash
   git clone https://github.com/nanangkurnim-svg/dsh-plugin-browserskill-clef.git
   ```

2. In your DSH profile (`~/.dsh/profiles/desktop/package.json`), link the plugin:
   ```json
   {
     "dependencies": {
       "@wxg-prc-cpg/browser-skill-dsh-plugin": "link:C:/path/to/dsh-plugin-browserskill-clef"
     }
   }
   ```

3. In `~/.dsh/profiles/desktop/cordis.patch.yml`, configure the plugin:
   ```yaml
   - id: browserskill
     config:
       bskPath: 'C:\Users\<username>\.local\bin\bsk.exe'  # Path to bsk binary
       enableClef: true
       clefModel: 'clef-omni'  # 'clef-omni' | 'clef-flash' | 'clef'
       cloudflareAccounts:
         - label: 'Primary Account'
           accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID'
           apiToken: 'YOUR_CLOUDFLARE_API_TOKEN'
           enabled: true
         - label: 'Backup Account'
           accountId: 'BACKUP_ACCOUNT_ID'
           apiToken: 'BACKUP_API_TOKEN'
           enabled: true
   ```

4. Restart or refresh DeepSeek Harness (`Ctrl + R`).

---

### Option 2: Standalone Autonomous CLI Runner

You can also run ultrafast browser tasks directly from the command line:

1. Copy `runner/config.example.json` to `runner/config.json` and fill in your Cloudflare credentials:
   ```json
   {
     "defaultModel": "clef-omni",
     "accounts": [
       {
         "label": "Primary Account",
         "accountId": "YOUR_CLOUDFLARE_ACCOUNT_ID",
         "apiToken": "YOUR_CLOUDFLARE_API_TOKEN",
         "enabled": true
       }
     ]
   }
   ```
   *(Alternatively, export `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables).*

2. Run an Instagram Engagement Rate analysis:
   ```bash
   node runner/ultrafast-agent.mjs instagram megaring.id 15 clef-omni
   ```

3. Run a general goal-directed agent loop:
   ```bash
   node runner/ultrafast-agent.mjs goal "https://news.ycombinator.com" "Find cybersecurity vulnerability articles"
   ```

---

## 🔒 Security & Privacy

* **Zero-Secret Commitment:** No API tokens, keys, or credentials are hardcoded or tracked in git.
* All credentials entered via DSH Settings are stored locally in your active profile configuration (`cordis.patch.yml`) or encrypted browser storage.
* Local CORS proxy protects sensitive API requests from browser cross-origin exposure.

---

## 📄 License

MIT License. Built on top of BrowserSkill and DeepSeek Harness open architecture.
