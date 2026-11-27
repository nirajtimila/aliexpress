// ============================================================
// ALIEXPRESS DAILY COINS AUTO-COLLECTOR HUD PRO
// Injects directly into https://m.aliexpress.com/p/coin-index/index.html
// ============================================================
(async function initAliExpressCoinCollector() {
    // 0. Cleanup any previous instance
    const old = document.getElementById('ae-coins-panel');
    if (old) old.remove();

    console.log("%c[AliExpress Coins Pro] Initializing...", "color: #ff5000; font-weight: bold; font-size: 16px;");

    // Audio synthesizer
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playChime() {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        } catch(e) {}
    }

    // Robust Click for Alibaba Rax framework
    function simulateClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        try {
            const touch = new Touch({
                identifier: Date.now(),
                target: el,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                pageX: x + window.scrollX,
                pageY: y + window.scrollY
            });
            const touchInit = {
                bubbles: true,
                cancelable: true,
                view: window,
                touches: [touch],
                targetTouches: [touch],
                changedTouches: [touch]
            };
            el.dispatchEvent(new TouchEvent('touchstart', touchInit));
            el.dispatchEvent(new TouchEvent('touchend', touchInit));
        } catch(e) {}

        try {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
        } catch(e) {}

        try {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        } catch(e) {}

        el.click();
    }

    // Scrape Coin Balance
    function getCoinBalance() {
        const all = Array.from(document.querySelectorAll('div, span, p'));
        for (const el of all) {
            const txt = (el.innerText || '').trim();
            if (/^\d{1,6}$/.test(txt)) {
                const parent = el.parentElement ? el.parentElement.innerText : '';
                if (parent.includes('worth') || parent.includes('Coins helped')) {
                    const worthMatch = parent.match(/worth\s+([A-Z\$0-9\.]+)/i);
                    return {
                        coins: txt,
                        worth: worthMatch ? worthMatch[1] : ''
                    };
                }
            }
        }
        return { coins: '--', worth: '' };
    }

    // Check if claimed
    function isAlreadyClaimed() {
        const all = Array.from(document.querySelectorAll('div, span, button, p'));
        return all.some(el => {
            const t = (el.innerText || '').trim().toLowerCase();
            return t === 'collected' || t === 'already collected' || t === 'come back tomorrow' || t.includes('checked in');
        });
    }

    // Find Collect Button
    function findCollectButton() {
        const all = Array.from(document.querySelectorAll('button, div, span, a'));
        const exact = all.find(el => /^collect$/i.test((el.innerText || '').trim()) && el.children.length <= 1);
        if (exact) {
            return exact.closest('button, [role="button"], div') || exact;
        }

        // Secondary fallback
        for (const el of all) {
            const txt = (el.innerText || '').trim();
            if (txt.includes('Daily coins') || txt.includes('Today')) {
                const container = el.closest('[class*="daily"], [class*="card"], div') || el.parentElement;
                if (container) {
                    const btn = Array.from(container.querySelectorAll('div, button, span')).find(c => {
                        const ct = (c.innerText || '').trim();
                        return /collect/i.test(ct) && !/collected/i.test(ct);
                    });
                    if (btn) return btn;
                }
            }
        }
        return null;
    }

    // Find Bonus Task Buttons
    function findBonusTaskButtons() {
        const all = Array.from(document.querySelectorAll('div, button, span'));
        return all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);
    }

    // Create Floating HUD Panel
    const panel = document.createElement("div");
    panel.id = "ae-coins-panel";
    panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 310px;
        background: rgba(15, 17, 23, 0.96);
        color: #e0e6ed;
        border: 2px solid #ff5000;
        border-radius: 14px;
        box-shadow: 0 10px 35px rgba(0,0,0,0.8);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        padding: 16px;
        backdrop-filter: blur(10px);
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-weight:800; color:#ff5000; font-size:14px; display:flex; align-items:center; gap:6px;">
                🪙 AE COINS AUTO-COLLECT
            </span>
            <span id="ae-hud-status" style="font-size:11px; background:#222733; color:#00e676; padding:3px 8px; border-radius:10px; font-weight:600;">
                ACTIVE
            </span>
        </div>

        <div style="background:#090b10; border:1px solid #1f2533; border-radius:10px; padding:10px 14px; margin-bottom:12px;">
            <div style="font-size:11px; color:#888; text-transform:uppercase;">CURRENT COIN BALANCE</div>
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:2px;">
                <div id="ae-hud-coins" style="font-size:24px; font-weight:bold; color:#fff;">🪙 --</div>
                <div id="ae-hud-worth" style="font-size:12px; color:#ffaa00; font-weight:600;">--</div>
            </div>
        </div>

        <div style="margin-bottom:12px;">
            <div style="font-size:11px; color:#aaa; margin-bottom:4px;">STATUS:</div>
            <div id="ae-hud-msg" style="padding:8px 10px; border-radius:6px; background:#121622; border:1px solid #232a3d; font-size:12px; color:#00e676;">
                Scanning page...
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:10px;">
            <button id="ae-btn-collect" style="flex:1.5; padding:10px; background:linear-gradient(135deg, #ff5000, #ff8000); border:none; color:#fff; border-radius:8px; font-weight:700; cursor:pointer; font-size:13px; box-shadow:0 3px 10px rgba(255,80,0,0.3);">
                ⚡ Collect Coins
            </button>
            <button id="ae-btn-tasks" style="flex:1; padding:10px; background:#232a3d; border:1px solid #36415d; color:#fff; border-radius:8px; font-weight:600; cursor:pointer; font-size:12px;">
                🎯 Tasks (+5)
            </button>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:11px; color:#777; border-top:1px solid #222; padding-top:8px;">
            <span>Streak: <b id="ae-hud-streak" style="color:#ddd;">Day 1+</b></span>
            <span id="ae-hud-close" style="cursor:pointer; color:#ff5000;">✕ Minimize</span>
        </div>
    `;

    document.body.appendChild(panel);

    const statusEl = document.getElementById('ae-hud-status');
    const msgEl = document.getElementById('ae-hud-msg');
    const coinsEl = document.getElementById('ae-hud-coins');
    const worthEl = document.getElementById('ae-hud-worth');

    function updateBalanceUI() {
        const bal = getCoinBalance();
        if (bal.coins !== '--') {
            coinsEl.textContent = '🪙 ' + bal.coins;
            if (bal.worth) worthEl.textContent = 'worth ' + bal.worth;
        }
    }

    // Collection Action
    function executeCollect() {
        updateBalanceUI();

        if (isAlreadyClaimed()) {
            msgEl.textContent = '✓ Already collected today!';
            msgEl.style.color = '#00e676';
            statusEl.textContent = 'CLAIMED';
            statusEl.style.color = '#00e676';
            return;
        }

        const btn = findCollectButton();
        if (btn) {
            btn.style.outline = '4px solid #00e676';
            btn.style.boxShadow = '0 0 20px #00e676';
            simulateClick(btn);
            playChime();

            msgEl.textContent = '🎉 Clicked Collect! Coins claimed!';
            msgEl.style.color = '#00e676';
            statusEl.textContent = 'SUCCESS';
            statusEl.style.color = '#00e676';

            setTimeout(updateBalanceUI, 1500);
        } else {
            msgEl.textContent = '⚠️ Collect button not found or already claimed.';
            msgEl.style.color = '#ffaa00';
        }
    }

    // Tasks Action
    function executeTasks() {
        const tasks = findBonusTaskButtons();
        if (tasks.length === 0) {
            msgEl.textContent = 'No pending bonus task buttons found.';
            msgEl.style.color = '#aaa';
            return;
        }

        msgEl.textContent = `Found ${tasks.length} task buttons. Auto-clicking...`;
        msgEl.style.color = '#ffaa00';

        let delay = 300;
        tasks.forEach((b, idx) => {
            setTimeout(() => {
                const target = b.closest('[role="button"], div, button') || b;
                target.style.outline = '2px solid #ffaa00';
                simulateClick(target);
                playChime();
                msgEl.textContent = `Completed task ${idx + 1}/${tasks.length} (+${b.innerText})`;
            }, delay);
            delay += 1200;
        });

        setTimeout(() => {
            msgEl.textContent = '✓ All tasks completed!';
            msgEl.style.color = '#00e676';
            updateBalanceUI();
        }, delay + 500);
    }

    // Event Listeners
    document.getElementById('ae-btn-collect').addEventListener('click', executeCollect);
    document.getElementById('ae-btn-tasks').addEventListener('click', executeTasks);
    document.getElementById('ae-hud-close').addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // Auto-Run immediately on injection
    updateBalanceUI();
    executeCollect();
    setTimeout(executeTasks, 2000);

})();
