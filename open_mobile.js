const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_DIR = path.join(__dirname, 'chrome_session');

(async () => {
    try {
        console.log("Launching AliExpress Mobile Coins Window (iPhone 16 Pro Max Emulation)...");
        const browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
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
        console.log("✓ Mobile window loaded directly on your screen!");
        console.log("👉 Tap 'Log in' and sign in if needed. Close the window when done.");

        let isOpen = true;
        browser.on('disconnected', () => { isOpen = false; });
        while (isOpen) {
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch(e) {
        console.error("Error launching mobile window:", e.message);
    }
})();

