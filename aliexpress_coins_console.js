// ============================================================
// ALIEXPRESS AUTO COLLECT - DEVTOOLS CONSOLE SNIPPET
// Paste this directly into your Chrome DevTools Console!
// ============================================================
(() => {
    console.log("%c[AliExpress Coins Auto-Collector] Running...", "color: #ff5000; font-weight: bold; font-size: 14px;");

    function simulateClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        try {
            const touch = new Touch({ identifier: Date.now(), target: el, clientX: x, clientY: y });
            el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch] }));
            el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [touch] }));
        } catch(e) {}

        try {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
        } catch(e) {}

        el.click();
    }

    // 1. Scan for the Collect button
    const allElements = Array.from(document.querySelectorAll("div, button, span, a"));
    
    // Check if already collected
    const alreadyClaimed = allElements.some(el => {
        const t = (el.innerText || "").trim().toLowerCase();
        return t === "collected" || t === "already collected" || t === "come back tomorrow";
    });

    if (alreadyClaimed) {
        console.log("%c✓ You have already collected today's coins!", "color: #00ff88; font-weight: bold; font-size: 14px;");
        return;
    }

    // Find the Collect button
    const collectBtn = allElements.find(el => {
        const t = (el.innerText || "").trim();
        return /^collect$/i.test(t) && el.children.length <= 1;
    });

    if (collectBtn) {
        const target = collectBtn.closest("button, [role='button'], div") || collectBtn;
        target.style.outline = "4px solid #00ff88";
        target.style.boxShadow = "0 0 15px #00ff88";
        console.log("%c✓ Found Collect button! Clicking...", "color: #00ff88; font-weight: bold; font-size: 14px;", target);
        simulateClick(target);

        setTimeout(() => {
            console.log("%c🎉 Daily Coins Collected Successfully!", "color: #ff5000; font-weight: bold; font-size: 16px;");
        }, 600);
    } else {
        console.warn("⚠️ Could not find 'Collect' button. Make sure the page is completely loaded in mobile view.");
    }

    // 2. Scan and click extra task buttons (+1, +5)
    const taskBtns = allElements.filter(el => {
        const t = (el.innerText || "").trim();
        return /^\+\d+$/.test(t) && el.children.length === 0;
    });

    if (taskBtns.length > 0) {
        console.log(`Found ${taskBtns.length} bonus task buttons (+1 / +5). Clicking them in sequence...`);
        let delay = 1000;
        taskBtns.forEach((btn, i) => {
            setTimeout(() => {
                const clickTarget = btn.closest("[role='button'], div, button") || btn;
                clickTarget.style.outline = "2px solid #ffcc00";
                console.log(`Clicking bonus task #${i + 1} (${btn.innerText})...`);
                simulateClick(clickTarget);
            }, delay);
            delay += 1200;
        });
    }
})();
