document.addEventListener('DOMContentLoaded', async () => {
  const badge = document.getElementById('acc-badge');
  const coinsDisplay = document.getElementById('coins-display');
  const coinsWorth = document.getElementById('coins-worth');
  const accInfo = document.getElementById('acc-info');
  const lastUpdated = document.getElementById('last-updated');
  const btnCollect = document.getElementById('btn-collect');
  const btnOpenMobile = document.getElementById('btn-open-mobile');
  const btnToggleAuto = document.getElementById('btn-toggle-auto');
  const statusMsg = document.getElementById('status-msg');

  // Load saved state
  const data = await chrome.storage.local.get(['coins', 'worth', 'email', 'userId', 'lastCollected', 'autoDaily']);
  
  if (data.coins) coinsDisplay.textContent = '🪙 ' + data.coins;
  if (data.worth) coinsWorth.textContent = '(' + data.worth + ')';
  if (data.email || data.userId) accInfo.textContent = 'Account: ' + (data.email || data.userId);
  if (data.lastCollected) lastUpdated.textContent = 'Last collected: ' + new Date(data.lastCollected).toLocaleTimeString();

  const autoDaily = data.autoDaily !== false;
  btnToggleAuto.textContent = autoDaily ? 'ON' : 'OFF';
  btnToggleAuto.className = autoDaily ? 'toggle-btn active' : 'toggle-btn';

  // Check login cookies
  const cookies = await chrome.cookies.getAll({ domain: 'aliexpress.com' });
  const xman = cookies.find(c => c.name === 'xman_us_t');
  const isConnected = !!xman;

  if (isConnected) {
    badge.textContent = '● Connected';
    badge.className = 'badge connected';
    
    try {
      const params = new URLSearchParams(decodeURIComponent(xman.value));
      const email = params.get('x_e') || params.get('x_user');
      const uid = params.get('x_u_i');
      if (email || uid) {
        accInfo.textContent = 'Account: ' + (email || ('ID ' + uid));
        chrome.storage.local.set({ email: email || '', userId: uid || '' });
      }
    } catch(e) {}
  } else {
    badge.textContent = '● Not Logged In';
    badge.className = 'badge disconnected';
    statusMsg.innerHTML = '⚠️ Please sign into AliExpress first.';
  }

  // View in Mobile Window (Exact iPhone 16 Pro Max dimensions + Mobile UA)
  btnOpenMobile.addEventListener('click', () => {
    chrome.windows.create({
      url: 'https://m.aliexpress.com/p/coin-index/index.html',
      type: 'popup',
      width: 440,
      height: 956
    });
  });

  // Toggle auto daily
  btnToggleAuto.addEventListener('click', async () => {
    const cur = btnToggleAuto.textContent === 'ON';
    const next = !cur;
    btnToggleAuto.textContent = next ? 'ON' : 'OFF';
    btnToggleAuto.className = next ? 'toggle-btn active' : 'toggle-btn';
    await chrome.storage.local.set({ autoDaily: next });
    statusMsg.textContent = next ? '✓ Daily 24h auto-collection activated!' : 'Daily auto-collection disabled.';
  });

  // Collect button
  btnCollect.addEventListener('click', async () => {
    btnCollect.disabled = true;
    btnCollect.textContent = 'Collecting...';
    statusMsg.textContent = 'Opening mobile coins session and claiming...';

    chrome.runtime.sendMessage({ action: 'trigger_collect' }, (res) => {
      btnCollect.disabled = false;
      btnCollect.textContent = '⚡ Collect Coins';
      
      if (res && res.success) {
        statusMsg.innerHTML = '<span style="color:#10b981;">🎉 ' + (res.message || 'Coins & tasks collected!') + '</span>';
        if (res.coins && res.coins !== '--') coinsDisplay.textContent = '🪙 ' + res.coins;
        if (res.worth) coinsWorth.textContent = '(' + res.worth + ')';
        lastUpdated.textContent = 'Last collected: ' + new Date().toLocaleTimeString();
      } else {
        statusMsg.innerHTML = '<span style="color:#f87171;">⚠️ ' + (res?.error || 'Could not collect.') + '</span>';
      }
    });
  });
});
