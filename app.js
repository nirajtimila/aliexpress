/**
 * AliExpress Daily Coins Auto-Collector App
 * Single App - Just Connect AliExpress & It Auto-Collects!
 * 100% Mobile Emulation (No Extension Required)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const puppeteer = require('puppeteer-core');

const PORT = 3333;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_DIR = path.join(__dirname, 'chrome_session');
const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// App State
let isConnected = false;
let isBusy = false;
let currentAction = 'Idle';
let loginWindowOpened = false;
let currentBrowser = null;

let accountDetails = {
    email: null,
    userId: null,
    region: null,
    currency: null,
    coins: null,
    worth: null,
    streak: null,
    tasksStatus: null,
    lastUpdated: null
};

// Check if saved session_cookies.json exists
if (fs.existsSync(COOKIES_FILE)) {
    try {
        const savedCookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        const acc = parseAccountCookies(savedCookies);
        if (acc.email || acc.userId) {
            isConnected = true;
            accountDetails.email = acc.email;
            accountDetails.userId = acc.userId;
            accountDetails.region = acc.region || 'AU';
            accountDetails.currency = acc.currency || 'AUD';
        }
    } catch(e) {}
}
let lastResult = {
    status: 'Ready',
    coins: null,
    worth: null,
    alreadyCollected: false,
    timestamp: null
};
let logs = [];
let autoSchedule = true;

/**
 * Extract User Account details from cookies
 */
function parseAccountCookies(cookies) {
    const acc = { email: null, userId: null, region: null, currency: null };
    for (const c of cookies) {
        if (c.name === 'xman_us_t') {
            try {
                const decoded = decodeURIComponent(c.value);
                const params = new URLSearchParams(decoded);
                acc.email = params.get('x_e') || params.get('x_user');
                acc.userId = params.get('x_u_i') || params.get('x_u_c');
            } catch(e) {}
        }
        if (c.name === 'aep_usuc_f') {
            try {
                const decoded = decodeURIComponent(c.value);
                const params = new URLSearchParams(decoded.replace(/&amp;/g, '&'));
                acc.region = params.get('region') || params.get('site');
                acc.currency = params.get('c_tp');
            } catch(e) {}
        }
    }
    return acc;
}

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
    logs.unshift({ time, msg, type });
    if (logs.length > 80) logs.pop();
}

addLog("AliExpress Auto-Collector App starting (Mobile Engine active)...", "info");

// Stop any lingering session Chrome processes safely
function killSessionChrome() {
    return new Promise((resolve) => {
        exec('wmic process where "name=\'chrome.exe\' and commandline like \'%%chrome_session%%\'" call terminate', () => {
            setTimeout(resolve, 600);
        });
    });
}

/**
 * Check if the user is already logged in (never runs when login window is active)
 */
async function checkLoginStatus() {
    if (loginWindowOpened || currentBrowser) {
        return false;
    }
    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: true,
            args: [
                '--window-size=460,980',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        const page = (await browser.pages())[0];
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 4000));

        const cookies = await page.cookies();
        const acc = parseAccountCookies(cookies);

        const domOk = await page.evaluate(() => {
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm');
            const txt = (document.body ? document.body.innerText : '');
            const hasDaily = txt.includes('Daily coins') || txt.includes('Today') || txt.includes('Collect') || txt.includes('worth');
            return !hasLoginBtn && hasDaily && !txt.includes('COINS\nLog in');
        });

        const loggedIn = !!((acc.userId || acc.email) && domOk);
        isConnected = loggedIn;
        if (isConnected) {
            if (acc.email) accountDetails.email = acc.email;
            if (acc.userId) accountDetails.userId = acc.userId;
            if (acc.region) accountDetails.region = acc.region;
            if (acc.currency) accountDetails.currency = acc.currency;
            addLog(`✓ AliExpress Account Connected: ${accountDetails.email || accountDetails.userId} (${accountDetails.region || 'AU'})`, "success");
        } else {
            addLog("AliExpress Account not connected yet. Click 'Connect AliExpress' to open mobile login window.", "warn");
        }
        return loggedIn;
    } catch(e) {
        addLog(`Status check: ${e.message}`, "info");
        return false;
    } finally {
        if (browser) try { await browser.close(); } catch(e) {}
    }
}

/**
 * 1. Open Visible Mobile Login Window directly with genuine iPhone 16 Pro Max emulation
 * Kept open until the user actually signs in!
 */
async function openLoginWindow() {
    if (currentBrowser) {
        try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
        await new Promise(r => setTimeout(r, 500));
    }

    isBusy = true;
    loginWindowOpened = true;
    currentAction = 'Mobile login window open. Waiting for you to sign in...';
    addLog("Opening AliExpress Mobile window directly on your screen (iPhone mode)...", "info");

    try {
        currentBrowser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: false,
            args: [
                '--window-size=450,940',
                '--window-position=250,60',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const pages = await currentBrowser.pages();
        const page = pages[0] || await currentBrowser.newPage();
        
        // Emulate genuine iPhone 16 Pro Max (Device metrics, Touch, Mobile UA)
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);

        // Load mobile coins page
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded' });

        addLog("✓ Mobile window is now open on your screen!", "success");
        addLog("👉 If not signed in, tap 'Log in' inside that window to sign into your account...", "warn");

        let isWindowOpen = true;
        currentBrowser.on('disconnected', () => {
            isWindowOpen = false;
            currentBrowser = null;
        });

        // Polling loop: Wait for REAL login (checks cookies & DOM)
        let loggedIn = false;
        for (let i = 0; i < 300; i++) { // Up to 10 minutes
            await new Promise(r => setTimeout(r, 2000));

            if (!isWindowOpen || !currentBrowser) {
                addLog("Mobile window was closed.", "info");
                break;
            }

            try {
                const cookies = await page.cookies();
                const acc = parseAccountCookies(cookies);

                const domOk = await page.evaluate(() => {
                    const currentUrl = window.location.href;
                    if (currentUrl.includes('login') || currentUrl.includes('passport')) return false;
                    const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm');
                    const txt = (document.body ? document.body.innerText : '');
                    const hasDaily = txt.includes('Daily coins') || txt.includes('Today') || txt.includes('Collect') || txt.includes('worth');
                    return !hasLoginBtn && hasDaily && !txt.includes('COINS\nLog in');
                }).catch(() => false);

                // Both auth cookie and coin page must be confirmed
                if ((acc.userId || acc.email) && domOk) {
                    loggedIn = true;
                    if (acc.email) accountDetails.email = acc.email;
                    if (acc.userId) accountDetails.userId = acc.userId;
                    if (acc.region) accountDetails.region = acc.region;
                    if (acc.currency) accountDetails.currency = acc.currency;

                    addLog(`🎉 LOGIN CONFIRMED! Welcome ${acc.email || acc.userId}!`, "success");
                    isConnected = true;
                    loginWindowOpened = false;
                    break;
                }
            } catch(pollErr) {}
        }

        if (loggedIn) {
            await new Promise(r => setTimeout(r, 2500));
            if (currentBrowser) {
                try { await currentBrowser.close(); } catch(e) {}
                currentBrowser = null;
            }

            addLog("Automatically collecting today's coins & tasks now...", "info");
            await runAutoCollect({ headless: true });
        }

    } catch(err) {
        addLog(`Login window error: ${err.message}`, "error");
    } finally {
        isBusy = false;
        loginWindowOpened = false;
        currentAction = 'Idle';
    }
}

/**
 * 2. Open Mobile Coins Window to let user view/interact with mobile interface anytime
 */
async function openMobileWindow() {
    if (currentBrowser) {
        try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
        await new Promise(r => setTimeout(r, 500));
    }

    isBusy = true;
    currentAction = 'Mobile window active...';
    addLog("Opening interactive Mobile Coins window on your screen...", "info");

    try {
        currentBrowser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: false,
            args: [
                '--window-size=450,940',
                '--window-position=250,60',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const pages = await currentBrowser.pages();
        const page = pages[0] || await currentBrowser.newPage();
        
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded' });
        
        addLog("✓ Mobile Coins window open (iPhone 16 Pro Max view)!", "success");

        let isOpen = true;
        currentBrowser.on('disconnected', () => {
            isOpen = false;
            currentBrowser = null;
        });
        while (isOpen && currentBrowser) {
            await new Promise(r => setTimeout(r, 1000));
        }
        addLog("Mobile window closed.", "info");
    } catch(err) {
        addLog(`Mobile window error: ${err.message}`, "error");
    } finally {
        isBusy = false;
        currentAction = 'Idle';
        if (currentBrowser) try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
    }
}

/**
 * 3. Verify login and immediately collect coins
 */
async function verifyAndCollect() {
    addLog("Verifying AliExpress login...", "info");
    currentAction = 'Verifying login...';

    if (currentBrowser) {
        try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
        await new Promise(r => setTimeout(r, 800));
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: true,
            args: [
                '--window-size=460,980',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        const page = (await browser.pages())[0];
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 4500));

        const cookies = await page.cookies();
        const acc = parseAccountCookies(cookies);

        const domOk = await page.evaluate(() => {
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm');
            const txt = (document.body ? document.body.innerText : '');
            const hasDaily = txt.includes('Daily coins') || txt.includes('Today') || txt.includes('Collect') || txt.includes('worth');
            return !hasLoginBtn && hasDaily && !txt.includes('COINS\nLog in');
        });

        if ((acc.userId || acc.email) && domOk) {
            isConnected = true;
            loginWindowOpened = false;
            if (acc.email) accountDetails.email = acc.email;
            if (acc.userId) accountDetails.userId = acc.userId;
            if (acc.region) accountDetails.region = acc.region;
            if (acc.currency) accountDetails.currency = acc.currency;
            addLog(`🎉 LOGIN VERIFIED! Connected as ${acc.email || acc.userId} (${acc.region || 'AU'})`, "success");
            try { await browser.close(); } catch(e) {}
            browser = null;
            return await runAutoCollect({ headless: true });
        } else {
            isConnected = false;
            addLog("⚠️ Not logged in yet. Please log into your account in the mobile window, then click verify.", "warn");
            return { success: false, message: 'Not logged in yet' };
        }
    } catch(e) {
        addLog(`Verify check error: ${e.message}`, "error");
        return { success: false, message: e.message };
    } finally {
        if (browser) try { await browser.close(); } catch(e) {}
        isBusy = false;
        currentAction = 'Idle';
    }
}

/**
 * 4. Automated Daily Collector (claims coins + tasks)
 */
async function runAutoCollect({ headless = true } = {}) {
    isBusy = true;
    currentAction = 'Collecting Coins & Tasks...';
    addLog("Starting automatic coin collection...", "info");

    if (currentBrowser) {
        try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
        await new Promise(r => setTimeout(r, 800));
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: headless,
            args: [
                '--window-size=480,1020',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        
        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);

        if (fs.existsSync(COOKIES_FILE)) {
            try {
                const cList = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                await page.setCookie(...cList);
            } catch(e) {}
        }

        await page.goto('https://m.aliexpress.com/p/coin-index/index.html', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        addLog("Loading Coins page in mobile mode...", "info");
        await new Promise(r => setTimeout(r, 4500));

        // Check if session valid
        const cookies = await page.cookies();
        const cookieAcc = parseAccountCookies(cookies);

        const isLoggedOut = await page.evaluate(() => {
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm');
            const txt = (document.body ? document.body.innerText : '');
            return hasLoginBtn || txt.includes('COINS\nLog in');
        });

        if (isLoggedOut || (!cookieAcc.userId && !cookieAcc.email)) {
            isConnected = false;
            throw new Error("AliExpress session expired. Please click 'Connect AliExpress' to log in again.");
        }

        isConnected = true;

        if (cookieAcc.email) accountDetails.email = cookieAcc.email;
        if (cookieAcc.userId) accountDetails.userId = cookieAcc.userId;
        if (cookieAcc.region) accountDetails.region = cookieAcc.region;
        if (cookieAcc.currency) accountDetails.currency = cookieAcc.currency;

        // Scrape Current Balance & Streak
        const balanceData = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('div, span, p'));
            let coins = null;
            let worth = null;
            let streak = null;

            for (const el of all) {
                const txt = (el.innerText || '').trim();
                if (/^\d{1,6}$/.test(txt)) {
                    const p = el.parentElement ? el.parentElement.innerText : '';
                    if (p.includes('worth') || p.includes('Coins helped')) {
                        coins = txt;
                        worth = (p.match(/worth\s+([A-Z\$0-9\.]+)/i) || [])[1] || '';
                        break;
                    }
                }
            }

            // Streak check
            const streakCard = all.find(el => (el.innerText || '').includes('Today') && (el.innerText || '').includes('Worth'));
            if (streakCard) {
                streak = streakCard.innerText.replace(/\n+/g, ' • ').trim();
            }

            return { coins, worth, streak };
        });

        if (balanceData) {
            lastResult.coins = balanceData.coins;
            lastResult.worth = balanceData.worth;
            accountDetails.coins = balanceData.coins;
            accountDetails.worth = balanceData.worth;
            accountDetails.streak = balanceData.streak;
            accountDetails.lastUpdated = new Date().toISOString();
            addLog(`Account: ${accountDetails.email || accountDetails.userId || 'User'} | Balance: 🪙 ${balanceData.coins} coins (${balanceData.worth})`, "info");
        }

        // Check if already claimed today
        const alreadyClaimed = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('div, span, button, p'));
            return all.some(el => {
                const txt = (el.innerText || '').trim().toLowerCase();
                return txt === 'collected' || txt === 'already collected' || txt === 'come back tomorrow';
            });
        });

        if (alreadyClaimed) {
            lastResult.alreadyCollected = true;
            lastResult.status = 'Collected Today ✓';
            lastResult.timestamp = new Date().toISOString();
            addLog("✓ Daily Coins have already been collected today!", "success");
        } else {
            // Click Collect Button
            addLog("Clicking 'Collect' button...", "info");
            const collectResult = await page.evaluate(() => {
                function smartClick(el) {
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const clientX = rect.left + rect.width / 2;
                    const clientY = rect.top + rect.height / 2;
                    const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
                    try { el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'touch' })); } catch(e) {}
                    try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(e) {}
                    try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'touch' })); } catch(e) {}
                    try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(e) {}
                    try { el.dispatchEvent(new MouseEvent('click', opts)); } catch(e) {}
                    el.click();
                    if (el.parentElement && el.parentElement !== document.body) {
                        try { el.parentElement.click(); } catch(e) {}
                    }
                }

                const all = Array.from(document.querySelectorAll('button, div, span, a, p'));
                for (const el of all) {
                    const txt = (el.innerText || '').trim();
                    if (/^collect$/i.test(txt)) {
                        smartClick(el.closest('button, [role="button"]') || el);
                        return true;
                    }
                }
                for (const el of all) {
                    const txt = (el.innerText || '').trim();
                    if (/collect/i.test(txt) && !/collected/i.test(txt) && txt.length < 25) {
                        smartClick(el.closest('button, [role="button"]') || el);
                        return true;
                    }
                }
                return false;
            });

            if (collectResult) {
                lastResult.alreadyCollected = true;
                lastResult.status = 'Success - Collected Daily Coins! 🎉';
                lastResult.timestamp = new Date().toISOString();
                addLog("🎉 SUCCESS! Daily Coins claimed!", "success");
                await new Promise(r => setTimeout(r, 2000));
            } else {
                addLog("Collect button was not found or already claimed.", "warn");
            }
        }

        // Auto-Complete Daily Bonus Tasks (+1, +5)
        addLog("Checking bonus task buttons (+1 / +5)...", "info");
        const tasksDone = await page.evaluate(async () => {
            function smartClick(el) {
                const rect = el.getBoundingClientRect();
                const clientX = rect.left + rect.width / 2;
                const clientY = rect.top + rect.height / 2;
                const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
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
                await new Promise(r => setTimeout(r, 1200));
            }
            return taskBtns.length;
        });

        if (tasksDone > 0) {
            addLog(`✓ Completed ${tasksDone} daily bonus tasks!`, "success");
        } else {
            addLog("No pending task buttons found.", "info");
        }

        // Final balance check
        const finalBalance = await page.evaluate(() => {
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

        if (finalBalance) {
            lastResult.coins = finalBalance.coins;
            lastResult.worth = finalBalance.worth;
            addLog(`Updated Total: 🪙 ${finalBalance.coins} coins (${finalBalance.worth})`, "success");
        }

        await new Promise(r => setTimeout(r, 1500));
        addLog("✓ Auto-collect finished successfully!", "success");
        return { success: true };

    } catch(err) {
        addLog(`Collection error: ${err.message}`, "error");
        lastResult.status = `Error: ${err.message}`;
        return { success: false, error: err.message };
    } finally {
        isBusy = false;
        currentAction = 'Idle';
        if (browser) try { await browser.close(); } catch(e) {}
    }
}

/**
 * Disconnect AliExpress Account
 */
async function disconnectAccount() {
    addLog("Disconnecting AliExpress account...", "info");
    if (currentBrowser) {
        try { await currentBrowser.close(); } catch(e) {}
        currentBrowser = null;
    }
    await killSessionChrome();

    try {
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }
    } catch(e) {
        addLog(`Note clearing files: ${e.message}`, "info");
    }

    isConnected = false;
    loginWindowOpened = false;
    isBusy = false;
    currentAction = 'Disconnected';
    accountDetails = {
        email: null,
        userId: null,
        region: null,
        currency: null,
        coins: null,
        worth: null,
        streak: null,
        tasksStatus: null,
        lastUpdated: null
    };

    addLog("✓ AliExpress Account disconnected successfully. Session cleared.", "warn");
    return { success: true };
}

// Daily background auto-scheduler (Runs every 24 hours)
setInterval(() => {
    if (autoSchedule && isConnected && !isBusy && !loginWindowOpened) {
        addLog("⏰ 24h Daily Schedule: Running auto-collect...", "info");
        runAutoCollect({ headless: true });
    }
}, 24 * 60 * 60 * 1000);

// Safe startup check (only if not busy)
setTimeout(() => {
    if (!loginWindowOpened && !isBusy) {
        checkLoginStatus();
    }
}, 1500);

/**
 * Web Dashboard Server
 */
const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host || 'localhost:3333'}`);
    const pathname = parsed.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getHtmlContent());
        return;
    }

    if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            isConnected,
            isBusy,
            loginWindowOpened,
            currentAction,
            accountDetails,
            lastResult,
            autoSchedule,
            logs
        }));
        return;
    }

    if (pathname === '/api/connect') {
        openLoginWindow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Mobile login window launched' }));
        return;
    }

    if (pathname === '/api/open_mobile_window') {
        openMobileWindow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Mobile window opened' }));
        return;
    }

    if (pathname === '/api/disconnect') {
        disconnectAccount().then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Disconnected' }));
        });
        return;
    }

    if (pathname === '/api/verify') {
        verifyAndCollect().then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result || {}));
        });
        return;
    }

    if (pathname === '/api/collect') {
        if (!isConnected) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Please connect AliExpress first' }));
            return;
        }
        runAutoCollect({ headless: false });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Collect triggered' }));
        return;
    }

    if (pathname === '/api/toggle_schedule') {
        autoSchedule = !autoSchedule;
        addLog(`Auto-Schedule is now ${autoSchedule ? 'ENABLED (Every 24h)' : 'DISABLED'}`, "info");
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ autoSchedule }));
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    addLog(`AliExpress Auto-Collector Dashboard live at http://localhost:${PORT}`, "success");
});

function getHtmlContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AliExpress Daily Coins Auto-Collector</title>
    <style>
        :root {
            --bg: #0b0f19;
            --card: #131a29;
            --border: #1f2c42;
            --orange: #ff5000;
            --orange-grad: linear-gradient(135deg, #ff5000 0%, #ff8000 100%);
            --green: #10b981;
            --green-grad: linear-gradient(135deg, #059669 0%, #10b981 100%);
            --blue: #38bdf8;
            --blue-grad: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%);
            --text: #f1f5f9;
            --dim: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 28px 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
        .wrapper { width: 100%; max-width: 780px; }
        
        .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-icon { font-size: 34px; filter: drop-shadow(0 0 12px rgba(255,80,0,0.5)); }
        .brand-title { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
        .brand-sub { font-size: 13px; color: var(--dim); margin-top: 2px; }

        .account-banner { background: var(--card); border: 2px solid var(--border); border-radius: 14px; padding: 22px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; gap: 20px; transition: all 0.3s ease; }
        .account-banner.connected { border-color: rgba(16, 185, 129, 0.4); background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, var(--card) 100%); }
        .account-banner.disconnected { border-color: rgba(245, 158, 11, 0.4); background: linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, var(--card) 100%); }
        .account-banner.waiting { border-color: rgba(56, 189, 248, 0.5); background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, var(--card) 100%); }
        
        .acc-info { display: flex; flex-direction: column; gap: 4px; }
        .acc-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; width: fit-content; text-transform: uppercase; letter-spacing: 0.5px; }
        .acc-badge.connected { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
        .acc-badge.disconnected { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
        .acc-badge.waiting { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
        
        .acc-title { font-size: 18px; font-weight: 700; color: #fff; margin-top: 4px; }
        .acc-desc { font-size: 13px; color: var(--dim); line-height: 1.4; }

        .btn-connect { background: var(--orange-grad); color: #fff; border: none; padding: 12px 22px; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(255,80,0,0.35); white-space: nowrap; }
        .btn-connect:hover { transform: translateY(-1px); opacity: 0.95; }
        .btn-disconnect { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); padding: 12px 20px; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
        .btn-disconnect:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; border-color: #ef4444; }
        .btn-verify { background: var(--green-grad); color: #fff; border: none; padding: 12px 22px; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(16,185,129,0.35); white-space: nowrap; }
        .btn-verify:hover { transform: translateY(-1px); opacity: 0.95; }
        .btn-mobile-view { background: #1e293b; color: #38bdf8; border: 1px solid #334155; padding: 12px 18px; font-size: 13px; font-weight: 700; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-mobile-view:hover { background: #283955; border-color: #38bdf8; }
        .btn-reconnect { background: #1f2c42; color: #cbd5e1; border: 1px solid #334155; padding: 12px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; cursor: pointer; }
        .btn-reconnect:hover { background: #283955; color: #fff; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); margin-bottom: 8px; }
        .card-value { font-size: 26px; font-weight: 800; color: #fff; display: flex; align-items: baseline; gap: 8px; }
        .card-worth { font-size: 13px; color: #f59e0b; font-weight: 600; }
        .card-sub { font-size: 12px; color: var(--dim); margin-top: 6px; }

        .action-bar { display: flex; gap: 12px; margin-bottom: 20px; }
        .btn-action-primary { flex: 2; background: var(--green-grad); border: none; color: #fff; padding: 16px 24px; font-size: 16px; font-weight: 700; border-radius: 10px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: center; align-items: center; gap: 10px; box-shadow: 0 4px 16px rgba(16,185,129,0.3); }
        .btn-action-primary:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.95; }
        .btn-action-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .btn-action-secondary { flex: 1; background: #1a2336; border: 1px solid var(--border); color: #e2e8f0; padding: 16px; font-size: 14px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; }
        .btn-action-secondary:hover { background: #222f47; }
        .btn-action-secondary.active { border-color: #10b981; color: #10b981; }

        .logs-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
        .logs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .logs-title { font-size: 14px; font-weight: 700; }
        .logs-box { background: #070a12; border: 1px solid #141c2c; border-radius: 8px; padding: 14px; height: 260px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 12px; line-height: 1.6; }
        .log-entry { margin-bottom: 4px; }
        .log-time { color: #38bdf8; margin-right: 6px; }
        .log-info { color: #cbd5e1; }
        .log-success { color: #34d399; font-weight: 600; }
        .log-warn { color: #fbbf24; }
        .log-error { color: #f87171; font-weight: 600; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="header">
            <div class="brand">
                <span class="brand-icon">🪙</span>
                <div>
                    <div class="brand-title">AliExpress Coins Auto-Collector</div>
                    <div class="brand-sub">Native Mobile View & 24h Daily Check-in Automation</div>
                </div>
            </div>
            <div id="live-status-pill" style="font-size:12px; background:#1e293b; color:#94a3b8; padding:6px 14px; border-radius:20px; font-weight:600;">
                Idle
            </div>
        </div>

        <!-- Account Connection Banner -->
        <div class="account-banner disconnected" id="acc-banner">
            <div class="acc-info">
                <div class="acc-badge disconnected" id="acc-badge">● Not Connected</div>
                <div class="acc-title" id="acc-title">Connect your AliExpress Account</div>
                <div class="acc-desc" id="acc-desc">Click connect once. Opens directly in native mobile mode. Session is saved forever.</div>
            </div>
            <div id="acc-actions">
                <button class="btn-connect" id="btn-connect" onclick="triggerConnect()">
                    🔗 Connect AliExpress
                </button>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-label">Coin Balance & Worth</div>
                <div class="card-value">
                    <span id="coins-display">🪙 --</span>
                    <span class="card-worth" id="coins-worth"></span>
                </div>
                <div class="card-sub" id="streak-info">Streak: Ready</div>
                <div class="card-sub" id="coins-updated" style="margin-top:2px;">Updated: Waiting for run</div>
            </div>
            <div class="card">
                <div class="card-label">Logged In Account Details</div>
                <div style="font-size:15px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px; margin-top:4px;" id="acc-email-display">
                    👤 Not Connected
                </div>
                <div class="card-sub" id="acc-meta-display">User ID: -- • Region: -- • Currency: --</div>
                <div class="card-sub" style="margin-top:6px; color:#10b981; font-weight:600;" id="status-display">Ready</div>
            </div>
        </div>

        <div class="action-bar">
            <button class="btn-action-primary" id="btn-collect" onclick="triggerCollect()">
                ⚡ Collect Today's Coins Now
            </button>
            <button class="btn-action-secondary" id="btn-mobile-view" onclick="triggerMobileView()">
                📱 View Mobile Screen
            </button>
            <button class="btn-action-secondary active" id="btn-schedule" onclick="toggleSchedule()">
                ⏰ Auto-Run: 24h ON
            </button>
        </div>

        <div class="logs-card">
            <div class="logs-header">
                <div class="logs-title">Automation Console</div>
                <div style="font-size:11px; color:var(--dim);">Live sync</div>
            </div>
            <div class="logs-box" id="logs-box">
                <!-- Logs rendered here -->
            </div>
        </div>
    </div>

    <script>
        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();

                // Live status pill
                const pill = document.getElementById('live-status-pill');
                if (data.isBusy) {
                    pill.textContent = data.currentAction;
                    pill.style.background = '#d97706';
                    pill.style.color = '#fff';
                } else {
                    pill.textContent = data.isConnected ? 'Connected & Ready' : 'Not Connected';
                    pill.style.background = data.isConnected ? '#065f46' : '#1e293b';
                    pill.style.color = data.isConnected ? '#34d399' : '#94a3b8';
                }

                // Account Banner
                const banner = document.getElementById('acc-banner');
                const badge = document.getElementById('acc-badge');
                const title = document.getElementById('acc-title');
                const desc = document.getElementById('acc-desc');
                const actions = document.getElementById('acc-actions');
                const btnCollect = document.getElementById('btn-collect');

                if (data.loginWindowOpened && !data.isConnected) {
                    banner.className = 'account-banner waiting';
                    badge.className = 'acc-badge waiting';
                    badge.textContent = '● Mobile Window Open';
                    title.textContent = 'Sign into AliExpress in the opened mobile window';
                    desc.textContent = 'The mobile window is open on your screen. Tap Log In, then click the green button below:';
                    actions.innerHTML = '<div style="display:flex; gap:8px;">' +
                        '<button class="btn-verify" onclick="triggerVerify()">✓ I Have Logged In (Verify & Collect)</button>' +
                        '<button class="btn-disconnect" onclick="triggerDisconnect()">✕ Cancel</button>' +
                        '</div>';
                    btnCollect.disabled = true;
                } else if (data.isConnected) {
                    banner.className = 'account-banner connected';
                    badge.className = 'acc-badge connected';
                    badge.textContent = '● Connected & Ready';
                    title.textContent = 'AliExpress Connected ✓';
                    desc.textContent = 'Your session is active. Daily coins and bonus tasks are collected automatically.';
                    actions.innerHTML = '<div style="display:flex; gap:8px;">' +
                        '<button class="btn-mobile-view" onclick="triggerMobileView()">📱 View Mobile Screen</button>' +
                        '<button class="btn-disconnect" onclick="triggerDisconnect()">🔌 Disconnect</button>' +
                        '</div>';
                    btnCollect.disabled = data.isBusy;
                } else {
                    banner.className = 'account-banner disconnected';
                    badge.className = 'acc-badge disconnected';
                    badge.textContent = '● Not Connected';
                    title.textContent = 'Connect your AliExpress Account';
                    desc.textContent = 'Opens directly in native mobile mode on your screen. From then on, everything is automated.';
                    actions.innerHTML = '<button class="btn-connect" onclick="triggerConnect()">🔗 Connect AliExpress</button>';
                    btnCollect.disabled = true;
                }

                // Account Details
                const accEmail = document.getElementById('acc-email-display');
                const accMeta = document.getElementById('acc-meta-display');
                if (data.isConnected && data.accountDetails) {
                    const email = data.accountDetails.email || 'AliExpress User';
                    const uid = data.accountDetails.userId || 'Linked';
                    const reg = (data.accountDetails.region || 'AU').toUpperCase();
                    const cur = data.accountDetails.currency || 'AUD';
                    accEmail.innerHTML = '👤 ' + email;
                    accMeta.textContent = 'User ID: ' + uid + ' • Region: ' + reg + ' • Currency: ' + cur;
                } else {
                    accEmail.innerHTML = '👤 Not Connected';
                    accMeta.textContent = 'User ID: -- • Region: -- • Currency: --';
                }

                // Balance & Streak
                if (data.lastResult && data.lastResult.coins) {
                    document.getElementById('coins-display').textContent = '🪙 ' + data.lastResult.coins;
                    if (data.lastResult.worth) {
                        document.getElementById('coins-worth').textContent = '(' + data.lastResult.worth + ')';
                    }
                }
                if (data.accountDetails && data.accountDetails.streak) {
                    document.getElementById('streak-info').textContent = 'Streak: ' + data.accountDetails.streak;
                }

                // Today Status
                if (data.lastResult && data.lastResult.status) {
                    const st = document.getElementById('status-display');
                    st.textContent = data.lastResult.status;
                    if (data.lastResult.status.includes('Success') || data.lastResult.status.includes('Collected')) {
                        st.style.color = '#34d399';
                    } else if (data.lastResult.status.includes('Error')) {
                        st.style.color = '#f87171';
                    } else {
                        st.style.color = '#fff';
                    }
                }
                if (data.lastResult && data.lastResult.timestamp) {
                    const timeStr = new Date(data.lastResult.timestamp).toLocaleTimeString();
                    document.getElementById('coins-updated').textContent = 'Updated: ' + timeStr;
                }

                // Schedule button
                const schBtn = document.getElementById('btn-schedule');
                if (data.autoSchedule) {
                    schBtn.textContent = '⏰ Auto-Run: 24h ON';
                    schBtn.className = 'btn-action-secondary active';
                } else {
                    schBtn.textContent = '⏰ Auto-Run: OFF';
                    schBtn.className = 'btn-action-secondary';
                }

                // Render Logs
                const logsBox = document.getElementById('logs-box');
                logsBox.innerHTML = data.logs.map(l => {
                    const cls = 'log-' + (l.type || 'info');
                    return '<div class="log-entry"><span class="log-time">[' + l.time + ']</span><span class="' + cls + '">' + l.msg + '</span></div>';
                }).join('');

            } catch (e) {
                console.error("Status fetch error:", e);
            }
        }

        async function triggerConnect() {
            try {
                await fetch('/api/connect');
                fetchStatus();
            } catch(e) {
                alert("Failed to open connection window: " + e.message);
            }
        }

        async function triggerMobileView() {
            try {
                await fetch('/api/open_mobile_window');
                fetchStatus();
            } catch(e) {
                alert("Failed to open mobile view: " + e.message);
            }
        }

        async function triggerDisconnect() {
            if (!confirm("Are you sure you want to disconnect your AliExpress account? This will log out and clear the saved session.")) return;
            try {
                await fetch('/api/disconnect');
                fetchStatus();
            } catch(e) {
                alert("Failed to disconnect: " + e.message);
            }
        }

        async function triggerVerify() {
            try {
                const btn = document.querySelector('.btn-verify');
                if (btn) { btn.textContent = 'Verifying... please wait'; btn.disabled = true; }
                const res = await fetch('/api/verify');
                const data = await res.json();
                fetchStatus();
            } catch(e) {
                alert("Verification failed: " + e.message);
            }
        }

        async function triggerCollect() {
            try {
                await fetch('/api/collect');
                fetchStatus();
            } catch(e) {
                alert("Failed to start collect: " + e.message);
            }
        }

        async function toggleSchedule() {
            try {
                await fetch('/api/toggle_schedule');
                fetchStatus();
            } catch(e) {
                alert("Failed to toggle schedule: " + e.message);
            }
        }

        fetchStatus();
        setInterval(fetchStatus, 1500);
    </script>
</body>
</html>`;
}
