/**
 * AI Shield - Background Service Worker
 * Manages ML API communications, toxic phrase lexicon sync, and persistent statistics.
 */

const API_BASE = "http://127.0.0.1:8000";
const CACHE_MAX_SIZE = 5000;
const scoreCache = new Map();

// Built-in core toxic lexicon (supplements backend model features)
const DEFAULT_COMPOUNDS = [
  "fuck off", "fuck you", "fucking idiot", "fucking loser", "shut up",
  "shut the fuck up", "piss off", "pissed off", "piece of shit",
  "kill yourself", "go die", "delete your account", "waste of space",
  "worthless piece of shit", "nobody likes you", "drop dead", "eat shit",
  "get the fuck out", "motherfucker", "dumb fuck", "dumb bitch",
  "son of a bitch", "ass hole", "fat ugly", "kill your self", "Bhenchod", "madarchod", "chutiya", "mc", "bc", "mc bc", "bitch"
];

// Initialize default settings on install or startup
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    "enabled",
    "threshold",
    "sensitivity",
    "posts_scanned",
    "threats_blocked",
    "toxic_lexicon",
  ]);

  await chrome.storage.local.set({
    enabled: existing.enabled !== undefined ? existing.enabled : true,
    threshold: existing.threshold !== undefined ? existing.threshold : 0.7,
    sensitivity: existing.sensitivity !== undefined ? existing.sensitivity : "balanced",
    posts_scanned: existing.posts_scanned !== undefined ? existing.posts_scanned : 0,
    threats_blocked: existing.threats_blocked !== undefined ? existing.threats_blocked : 0,
  });

  // Sync learned vocabulary from backend
  syncToxicLexicon();
});

// Sync learned toxic vocabulary from FastAPI backend
async function syncToxicLexicon() {
  try {
    const res = await fetch(`${API_BASE}/toxic-lexicon`);
    if (res.ok) {
      const data = await res.json();
      await chrome.storage.local.set({
        toxic_features: data.features || [],
        toxic_compounds: data.compounds || DEFAULT_COMPOUNDS,
      });
      console.log("[AI Shield] Synced toxic lexicon from model:", data.count, "items");
    }
  } catch (err) {
    console.warn("[AI Shield] Using default toxic lexicon, backend offline:", err.message);
    const existing = await chrome.storage.local.get(["toxic_compounds"]);
    if (!existing.toxic_compounds) {
      await chrome.storage.local.set({
        toxic_compounds: DEFAULT_COMPOUNDS,
      });
    }
  }
}

// Fast string hashing for cache keys
function hashText(str) {
  let hash = 5381;
  const clean = str.trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 33) ^ clean.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// Update stats in chrome.storage.local
async function recordStats(scannedCount, blockedCount) {
  const data = await chrome.storage.local.get(["posts_scanned", "threats_blocked"]);
  const newScanned = (data.posts_scanned || 0) + scannedCount;
  const newBlocked = (data.threats_blocked || 0) + blockedCount;
  await chrome.storage.local.set({
    posts_scanned: newScanned,
    threats_blocked: newBlocked,
  });
  return { posts_scanned: newScanned, threats_blocked: newBlocked };
}

// Fetch health status from backend
async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      // Also refresh lexicon if needed
      syncToxicLexicon();
      return { online: true, ...data };
    }
    return { online: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_HEALTH") {
    checkBackendHealth().then(sendResponse);
    return true;
  }

  if (message.type === "RECORD_BLOCKED") {
    recordStats(message.scanned || 1, message.blocked || 1).then(sendResponse);
    return true;
  }

  if (message.type === "GET_STATS") {
    chrome.storage.local
      .get(["posts_scanned", "threats_blocked", "enabled", "sensitivity", "threshold"])
      .then(sendResponse);
    return true;
  }

  if (message.type === "RESET_STATS") {
    chrome.storage.local
      .set({ posts_scanned: 0, threats_blocked: 0 })
      .then(() => sendResponse({ success: true }));
    return true;
  }
});
