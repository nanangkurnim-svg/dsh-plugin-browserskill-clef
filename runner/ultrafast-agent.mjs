#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ClefAccountPool } from '../lib/clef-pool.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find bsk executable (checks PATH, ~/.local/bin/bsk, or custom env BSK_PATH)
function resolveBskPath() {
  if (process.env.BSK_PATH && fs.existsSync(process.env.BSK_PATH)) {
    return process.env.BSK_PATH;
  }
  const homeBsk = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'bsk.exe' : 'bsk');
  if (fs.existsSync(homeBsk)) {
    return homeBsk;
  }
  return 'bsk';
}

const BSK_PATH = resolveBskPath();
const SNAPSHOT_JS = fs.readFileSync(path.join(__dirname, 'snapshot.js'), 'utf8');

// Load accounts from config.json or environment variables
let defaultAccounts = [];
const cfgPath = path.join(__dirname, 'config.json');
if (fs.existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Array.isArray(cfg.accounts)) {
      defaultAccounts = cfg.accounts;
    } else if (cfg.accountId && cfg.apiToken) {
      defaultAccounts.push({
        label: 'Default Account',
        accountId: cfg.accountId,
        apiToken: cfg.apiToken,
        enabled: true,
      });
    }
  } catch {}
}

if (defaultAccounts.length === 0 && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
  defaultAccounts.push({
    label: 'Env Account',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    enabled: true,
  });
}

export const globalClefPool = new ClefAccountPool(defaultAccounts, 'clef-omni');

export class BskDriver {
  constructor() {
    this.sessionId = null;
  }

  run(args) {
    const res = spawnSync(BSK_PATH, [...args, '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error) throw res.error;
    const stdout = res.stdout.trim();
    if (!stdout) return null;
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout;
    }
  }

  startSession() {
    const out = this.run(['session', 'start']);
    this.sessionId = typeof out === 'object' && out ? out.session_id : null;
    return this.sessionId;
  }

  stopSession() {
    if (this.sessionId) {
      this.run(['session', 'stop', this.sessionId]);
      this.sessionId = null;
    }
  }

  navigate(url) {
    return this.run(['navigate', '--session', this.sessionId, url]);
  }

  evaluate(expression) {
    const out = this.run(['evaluate', '--session', this.sessionId, expression]);
    return out?.value ?? out;
  }

  click(target, isSelector = false) {
    const args = ['click', '--session', this.sessionId];
    if (isSelector) args.push('--selector', target);
    else args.push(target);
    return this.run(args);
  }

  hover(target, isSelector = false) {
    const args = ['hover', '--session', this.sessionId];
    if (isSelector) args.push('--selector', target);
    else args.push(target);
    return this.run(args);
  }

  fill(target, value) {
    return this.run(['fill', '--session', this.sessionId, target, value]);
  }

  getSnapshot() {
    return this.evaluate(SNAPSHOT_JS);
  }
}

function parseCount(str) {
  if (!str) return 0;
  const clean = str.replace(/,/g, '').trim().toUpperCase();
  if (clean.endsWith('K')) {
    return Math.round(parseFloat(clean) * 1000);
  }
  if (clean.endsWith('M')) {
    return Math.round(parseFloat(clean) * 1000000);
  }
  return parseInt(clean, 10) || 0;
}

/**
 * Ultra-Fast Autonomous Instagram Engagement Inspector
 */
export async function fastInspectInstagram(driver, usernameOrUrl, targetCount = 10, model = 'clef-omni') {
  const cleanUsername = usernameOrUrl.replace(/^@/, '').replace(/\/$/, '').split('/').pop();
  const url = usernameOrUrl.startsWith('http')
    ? usernameOrUrl
    : `https://www.instagram.com/${cleanUsername}/`;

  console.log(`[Fast-IG] Navigating to ${url}...`);
  driver.navigate(url);

  const initScript = `
    (async () => {
      const target = ${targetCount};
      for (let i = 0; i < 40; i++) {
        if (document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length > 0) break;
        await new Promise(r => setTimeout(r, 100));
      }

      let lastCount = 0;
      let noChange = 0;
      while (document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length < target && noChange < 5) {
        window.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 300));
        const currentCount = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').length;
        if (currentCount === lastCount) {
          noChange++;
        } else {
          noChange = 0;
          lastCount = currentCount;
        }
      }

      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 100));

      let followers = '';
      let postsCount = '';
      for (const a of document.querySelectorAll('header a, header span, main span')) {
        const txt = a.innerText.trim();
        if (txt.includes('followers')) followers = txt.split(' ')[0];
        if (txt.includes('posts')) postsCount = txt.split(' ')[0];
      }

      const links = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')).slice(0, target);
      return {
        followers,
        postsCount,
        count: links.length,
        items: links.map((a, i) => ({
          index: i + 1,
          href: a.getAttribute('href'),
          caption: (a.querySelector('img')?.getAttribute('alt') || '').slice(0, 80).replace(/\\n/g, ' '),
          isClip: !!a.querySelector('svg[aria-label="Clip"]')
        }))
      };
    })()
  `;

  const meta = driver.evaluate(initScript);
  if (!meta || !meta.items || meta.items.length === 0) {
    throw new Error(`Failed to load Instagram post cards for ${cleanUsername}`);
  }

  console.log(`[Fast-IG] Found ${meta.items.length}/${targetCount} posts. Followers: ${meta.followers}. Hovering locally...`);

  const postMetrics = [];
  for (let i = 0; i < meta.items.length; i++) {
    const item = meta.items[i];
    const selector = `a[href="${item.href}"]`;

    driver.evaluate(`
      (() => {
        const el = document.querySelector('a[href="${item.href}"]');
        if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()
    `);

    driver.hover(selector, true);

    const readScript = `
      (() => {
        const a = document.querySelector('a[href="${item.href}"]');
        if (!a) return null;
        return a.innerText.trim().replace(/\\n/g, ' ');
      })()
    `;
    const text = driver.evaluate(readScript) || '';

    let likes = 0;
    let comments = 0;
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      likes = parseCount(parts[0]);
      comments = parseCount(parts[1]);
    } else if (parts.length === 1) {
      likes = parseCount(parts[0]);
    }

    postMetrics.push({
      ...item,
      rawHoverText: text,
      likes,
      comments,
      totalEngagements: likes + comments,
    });
  }

  const followerCount = parseCount(meta.followers);
  const totalLikes = postMetrics.reduce((sum, p) => sum + p.likes, 0);
  const totalComments = postMetrics.reduce((sum, p) => sum + p.comments, 0);
  const totalEngagements = totalLikes + totalComments;
  const avgEngagement = totalEngagements / postMetrics.length;
  const engagementRate = followerCount > 0 ? (avgEngagement / followerCount) * 100 : 0;

  let tokenUsage = { input_tokens: 0, output_tokens: 0, model };
  let clefAnalysisResult = null;

  try {
    const sampleCaptions = postMetrics.slice(0, 5).map(p => p.caption).filter(Boolean);
    const clefRes = await globalClefPool.askClef({
      model,
      state: `Instagram Account: @${cleanUsername}
Followers: ${meta.followers} (${followerCount})
Total Account Posts: ${meta.postsCount}
Sample Recent Captions:
${sampleCaptions.map((c, i) => `${i+1}. ${c}`).join('\n')}`,
      questions: {
        category: {
          type: 'choice',
          instructions: 'What is the primary industry category of this account?',
          criteria: {
            pharma_health: 'Healthcare / OTC Medicine / Pain Relief / Patch',
            fmcg_food: 'FMCG / Food & Beverage / Snacks / Biscuits',
            lifestyle_personal: 'Personal Blog / Creator / Lifestyle / Hobby',
            corporate_other: 'Corporate / Retail / Other',
          },
        },
        content_focus: {
          type: 'choice',
          instructions: 'What is the main format/focus of these posts?',
          criteria: {
            reels_entertainment: 'Video / Reels / Skits / Entertainment',
            product_showcase: 'Product Photos / Features / Hard selling',
            personal_moments: 'Personal Photos / Travel / Everyday life',
          },
        },
      },
    });

    tokenUsage.input_tokens = clefRes.usage?.input_tokens || 0;
    tokenUsage.output_tokens = clefRes.usage?.output_tokens || 0;
    clefAnalysisResult = {
      category: clefRes.answers?.category?.choice,
      categoryConfidence: clefRes.answers?.category?.confidence,
      contentFocus: clefRes.answers?.content_focus?.choice,
      contentFocusConfidence: clefRes.answers?.content_focus?.confidence,
    };
  } catch (err) {
    console.warn(`[Fast-IG] Clef analysis note: ${err.message}`);
  }

  return {
    username: cleanUsername,
    followers: meta.followers,
    followerCount,
    postsCount: meta.postsCount,
    postCountEvaluated: postMetrics.length,
    totalLikes,
    totalComments,
    totalEngagements,
    avgEngagement: Math.round(avgEngagement * 10) / 10,
    engagementRate: Math.round(engagementRate * 100) / 100,
    tokens: tokenUsage,
    clefAnalysis: clefAnalysisResult,
    posts: postMetrics,
  };
}

/**
 * General Jev-Ultrafast Speculative Agent Loop
 */
export async function runUltrafastGoal({ url, goal, maxSteps = 10, model = 'clef-omni' }) {
  const driver = new BskDriver();
  const startTime = Date.now();

  try {
    const sessionId = driver.startSession();
    console.log(`[Jev-Fast] Session started: ${sessionId}`);

    driver.navigate(url);
    console.log(`[Jev-Fast] Navigated to: ${url}`);

    const history = [];

    for (let step = 1; step <= maxSteps; step++) {
      const stepStart = Date.now();
      const page = driver.getSnapshot();
      if (!page || !page.actions || page.actions.length === 0) {
        console.log(`[Jev-Fast] No interactive actions found.`);
        break;
      }

      const operations = {
        CLICK: 'Click a button, link, or tab.',
        TYPE_TEXT: 'Type text into an editable input field.',
        SCROLL_DOWN: 'Scroll down to see more content.',
        WAIT: 'Wait for page/data to load.',
        DONE: 'Goal is visibly and completely satisfied.',
        BLOCKED: 'Cannot proceed further.',
      };

      const clickCandidates = {};
      const typeCandidates = {};

      for (const a of page.actions) {
        if (a.kind === 'click') {
          clickCandidates[a.id] = `[${a.role}] ${a.label}`;
        } else if (a.kind === 'fill') {
          typeCandidates[a.id] = `[${a.role}] ${a.label} (current: "${a.value}")`;
        }
      }

      const questions = {
        operation: {
          type: 'choice',
          instructions: `Goal: ${goal}. Select the best next high-level operation.`,
          criteria: operations,
        },
      };

      if (Object.keys(clickCandidates).length > 0) {
        questions.click_target = {
          type: 'choice',
          instructions: 'If operation is CLICK, which element to click?',
          criteria: clickCandidates,
        };
      }

      if (Object.keys(typeCandidates).length > 0) {
        questions.type_text_target = {
          type: 'choice',
          instructions: 'If operation is TYPE_TEXT, which element to type into?',
          criteria: typeCandidates,
        };
      }

      const clefDecision = await globalClefPool.askClef({
        state: `URL: ${page.url}\nTitle: ${page.title}\nGoal: ${goal}`,
        questions,
        model,
      });

      const op = clefDecision.answers.operation.choice;
      const opConf = clefDecision.answers.operation.confidence;
      const stepElapsed = Date.now() - stepStart;

      console.log(`[Step ${step}] Clef: ${op} (${opConf}) in ${stepElapsed}ms`);

      if (op === 'DONE') {
        console.log(`[Jev-Fast] Goal completed!`);
        break;
      }
      if (op === 'BLOCKED') {
        console.log(`[Jev-Fast] Agent reported BLOCKED.`);
        break;
      }

      if (op === 'CLICK' && clefDecision.answers.click_target) {
        const targetId = clefDecision.answers.click_target.choice;
        console.log(`[Step ${step}] Clicking ${targetId}...`);
        driver.click(`@${targetId}`);
        history.push({ step, op, target: targetId });
      } else if (op === 'SCROLL_DOWN') {
        driver.evaluate('window.scrollBy(0, 500)');
        history.push({ step, op });
      }

      await new Promise(r => setTimeout(r, 100));
    }

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Jev-Fast] Total time: ${totalElapsed}s`);

    return {
      success: true,
      elapsedSeconds: totalElapsed,
      history,
    };
  } finally {
    driver.stopSession();
    console.log(`[Jev-Fast] Session stopped.`);
  }
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'instagram') {
    const target = args[1] || 'megaring.id';
    const count = parseInt(args[2], 10) || 10;
    const model = args[3] || 'clef-omni';
    const driver = new BskDriver();
    try {
      driver.startSession();
      fastInspectInstagram(driver, target, count, model)
        .then(res => {
          console.log(JSON.stringify(res, null, 2));
        })
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          driver.stopSession();
        });
    } catch (e) {
      driver.stopSession();
      console.error(e);
    }
  } else if (command === 'goal') {
    const url = args[1];
    const goal = args[2];
    runUltrafastGoal({ url, goal });
  } else {
    console.log('Usage:\n  node runner/ultrafast-agent.mjs instagram <username> [count] [model]\n  node runner/ultrafast-agent.mjs goal <url> "<goal>"');
  }
}
