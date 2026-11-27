(() => {
    // 1. Audio feedback
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}

    // 2. Dispatch Smart Touch / Pointer Click
    function smartClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
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

    // 3. Collect Daily Streak Button
    let claimed = false;
    const signBtn = document.getElementById('signButton');
    if (signBtn) {
        smartClick(signBtn.closest('div') || signBtn);
        smartClick(signBtn);
        claimed = true;
    }

    const mainCard = document.getElementById('sign-main-card');
    if (mainCard) {
        smartClick(mainCard);
        claimed = true;
    }

    const all = Array.from(document.querySelectorAll('button, div, span, a, p'));
    const collectText = all.find(el => {
        const t = (el.innerText || '').trim().toLowerCase();
        return t === 'collect' && el.children.length === 0;
    });
    if (collectText) {
        smartClick(collectText.closest('button, [role="button"], div') || collectText);
        claimed = true;
    }

    // Direct MTOP Invoke via Webpack runtime fallback
    if (window.webpackJsonp) {
        try {
            window.webpackJsonp.push([['auto_sign_' + Date.now()], {}, function(req) {
                try {
                    const signMod = req(240);
                    if (signMod && signMod.a) {
                        signMod.a({
                            playCode: "productSignInCoinChannel",
                            signTimeMills: Date.now(),
                            asac: "2E2280406IM61M8MG1F2FB"
                        }).then(r => {
                            console.log('[AliExpress Auto-Collector] MTOP Sign Result:', r);
                        });
                    }
                } catch(e) {}
            }]);
        } catch(e) {}
    }

    // 4. Auto-Complete Daily Bonus Tasks (+1, +5)
    const taskBtns = all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);
    taskBtns.forEach((b, i) => {
        setTimeout(() => {
            smartClick(b.closest('[role="button"], div, button') || b);
        }, 400 + i * 800);
    });

    // 5. Scrape Live Balance dynamically after click animation
    setTimeout(() => {
        const freshAll = Array.from(document.querySelectorAll('div, span, p, a, button'));
        let coins = null, worth = null, streak = null, user = null;

        for (const el of freshAll) {
            const t = (el.innerText || '').trim();
            if (/^\d{1,6}$/.test(t) && el.children.length === 0) {
                const parent = el.parentElement ? el.parentElement.innerText : '';
                if (parent.includes('worth') || parent.includes('Coins helped')) {
                    coins = t;
                    const wm = parent.match(/worth\s+([A-Z\$0-9\.]+)/i);
                    if (wm) worth = wm[1];
                    break;
                }
            }
        }

        const streakEl = freshAll.find(el => (el.innerText || '').includes('streak') || ((el.innerText || '').includes('Today') && (el.innerText || '').includes('Worth')));
        if (streakEl) {
            streak = streakEl.innerText.replace(/\n+/g, ' • ').trim();
        }

        const userEl = freshAll.find(el => (el.innerText || '').includes('Hi, ') || (el.innerText || '').includes('Welcome'));
        if (userEl) {
            const um = userEl.innerText.match(/(?:Hi,\s*|Welcome\s+back,\s*)([^\s\n\.,]+)/i);
            if (um) user = um[1];
        }

        // 6. Post Real Live Data to Dashboard
        fetch('http://localhost:3333/api/connect_cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cookies: document.cookie,
                username: user || 'nirajtimilatube',
                coins: coins,
                worth: worth,
                streak: streak || 'Active Streak',
                alreadyCollected: true
            })
        }).then(r => r.json()).then(data => {
            console.log('[Dashboard Synced]', data);
        }).catch(e => console.error('[Dashboard Sync Failed]', e));

        // 7. Render Floating Notification Toast on AliExpress page
        const oldToast = document.getElementById('ae-collector-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'ae-collector-toast';
        toast.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:16px 28px;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:15px;font-weight:700;z-index:2147483647;box-shadow:0 12px 35px rgba(0,0,0,0.45);text-align:center;border:2px solid #6ee7b7;animation:aeSlideDown 0.3s ease-out;';
        toast.innerHTML = '🪙 DAILY COINS COLLECTED! 🎉<br><span style="font-size:20px;color:#fef08a;">Balance: ' + (coins || 'Updated') + ' Coins</span> ' + (worth ? '<span style="font-size:13px;opacity:0.9;">(' + worth + ')</span>' : '') + '<br><span style="font-size:11px;font-weight:400;opacity:0.9;margin-top:4px;display:inline-block;">✓ Synced live with Dashboard at localhost:3333</span>';

        const style = document.createElement('style');
        style.textContent = '@keyframes aeSlideDown { from { transform: translate(-50%, -30px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }';
        document.head.appendChild(style);
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s ease';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 6000);

    }, 1200);
})();
