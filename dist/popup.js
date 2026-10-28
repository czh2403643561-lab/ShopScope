"use strict";
(() => {
  // src/popup.ts
  var button = document.querySelector("#toggle");
  var message = document.querySelector("#message");
  button?.addEventListener("click", () => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id || !tab.url?.startsWith("https://www.temu.com/")) {
        if (message) message.textContent = "\u8BF7\u5148\u6253\u5F00 Temu \u5546\u54C1\u5217\u8868\u9875\u3002";
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SHOP_SCOPE_PANEL" });
        window.close();
      } catch {
        if (message) message.textContent = "\u8BF7\u5237\u65B0 Temu \u9875\u9762\u540E\u518D\u8BD5\u3002";
      }
    });
  });
})();
