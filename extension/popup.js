/**
 * AI Shield - Popup Interface Logic
 * Controls protection master toggle, backend connection status,
 * sensitivity presets, statistics, and demo launcher.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const masterToggle = document.getElementById("masterToggle");
  const shieldStatusTitle = document.getElementById("shieldStatusTitle");
  const shieldStatusDesc = document.getElementById("shieldStatusDesc");
  const backendDot = document.getElementById("backendDot");
  const backendStatusText = document.getElementById("backendStatusText");
  const btnRefreshHealth = document.getElementById("btnRefreshHealth");
  const statScanned = document.getElementById("statScanned");
  const statBlocked = document.getElementById("statBlocked");
  const sensitivityTag = document.getElementById("sensitivityTag");
  const sensitivityExplanation = document.getElementById("sensitivityExplanation");
  const segmentBtns = document.querySelectorAll(".segment-btn");
  const btnOpenDemo = document.getElementById("btnOpenDemo");
  const btnResetStats = document.getElementById("btnResetStats");

  const SENSITIVITY_CONFIGS = {
    strict: {
      threshold: 0.5,
      label: "Strict (50%)",
      desc: "Maximum safety: filters subtle insults, sarcasm, and offensive undertones.",
    },
    balanced: {
      threshold: 0.7,
      label: "Balanced (70%)",
      desc: "Standard protection: blocks overt insults, hate speech, and harassment.",
    },
    relaxed: {
      threshold: 0.85,
      label: "Relaxed (85%)",
      desc: "Minimal filtering: blocks only severe threats and explicit abuse.",
    },
  };

  // Load Initial State
  function loadState() {
    chrome.storage.local.get(
      ["enabled", "threshold", "sensitivity", "posts_scanned", "threats_blocked"],
      (data) => {
        const isEnabled = data.enabled !== undefined ? data.enabled : true;
        masterToggle.checked = isEnabled;
        updateToggleLabels(isEnabled);

        const currentSensitivity = data.sensitivity || "balanced";
        updateSensitivityUI(currentSensitivity);

        statScanned.textContent = (data.posts_scanned || 0).toLocaleString();
        statBlocked.textContent = (data.threats_blocked || 0).toLocaleString();
      }
    );

    checkBackend();
  }

  // Update Master Toggle Labels
  function updateToggleLabels(enabled) {
    if (enabled) {
      shieldStatusTitle.textContent = "Protection Active";
      shieldStatusDesc.textContent = "Filtering toxic posts in real time";
    } else {
      shieldStatusTitle.textContent = "Protection Paused";
      shieldStatusDesc.textContent = "Feed filtering is currently turned off";
    }
  }

  // Master Toggle Change Event
  masterToggle.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    updateToggleLabels(isChecked);
    chrome.storage.local.set({ enabled: isChecked });
  });

  // Check Backend Connection via Background Worker
  function checkBackend() {
    backendDot.className = "status-dot";
    backendStatusText.textContent = "Checking backend...";

    chrome.runtime.sendMessage({ type: "CHECK_HEALTH" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.online) {
        backendDot.className = "status-dot disconnected";
        backendStatusText.textContent = "Backend Offline";
        backendStatusText.title = "FastAPI server is not running on localhost:8000";
      } else {
        backendDot.className = "status-dot connected";
        backendStatusText.textContent = "Connected (localhost:8000)";
        backendStatusText.title = `Model Loaded: ${res.model_loaded ? "Yes" : "No"}`;
      }
    });
  }

  btnRefreshHealth.addEventListener("click", () => {
    checkBackend();
  });

  // Sensitivity Selection
  function updateSensitivityUI(level) {
    const config = SENSITIVITY_CONFIGS[level] || SENSITIVITY_CONFIGS.balanced;

    segmentBtns.forEach((btn) => {
      if (btn.dataset.level === level) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    sensitivityTag.textContent = config.label;
    sensitivityExplanation.textContent = config.desc;
  }

  segmentBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.level;
      const config = SENSITIVITY_CONFIGS[level];
      if (!config) return;

      updateSensitivityUI(level);
      chrome.storage.local.set({
        sensitivity: level,
        threshold: config.threshold,
      });
    });
  });

  // Reset Stats Button
  btnResetStats.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESET_STATS" }, () => {
      statScanned.textContent = "0";
      statBlocked.textContent = "0";
    });
  });

  // Scan Current Page Button
  const btnScanCurrentPage = document.getElementById("btnScanCurrentPage");
  if (btnScanCurrentPage) {
    btnScanCurrentPage.addEventListener("click", async () => {
      btnScanCurrentPage.innerHTML = "<span>⏳ Scanning Page...</span>";
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE_NOW" }, async (res) => {
            if (chrome.runtime.lastError) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ["content.js"],
                });
                await chrome.scripting.insertCSS({
                  target: { tabId: tab.id },
                  files: ["content.css"],
                });
                btnScanCurrentPage.innerHTML = "<span>✓ Injected & Scanned!</span>";
              } catch (err) {
                btnScanCurrentPage.innerHTML = "<span>⚠️ Refresh tab (F5) to enable</span>";
              }
            } else {
              btnScanCurrentPage.innerHTML = "<span>✓ Page Scanned!</span>";
            }
            setTimeout(() => {
              btnScanCurrentPage.innerHTML = "<span>⚡ Scan Current Page Now</span>";
            }, 2500);
          });
        }
      } catch (e) {
        btnScanCurrentPage.innerHTML = "<span>⚠️ Refresh tab (F5) to enable</span>";
        setTimeout(() => {
          btnScanCurrentPage.innerHTML = "<span>⚡ Scan Current Page Now</span>";
        }, 2500);
      }
    });
  }

  // Open Test Demo Page
  btnOpenDemo.addEventListener("click", () => {
    const demoUrl = chrome.runtime.getURL("demo.html");
    chrome.tabs.create({ url: demoUrl });
  });

  // Listen for storage changes while popup is open to keep counters live
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.posts_scanned) {
      statScanned.textContent = (changes.posts_scanned.newValue || 0).toLocaleString();
    }
    if (changes.threats_blocked) {
      statBlocked.textContent = (changes.threats_blocked.newValue || 0).toLocaleString();
    }
    if (changes.enabled !== undefined) {
      masterToggle.checked = changes.enabled.newValue;
      updateToggleLabels(changes.enabled.newValue);
    }
    if (changes.sensitivity) {
      updateSensitivityUI(changes.sensitivity.newValue);
    }
  });

  loadState();
});
