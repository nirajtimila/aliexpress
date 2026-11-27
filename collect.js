const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');

async function runCollector() {
    console.log("==================================================");
    console.log("     AliExpress Daily Coins Auto-Collector        ");
    console.log("==================================================");

    if (!fs.existsSync(COOKIES_FILE)) {
        console.error("\n[⚠️] Account not connected yet!");
        console.error("Please run login.bat once to connect your AliExpress account.\n");
        return;
    }

    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    console.log(`[✓] Loaded ${cookies.length} session cookies.`);

    console.log("[i] Launching mobile collector engine (Headless iPhone mode)...");
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    try {
        const page = (await browser.pages())[0];
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
        await page.setCookie(...cookies);

        console.log("[i] Loading https://m.aliexpress.com/p/coin-index/index.html...");
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await new Promise(r => setTimeout(r, 4500));

        // Check login
        const loggedIn = await page.evaluate(() => {
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm');
            const txt = (document.body ? document.body.innerText : '');
            return !hasLoginBtn && !txt.includes('COINS\nLog in');
        });

        if (!loggedIn) {
            console.error("\n[⚠️] Session expired! Please run login.bat again to reconnect.\n");
            return;
        }

        // Check if already claimed
        const alreadyClaimed = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('div, span, button, p'));
            return all.some(el => {
                const txt = (el.innerText || '').trim().toLowerCase();
                return txt === 'collected' || txt === 'already collected' || txt === 'come back tomorrow';
            });
        });

        if (alreadyClaimed) {
            console.log("[✓] Daily check-in: Already collected today!");
        } else {
            console.log("[i] Claiming daily check-in coins...");
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

                const all = Array.from(document.querySelectorAll('button, div, span, a, p'));
                const btn = all.find(el => /^collect$/i.test((el.innerText || '').trim())) ||
                            all.find(el => (el.innerText || '').toLowerCase().includes('collect') && (el.innerText || '').length < 25);
                if (btn) {
                    smartClick(btn.closest('button, [role="button"]') || btn);
                    return true;
                }
                return false;
            });

            if (collected) {
                console.log("[🎉] SUCCESS! Daily Streak Coins Claimed!");
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log("[i] Streak button not found or already claimed.");
            }
        }

        // Complete bonus tasks
        console.log("[i] Checking bonus tasks (+1, +5)...");
        const tasksClaimed = await page.evaluate(async () => {
            function smartClick(el) {
                const rect = el.getBoundingClientRect();
                const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
                try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'touch' })); } catch(e) {}
                try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(e) {}
                try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'touch' })); } catch(e) {}
                try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(e) {}
                try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(e) {}
                el.click();
            }

            const all = Array.from(document.querySelectorAll('div, button, span'));
            const taskBtns = all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0);

            for (const b of taskBtns) {
                const target = b.closest('[role="button"], div, button') || b;
                smartClick(target);
                await new Promise(r => setTimeout(r, 1000));
            }
            return taskBtns.length;
        });

        if (tasksClaimed > 0) {
            console.log(`[✓] Completed ${tasksClaimed} bonus tasks!`);
        } else {
            console.log("[i] No pending bonus tasks found.");
        }

        // Get final balance
        const balance = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('div, span, p'));
            for (const el of all) {
                const txt = (el.innerText || '').trim();
                if (/^\d{1,6}$/.test(txt)) {
                    const p = el.parentElement ? el.parentElement.innerText : '';
                    if (p.includes('worth') || p.includes('Coins helped')) {
                        const worth = (p.match(/worth\s+([A-Z\$0-9\.]+)/i) || [])[1] || '';
                        return { coins: txt, worth };
                    }
                }
            }
            return null;
        });

        console.log("\n==================================================");
        if (balance) {
            console.log(`[🪙] CURRENT BALANCE: ${balance.coins} Coins (${balance.worth})`);
        }
        console.log("[✓] Daily collection finished successfully!");
        console.log("==================================================\n");

        // Save updated cookies
        const updatedCookies = await page.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(updatedCookies, null, 2));

    } catch(err) {
        console.error("[ERROR]", err.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    runCollector();
}

module.exports = { runCollector };
