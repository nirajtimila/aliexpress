const puppeteer = require('puppeteer-core');

async function testCollect() {
    try {
        console.log('Connecting to Chrome on port 9222...');
        const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('coin-index')) || pages[0];
        console.log('Target Page URL:', page.url());

        // Check if user is logged in
        const state = await page.evaluate(() => {
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm') || (document.body && document.body.innerText.includes('COINS\nLog in'));
            const signBtn = document.getElementById('signButton');
            const mainCard = document.getElementById('sign-main-card');
            
            // Scrape balance
            let coins = null, worth = null;
            const all = Array.from(document.querySelectorAll('div, span, p'));
            for (const el of all) {
                const txt = (el.innerText || '').trim();
                if (/^\d{1,6}$/.test(txt) && el.children.length === 0) {
                    const p = el.parentElement ? el.parentElement.innerText : '';
                    if (p.includes('worth') || p.includes('Coins helped') || p.includes('saves')) {
                        coins = txt;
                        const wm = p.match(/worth\s+([A-Z\$0-9\.]+)|AU\$([0-9\.]+)/i);
                        if (wm) worth = wm[0];
                        break;
                    }
                }
            }

            return { hasLoginBtn, hasSignBtn: !!signBtn, hasMainCard: !!mainCard, coins, worth };
        });

        console.log('Mobile Page State:', state);

        if (state.hasLoginBtn) {
            console.log('Status: Window is open, waiting for you to complete 1-time log in.');
        } else {
            console.log('Logged in! Current Coins:', state.coins, 'Worth:', state.worth);
            // Click collect
            if (state.hasSignBtn || state.hasMainCard) {
                console.log('Triggering Collect...');
                await page.evaluate(() => {
                    const btn = document.getElementById('signButton') || document.getElementById('sign-main-card');
                    if (btn) (btn.closest('div') || btn).click();
                });
                console.log('Collect clicked!');
            }
        }

        await browser.disconnect();
    } catch(err) {
        console.error('Error connecting to port 9222:', err.message);
    }
}
testCollect();
