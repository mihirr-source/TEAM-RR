/**
 * AI Shield - Semantic Trigger & Master Protection Popup
 * Controls master protection toggle, displays live statistics (total analyzed, words discarded),
 * and saves/retrieves custom semantic triggers.
 */

document.addEventListener("DOMContentLoaded", () => {
  const masterToggle = document.getElementById("masterToggle");
  const shieldStatusTitle = document.getElementById("shieldStatusTitle");
  const shieldStatusDesc = document.getElementById("shieldStatusDesc");
  const triggerInput = document.getElementById("triggerInput");
  const saveButton = document.getElementById("saveButton") || document.querySelector("button");
  const statusMessage = document.getElementById("statusMessage");
  const btnOpenDemo = document.getElementById("btnOpenDemo");
  const statAnalyzed = document.getElementById("statAnalyzed");
  const statDiscarded = document.getElementById("statDiscarded");
  const btnResetStats = document.getElementById("btnResetStats");

  function updateToggleLabels(enabled) {
    if (shieldStatusTitle && shieldStatusDesc) {
      if (enabled) {
        shieldStatusTitle.textContent = "Protection Active";
        shieldStatusDesc.textContent = "Filtering toxic posts & triggers";
      } else {
        shieldStatusTitle.textContent = "Protection Paused";
        shieldStatusDesc.textContent = "Protection is currently turned off";
      }
    }
  }

  function updateStats(scanned, blocked) {
    if (statAnalyzed) {
      statAnalyzed.textContent = Number(scanned || 0).toLocaleString();
    }
    if (statDiscarded) {
      statDiscarded.textContent = Number(blocked || 0).toLocaleString();
    }
  }

  // Retrieve saved state and statistics when popup opens
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      ["enabled", "trigger", "triggerInput", "posts_scanned", "threats_blocked"],
      (data) => {
        const isEnabled = data.enabled !== undefined ? data.enabled : true;
        if (masterToggle) {
          masterToggle.checked = isEnabled;
          updateToggleLabels(isEnabled);
        }
        if (triggerInput) {
          triggerInput.value = data.trigger || data.triggerInput || "";
        }
        updateStats(data.posts_scanned, data.threats_blocked);
      }
    );

    // Listen to storage changes to keep toggle and stats live in real time
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.enabled !== undefined && masterToggle) {
          masterToggle.checked = changes.enabled.newValue;
          updateToggleLabels(changes.enabled.newValue);
        }

        if (changes.posts_scanned !== undefined && statAnalyzed) {
          statAnalyzed.textContent = Number(changes.posts_scanned.newValue || 0).toLocaleString();
        }

        if (changes.threats_blocked !== undefined && statDiscarded) {
          statDiscarded.textContent = Number(changes.threats_blocked.newValue || 0).toLocaleString();
        }
      });
    }
  }

  // Master Toggle Change Event
  if (masterToggle) {
    masterToggle.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      updateToggleLabels(isChecked);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ enabled: isChecked }, () => {
          console.log("[AI Shield] Protection enabled state set to:", isChecked);
        });
      }
    });
  }

  // Save input value to chrome.storage.local when clicked
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const val = triggerInput ? triggerInput.value.trim() : "";

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ trigger: val, triggerInput: val }, () => {
          console.log("[AI Shield] Trigger saved to chrome.storage.local:", val);
          if (statusMessage) {
            statusMessage.textContent = "✓ Trigger saved successfully!";
            statusMessage.style.color = "#10b981";
            setTimeout(() => {
              if (statusMessage) statusMessage.textContent = "";
            }, 2500);
          }
        });
      }
    });
  }

  // Allow Enter key in triggerInput to also trigger Save
  if (triggerInput) {
    triggerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveButton.click();
      }
    });
  }

  // Reset Stats button handler
  if (btnResetStats) {
    btnResetStats.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ posts_scanned: 0, threats_blocked: 0 }, () => {
          updateStats(0, 0);
          console.log("[AI Shield] Statistics reset to 0.");
        });
      }
    });
  }

  // Demo link handler
  if (btnOpenDemo) {
    btnOpenDemo.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.runtime) {
        const demoUrl = chrome.runtime.getURL("demo.html");
        chrome.tabs.create({ url: demoUrl });
      } else {
        window.open("demo.html", "_blank");
      }
    });
  }
});
