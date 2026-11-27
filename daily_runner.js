/**
 * AliExpress Autonomous Daily Coins Runner
 * Designed to run independently via Windows Task Scheduler every day.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MOBILE_SESSION_DIR = path.join(__dirname, 'chrome_mobile_session');
const ACCOUNT_FILE = path.join(__dirname, 'account.json');

async function runDaily() {
    console.log(`[${new Date().toLocaleString()}] Starting AliExpress Daily Coins Auto-Collector...`);

    // 1. If server is active on 3333, trigger collection via API
    try {
        const res = await fetch('http://127.0.0.1:3333/api/collect', { method: 'POST', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            console.log('[✓] Triggered via active Dashboard Engine on port 3333!');
            return;
        }
    } catch(e) {}

    // 2. Otherwise, run standalone via port 9222 / interactive task
    let isConnectedLive = false;
    try {
        const vRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (vRes.ok) isConnectedLive = true;
    } catch(e) {}

    if (!isConnectedLive) {
        console.log('[i] Launching mobile session on port 9222...');
        exec('schtasks /run /tn "TestInteractiveChrome"');
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const vRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
                if (vRes.ok) {
                    isConnectedLive = true;
                    break;
                }
            } catch(e) {}
        }
    }

    if (!isConnectedLive) {
        console.error('[!] Could not attach to mobile browser window.');
        return;
    }

    try {
        const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
        const pages = await browser.pages();
        let page = pages.find(p => p.url().includes('coin-index')) || pages[0];

        if (!page || !page.url().includes('coin-index')) {
            page = page || await browser.newPage();
            await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
        }

        await new Promise(r => setTimeout(r, 4000));

        // Click collect
        const collected = await page.evaluate(() => {
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
            }

            const sBtn = document.getElementById('signButton') ||
                         document.querySelector('.aecoin-checkInButton-jC2Uo') ||
                         document.querySelector('.aecoin-signButton-gaDga') ||
                         document.querySelector('.aecoin-checkInAura-36sJZ');
            if (sBtn) {
                smartClick(sBtn.closest('.aecoin-signButtonWrapper-21Q3m') || sBtn);
                smartClick(sBtn);
                return true;
            }
            return false;
        });

        console.log('[i] Daily Check-in Collect click triggered:', collected);

        // Click bonus tasks
        await new Promise(r => setTimeout(r, 2000));
        await page.evaluate(async () => {
            function smartClick(el) {
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
                try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'touch' })); } catch(e) {}
                try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(e) {}
                el.click();
            }
            const all = Array.from(document.querySelectorAll('div, button, span'));
            const taskBtns = all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);
            for (const b of taskBtns) {
                smartClick(b.closest('[role="button"], div, button') || b);
                await new Promise(r => setTimeout(r, 1000));
            }
        });

        // Re-scrape balance
        await new Promise(r => setTimeout(r, 2000));
        const finalBalance = await page.evaluate(() => {
            let coins = null, worth = null;
            const scrollNumber = document.querySelector('.aecoin-scroll-number-x0PUc');
            if (scrollNumber) {
                const containers = Array.from(scrollNumber.querySelectorAll('.aecoin-number-container-3pIdj, [class*="number-container"]'));
                const digits = containers.map(c => {
                    if (c.id && /^\d+-(\d+)$/.test(c.id)) return c.id.match(/^\d+-(\d+)$/)[1];
                    const m = c.className.match(/num(\d+)/i);
                    if (m) return m[1];
                    return '';
                }).join('');
                if (digits) coins = digits;
            }
            const worthEl = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').includes('worth') && e.children.length === 0);
            if (worthEl) {
                const wm = worthEl.innerText.match(/worth\s*([A-Z\$0-9\.]+)/i);
                if (wm) worth = wm[1];
            }
            return { coins, worth };
        });

        console.log('[✓] Updated Live Balance:', finalBalance);

        if (finalBalance.coins && fs.existsSync(ACCOUNT_FILE)) {
            try {
                const acc = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
                acc.coins = finalBalance.coins;
                if (finalBalance.worth) acc.worth = finalBalance.worth;
                acc.lastCollected = new Date().toISOString();
                fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(acc, null, 2));
            } catch(e) {}
        }

        await browser.disconnect();
        console.log('[✓] Daily collection finished successfully!');
    } catch(err) {
        console.error('[!] Daily Runner error:', err.message);
    }
}

runDaily();
