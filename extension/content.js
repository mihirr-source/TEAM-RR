/**
 * AI Shield - Content Script
 * In-place phrase-level filtering across all websites (Wikipedia, Reddit, YouTube, Web Apps, etc.).
 * Blurs ONLY the specific harmful phrase within the text, leaving surrounding sentences 100% intact.
 */

(() => {
  if (window.__AI_SHIELD_INJECTED__) return;
  window.__AI_SHIELD_INJECTED__ = true;
  console.log("[AI Shield] Content script active and Pre-Post Toxicity Check ready!");

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
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      buildRegex([], []);
      if (isEnabled) {
        scanDocument();
      }
      return;
    }

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

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        let needsRegexRebuild = false;

        if (changes.enabled !== undefined) {
          isEnabled = changes.enabled.newValue;
          if (!isEnabled) {
            unblurAllInline();
            document.querySelectorAll("[data-trigger-blocked='true']").forEach((el) => {
              el.style.filter = "";
              el.style.border = "";
            });
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

        if (changes.trigger !== undefined || changes.triggerInput !== undefined) {
          document.querySelectorAll("[data-trigger-blocked='true']").forEach((el) => {
            el.style.filter = "";
            el.style.border = "";
            delete el.dataset.triggerBlocked;
            delete el.dataset.triggerScanned;
          });
          document.querySelectorAll("[data-trigger-scanned]").forEach((el) => {
            delete el.dataset.triggerScanned;
          });
          if (isEnabled) {
            scanDocument();
          }
        }
      });
    }

    // Listen for manual trigger from popup
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === "SCAN_PAGE_NOW") {
          scanDocument();
          sendResponse({ success: true });
          return true;
        }
      });
    }
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

    const candidateElements = new Set();
    const nodesToProcess = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      nodesToProcess.push(currentNode);
      if (currentNode.parentElement) {
        const textEl = currentNode.parentElement.closest("p, li, article, h1, h2, h3, h4, h5, h6, blockquote, [data-shield-text], .social-post-text") || currentNode.parentElement;
        if (textEl && !textEl.closest(".ai-shield-inline-shield")) {
          candidateElements.add(textEl);
        }
      }
    }

    let totalBlocked = 0;
    for (const node of nodesToProcess) {
      totalBlocked += processTextNode(node);
    }

    if (nodesToProcess.length > 0) {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "RECORD_BLOCKED",
          scanned: nodesToProcess.length,
          blocked: totalBlocked,
        });
      }
    }

    // Asynchronously fetch user's saved trigger and analyze text for semantic trigger filtering
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["trigger", "triggerInput"], async (storageData) => {
        const trigger = (storageData && (storageData.trigger || storageData.triggerInput || "")).trim();
        if (!trigger) return;

        if (root && root.querySelectorAll) {
          root.querySelectorAll("[data-shield-text], .social-post-text").forEach((el) => {
            if (!el.closest(".ai-shield-inline-shield")) {
              candidateElements.add(el);
            }
          });
        }

        for (const el of candidateElements) {
          if (el.dataset.triggerScanned === trigger) continue;
          el.dataset.triggerScanned = trigger;

          const scrapedText = (el.innerText || el.textContent || "").trim();
          if (!scrapedText || scrapedText.length < 2) continue;

          try {
            const res = await fetch("http://localhost:8000/analyze-trigger", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                trigger: trigger,
                text: scrapedText,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data && data.trigger_matched === true) {
                el.style.filter = "blur(15px)";
                el.style.border = "2px solid red";
                el.setAttribute("data-trigger-blocked", "true");
                if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
                  chrome.runtime.sendMessage({
                    type: "RECORD_BLOCKED",
                    scanned: 0,
                    blocked: 1,
                  });
                }
              }
            }
          } catch (err) {
            // Silently handle backend connection error
          }
        }
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

        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: "RECORD_BLOCKED",
            scanned: 1,
            blocked: (data && data.is_nsfw === true) ? 1 : 0,
          });
        }

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

  // ============================================================================
  // Pre-Post Toxicity Check (Intercept compose submission & suggest safe text)
  // Supports Demo Feed, WhatsApp Web, Instagram (DMs & Comments), Twitter/X, Reddit
  // ============================================================================

  function isComposeSubmitButton(el) {
    if (!el || !(el instanceof HTMLElement)) return null;

    // 1. WhatsApp Web paper-plane send button
    if (el.closest('[data-icon="send"]')) {
      return el.closest('button, [role="button"]') || el;
    }

    // 2. Direct match for demo publish button or known social submit buttons
    const btn = el.closest(
      '#btnPublish, .btn-post, [data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonDesktop"], button[type="submit"], button[aria-label*="Send" i], button[aria-label*="Post" i], div[role="button"][tabindex="0"]'
    );
    if (btn) return btn;

    // 3. Generic button check with post/send text inside or near a composer/chat
    const clickable = el.closest('button, [role="button"]');
    if (clickable) {
      const text = (clickable.innerText || clickable.textContent || "").trim().toLowerCase();
      if (
        ["publish post", "publish", "post", "tweet", "comment", "reply", "send"].includes(text) &&
        (clickable.closest(".composer, form, footer, [data-testid='tweetBox'], [role='main']") ||
          document.querySelector("#composerText, .composer-input, textarea, [contenteditable='true'][role='textbox']"))
      ) {
        return clickable;
      }
    }
    return null;
  }

  function findComposeBox(submitBtn) {
    // 1. Check demo compose box
    const demoInput = document.getElementById("composerText");
    if (demoInput && (submitBtn?.id === "btnPublish" || submitBtn?.closest?.(".composer"))) {
      return demoInput;
    }

    // 2. WhatsApp Web active or footer compose box
    if (location.hostname.includes("whatsapp.com")) {
      const waBox = document.querySelector(
        'footer div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"], div[contenteditable="true"]'
      );
      if (waBox) return waBox;
    }

    // 3. Instagram DMs or comment compose box
    if (location.hostname.includes("instagram.com")) {
      const igBox = document.querySelector(
        'div[role="textbox"][contenteditable="true"], textarea[aria-label*="comment" i], textarea[placeholder*="comment" i]'
      );
      if (igBox) return igBox;
    }

    // 4. Check within common container
    if (submitBtn) {
      const container = submitBtn.closest(
        ".composer, form, footer, [data-testid='tweetBox'], [role='dialog'], .composer-actions?.parentElement"
      );
      if (container) {
        const box = container.querySelector(
          "#composerText, .composer-input, textarea, [contenteditable='true'][role='textbox'], [data-testid='tweetTextarea_0']"
        );
        if (box) return box;
      }

      // 5. Check preceding siblings
      let prev = submitBtn.previousElementSibling;
      while (prev) {
        if (prev.matches?.("#composerText, textarea, [contenteditable='true']")) {
          return prev;
        }
        const childBox = prev.querySelector?.("#composerText, textarea, [contenteditable='true']");
        if (childBox) return childBox;
        prev = prev.previousElementSibling;
      }
    }

    // 6. Fallback to active element or any visible composer textarea/contenteditable
    if (document.activeElement && document.activeElement.matches?.("textarea, [contenteditable='true']")) {
      return document.activeElement;
    }
    return demoInput || document.querySelector("textarea, [contenteditable='true'][role='textbox']");
  }

  function findAssociatedSubmitButton(composeBox) {
    if (!composeBox) return null;

    // 1. Demo post button
    const demoBtn = document.getElementById("btnPublish");
    if (demoBtn && (composeBox.id === "composerText" || composeBox.closest(".composer"))) {
      return demoBtn;
    }
    const demoChatSend = document.getElementById("btnChatSend");
    if (demoChatSend && composeBox.closest(".chat-simulator")) {
      return demoChatSend;
    }

    // 2. WhatsApp Web send button
    const waSend = document.querySelector(
      'button span[data-icon="send"], span[data-icon="send"]'
    )?.closest('button, [role="button"]');
    if (waSend) return waSend;

    // 3. Instagram DM / Web Chat send button
    const container =
      composeBox.closest('footer, form, div[role="region"], div[role="main"]') ||
      composeBox.parentElement?.parentElement ||
      document.body;

    const buttons = Array.from(
      container.querySelectorAll('button, div[role="button"], span[role="button"], [tabindex="0"]')
    ).filter((b) => b !== composeBox && !composeBox.contains(b));

    // Priority A: Elements with text "Send", "Post", "Reply", "Tweet"
    for (const b of buttons) {
      const text = (b.innerText || b.textContent || "").trim().toLowerCase();
      const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
      if (
        text === "send" ||
        text === "post" ||
        text === "tweet" ||
        aria === "send" ||
        aria.includes("send message")
      ) {
        return b;
      }
    }

    // Priority B: Elements with SVG or testid indicating send
    for (const b of buttons) {
      const testId = (b.getAttribute("data-testid") || "").toLowerCase();
      const svg = b.querySelector('svg[aria-label="Send"], svg[aria-label="send"]');
      if (testId.includes("send") || svg) {
        return b;
      }
    }

    // Priority C: Form submit button
    const submitBtn = container.querySelector?.('button[type="submit"]');
    if (submitBtn && submitBtn !== composeBox) return submitBtn;

    return null;
  }

  function getDraftText(composeBox) {
    if (!composeBox) return "";
    if (composeBox.tagName === "TEXTAREA" || composeBox.tagName === "INPUT") {
      return composeBox.value || "";
    }
    return composeBox.innerText || composeBox.textContent || "";
  }

  function selectAllInComposeBox(composeBox) {
    if (!composeBox) return;
    try {
      composeBox.focus();
    } catch (e) {}

    if (composeBox.tagName === "TEXTAREA" || composeBox.tagName === "INPUT") {
      try {
        composeBox.select();
      } catch (e) {}
      return;
    }

    // For ContentEditable (Instagram Lexical, WhatsApp Web, etc.)
    try {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(composeBox);
        sel.addRange(range);
      }
    } catch (e) {}
  }

  function setDraftText(composeBox, text) {
    if (!composeBox) return false;

    console.log("[AI Shield] setDraftText requested for:", text);

    // 1. Textarea or Input (Demo feed, Twitter, simple forms)
    if (composeBox.tagName === "TEXTAREA" || composeBox.tagName === "INPUT") {
      composeBox.focus();
      try {
        const proto =
          composeBox.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(composeBox, text);
        } else {
          composeBox.value = text;
        }
      } catch (e) {
        composeBox.value = text;
      }
      composeBox.dispatchEvent(new Event("input", { bubbles: true }));
      composeBox.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // 2. ContentEditable on Instagram Web:
    // Meta Lexical strictly rejects synthetic/untrusted DOM events and creates duplicate nodes if forced.
    // So on Instagram, we skip synthetic injection to keep the draft clean, and let native Ctrl+V replace it.
    const isInstagram =
      window.location.hostname.includes("instagram.com") ||
      Boolean(composeBox.closest('[data-lexical-text="true"], div[role="textbox"]'));
    if (isInstagram) {
      console.log("[AI Shield] Instagram Lexical detected; keeping DOM clean for native Ctrl+V replacement.");
      return false;
    }

    // 3. ContentEditable on other sites (Demo chat simulator, standard rich editors)
    composeBox.focus();
    selectAllInComposeBox(composeBox);

    try {
      document.execCommand("insertText", false, text);
    } catch (err) {}

    const current = getDraftText(composeBox).trim();
    if (current === text.trim()) {
      return true;
    }

    // If execCommand failed or appended, undo so no duplicates exist in the DOM
    try {
      document.execCommand("undo");
    } catch (e) {}

    return false;
  }

  function removeExistingTooltip() {
    document.querySelectorAll(".ai-shield-toxicity-tooltip").forEach((t) => t.remove());
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function dispatchApprovedSubmit(composeBox, submitBtn) {
    if (submitBtn && submitBtn.isConnected) {
      console.log("[AI Shield] Submitting via button click:", submitBtn);
      submitBtn.dataset.shieldAllowSubmit = "true";
      submitBtn.click();
      submitBtn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      submitBtn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      submitBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return;
    }

    if (composeBox && composeBox.isConnected) {
      console.log("[AI Shield] Submitting via Enter keydown on composeBox");
      composeBox.dataset.shieldAllowSubmit = "true";
      const enterDown = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      composeBox.dispatchEvent(enterDown);
    }
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      textarea.remove();
      return success;
    } catch (e) {
      return false;
    }
  }



  function showToastGuidancePill(composeBox, messageHtml) {
    document.querySelectorAll(".ai-shield-toast-pill").forEach((t) => t.remove());

    const toast = document.createElement("div");
    toast.className = "ai-shield-toast-pill";
    toast.innerHTML = `
      <span>🛡️</span>
      <span>${messageHtml}</span>
      <span style="opacity: 0.7; font-size: 11px; margin-left: 6px; cursor: pointer;" title="Dismiss">✕</span>
    `;

    // Position it floating right above the compose box
    const outerPill =
      composeBox.closest('.composer, form, footer, [role="region"], div[style*="border-radius"]') ||
      composeBox.parentElement ||
      composeBox;
    const rect = outerPill.getBoundingClientRect();
    const bottom = Math.max(16, window.innerHeight - rect.top + 10);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));

    toast.style.setProperty("bottom", `${bottom}px`, "important");
    toast.style.setProperty("left", `${left}px`, "important");

    toast.addEventListener("click", () => toast.remove());

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.isConnected) {
        toast.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-6px)";
        setTimeout(() => toast.remove(), 400);
      }
    }, 6000);
  }

  function showToxicityTooltip(composeBox, submitBtn, safeText, score) {
    removeExistingTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "ai-shield-toxicity-tooltip";
    tooltip.dataset.shieldTooltip = "true";

    // Prevent button click from stealing focus from composeBox
    tooltip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
    });
    tooltip.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    // Find the outer visual input container (pill / footer / composer)
    const outerPill =
      composeBox.closest('.composer, form, footer, [role="region"], div[style*="border-radius"]') ||
      composeBox.parentElement ||
      composeBox;
    const rect = outerPill.getBoundingClientRect();

    // Fixed floating position directly above the input box (never clipped by chat overflow:hidden)
    tooltip.style.setProperty("position", "fixed", "important");
    tooltip.style.setProperty("z-index", "2147483647", "important");
    tooltip.style.setProperty("max-width", "560px", "important");
    const width = Math.min(Math.max(rect.width, 340), window.innerWidth - 32);
    tooltip.style.setProperty("width", `${width}px`, "important");
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    tooltip.style.setProperty("left", `${left}px`, "important");
    const bottom = Math.max(16, window.innerHeight - rect.top + 10);
    tooltip.style.setProperty("bottom", `${bottom}px`, "important");

    const scorePct = typeof score === "number" ? Math.round(score * 100) : null;
    const badgeText = scorePct ? `${scorePct}% Toxicity Detected` : `Toxicity Detected`;

    tooltip.innerHTML = `
      <div class="ai-shield-tooltip-header">
        <div class="ai-shield-tooltip-title">
          <span class="ai-shield-tooltip-icon">⚠️</span>
          <span>Pre-Post Toxicity Warning</span>
        </div>
        <span class="ai-shield-tooltip-badge">${badgeText}</span>
      </div>
      <div class="ai-shield-tooltip-body">
        Your draft contains language that may violate wellbeing guidelines. Consider using this suggested constructive alternative:
      </div>
      <div class="ai-shield-suggestion-box">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
          <span class="ai-shield-suggestion-label">Suggested Safe Text:</span>
          <button type="button" class="ai-shield-btn-copy-inline" id="btnCopySafeText">📋 Copy</button>
        </div>
        <p class="ai-shield-suggestion-text">${escapeHtml(safeText)}</p>
      </div>
      <div class="ai-shield-tooltip-actions">
        <button type="button" class="ai-shield-btn-accept" id="btnAcceptSuggestion">
          <span>✓ Accept Suggestion</span>
        </button>
        <button type="button" class="ai-shield-btn-dismiss" id="btnDismissSuggestion">
          <span>Edit Draft</span>
        </button>
      </div>
    `;

    // Inline Copy Button
    const copyBtn = tooltip.querySelector("#btnCopySafeText");
    if (copyBtn) {
      copyBtn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await copyTextToClipboard(safeText);
        copyBtn.textContent = "✓ Copied!";
        selectAllInComposeBox(composeBox);
        showToastGuidancePill(
          composeBox,
          `Safe text copied! Press <kbd>Ctrl+V</kbd> to replace &amp; <kbd>Enter</kbd> to send`
        );
        setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = "📋 Copy";
        }, 2000);
      });
    }

    // Accept Suggestion Button: Copies safe text, highlights old text & submits/guides
    const acceptBtn = tooltip.querySelector(".ai-shield-btn-accept");
    acceptBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      console.log("[AI Shield] Accept Suggestion clicked!");

      // 1. Immediately copy safe text to clipboard
      await copyTextToClipboard(safeText);

      // 2. Remove the warning tooltip
      tooltip.remove();

      // 3. Attempt programmatic replacement (succeeds on standard forms, Twitter, demo)
      const didUpdateAuto = setDraftText(composeBox, safeText);

      // 4. Highlight/select all in composeBox so user can Ctrl+V replace with 0 duplicates
      selectAllInComposeBox(composeBox);

      if (didUpdateAuto) {
        showToastGuidancePill(composeBox, `✓ Suggestion accepted!`);
        const sendBtn = submitBtn || findAssociatedSubmitButton(composeBox);
        if (sendBtn) {
          setTimeout(() => {
            dispatchApprovedSubmit(composeBox, sendBtn);
          }, 250);
        }
      } else {
        // On Instagram / Lexical:
        // The toxic draft is 100% highlighted in blue, and the safe text is in the clipboard!
        // Pressing Ctrl+V replaces the toxic draft cleanly with ZERO duplicates!
        showToastGuidancePill(
          composeBox,
          `Safe text copied! Press <kbd>Ctrl+V</kbd> to replace &amp; <kbd>Enter</kbd> to send`
        );
      }
    });

    // Dismiss Button: Close tooltip to allow manual editing
    const dismissBtn = tooltip.querySelector(".ai-shield-btn-dismiss");
    dismissBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tooltip.remove();
      composeBox.focus();
    });

    // Append to document.body so no parent container overflow:hidden can clip it
    document.body.appendChild(tooltip);
  }

  function setupPrePostCheck() {
    // 1. Intercept submit clicks using capture phase (Demo, Twitter, Instagram, WhatsApp send button)
    document.addEventListener(
      "click",
      async (e) => {
        const submitBtn = isComposeSubmitButton(e.target);
        if (!submitBtn) return;

        // If explicitly approved or bypassing check, let original submission proceed
        if (submitBtn.dataset.shieldAllowSubmit === "true") {
          delete submitBtn.dataset.shieldAllowSubmit;
          return;
        }

        const composeBox = findComposeBox(submitBtn);
        if (!composeBox) return;

        const draftText = getDraftText(composeBox).trim();
        if (!draftText) return;

        // Halt default submission
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // API Call to http://localhost:8000/check-draft
        try {
          const res = await fetch("http://localhost:8000/check-draft", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: draftText,
              threshold: currentThreshold,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
          }

          const data = await res.json();

          if (data && data.is_toxic === false) {
            // Pass Scenario
            removeExistingTooltip();
            submitBtn.dataset.shieldAllowSubmit = "true";
            submitBtn.click();
          } else if (data && data.is_toxic === true) {
            // Fail Scenario
            const safeText =
              data.suggested_text ||
              data.safe_text ||
              "I have a different perspective on this topic, but appreciate the discussion.";
            showToxicityTooltip(composeBox, submitBtn, safeText, data.toxicity_score);
          }
        } catch (err) {
          console.warn("[AI Shield] Pre-post check error:", err);
          submitBtn.dataset.shieldAllowSubmit = "true";
          submitBtn.click();
        }
      },
      true
    );

    // 2. Intercept Enter keypress in chat and comment inputs (WhatsApp Web, Instagram DMs & comments)
    document.addEventListener(
      "keydown",
      async (e) => {
        // Only intercept plain Enter (not Shift+Enter for newlines or other modifiers)
        if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) {
          return;
        }

        const target = e.target;
        if (!target || !(target instanceof HTMLElement)) return;

        // Resolve the actual compose box whether target is the container or an inner span/p
        const composeBox = target.closest(
          '#composerText, .composer-input, [contenteditable="true"], [role="textbox"], textarea, input'
        );
        if (!composeBox) return;

        // Ignore inputs like passwords, numbers, etc.
        if (composeBox.tagName === "INPUT" && !["text", "search"].includes(composeBox.type)) return;

        // Check bypass flag
        if (composeBox.dataset.shieldAllowSubmit === "true") {
          delete composeBox.dataset.shieldAllowSubmit;
          return;
        }

        const draftText = getDraftText(composeBox).trim();
        if (!draftText) return;

        // Halt default Enter submission
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const submitBtn = findAssociatedSubmitButton(composeBox);

        // API Call to http://localhost:8000/check-draft
        try {
          const res = await fetch("http://localhost:8000/check-draft", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: draftText,
              threshold: currentThreshold,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
          }

          const data = await res.json();

          if (data && data.is_toxic === false) {
            // Pass Scenario
            removeExistingTooltip();
            dispatchApprovedSubmit(composeBox, submitBtn);
          } else if (data && data.is_toxic === true) {
            // Fail Scenario
            const safeText =
              data.suggested_text ||
              data.safe_text ||
              "I have a different perspective on this topic, but appreciate the discussion.";
            showToxicityTooltip(composeBox, submitBtn, safeText, data.toxicity_score);
          }
        } catch (err) {
          console.warn("[AI Shield] Enter-key check error:", err);
          dispatchApprovedSubmit(composeBox, submitBtn);
        }
      },
      true
    );
  }

  // Start extension lifecycle
  function start() {
    initConfig();
    observeMutations();
    setupImageScanner();
    setupPrePostCheck();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
