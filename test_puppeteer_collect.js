const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    const cookies = JSON.parse(fs.readFileSync('c:\\Users\\NT\\Downloads\\NNNN\\session_cookies.json', 'utf8'));
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);

    // Also set extra HTTP headers to match genuine mobile browser
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"iOS"'
    });

    // Set cookies for multiple domains: .aliexpress.com, m.aliexpress.com
    const extendedCookies = [];
    for (const c of cookies) {
        extendedCookies.push({
            name: c.name,
            value: c.value,
            domain: '.aliexpress.com',
            path: '/'
        });
        extendedCookies.push({
            name: c.name,
            value: c.value,
            domain: 'm.aliexpress.com',
            path: '/'
        });
    }
    await page.setCookie(...extendedCookies);

    // Listen to network requests to see mtop / checkin APIs
    page.on('response', async res => {
        const u = res.url();
        if (u.includes('mtop.') || u.includes('coin') || u.includes('sign')) {
            try {
                const text = await res.text();
                console.log(`[API RESPONSE] ${res.status()} ${u.slice(0, 80)} -> ${text.slice(0, 100)}`);
            } catch(e) {}
        }
    });

    console.log('Navigating...');
    await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', {
        waitUntil: 'networkidle2',
        timeout: 35000
    }).catch(e => console.log('Goto err:', e.message));

    await new Promise(r => setTimeout(r, 6000));

    console.log('Final URL:', page.url());
    const data = await page.evaluate(() => {
        return {
            body: document.body ? document.body.innerText.slice(0, 600) : '',
            allTexts: Array.from(document.querySelectorAll('div, button, span, p')).map(e => e.innerText.trim()).filter(Boolean).slice(0, 30)
        };
    });

    console.log('Body sample:\n', data.body);
    console.log('Texts sample:\n', data.allTexts.slice(0, 15));

    await page.screenshot({ path: 'c:\\Users\\NT\\Downloads\\NNNN\\test_mobile_page.png' });
    console.log('Screenshot saved to test_mobile_page.png');

    await browser.close();
})();
