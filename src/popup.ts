const button = document.querySelector<HTMLButtonElement>('#toggle');
const message = document.querySelector<HTMLDivElement>('#message');

button?.addEventListener('click', () => {
  void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab?.id || !tab.url?.startsWith('https://www.temu.com/')) {
      if (message) message.textContent = '请先打开 Temu 商品列表页。';
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SHOP_SCOPE_PANEL' });
      window.close();
    } catch {
      if (message) message.textContent = '请刷新 Temu 页面后再试。';
    }
  });
});
