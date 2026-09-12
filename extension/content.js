/**
 * AI Shield - Content Script
 * In-place phrase-level filtering across all websites (Wikipedia, Reddit, YouTube, Web Apps, etc.).
 * Blurs ONLY the specific harmful phrase within the text, leaving surrounding sentences 100% intact.
 */

(() => {
  let isEnabled = true;
  let currentSensitivity = "balanced";
  let currentThreshold = 0.7;
  let toxicRegex = null;
  let scanDebounceTimer = null;

  // Base built-in phrases (compound phrases first, then single words)
  const BASE_COMPOUNDS = [
    "fuck off", "fuck you", "fucking idiot", "fucking loser", "shut up",
    "shut the fuck up", "piss off", "pissed off", "piece of shit",
    "kill yourself", "go die", "delete your account", "waste of space",
    "worthless piece of shit", "nobody likes you", "drop dead", "eat shit",
    "get the fuck out", "motherfucker", "dumb fuck", "dumb bitch",
    "son of a bitch", "ass hole", "fat ugly", "kill your self",
    "die in a fire", "suck my dick", "suck my cock", "kiss my ass",
    // Hindi / Hinglish compounds
    "mc bc", "maa ki chut", "teri maa ki", "teri maa ki chut", "teri behen ki",
    "bhen ke lode", "bhen ke takke", "bhosadike", "bhosdi ke", "bhosdiwale",
    "gaand mara", "gaand maro", "chut ke dhakkan", "lund ke baal", "kutta kamina"
  ];

  const BASE_WORDS_BALANCED = [
    "fuck", "fucking", "fucked", "fucker", "shit", "bitch", "cunt",
    "asshole", "dick", "pussy", "bastard", "faggot", "nigger", "retard",
    "moron", "idiot", "idiots", "stupid", "dumbass", "bullshit",
    "slut", "whore", "cock", "penis", "piss", "suck", "sucks",
    // Hindi / Hinglish abusive words
    "bhenchod", "behenchod", "madarchod", "chutiya", "chutiye", "chutiyapa",
    "bhosdike", "bsdk", "bhosdi", "gandu", "gaandu", "gaand", "lund", "loda",
    "lauda", "lodu", "randi", "rndi", "harami", "kameene", "kamina", "saala", "saale",
    "mc", "bc"
  ];

  const BASE_WORDS_STRICT = [
    ...BASE_WORDS_BALANCED,
    "hate", "loser", "liar", "dumb", "pathetic", "jerk", "hell",
    "damn", "crap", "worthless", "die", "kill", "shut"
  ];

  const BASE_WORDS_RELAXED = [
    "fuck", "fucking", "fucked", "fucker", "cunt", "faggot", "nigger",
    "retard", "bitch", "motherfucker", "kill yourself",
    "bhenchod", "behenchod", "madarchod", "chutiya", "bhosdike", "bsdk", "gandu", "randi", "mc", "bc"
  ];

  // Helper to escape regex special characters
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Compile active regex based on sensitivity and synced backend features
  function buildRegex(features = [], compounds = []) {
    const allCompounds = Array.from(new Set([...BASE_COMPOUNDS, ...compounds]));
    let words = BASE_WORDS_BALANCED;

    if (currentSensitivity === "strict") {
      words = BASE_WORDS_STRICT;
    } else if (currentSensitivity === "relaxed") {
      words = BASE_WORDS_RELAXED;
    }

    // Add features from backend model that meet weight threshold
    const minWeight = currentSensitivity === "strict" ? 2.0 : currentSensitivity === "relaxed" ? 7.0 : 3.5;
    const modelWords = features
      .filter((f) => f.weight >= minWeight && f.term.length >= 3)
      .map((f) => f.term.toLowerCase());

    const combined = Array.from(new Set([...allCompounds, ...words, ...modelWords]));

    // Sort by length descending so longer phrases match before sub-words (e.g. "fuck off" before "fuck")
    combined.sort((a, b) => b.length - a.length);

    const pattern = combined.map((term) => escapeRegExp(term)).join("|");
    toxicRegex = new RegExp(`\\b(${pattern})\\b`, "gi");
  }

  // Initialize configuration from storage
  function initConfig() {
    chrome.storage.local.get(
      ["enabled", "threshold", "sensitivity", "toxic_features", "toxic_compounds"],
      (data) => {
        if (data.enabled !== undefined) isEnabled = data.enabled;
        if (data.threshold !== undefined) currentThreshold = data.threshold;
        if (data.sensitivity !== undefined) currentSensitivity = data.sensitivity;

        buildRegex(data.toxic_features || [], data.toxic_compounds || []);

        if (isEnabled) {
          scanDocument();
        }
      }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      let needsRegexRebuild = false;

      if (changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        if (!isEnabled) {
          unblurAllInline();
        } else {
          reblurAllInline();
          scanDocument();
        }
      }

      if (changes.sensitivity !== undefined) {
        currentSensitivity = changes.sensitivity.newValue;
        needsRegexRebuild = true;
      }

      if (changes.toxic_features || changes.toxic_compounds) {
        needsRegexRebuild = true;
      }

      if (needsRegexRebuild) {
        chrome.storage.local.get(["toxic_features", "toxic_compounds"], (d) => {
          buildRegex(d.toxic_features || [], d.toxic_compounds || []);
          if (isEnabled) {
            scanDocument();
          }
        });
      }
    });

    // Listen for manual trigger from popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "SCAN_PAGE_NOW") {
        scanDocument();
        sendResponse({ success: true });
        return true;
      }
    });
  }

  // Create interactive inline shield badge for the specific phrase
  function createInlineShield(phrase) {
    const span = document.createElement("span");
    span.className = "ai-shield-inline-shield";
    span.title = "Harmful phrase shielded by AI Shield. Click to reveal.";

    span.innerHTML = `
      <span class="ai-shield-inline-icon">🛡️</span>
      <span class="ai-shield-phrase-blurred">${phrase}</span>
    `;

    // Click anywhere on the phrase chip to effortlessly toggle reveal/re-blur
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      span.classList.toggle("ai-shield-revealed");
      if (span.classList.contains("ai-shield-revealed")) {
        span.title = "Revealed content. Click to re-blur.";
      } else {
        span.title = "Harmful phrase shielded by AI Shield. Click to reveal.";
      }
    }, true);

    return span;
  }

  // Temporarily reveal all inline phrases when master toggle is off
  function unblurAllInline() {
    document.querySelectorAll(".ai-shield-inline-shield").forEach((el) => {
      el.classList.add("ai-shield-revealed");
    });
  }

  // Re-blur all inline phrases when master toggle is on
  function reblurAllInline() {
    document.querySelectorAll(".ai-shield-inline-shield").forEach((el) => {
      el.classList.remove("ai-shield-revealed");
    });
  }

  // Process a single text node, replacing ONLY the toxic phrase with the inline shield
  function processTextNode(node) {
    if (!toxicRegex || !isEnabled) return 0;

    const text = node.nodeValue;
    if (!text || text.length < 3) return 0;

    toxicRegex.lastIndex = 0;
    if (!toxicRegex.test(text)) return 0;

    toxicRegex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let matchCount = 0;

    while ((match = toxicRegex.exec(text)) !== null) {
      matchCount++;
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      const matchedText = match[0];

      // Append safe preceding text
      if (matchStart > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
      }

      // Append inline shield for the toxic phrase only
      const shieldSpan = createInlineShield(matchedText);
      fragment.appendChild(shieldSpan);

      lastIndex = matchEnd;
    }

    if (matchCount > 0) {
      // Append safe trailing text
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      // Swap text node with fragment in DOM
      if (node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
      }
    }

    return matchCount;
  }

  // Find and process text nodes in a given container (works on Wikipedia, Reddit, YouTube, any web app)
  function scanContainer(root = document.body) {
    if (!root || !isEnabled || !toxicRegex) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tag = parent.tagName.toLowerCase();
          if (
            tag === "script" ||
            tag === "style" ||
            tag === "noscript" ||
            tag === "textarea" ||
            tag === "input" ||
            tag === "select" ||
            tag === "code" ||
            tag === "pre" ||
            tag === "svg" ||
            parent.isContentEditable ||
            parent.closest(".ai-shield-inline-shield, form[role='search']")
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!node.nodeValue || node.nodeValue.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodesToProcess = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      nodesToProcess.push(currentNode);
    }

    let totalBlocked = 0;
    for (const node of nodesToProcess) {
      totalBlocked += processTextNode(node);
    }

    if (totalBlocked > 0) {
      chrome.runtime.sendMessage({
        type: "RECORD_BLOCKED",
        scanned: nodesToProcess.length,
        blocked: totalBlocked,
      });
    }
  }

  // Full page scan
  function scanDocument() {
    scanContainer(document.body);
  }

  // Debounced scan for DOM mutations (infinite scroll / dynamic single page apps)
  function scheduleScan(delay = 150) {
    if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      scanDocument();
    }, delay);
  }

  // Observe newly loaded content (Reddit infinite feed, Wikipedia previews, YouTube comments)
  function observeMutations() {
    const observer = new MutationObserver((mutations) => {
      let hasAddedNodes = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          // Ignore mutations generated by AI Shield itself
          let isShieldMutation = false;
          for (const node of m.addedNodes) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              (node.classList?.contains("ai-shield-inline-shield") ||
                node.querySelector?.(".ai-shield-inline-shield"))
            ) {
              isShieldMutation = true;
              break;
            }
          }
          if (!isShieldMutation) {
            hasAddedNodes = true;
            break;
          }
        }
      }
      if (hasAddedNodes) {
        scheduleScan(150);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ============================================================================
  // NSFW Image Filtering
  // ============================================================================

  // Deep query to traverse light DOM and all open Shadow Roots (essential for Reddit, YouTube, etc.)
  function getAllImages(root = document) {
    const images = [];

    // 1. Direct <img> elements
    try {
      const imgs = root.querySelectorAll("img");
      for (const img of imgs) {
        images.push(img);
      }
    } catch (e) {}

    // 2. Custom elements like Reddit's <faceplate-img>
    try {
      const faceplates = root.querySelectorAll("faceplate-img");
      for (const fp of faceplates) {
        if (fp.shadowRoot) {
          const sImgs = fp.shadowRoot.querySelectorAll("img");
          for (const sImg of sImgs) {
            images.push(sImg);
          }
        }
        if (fp.getAttribute("src") || fp.src) {
          images.push(fp);
        }
      }
    } catch (e) {}

    // 3. Recurse through all open shadow roots
    try {
      const allWithShadow = root.querySelectorAll("*");
      for (const el of allWithShadow) {
        if (el.shadowRoot && el.tagName.toLowerCase() !== "faceplate-img") {
          images.push(...getAllImages(el.shadowRoot));
        }
      }
    } catch (e) {}

    return images;
  }

  // Convert image to data URI in-browser to bypass CDN anti-bot 403 blocks (e.g. Reddit preview.redd.it)
  async function getImagePayload(img, src) {
    if (!src || src.startsWith("data:image")) return src;

    // Fetch directly within user browser session (has cookies & session headers)
    try {
      const res = await fetch(src, { mode: "cors" });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0 && blob.size < 4 * 1024 * 1024) {
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(src);
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (e) {
      // If CORS blocks fetch, try offscreen canvas
      try {
        if (img.complete && img.naturalWidth > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(img.naturalWidth, 300);
          canvas.height = Math.min(img.naturalHeight, 300);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.8);
        }
      } catch (canvasErr) {}
    }
    return src;
  }

  // Asynchronously scan all images in live DOM (including shadow roots) and filter NSFW content
  async function scanImages() {
    const images = getAllImages(document);
    for (const img of images) {
      if (img.getAttribute("data-scanned") === "true") {
        continue;
      }

      // Read currentSrc (for srcset) or standard src
      const src = img.currentSrc || img.src || img.getAttribute("src") || img.getAttribute("data-src");
      if (!src || (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:image"))) {
        continue;
      }

      // Mark as scanned to prevent redundant scans and infinite loops
      img.setAttribute("data-scanned", "true");

      try {
        const payloadSrc = await getImagePayload(img, src);

        const response = await fetch("http://localhost:8000/analyze-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image_url: payloadSrc, threshold: currentThreshold }),
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        console.log("AI Shield [Image Scan]:", src.substring(0, 60), data);

        if (data && data.is_nsfw === true) {
          img.style.filter = "blur(25px)";
          img.style.setProperty("filter", "blur(25px)", "important");
          img.style.transition = "filter 0.2s ease";
          img.style.cursor = "pointer";

          const parent = img.parentElement;
          if (parent && parent.tagName && parent.tagName.toLowerCase() === "faceplate-img") {
            parent.style.filter = "blur(25px)";
            parent.style.setProperty("filter", "blur(25px)", "important");
          }

          const removeBlur = (e) => {
            if (e) e.stopPropagation();
            img.style.filter = "none";
            img.style.setProperty("filter", "none", "important");
            if (parent && parent.tagName && parent.tagName.toLowerCase() === "faceplate-img") {
              parent.style.filter = "none";
              parent.style.setProperty("filter", "none", "important");
            }
          };

          img.onclick = removeBlur;
          img.addEventListener("click", removeBlur);
        }
      } catch (err) {
        // Silently catch fetch errors if backend is unavailable
      }
    }
  }

  // Set up continuous scanning for images (observer + interval loop)
  function setupImageScanner() {
    scanImages();

    // Continuously check for new images (e.g. as user scrolls or lazy-loads)
    setInterval(scanImages, 1000);

    // MutationObserver to immediately detect newly injected <img> elements
    const imageObserver = new MutationObserver(() => {
      scanImages();
    });

    if (document.body) {
      imageObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  if (typeof window !== "undefined") {
    window.scanImages = scanImages;
  }

  // Start extension lifecycle
  function start() {
    initConfig();
    observeMutations();
    setupImageScanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
