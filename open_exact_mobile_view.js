const puppeteer = require('puppeteer-core');
const { exec } = require('child_process');

async function fixAndOpenMobile() {
    let isConnected = false;
    try {
        const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (v.ok) isConnected = true;
    } catch(e) {}

    if (!isConnected) {
        console.log('Starting interactive mobile chrome...');
        exec('schtasks /run /tn "TestInteractiveChrome"');
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

    // Emulate iPhone completely (Device Metrics, Touch, and Client Hints)
    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
    
    // Also use raw CDP to enforce iOS platform metadata
    const client = await page.target().createCDPSession();
    await client.send('Network.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        userAgentMetadata: {
            mobile: true,
            platform: 'iOS',
            platformVersion: '17.0',
            architecture: '',
            model: 'iPhone',
            brands: []
        }
    });

    console.log('Navigating page to m.aliexpress.com/p/coin-index...');
    await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
    
    await new Promise(r => setTimeout(r, 3000));
    console.log('Current URL on screen:', page.url());
    await browser.disconnect();
}

fixAndOpenMobile();
