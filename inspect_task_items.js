const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');

(async () => {
    let isConnected = false;
    try {
        const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (v.ok) isConnected = true;
    } catch(e) {}

    if (!isConnected) {
        execSync('schtasks /run /tn "TestInteractiveChrome"');
        for (let i = 0; i < 6; i++) {
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

    // Emulate iPhone
    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
    const client = await page.target().createCDPSession();
    await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        userAgentMetadata: { mobile: true, platform: 'iOS', platformVersion: '17.0', architecture: '', model: 'iPhone', brands: [] }
    });

    await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));

    // Inspect task rows
    const tasks = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const taskRows = all.filter(el => {
            const t = (el.innerText || '');
            return (t.includes('Explore sponsored items') || t.includes('Browse recently viewed items')) && el.children.length > 0 && el.children.length < 10;
        });

        return taskRows.map(r => ({
            tag: r.tagName,
            className: r.className,
            text: r.innerText.replace(/\n+/g, ' | '),
            hasButton: !!r.querySelector('button, [class*="btn"], [class*="Button"]'),
            buttonText: r.querySelector('button, [class*="btn"], [class*="Button"]')?.innerText?.trim(),
            html: r.outerHTML.slice(0, 350)
        }));
    });

    console.log('Detected tasks:', JSON.stringify(tasks, null, 2));
    await browser.disconnect();
})();
