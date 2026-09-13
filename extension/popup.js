/**
 * AI Shield - Semantic Trigger & Master Protection Popup
 * Controls master protection toggle and saves/retrieves custom semantic triggers.
 */

document.addEventListener("DOMContentLoaded", () => {
  const masterToggle = document.getElementById("masterToggle");
  const shieldStatusTitle = document.getElementById("shieldStatusTitle");
  const shieldStatusDesc = document.getElementById("shieldStatusDesc");
  const triggerInput = document.getElementById("triggerInput");
  const saveButton = document.getElementById("saveButton") || document.querySelector("button");
  const statusMessage = document.getElementById("statusMessage");
  const btnOpenDemo = document.getElementById("btnOpenDemo");

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

  // Retrieve saved state when popup opens
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["enabled", "trigger", "triggerInput"], (data) => {
      const isEnabled = data.enabled !== undefined ? data.enabled : true;
      if (masterToggle) {
        masterToggle.checked = isEnabled;
        updateToggleLabels(isEnabled);
      }
      if (triggerInput) {
        triggerInput.value = data.trigger || data.triggerInput || "";
      }
    });

    // Listen to storage changes to keep toggle in sync if changed elsewhere
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.enabled !== undefined && masterToggle) {
          masterToggle.checked = changes.enabled.newValue;
          updateToggleLabels(changes.enabled.newValue);
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
