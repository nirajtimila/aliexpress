const puppeteer = require('puppeteer-core');
const { exec, execSync } = require('child_process');
const path = require('path');

(async () => {
    let isConnected = false;
    try {
        const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (v.ok) isConnected = true;
    } catch(e) {}

    if (!isConnected) {
        try { execSync('schtasks /run /tn "TestInteractiveChrome"'); } catch(e) {}
        for (let i = 0; i < 7; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
                if (v.ok) { isConnected = true; break; }
            } catch(e) {}
        }
    }

    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('coin')) || pages[0] || await browser.newPage();

    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
    const client = await page.target().createCDPSession();
    await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        userAgentMetadata: { mobile: true, platform: 'iOS', platformVersion: '17.0', architecture: '', model: 'iPhone', brands: [] }
    });

    console.log('Navigating to coin index...');
    await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));

    // Scroll down to task area
    await page.evaluate(() => window.scrollBy(0, 300));
    await new Promise(r => setTimeout(r, 1000));

    // Search for all task titles and text
    const taskInfo = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const matching = all.filter(e => {
            const t = (e.innerText || '').toLowerCase();
            return (t.includes('sponsor') || t.includes('explore') || t.includes('viewed') || t.includes('browse') || t.includes('order') || t.includes('water') || t.includes('share')) && e.children.length === 0;
        }).map(e => ({
            text: e.innerText.trim(),
            tag: e.tagName,
            parentText: e.parentElement ? e.parentElement.innerText.replace(/\n+/g, ' | ').slice(0, 150) : null,
            grandparentText: e.parentElement?.parentElement ? e.parentElement.parentElement.innerText.replace(/\n+/g, ' | ').slice(0, 200) : null
        }));
        return matching;
    });

    console.log('Matching tasks in DOM:', JSON.stringify(taskInfo, null, 2));
    await browser.disconnect();
})();
