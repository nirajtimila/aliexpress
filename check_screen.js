const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function check() {
    try {
        const lines = fs.readFileSync('chrome_mobile_session/DevToolsActivePort', 'utf8').trim().split('\n');
        const port = lines[0].trim();
        const path = lines[1].trim();
        const wsEndpoint = 'ws://127.0.0.1:' + port + path;
        console.log('Connecting to ws:', wsEndpoint);
        const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
        const pages = await browser.pages();
        console.log('Pages count:', pages.length);
        if (pages.length > 0) {
            console.log('Page URL:', pages[0].url());
            await pages[0].screenshot({ path: 'screen_now.png' });
            console.log('Saved screenshot to screen_now.png');
        }
        await browser.disconnect();
    } catch(e) {
        console.error('Error:', e);
    }
}
check();
