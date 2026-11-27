// ============================================================
// ALIEXPRESS DAILY COINS & TASKS SNIPER PRO
// Run in Chrome DevTools Console on https://m.aliexpress.com/p/coin-index/index.html
// ============================================================
(function initAliExpressSniperPro() {
    // 1. Clean previous instance
    const old = document.getElementById('ae-sniper-pro-panel');
    if (old) old.remove();

    console.log("%c[AE Coins Sniper Pro] Initializing...", "color: #ff5000; font-weight: 800; font-size: 16px;");

    // Audio synthesizer for feedback
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function beep(freq = 880, dur = 0.15) {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
            osc.start();
            osc.stop(audioCtx.currentTime + dur);
        } catch(e) {}
    }

    // Bulletproof click dispatcher (handles Rax, React, Pointer, Mouse, Native)
    function smartClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

        try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'touch' })); } catch(e) {}
        try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(e) {}
        try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'touch' })); } catch(e) {}
        try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(e) {}
        try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(e) {}
        el.click();

        // Also trigger parent if element is a text/icon child
        if (el.parentElement && el.parentElement !== document.body && el.parentElement.tagName !== 'HTML') {
            try { el.parentElement.click(); } catch(e) {}
        }
    }

    // 2. Scrape Coin Balance
    function getBalance() {
        const all = Array.from(document.querySelectorAll('div, span, p'));
        for (const el of all) {
            const txt = (el.innerText || '').trim();
            if (/^\d{1,6}$/.test(txt)) {
                const parentText = el.parentElement ? el.parentElement.innerText : '';
                if (parentText.includes('worth') || parentText.includes('Coins helped')) {
                    const worth = (parentText.match(/worth\s+([A-Z\$0-9\.]+)/i) || [])[1] || '';
                    return { coins: txt, worth };
                }
            }
        }
        return { coins: '--', worth: '' };
    }

    // 3. Find Collect Button
    function findCollectButton() {
        const all = Array.from(document.querySelectorAll('button, div, span, a, p'));

        // Strategy A: Exact or near-exact "Collect" text
        for (const el of all) {
            const txt = (el.innerText || '').trim();
            if (/^collect$/i.test(txt)) {
                return el.closest('button, [role="button"]') || el;
            }
        }

        // Strategy B: Element containing "Collect" inside Daily coins area
        for (const el of all) {
            const txt = (el.innerText || '').trim();
            if (/collect/i.test(txt) && !/collected/i.test(txt) && txt.length < 25) {
                return el.closest('button, [role="button"]') || el;
            }
        }

        // Strategy C: Orange button next to streak items
        const dailyStreak = all.find(el => (el.innerText || '').includes('Today') && (el.innerText || '').includes('Worth'));
        if (dailyStreak) {
            const parent = dailyStreak.closest('div[class*="daily"], div[class*="card"], div') || dailyStreak.parentElement;
            if (parent) {
                const orangeBtn = Array.from(parent.querySelectorAll('div, button, span')).find(c => {
                    const bg = window.getComputedStyle(c).backgroundColor;
                    const isOrange = bg.includes('255, 80') || bg.includes('255, 120') || bg.includes('255, 100') || bg.includes('255, 136');
                    return isOrange && (c.innerText || '').trim().length > 0;
                });
                if (orangeBtn) return orangeBtn;
            }
        }

        return null;
    }

    // 4. Check if already collected
    function isAlreadyCollected() {
        const all = Array.from(document.querySelectorAll('div, span, button, p'));
        return all.some(el => {
            const txt = (el.innerText || '').trim().toLowerCase();
            return txt === 'collected' || txt === 'already collected' || txt === 'come back tomorrow' || txt.includes('checked in');
        });
    }

    // 5. Find Bonus Task Buttons
    function findTaskButtons() {
        const all = Array.from(document.querySelectorAll('div, button, span'));
        return all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);
    }

    // 6. Create Floating HUD
    const panel = document.createElement("div");
    panel.id = "ae-sniper-pro-panel";
    panel.style.cssText = `
        position: fixed;
        bottom: 15px;
        right: 15px;
        z-index: 2147483647;
        width: 320px;
        background: rgba(13, 16, 23, 0.96);
        color: #e6edf3;
        border: 2px solid #ff5000;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.85);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        padding: 14px;
        backdrop-filter: blur(10px);
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:800; color:#ff5000; font-size:14px; display:flex; align-items:center; gap:6px;">
                🪙 AE COINS SNIPER PRO
            </span>
            <span id="ae-hud-badge" style="font-size:11px; background:#1f2937; color:#10b981; padding:2px 8px; border-radius:10px; font-weight:700;">
                READY
            </span>
        </div>

        <div style="background:#090d16; border:1px solid #1e293b; border-radius:8px; padding:8px 12px; margin-bottom:10px;">
            <div style="font-size:10px; color:#888; text-transform:uppercase;">COIN BALANCE</div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:2px;">
                <div id="ae-hud-balance" style="font-size:22px; font-weight:bold; color:#fff;">🪙 --</div>
                <div id="ae-hud-worth" style="font-size:12px; color:#f59e0b; font-weight:600;">--</div>
            </div>
        </div>

        <div style="margin-bottom:10px;">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">TARGET / STATUS:</div>
            <div id="ae-hud-status" style="padding:8px 10px; border-radius:6px; background:#111827; border:1px solid #374151; font-size:12px; color:#10b981; min-height:18px;">
                Scanning for Collect button...
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:8px;">
            <button id="ae-btn-collect" style="flex:1.5; padding:10px; background:linear-gradient(135deg, #ff5000, #ff8000); border:none; color:#fff; border-radius:6px; font-weight:700; cursor:pointer; font-size:13px; box-shadow:0 3px 12px rgba(255,80,0,0.35);">
                ⚡ Collect Coins
            </button>
            <button id="ae-btn-tasks" style="flex:1; padding:10px; background:#1e293b; border:1px solid #334155; color:#fff; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px;">
                🎯 Tasks (+5)
            </button>
        </div>

        <div style="font-size:11px; color:#64748b; text-align:center; padding-top:6px; border-top:1px solid #1e293b;">
            💡 Click any button on screen to manually target it
        </div>
    `;

    document.body.appendChild(panel);

    const statusEl = document.getElementById('ae-hud-status');
    const badgeEl = document.getElementById('ae-hud-badge');
    const balanceEl = document.getElementById('ae-hud-balance');
    const worthEl = document.getElementById('ae-hud-worth');

    function updateBalance() {
        const b = getBalance();
        if (b.coins !== '--') {
            balanceEl.textContent = '🪙 ' + b.coins;
            if (b.worth) worthEl.textContent = 'worth ' + b.worth;
        }
    }

    let targetButton = null;

    // Scan loop
    const scanInterval = setInterval(() => {
        updateBalance();

        if (isAlreadyCollected()) {
            statusEl.innerHTML = '<span style="color:#10b981;">✓ Daily Coins ALREADY collected today!</span>';
            badgeEl.textContent = 'CLAIMED';
            badgeEl.style.color = '#10b981';
            return;
        }

        if (!targetButton) {
            targetButton = findCollectButton();
            if (targetButton) {
                targetButton.style.outline = '4px solid #10b981';
                targetButton.style.boxShadow = '0 0 20px rgba(16,185,129,0.9)';
                statusEl.innerHTML = `🎯 <b style="color:#10b981;">Found:</b> "${(targetButton.innerText || '').trim()}"`;
                badgeEl.textContent = 'TARGETED';
            }
        }
    }, 500);

    // Collect Action
    function doCollect() {
        updateBalance();

        if (isAlreadyCollected()) {
            statusEl.innerHTML = '<span style="color:#10b981;">✓ Already collected today!</span>';
            beep(600, 0.1);
            return;
        }

        const btn = targetButton || findCollectButton();
        if (btn) {
            btn.style.outline = '4px solid #10b981';
            btn.style.boxShadow = '0 0 25px #10b981';
            smartClick(btn);
            beep(1000, 0.2);

            statusEl.innerHTML = '<b style="color:#10b981;">🎉 Clicked Collect! Coins Claimed!</b>';
            badgeEl.textContent = 'SUCCESS';
            badgeEl.style.color = '#10b981';

            setTimeout(updateBalance, 1500);
            setTimeout(updateBalance, 3000);
        } else {
            statusEl.innerHTML = '<span style="color:#f59e0b;">⚠️ Button not found. Click the button on screen manually to select it.</span>';
            beep(400, 0.2);
        }
    }

    // Tasks Action
    function doTasks() {
        const tasks = findTaskButtons();
        if (tasks.length === 0) {
            statusEl.innerHTML = '<span>No pending task buttons (+1/+5) found.</span>';
            return;
        }

        statusEl.innerHTML = `<span style="color:#f59e0b;">Found ${tasks.length} tasks. Auto-clicking...</span>`;
        let delay = 300;
        tasks.forEach((b, idx) => {
            setTimeout(() => {
                const target = b.closest('[role="button"], div, button') || b;
                target.style.outline = '3px solid #f59e0b';
                smartClick(target);
                beep(800 + idx * 100, 0.1);
                statusEl.innerHTML = `<span>Clicked task ${idx + 1}/${tasks.length} (+${b.innerText})</span>`;
            }, delay);
            delay += 1200;
        });

        setTimeout(() => {
            statusEl.innerHTML = '<b style="color:#10b981;">✓ All bonus tasks completed!</b>';
            updateBalance();
        }, delay + 500);
    }

    // Manual click selector override
    document.addEventListener('click', (e) => {
        if (e.target.closest('#ae-sniper-pro-panel')) return;
        targetButton = e.target.closest('button, [role="button"]') || e.target;
        targetButton.style.outline = '3px solid #10b981';
        targetButton.style.boxShadow = '0 0 15px rgba(16,185,129,0.8)';
        statusEl.innerHTML = `🎯 <b style="color:#10b981;">Target set to:</b> "${(targetButton.innerText || '').trim().slice(0, 20)}"`;
        beep(750, 0.05);
    }, true);

    document.getElementById('ae-btn-collect').addEventListener('click', doCollect);
    document.getElementById('ae-btn-tasks').addEventListener('click', doTasks);

    // Run automatically on inject
    setTimeout(doCollect, 800);
    setTimeout(doTasks, 2500);

    console.log("%c[AE Coins Sniper Pro] Ready! HUD active.", "color: #10b981; font-weight: bold;");
})();
