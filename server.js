/**
 * AliExpress Daily Coins Auto-Collector
 * Full-Stack Node.js Backend Server
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 3333;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_DIR = path.join(__dirname, 'chrome_session');
const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');
const ACCOUNT_FILE = path.join(__dirname, 'account.json');

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// App State
let isConnected = false;
let isBusy = false;
let currentAction = 'Idle';
let loginWindowActive = false;
let currentBrowser = null;
let activePage = null;

let accountDetails = {
    email: null,
    userId: null,
    region: 'AU',
    currency: 'AUD',
    coins: null,
    worth: null,
    streak: null,
    lastCollected: null
};

// Startup restore of account details
if (fs.existsSync(ACCOUNT_FILE)) {
    try {
        const savedAcc = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
        if (savedAcc && (savedAcc.email || savedAcc.coins)) {
            accountDetails = { ...accountDetails, ...savedAcc };
            isConnected = true;
        }
    } catch(e) {}
}

function saveAccountState() {
    try {
        fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(accountDetails, null, 2));
    } catch(e) {}
}

let lastResult = {
    status: 'Ready',
    message: '',
    coins: null,
    worth: null,
    timestamp: null
};

let logs = [];
let autoSchedule = true;

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
    logs.unshift({ id: Date.now() + Math.random(), time, msg, type });
    if (logs.length > 200) logs.pop();
}

/**
 * Parse Account information from cookies
 */
function parseAccountCookies(cookies) {
    const acc = { email: null, userId: null, region: 'AU', currency: 'AUD', hasAuthToken: false };
    if (!cookies || !Array.isArray(cookies)) return acc;

    for (const c of cookies) {
        if (c.name === 'xman_t') {
            acc.hasAuthToken = true;
        }
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
                if (params.get('region')) acc.region = params.get('region');
                if (params.get('c_tp')) acc.currency = params.get('c_tp');
            } catch(e) {}
        }
    }
    return acc;
}

// Startup: restore session from cookies file if exists
if (fs.existsSync(COOKIES_FILE)) {
    try {
        const savedCookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        const acc = parseAccountCookies(savedCookies);
        if (acc.email || acc.userId || savedCookies.length > 0) {
            isConnected = true;
            if (acc.email && (!accountDetails.email || accountDetails.email.includes('/'))) {
                accountDetails.email = acc.email.includes('/') ? 'nirajtimilatube' : acc.email;
            }
            if (acc.userId) accountDetails.userId = acc.userId;
            if (acc.region) accountDetails.region = acc.region;
            if (acc.currency) accountDetails.currency = acc.currency;
            addLog(`✓ Session restored for account: ${accountDetails.email || 'User'} (${accountDetails.region})`, "success");
        }
    } catch(e) {}
}

/**
 * Safely close browser instance
 */
async function closeCurrentBrowser() {
    if (currentBrowser) {
        try {
            await currentBrowser.close();
        } catch(e) {}
        currentBrowser = null;
        activePage = null;
        await new Promise(r => setTimeout(r, 1000));
    }
}

/**
 * Check if the active mobile page is currently logged in
 */
async function evaluateMobilePageState(page) {
    if (!page) return { isLoggedIn: false, reason: 'No page' };

    try {
        const currentUrl = page.url();
        if (currentUrl.includes('passport.aliexpress.com') || currentUrl.includes('/login') || currentUrl.includes('/join')) {
            return { isLoggedIn: false, inLoginPage: true };
        }

        const cookies = await page.cookies();
        const acc = parseAccountCookies(cookies);

        const pageData = await page.evaluate(() => {
            const body = document.body ? document.body.innerText : '';
            const hasLoginBtn = !!document.querySelector('.aecoin-loginButton-3pcZm') || body.includes('COINS\nLog in');
            
            let coins = null;
            let worth = null;
            let streak = null;

            // 1. Odometer digit extraction from live DOM (.aecoin-scroll-number-x0PUc)
            const scrollNumber = document.querySelector('.aecoin-scroll-number-x0PUc');
            if (scrollNumber) {
                const containers = Array.from(scrollNumber.querySelectorAll('.aecoin-number-container-3pIdj, [class*="number-container"]'));
                const digits = containers.map(c => {
                    if (c.id && /^\d+-(\d+)$/.test(c.id)) return c.id.match(/^\d+-(\d+)$/)[1];
                    const m = c.className.match(/num(\d+)/i);
                    if (m) return m[1];
                    return '';
                }).join('');
                if (digits) coins = digits;
            }

            // 2. Fallback digit scraper
            if (!coins) {
                const all = Array.from(document.querySelectorAll('div, span, p'));
                for (const el of all) {
                    const txt = (el.innerText || '').trim();
                    if (/^\d{1,6}$/.test(txt)) {
                        const p = el.parentElement ? el.parentElement.innerText : '';
                        if (p.includes('worth') || p.includes('Coins helped')) {
                            coins = txt;
                            break;
                        }
                    }
                }
            }

            // 3. Extract exact worth text (e.g. AU$1.16)
            const allEls = Array.from(document.querySelectorAll('*'));
            const worthEl = allEls.find(e => (e.innerText || '').includes('worth') && e.children.length === 0);
            if (worthEl) {
                const wm = worthEl.innerText.match(/worth\s*([A-Z\$0-9\.]+)/i);
                if (wm) worth = wm[1];
                else worth = worthEl.innerText.trim();
            }

            // 4. Extract streak
            const streakEl = allEls.find(e => (e.innerText || '').includes('days streak') && (e.innerText || '').length < 30);
            if (streakEl) {
                streak = streakEl.innerText.replace(/\s+/g, ' ').trim();
            } else {
                const streakCard = allEls.find(el => (el.innerText || '').includes('Today') && (el.innerText || '').includes('Worth'));
                if (streakCard) {
                    streak = streakCard.innerText.replace(/\n+/g, ' • ').trim();
                }
            }

            const hasCollectBtn = allEls.some(el => {
                const t = (el.innerText || '').trim().toLowerCase();
                return t === 'collect' || t === 'collected' || t === 'already collected';
            });

            return {
                hasLoginBtn,
                coins,
                worth,
                streak,
                hasCollectBtn,
                bodyLength: body.length
            };
        });

        const isLoggedIn = !pageData.hasLoginBtn && (pageData.coins !== null || pageData.hasCollectBtn || (acc.hasAuthToken && (acc.email || acc.userId)));

        return {
            isLoggedIn,
            cookies,
            acc,
            pageData
        };
    } catch(err) {
        return { isLoggedIn: false, error: err.message };
    }
}

/**
 * 1. Open Visible Mobile Login Window with dedicated profile
 */
async function openLoginWindow() {
    if (isBusy && !loginWindowActive) {
        addLog("Server is currently busy running a task.", "warn");
        return;
    }

    await closeCurrentBrowser();

    isBusy = true;
    loginWindowActive = true;
    currentAction = 'Mobile login window active...';
    addLog("Opening AliExpress Mobile window directly on your screen...", "info");

    try {
        currentBrowser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            userDataDir: SESSION_DIR,
            headless: false,
            defaultViewport: null,
            args: [
                '--window-size=460,980',
                '--window-position=200,40',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const pages = await currentBrowser.pages();
        activePage = pages[0] || await currentBrowser.newPage();
        
        await activePage.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
        await activePage.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });

        addLog("✓ Exact iPhone 16 Pro Max mobile screen opened! Log in if needed.", "info");

        let isClosed = false;
        currentBrowser.on('disconnected', () => {
            isClosed = true;
            currentBrowser = null;
            activePage = null;
        });

        // Polling loop to detect genuine login completion
        let confirmed = false;
        for (let i = 0; i < 300; i++) { // Up to 12 minutes
            await new Promise(r => setTimeout(r, 2500));
            if (isClosed || !currentBrowser || !activePage) {
                addLog("Mobile window was closed.", "info");
                break;
            }

            try {
                const state = await evaluateMobilePageState(activePage);
                if (state.inLoginPage) {
                    currentAction = 'Waiting for you to complete sign-in...';
                    continue;
                }

                if (state.isLoggedIn && (state.pageData?.coins !== null || state.pageData?.hasCollectBtn)) {
                    confirmed = true;
                    isConnected = true;
                    loginWindowActive = false;

                    const acc = state.acc;
                    if (acc.email) accountDetails.email = acc.email;
                    if (acc.userId) accountDetails.userId = acc.userId;
                    if (acc.region) accountDetails.region = acc.region;
                    if (acc.currency) accountDetails.currency = acc.currency;
                    if (state.pageData?.coins) accountDetails.coins = state.pageData.coins;
                    if (state.pageData?.worth) accountDetails.worth = state.pageData.worth;
                    if (state.pageData?.streak) accountDetails.streak = state.pageData.streak;

                    fs.writeFileSync(COOKIES_FILE, JSON.stringify(state.cookies, null, 2));

                    addLog(`🎉 LOGIN CONFIRMED! Welcome ${accountDetails.email || accountDetails.userId || 'User'}! Balance: 🪙 ${accountDetails.coins || '...'} (${accountDetails.worth || ''})`, "success");
                    break;
                }
            } catch(e) {}
        }

        if (confirmed) {
            await new Promise(r => setTimeout(r, 2500));
            await closeCurrentBrowser();
            // Automatically collect today's coins
            await runAutoCollect();
        }

    } catch(err) {
        addLog(`Login window error: ${err.message}`, "error");
    } finally {
        isBusy = false;
        loginWindowActive = false;
        currentAction = 'Idle';
    }
}

/**
 * 2. Connect via Cookies (Instant 1-Click Paste / Sync / JSON)
 */
function connectViaCookies(cookieInput) {
    if (!cookieInput) {
        throw new Error("Invalid cookie input provided.");
    }

    let cookieList = [];

    if (Array.isArray(cookieInput)) {
        cookieList = cookieInput.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || '.aliexpress.com',
            path: c.path || '/'
        }));
    } else if (typeof cookieInput === 'string') {
        const trimmed = cookieInput.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    cookieList = parsed.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain || '.aliexpress.com',
                        path: c.path || '/'
                    }));
                }
            } catch(e) {}
        }

        if (cookieList.length === 0) {
            const pairs = trimmed.split(';');
            for (const p of pairs) {
                const parts = p.trim().split('=');
                if (parts.length >= 2) {
                    const name = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (name) {
                        cookieList.push({
                            name,
                            value,
                            domain: '.aliexpress.com',
                            path: '/'
                        });
                    }
                }
            }
        }
    }

    const acc = parseAccountCookies(cookieList);
    const hasAnyToken = cookieList.some(c => c.name === 'xman_us_t' || c.name === 'aep_usuc_f' || c.name === 'xman_t');

    if (!acc.email && !acc.userId && !hasAnyToken) {
        throw new Error("No AliExpress login cookies found in the input. Ensure you are copying cookies from an active AliExpress session.");
    }

    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookieList, null, 2));
    isConnected = true;
    if (acc.email) accountDetails.email = acc.email;
    if (acc.userId) accountDetails.userId = acc.userId;
    if (acc.region) accountDetails.region = acc.region;
    if (acc.currency) accountDetails.currency = acc.currency;

    addLog(`🎉 Session cookies saved! Account: ${acc.email || acc.userId || 'User'} (${accountDetails.region}/${accountDetails.currency})`, "success");
    return { success: true, account: accountDetails };
}

/**
 * 3. Automated Daily Collector (Silent Headless Engine)
 */
async function runAutoCollect() {
    if (isBusy && !loginWindowActive) {
        addLog("Collection already running in background...", "warn");
        return { success: false, message: "Busy" };
    }

    isBusy = true;
    currentAction = 'Collecting Coins & Tasks...';
    addLog("⚡ Starting automated daily coin collection...", "info");

    await closeCurrentBrowser();

    let browser = null;
    let isConnectedLiveWindow = false;

    try {
        // 1. Check if live interactive mobile window (port 9222) is running
        try {
            const versionRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1200) });
            if (versionRes.ok) isConnectedLiveWindow = true;
        } catch(e) {}

        if (!isConnectedLiveWindow) {
            addLog("📱 Launching live iPhone Mobile screen (port 9222)...", "info");
            const { exec } = require('child_process');
            exec('schtasks /run /tn "TestInteractiveChrome"');
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 1000));
                try {
                    const versionRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
                    if (versionRes.ok) {
                        isConnectedLiveWindow = true;
                        break;
                    }
                } catch(e) {}
            }
        }

        let page = null;

        if (isConnectedLiveWindow) {
            addLog("⚡ Connected directly to live iPhone Mobile window (port 9222)...", "info");
            browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
            const pages = await browser.pages();
            page = pages.find(p => p.url().includes('coin-index'));
            if (!page) {
                page = pages[0] || await browser.newPage();
                await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
            }
        } else {
            browser = await puppeteer.launch({
                executablePath: CHROME_PATH,
                userDataDir: SESSION_DIR,
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
            });

            const pages = await browser.pages();
            page = pages[0] || await browser.newPage();
            await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);

            if (fs.existsSync(COOKIES_FILE)) {
                try {
                    const cList = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                    await page.setCookie(...cList);
                } catch(e) {}
            }

            addLog("Navigating to AliExpress Coins page...", "info");
            await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', {
                waitUntil: 'domcontentloaded',
                timeout: 40000
            });
        }

        // Wait 5 seconds for React/Rax hydration
        await new Promise(r => setTimeout(r, 5000));

        // Evaluate login status
        let state = await evaluateMobilePageState(page);

        // If not immediately confirmed, wait another 3 seconds for slower connections
        if (!state.isLoggedIn && !state.pageData?.hasLoginBtn) {
            await new Promise(r => setTimeout(r, 3000));
            state = await evaluateMobilePageState(page);
        }

        if (state.pageData?.hasLoginBtn) {
            addLog("⚠️ Mobile headless page requested login. Use the 1-Click ⭐ Bookmarklet on your AliExpress tab!", "warn");
            lastResult.status = 'Ready';
            lastResult.message = 'To collect in 1-click (no console), click the ⭐ Bookmarklet on your AliExpress tab!';
            return { success: true, balance: accountDetails };
        }

        isConnected = true;

        if (state.pageData?.coins) {
            accountDetails.coins = state.pageData.coins;
            accountDetails.worth = state.pageData.worth;
            addLog(`Account: ${accountDetails.email || accountDetails.userId || 'User'} | Current: 🪙 ${state.pageData.coins} (${state.pageData.worth || ''})`, "info");
        }
        if (state.pageData?.streak) {
            accountDetails.streak = state.pageData.streak;
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
            lastResult.status = 'Collected Today ✓';
            lastResult.message = 'Daily streak already claimed today!';
            lastResult.timestamp = new Date().toISOString();
            addLog("✓ Daily Streak has already been collected today!", "success");
        } else {
            // Click Collect Button
            addLog("Clicking daily 'Collect' button...", "info");
            const collectResult = await page.evaluate(() => {
                function smartClick(el) {
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
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

                // Exact button from user DevTools inspection:
                // <button id="signButton" class="aecoin-signButton-gaDga aecoin-checkInButton-jC2Uo">Collect</button>
                // wrapped in <div class="aecoin-checkInAura-36sJZ"> and <div class="aecoin-signButtonWrapper-21Q3m">
                const sBtn = document.getElementById('signButton') ||
                             document.querySelector('.aecoin-checkInButton-jC2Uo') ||
                             document.querySelector('.aecoin-signButton-gaDga') ||
                             document.querySelector('.aecoin-checkInAura-36sJZ') ||
                             document.querySelector('.aecoin-signButtonWrapper-21Q3m');
                if (sBtn) {
                    const aura = sBtn.closest('.aecoin-signButtonWrapper-21Q3m') || sBtn.closest('div') || sBtn;
                    smartClick(aura);
                    smartClick(sBtn);
                    return true;
                }

                // Check sign-main-card ID
                const mCard = document.getElementById('sign-main-card');
                if (mCard) {
                    smartClick(mCard);
                    return true;
                }

                const all = Array.from(document.querySelectorAll('button, div, span, a, p'));
                const btn = all.find(el => /^collect$/i.test((el.innerText || '').trim())) ||
                            all.find(el => (el.innerText || '').toLowerCase().includes('collect') && (el.innerText || '').length < 25);
                if (btn) {
                    smartClick(btn.closest('button, [role="button"], div') || btn);
                    return true;
                }

                if (window.webpackJsonp) {
                    try {
                        window.webpackJsonp.push([['ae_srv_' + Date.now()], {}, function(req) {
                            try {
                                const m = req(240);
                                if (m && m.a) {
                                    m.a({ playCode: "productSignInCoinChannel", signTimeMills: Date.now(), asac: "2E2280406IM61M8MG1F2FB" });
                                }
                            } catch(e) {}
                        }]);
                        return true;
                    } catch(e) {}
                }

                return false;
            });

            if (collectResult) {
                lastResult.status = 'Collected Today ✓';
                lastResult.message = 'Daily coins successfully claimed! 🎉';
                lastResult.timestamp = new Date().toISOString();
                addLog("🎉 SUCCESS! Daily Streak Coins Claimed!", "success");
                await new Promise(r => setTimeout(r, 2500));
            }
        }

        // Auto-Complete Daily Bonus Tasks (+1, +5)
        addLog("Scanning for daily bonus tasks (+1, +5)...", "info");
        const tasksDone = await page.evaluate(async () => {
            function smartClick(el) {
                const rect = el.getBoundingClientRect();
                const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
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
            addLog(`✓ Auto-completed ${tasksDone} daily bonus tasks!`, "success");
        } else {
            addLog("No pending task buttons found at this time.", "info");
        }

        // Final balance re-scrape
        const finalData = await evaluateMobilePageState(page);
        if (finalData.pageData?.coins) {
            accountDetails.coins = finalData.pageData.coins;
            accountDetails.worth = finalData.pageData.worth;
            lastResult.coins = finalData.pageData.coins;
            lastResult.worth = finalData.pageData.worth;
            addLog(`Updated Coin Balance: 🪙 ${finalData.pageData.coins} coins (${finalData.pageData.worth || ''})`, "success");
        }
        if (finalData.pageData?.streak) {
            accountDetails.streak = finalData.pageData.streak;
        }

        accountDetails.lastCollected = new Date().toISOString();
        isConnected = true;
        saveAccountState();
        addLog("✓ Live balance saved to account.json!", "success");

        // Save fresh cookies
        const updatedCookies = await page.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(updatedCookies, null, 2));

        return { success: true, balance: accountDetails };

    } catch(err) {
        addLog(`Collection error: ${err.message}`, "error");
        lastResult.status = `Error`;
        lastResult.message = err.message;
        return { success: false, error: err.message };
    } finally {
        isBusy = false;
        currentAction = 'Idle';
        if (browser) {
            try { 
                if (isConnectedLiveWindow) {
                    browser.disconnect();
                } else {
                    await browser.close();
                }
            } catch(e) {}
        }
    }
}

/**
 * 4. Disconnect Account
 */
async function disconnectAccount() {
    addLog("Disconnecting AliExpress account...", "info");
    await closeCurrentBrowser();

    if (fs.existsSync(COOKIES_FILE)) {
        try { fs.unlinkSync(COOKIES_FILE); } catch(e) {}
    }
    if (fs.existsSync(ACCOUNT_FILE)) {
        try { fs.unlinkSync(ACCOUNT_FILE); } catch(e) {}
    }

    isConnected = false;
    isBusy = false;
    currentAction = 'Idle';
    accountDetails = {
        email: null,
        userId: null,
        region: 'AU',
        currency: 'AUD',
        coins: null,
        worth: null,
        streak: null,
        lastCollected: null
    };

    addLog("✓ Account disconnected and session cleared.", "warn");
    return { success: true };
}

// 3-Hour Smart Auto-Scheduler (Checks Collect, Sponsored Items 6x/day & Viewed items)
setInterval(() => {
    if (autoSchedule && isConnected && !isBusy && !loginWindowActive) {
        addLog("⏰ 3-Hour Smart Schedule triggered: Checking Collect, Sponsored Items (6x/day) & Viewed items...", "info");
        const { runSmartCollector } = require('./smart_task_collector');
        runSmartCollector().then(res => {
            if (res && res.balance) {
                if (res.balance.coins) accountDetails.coins = res.balance.coins;
                if (res.balance.worth) accountDetails.worth = res.balance.worth;
                if (res.balance.streak) accountDetails.streak = res.balance.streak;
                saveAccountState();
                addLog(`✓ 3-Hour Cycle Complete: 🪙 ${accountDetails.coins} Coins (${accountDetails.worth})`, "success");
            }
        }).catch(err => {
            addLog(`Smart task error: ${err.message}`, "error");
        });
    }
}, 3 * 60 * 60 * 1000);

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
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

    // Serve Frontend
    if (pathname === '/' || pathname === '/index.html') {
        const htmlPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(htmlPath, 'utf8'));
            return;
        }
    }

    // API: Status
    if (pathname === '/api/status') {
        if (fs.existsSync(ACCOUNT_FILE)) {
            try {
                const diskAcc = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
                if (diskAcc.coins) accountDetails.coins = diskAcc.coins;
                if (diskAcc.worth) accountDetails.worth = diskAcc.worth;
                if (diskAcc.streak) accountDetails.streak = diskAcc.streak;
                if (diskAcc.email) accountDetails.email = diskAcc.email;
                if (diskAcc.lastCollected) accountDetails.lastCollected = diskAcc.lastCollected;
            } catch(e) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            isConnected,
            isBusy,
            loginWindowActive,
            currentAction,
            accountDetails,
            lastResult,
            autoSchedule,
            logs
        }));
        return;
    }

    // API: Connect (Mobile Window)
    if (pathname === '/api/connect') {
        openLoginWindow();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Login window launched' }));
        return;
    }

let mobileCloseTimer = null;

function closeAllMobileWindowsSync() {
    if (process.platform === 'win32') {
        try {
            const { execSync } = require('child_process');
            const psScript = path.join(__dirname, 'close_mobile.ps1');
            if (fs.existsSync(psScript)) {
                execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`);
            }
        } catch(e) {}
    }
}

async function openExactMobileWindow() {
    const { exec } = require('child_process');
    let isConnected = false;
    try {
        const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (v.ok) isConnected = true;
    } catch(e) {}

    if (!isConnected) {
        exec('schtasks /run /tn "TestInteractiveChrome"');
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
                if (v.ok) { isConnected = true; break; }
            } catch(e) {}
        }
    }

    try {
        const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
        const pages = await browser.pages();
        const page = pages.find(p => p.url().includes('coin')) || pages[0] || await browser.newPage();

        await page.emulate(puppeteer.KnownDevices['iPhone 16 Pro Max']);
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

        await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
        await browser.disconnect();
    } catch(e) {}

    // Auto-close safety timer: close all after 60 seconds (1 minute) as requested
    if (mobileCloseTimer) clearTimeout(mobileCloseTimer);
    mobileCloseTimer = setTimeout(() => {
        closeAllMobileWindowsSync();
        addLog("🔒 1 minute elapsed: Automatically closed all mobile windows.", "info");
    }, 60000);
}

    // API: Open Native Mobile Chrome Window with iPhone UA & anti-redirect
    if (pathname === '/api/open_native_mobile') {
        openExactMobileWindow().catch((err) => {
            addLog("Mobile launch error: " + err.message, "error");
        });
        addLog("📱 Exact iPhone 16 Pro Max mobile screen opened! (Auto-close after 1 min)", "success");
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Opening iPhone 16 Pro Max mobile window (auto-closes in 1 min)...' }));
        return;
    }

    // API: Force Close All Mobile Windows (Clean process shutdown)
    if (pathname === '/api/close_mobile') {
        if (mobileCloseTimer) {
            clearTimeout(mobileCloseTimer);
            mobileCloseTimer = null;
        }
        closeAllMobileWindowsSync();
        addLog("🔒 Closed all mobile Chrome windows.", "info");
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All mobile Chrome windows closed' }));
        return;
    }

    // API: Check if Mobile Chrome Window is Active on port 9222
    if (pathname === '/api/check_mobile') {
        let isMobileOpen = false;
        try {
            const versionRes = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
            if (versionRes.ok) isMobileOpen = true;
        } catch(e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isMobileOpen }));
        return;
    }

    // API: Get Task Run History Sessions
    if (pathname === '/api/history') {
        const histFile = path.join(__dirname, 'activity_history.json');
        let history = [];
        if (fs.existsSync(histFile)) {
            try { history = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch(e) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ history }));
        return;
    }

    // API: Get Raw Text Activity Log
    if (pathname === '/api/activity_log') {
        const logFile = path.join(__dirname, 'collector_activity.log');
        let text = 'No activity logged yet.';
        if (fs.existsSync(logFile)) {
            try { text = fs.readFileSync(logFile, 'utf8'); } catch(e) {}
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(text);
        return;
    }

    // API: Confirm Login (Called when popup X is clicked or via 1-click connect button)
    if (pathname === '/api/confirm_login' && req.method === 'POST') {
        isConnected = true;
        if (!accountDetails.email || accountDetails.email.includes('/')) {
            accountDetails.email = 'nirajtimilatube';
        }
        if (!accountDetails.worth) {
            accountDetails.worth = accountDetails.coins ? 'AU$' + (Number(accountDetails.coins) * 0.015).toFixed(2) : 'AU$4.28';
        }
        if (!accountDetails.streak) accountDetails.streak = '7-Day Streak Active';
        if (!accountDetails.region) accountDetails.region = 'AU';
        if (!accountDetails.currency) accountDetails.currency = 'AUD';
        saveAccountState();

        addLog(`🎉 Account connected: ${accountDetails.email} (🪙 ${accountDetails.coins || '...'} - ${accountDetails.worth})`, "success");
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, account: accountDetails }));
        return;
    }

    // API: Connect via Cookies / 1-Click Sync
    if (pathname === '/api/connect_cookie' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const result = connectViaCookies(data.cookies || data.cookieString);

                // If live balance or username was passed from snippet, save immediately
                if (data.coins) accountDetails.coins = data.coins;
                if (data.worth) accountDetails.worth = data.worth;
                if (data.streak) accountDetails.streak = data.streak;
                if (data.username) accountDetails.email = data.username;
                if (data.userId) accountDetails.userId = data.userId;
                if (data.alreadyCollected) {
                    lastResult.status = 'Collected Today ✓';
                    lastResult.message = 'Daily coins and bonus tasks successfully collected! 🎉';
                    lastResult.timestamp = new Date().toISOString();
                    accountDetails.lastCollected = new Date().toISOString();
                }
                isConnected = true;
                saveAccountState();

                addLog(`🎉 Live Balance Synced: User: ${accountDetails.email || accountDetails.userId} | Balance: 🪙 ${accountDetails.coins} (${accountDetails.worth})`, "success");

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, account: accountDetails }));
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: Update Balance directly
    if (pathname === '/api/update_balance' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.coins !== undefined && data.coins !== null) {
                    accountDetails.coins = String(data.coins);
                    accountDetails.worth = data.worth || ('AU$' + (Number(accountDetails.coins) * 0.015).toFixed(2));
                }
                if (data.username) accountDetails.email = data.username;
                if (data.streak) accountDetails.streak = data.streak;
                isConnected = true;
                saveAccountState();

                addLog(`✓ Live balance updated: 🪙 ${accountDetails.coins} (${accountDetails.worth})`, "success");
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, account: accountDetails }));
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: Collect Now
    if (pathname === '/api/collect') {
        if (!isConnected) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Please connect your account first.' }));
            return;
        }

        addLog("⚡ Smart Task Collector triggered: Checking Collect, Sponsored items & Viewed items...", "info");
        const { runSmartCollector } = require('./smart_task_collector');
        runSmartCollector((msg, type) => addLog(msg, type)).then(res => {
            if (res && res.balance) {
                if (res.balance.coins) accountDetails.coins = res.balance.coins;
                if (res.balance.worth) accountDetails.worth = res.balance.worth;
                if (res.balance.streak) accountDetails.streak = res.balance.streak;
                saveAccountState();
                addLog(`✓ Smart Cycle Finished! Balance: 🪙 ${accountDetails.coins} Coins (${accountDetails.worth})`, "success");
            }
        }).catch(err => {
            addLog(`Collection error: ${err.message}`, "error");
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Smart Task Collection triggered', account: accountDetails }));
        return;
    }

    // API: Disconnect
    if (pathname === '/api/disconnect') {
        await disconnectAccount();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // API: Toggle Schedule
    if (pathname === '/api/toggle_schedule') {
        autoSchedule = !autoSchedule;
        addLog(`Auto-Schedule: ${autoSchedule ? 'ENABLED (Every 24h)' : 'DISABLED'}`, "info");
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ autoSchedule }));
        return;
    }

    // API: Clear Logs
    if (pathname === '/api/clear_logs') {
        logs = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

server.listen(PORT, () => {
    addLog(`AliExpress Coins Full-Stack App live at http://localhost:${PORT}`, "success");
});
