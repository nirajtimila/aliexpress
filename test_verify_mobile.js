const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
    console.log("Launching test standalone mobile window...");
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: path.join(__dirname, 'chrome_mobile_session'),
        headless: 'new',
        args: [
            '--window-size=450,960',
            '--window-position=200,40',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();
    await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
    await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    console.log("Current URL:", page.url());
    const isMobile = page.url().includes('m.aliexpress.com');
    console.log("Is mobile URL:", isMobile);

    const title = await page.title();
    console.log("Page title:", title);

    await page.screenshot({ path: path.join(__dirname, 'verify_mobile_view.png') });
    console.log("Screenshot saved to verify_mobile_view.png!");

    await browser.close();
})();
