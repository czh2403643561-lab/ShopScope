import { handleSourcingMessage, handleSourcingTabRemoved, handleSourcingWindowRemoved, isSourcingMessage } from './sourcing-background';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isSourcingMessage(message)) return undefined;
  void handleSourcingMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : '1688搜图请求失败。' }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => handleSourcingTabRemoved(tabId));
chrome.windows.onRemoved.addListener((windowId) => handleSourcingWindowRemoved(windowId));
