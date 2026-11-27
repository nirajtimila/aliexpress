const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');

(async () => {
    console.log("==================================================");
    console.log("   AliExpress Account Connector (One-Time Login)  ");
    console.log("==================================================");
    console.log("\nLaunching mobile login window directly on your screen...\n");

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        args: [
            '--window-size=450,940',
            '--window-position=250,60',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);

    await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded' });
    console.log("[✓] Mobile window is open!");
    console.log("[👉] Please tap 'Log in' in the window and sign into your account.\n");
    console.log("Waiting for sign in (window will stay open until you complete login)...");

    let isClosed = false;
    browser.on('disconnected', () => { isClosed = true; });

    let accountName = null;
    let loggedIn = false;

    for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (isClosed) {
            console.log("\n[i] Window was closed by user.");
            break;
        }

        try {
            const cookies = await page.cookies();
            const xman = cookies.find(c => c.name === 'xman_us_t');
            if (xman && (xman.value.includes('x_u') || xman.value.includes('x_e') || xman.value.includes('x_user'))) {
                try {
                    const params = new URLSearchParams(decodeURIComponent(xman.value));
                    accountName = params.get('x_e') || params.get('x_user') || params.get('x_u_i');
                } catch(e) {}

                fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
                loggedIn = true;
                break;
            }
        } catch(e) {}
    }

    if (loggedIn) {
        console.log("\n==================================================");
        console.log(`[🎉] LOGIN SUCCESSFUL! Connected as: ${accountName || 'AliExpress User'}`);
        console.log(`[✓] Session cookies saved to session_cookies.json!`);
        console.log("==================================================\n");

        await new Promise(r => setTimeout(r, 2000));
        await browser.close();

        // Run collector immediately!
        console.log("Now running automatic coin collection...\n");
        const { runCollector } = require('./collect.js');
        await runCollector();
    } else if (!isClosed) {
        await browser.close();
    }
})();
