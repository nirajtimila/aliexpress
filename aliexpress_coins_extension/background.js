// Background Service Worker for AliExpress Coins Auto-Collector

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AE Extension] Installed! Setting up 24h daily alarm...');
  chrome.alarms.create('daily_auto_collect', { periodInMinutes: 1440 });
  chrome.storage.local.set({ autoDaily: true });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily_auto_collect') {
    chrome.storage.local.get(['autoDaily'], (res) => {
      if (res.autoDaily !== false) {
        console.log('[AE Extension] 24h Alarm fired: Running auto collect...');
        executeCoinCollection();
      }
    });
  }
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'trigger_collect') {
    executeCoinCollection()
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

/**
 * Automates collection on https://m.aliexpress.com/p/coin-index/index.html
 */
async function executeCoinCollection() {
  console.log('[AE Extension] Starting coin collection tab...');

  // Create background tab
  const tab = await chrome.tabs.create({
    url: 'https://m.aliexpress.com/p/coin-index/index.html',
    active: false
  });

  try {
    // Wait for page to load
    await new Promise(r => setTimeout(r, 6000));

    // Execute collection script inside page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inPageCollector
    });

    const data = results && results[0] ? results[0].result : null;

    if (data) {
      if (data.coins) {
        chrome.storage.local.set({
          coins: data.coins,
          worth: data.worth || '',
          lastCollected: new Date().toISOString()
        });
      }
      return data;
    }

    return { success: false, error: 'Could not extract coin data' };

  } finally {
    // Close background tab smoothly
    setTimeout(() => {
      try { chrome.tabs.remove(tab.id); } catch(e) {}
    }, 2000);
  }
}

// Injected into AliExpress page
function inPageCollector() {
  function smartClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'touch' })); } catch(e) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(e) {}
    try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'touch' })); } catch(e) {}
    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(e) {}
    try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(e) {}
    el.click();
    if (el.parentElement && el.parentElement !== document.body) {
      try { el.parentElement.click(); } catch(e) {}
    }
  }

  // 1. Scrape Balance
  const all = Array.from(document.querySelectorAll('div, span, p, button, a'));
  let coins = null;
  let worth = null;

  for (const el of all) {
    const txt = (el.innerText || '').trim();
    if (/^\d{1,6}$/.test(txt)) {
      const p = el.parentElement ? el.parentElement.innerText : '';
      if (p.includes('worth') || p.includes('Coins helped')) {
        coins = txt;
        worth = (p.match(/worth\s+([A-Z\$0-9\.]+)/i) || [])[1] || '';
        break;
      }
    }
  }

  // 2. Check if already claimed
  const alreadyClaimed = all.some(el => {
    const t = (el.innerText || '').trim().toLowerCase();
    return t === 'collected' || t === 'already collected' || t === 'come back tomorrow';
  });

  let message = alreadyClaimed ? 'Already collected today ✓' : '';

  // 3. Click Collect
  if (!alreadyClaimed) {
    const btn = all.find(el => /^collect$/i.test((el.innerText || '').trim()) && el.children.length <= 1) ||
                all.find(el => (el.innerText || '').toLowerCase().includes('collect') && (el.innerText || '').length < 20);
    if (btn) {
      smartClick(btn.closest('button, [role="button"]') || btn);
      message = 'Daily coins claimed! 🎉';
    }
  }

  // 4. Click Bonus Tasks (+1, +5)
  const taskBtns = all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);
  taskBtns.forEach((b, idx) => {
    setTimeout(() => {
      smartClick(b.closest('[role="button"], div, button') || b);
    }, (idx + 1) * 800);
  });

  return {
    success: true,
    coins: coins || '--',
    worth: worth || '',
    tasksCount: taskBtns.length,
    message: message || 'Tasks & coins processed!'
  };
}
