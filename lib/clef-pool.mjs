import fs from 'node:fs';
import path from 'node:path';

export class ClefAccountPool {
  constructor(accounts = [], defaultModel = 'clef-omni') {
    this.defaultModel = defaultModel || 'clef-omni';
    this.accounts = [];
    this.updateConfig(accounts, defaultModel);
  }

  updateConfig(accounts = [], defaultModel) {
    if (defaultModel) this.defaultModel = defaultModel;
    if (!accounts || accounts.length === 0) {
      accounts = ClefAccountPool.loadDefaultAccounts();
    }
    const now = Date.now();
    const updated = [];

    for (const a of accounts) {
      if (!a.accountId || !a.apiToken) continue;
      const existing = this.accounts.find(ex => ex.accountId === a.accountId);
      updated.push({
        label: a.label || `Account (${a.accountId.slice(0, 6)})`,
        accountId: a.accountId.trim(),
        apiToken: a.apiToken.trim(),
        enabled: a.enabled !== false,
        coolingUntil: existing?.coolingUntil || 0,
        dailyExhaustedUntil: existing?.dailyExhaustedUntil || 0,
        lastLatencyMs: existing?.lastLatencyMs || null,
        lastError: existing?.lastError || null,
        totalRequests: existing?.totalRequests || 0,
        totalTokens: existing?.totalTokens || 0,
      });
    }
    this.accounts = updated;
  }

  getStatus() {
    const now = Date.now();
    return this.accounts.map(a => {
      let state = 'ready';
      if (!a.enabled) state = 'disabled';
      else if (now < a.dailyExhaustedUntil) state = 'quota_exhausted';
      else if (now < a.coolingUntil) state = 'cooling_down';

      return {
        label: a.label,
        accountId: a.accountId ? `${a.accountId.slice(0, 6)}...${a.accountId.slice(-4)}` : '',
        state,
        lastLatencyMs: a.lastLatencyMs,
        lastError: a.lastError,
        coolingRemainingSeconds: Math.max(0, Math.ceil((a.coolingUntil - now) / 1000)),
        totalRequests: a.totalRequests,
        totalTokens: a.totalTokens,
      };
    });
  }

  static loadDefaultAccounts() {
    const list = [];
    try {
      const p1 = 'C:\\Users\\marse\\DeepSeek-Harness\\_tooling\\cf-clef\\config.json';
      if (fs.existsSync(p1)) {
        const c1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
        if (c1.accountId && c1.apiToken) {
          list.push({
            label: 'Account Utama (config)',
            accountId: c1.accountId.trim(),
            apiToken: c1.apiToken.trim(),
            enabled: true
          });
        }
      }
    } catch {}

    try {
      const home = process.env.USERPROFILE || 'C:\\Users\\marse';
      const pPatch = path.join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
      if (fs.existsSync(pPatch)) {
        const text = fs.readFileSync(pPatch, 'utf8');
        const m = text.match(/cloudflareAccounts:\s*([\s\S]*?)(?=\n\s*-\s*id:|\n\s*disabled:|\n*$)/);
        if (m) {
          const accBlock = m[1];
          const accRegex = /-\s*label:\s*["']?([^"'\r\n]+)["']?\s*\n\s*accountId:\s*["']?([^"'\r\n]+)["']?\s*\n\s*apiToken:\s*["']?([^"'\r\n]+)["']?(?:\s*\n\s*enabled:\s*(true|false))?/g;
          let match;
          while ((match = accRegex.exec(accBlock)) !== null) {
            const [, label, accountId, apiToken, enabledStr] = match;
            if (accountId && apiToken && !list.some(x => x.accountId === accountId.trim())) {
              list.push({
                label: label.trim(),
                accountId: accountId.trim(),
                apiToken: apiToken.trim(),
                enabled: enabledStr !== 'false'
              });
            }
          }
        }
      }
    } catch {}

    return list;
  }

  static normalizeModel(model) {
    let clean = (model || 'clef-omni').toLowerCase().trim();
    if (clean.includes('/')) {
      clean = clean.split('/').pop();
    }
    const endpoint = `@cf/cloudflare/${clean}`;
    return { shortName: clean, endpoint };
  }

  async validateAccount(account, targetModel = this.defaultModel) {
    const { shortName, endpoint } = ClefAccountPool.normalizeModel(targetModel);
    const start = Date.now();

    const payload = {
      model: shortName,
      state: 'Clef account validation check.',
      questions: {
        status: {
          type: 'choice',
          instructions: 'Is system operational?',
          criteria: {
            operational: 'System operational',
            degraded: 'System degraded',
          },
        },
      },
    };

    const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${endpoint}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const latencyMs = Date.now() - start;
      const data = await res.json();

      if (!res.ok || !data.success) {
        const errMsg = data.errors?.[0]?.message || `HTTP ${res.status}`;
        return {
          ok: false,
          statusCode: res.status,
          latencyMs,
          error: errMsg,
        };
      }

      return {
        ok: true,
        statusCode: 200,
        latencyMs,
        model: shortName,
        endpoint,
        usage: data.result?.usage || {},
      };
    } catch (err) {
      return {
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  async askClef({ state, questions, images = [], model = this.defaultModel }) {
    if (this.accounts.length === 0) {
      throw new Error('ClefAccountPool: No Cloudflare accounts configured in pool.');
    }

    const { shortName, endpoint } = ClefAccountPool.normalizeModel(model);

    // Format images if any
    const formattedImages = [];
    for (const img of images) {
      if (typeof img === 'string') {
        if (img.startsWith('data:image/')) {
          formattedImages.push(img);
        } else if (fs.existsSync(img)) {
          const ext = path.extname(img).toLowerCase().replace('.', '') || 'png';
          const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          const b64 = fs.readFileSync(img).toString('base64');
          formattedImages.push(`data:${mime};base64,${b64}`);
        }
      } else if (img && typeof img === 'object' && img.base64 && img.content_type) {
        formattedImages.push(img);
      }
    }

    const payload = {
      model: shortName,
      state: typeof state === 'string' ? state : JSON.stringify(state),
      questions,
    };
    if (formattedImages.length > 0) {
      payload.images = formattedImages;
    }
    const bodyStr = JSON.stringify(payload);

    const now = Date.now();
    // Sort candidate accounts: active and ready first
    const candidates = this.accounts.filter(a => a.enabled && now >= a.dailyExhaustedUntil && now >= a.coolingUntil);

    if (candidates.length === 0) {
      // Check if some accounts are just temporarily cooling down
      const coolingAccounts = this.accounts.filter(a => a.enabled && now >= a.dailyExhaustedUntil);
      if (coolingAccounts.length > 0) {
        coolingAccounts.sort((a, b) => a.coolingUntil - b.coolingUntil);
        const waitMs = Math.max(100, coolingAccounts[0].coolingUntil - now);
        console.warn(`[ClefPool] All accounts cooling down. Waiting ${Math.ceil(waitMs / 1000)}s for account "${coolingAccounts[0].label}"...`);
        await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)));
        candidates.push(coolingAccounts[0]);
      } else {
        throw new Error('ClefAccountPool: All accounts in pool are quota exhausted or disabled.');
      }
    }

    const errors = [];

    for (const account of candidates) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${endpoint}`;
      const start = Date.now();

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        const latencyMs = Date.now() - start;
        account.lastLatencyMs = latencyMs;
        account.totalRequests++;

        const data = await res.json();

        // 1. Check Rate Limit (HTTP 429)
        if (res.status === 429) {
          account.coolingUntil = Date.now() + 60 * 1000; // 60s cooldown
          account.lastError = 'Rate limited (429)';
          console.warn(`[ClefPool] Account "${account.label}" hit rate limit (429). Cooldown 60s. Failing over to next account...`);
          errors.push({ account: account.label, error: 'Rate limit (429)' });
          continue;
        }

        // 2. Check Quota Exhaustion (5035 / 402 / payment required / limit reached)
        const errMsg = data.errors?.[0]?.message || '';
        if (
          res.status === 402 ||
          data.errors?.[0]?.code === 5035 ||
          errMsg.toLowerCase().includes('quota') ||
          errMsg.toLowerCase().includes('limit') ||
          errMsg.toLowerCase().includes('free plan')
        ) {
          account.dailyExhaustedUntil = Date.now() + 12 * 3600 * 1000; // 12h cooldown
          account.lastError = `Quota exhausted: ${errMsg}`;
          console.warn(`[ClefPool] Account "${account.label}" quota exhausted: ${errMsg}. Failing over to next account...`);
          errors.push({ account: account.label, error: errMsg });
          continue;
        }

        if (!res.ok || !data.success) {
          account.lastError = errMsg || `HTTP ${res.status}`;
          console.warn(`[ClefPool] Account "${account.label}" API error: ${account.lastError}`);
          errors.push({ account: account.label, error: account.lastError });
          continue;
        }

        // Success!
        account.lastError = null;
        if (data.result?.usage?.input_tokens) {
          account.totalTokens += data.result.usage.input_tokens;
        }

        return {
          ...data.result,
          _accountUsed: account.label,
          _latencyMs: latencyMs,
        };
      } catch (networkErr) {
        account.lastError = networkErr.message;
        errors.push({ account: account.label, error: networkErr.message });
        console.warn(`[ClefPool] Account "${account.label}" network exception: ${networkErr.message}. Trying next account...`);
      }
    }

    throw new Error(`ClefAccountPool: All available accounts failed. Details: ${JSON.stringify(errors)}`);
  }
}
