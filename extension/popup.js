/**
 * AI Shield - Semantic Trigger Filter Popup
 * Saves and retrieves the custom semantic trigger phrase to/from chrome.storage.local.
 */

document.addEventListener("DOMContentLoaded", () => {
  const triggerInput = document.getElementById("triggerInput");
  const saveButton = document.getElementById("saveButton") || document.querySelector("button");
  const statusMessage = document.getElementById("statusMessage");
  const btnOpenDemo = document.getElementById("btnOpenDemo");

  // Retrieve saved trigger value when popup opens
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["trigger", "triggerInput"], (data) => {
      if (triggerInput) {
        triggerInput.value = data.trigger || data.triggerInput || "";
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
