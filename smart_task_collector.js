/**
 * AliExpress Smart Autonomous Collector with Comprehensive Activity Logging
 * 
 * Rules:
 * 1. Log exact browser launch time and port.
 * 2. Check & click daily Collect button (if found: click, wait 1 min, log).
 * 3. Check & click 'Explore sponsored items' (+5) (if available: click, wait 1 min, log).
 * 4. Check & click 'Browse recently viewed items' (+5) (if available: click, wait 1 min, log).
 * 5. Leave other tasks untouched.
 * 6. Scrape live balance, persist to account.json & activity_history.json.
 * 7. Close Chrome cleanly and log exit time.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ACCOUNT_FILE = path.join(__dirname, 'account.json');
const HISTORY_FILE = path.join(__dirname, 'activity_history.json');
const LOG_FILE = path.join(__dirname, 'collector_activity.log');
const TARGET_URL = 'https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function appendLogFile(line) {
    try {
        const timeStr = new Date().toLocaleString();
        fs.appendFileSync(LOG_FILE, `[${timeStr}] ${line}\n`, 'utf8');
    } catch(e) {}
}

function saveSessionHistory(session) {
    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch(e) {}
        }
        if (!Array.isArray(history)) history = [];
        history.unshift(session);
        if (history.length > 50) history = history.slice(0, 50);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    } catch(e) {}
}

async function closeAllMobileWindows(browserInstance = null) {
    if (browserInstance) {
        try {
            const pages = await browserInstance.pages();
            for (const p of pages) {
                try { await p.close(); } catch(e) {}
            }
            await browserInstance.close();
        } catch(e) {}
    }
    // Only call Windows PowerShell cleanup on Windows
    if (process.platform === 'win32') {
        try {
            const psScript = path.join(__dirname, 'close_mobile.ps1');
            if (fs.existsSync(psScript)) {
                execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`);
            }
        } catch(e) {}
    }
}

async function runSmartCollector(customLogger = null) {
    const startTimestamp = Date.now();
    const session = {
        id: startTimestamp,
        date: new Date().toLocaleDateString(),
        startTime: new Date().toLocaleTimeString(),
        endTime: null,
        durationSeconds: 0,
        browserOpenedAt: null,
        browserClosedAt: null,
        tasks: {
            dailyCollect: { status: 'Checking...', details: '' },
            exploreSponsored: { status: 'Checking...', details: '' },
            browseViewed: { status: 'Checking...', details: '' }
        },
        balanceBefore: null,
        balanceAfter: null,
        worth: null,
        streak: null,
        logEntries: []
    };

    function logMsg(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ${msg}`);
        appendLogFile(`[${type.toUpperCase()}] ${msg}`);
        session.logEntries.push({ time, msg, type });
        if (typeof customLogger === 'function') {
            try { customLogger(msg, type); } catch(e) {}
        }
    }

    logMsg('=====================================================', 'info');
    logMsg('🚀 Starting AliExpress Smart Autonomous Task Collector', 'info');
    logMsg('=====================================================', 'info');

    // Read initial balance
    if (fs.existsSync(ACCOUNT_FILE)) {
        try {
            const acc = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
            session.balanceBefore = acc.coins || '...';
            session.worth = acc.worth || '';
            logMsg(`Initial Coin Balance: 🪙 ${session.balanceBefore} (${session.worth})`, 'info');
        } catch(e) {}
    }

    const isHeadlessMode = process.env.DOCKER === 'true' || process.env.HEADLESS === 'true' || process.platform !== 'win32';
    let browser = null;
    let page = null;

    if (isHeadlessMode) {
        logMsg('🐳 Server / Docker Environment Detected: Launching Headless Chromium...', 'info');
        try {
            const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH ||
                (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' :
                (fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' : undefined));

            browser = await puppeteer.launch({
                executablePath: chromiumPath,
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--window-size=440,956'
                ]
            });
            const pages = await browser.pages();
            page = pages[0] || await browser.newPage();

            // Set Australian English locale & emulation
            await page.setViewport({ width: 440, height: 956, isMobile: true, hasTouch: true });
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-AU,en-US;q=0.9,en;q=0.8'
            });

            // Inject saved session cookies via CDP Network.setCookies
            const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');
            if (fs.existsSync(COOKIES_FILE)) {
                try {
                    const rawCookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                    if (Array.isArray(rawCookies) && rawCookies.length > 0) {
                        const client = await page.target().createCDPSession();
                        const cdpCookies = rawCookies.map(c => {
                            const ck = {
                                name: c.name,
                                value: c.value,
                                domain: c.domain || '.aliexpress.com',
                                path: c.path || '/'
                            };
                            if (c.expires && c.expires > 0) ck.expires = c.expires;
                            if (c.httpOnly !== undefined) ck.httpOnly = Boolean(c.httpOnly);
                            if (c.secure !== undefined) ck.secure = Boolean(c.secure);
                            if (c.sameSite && ['Strict', 'Lax', 'None'].includes(c.sameSite)) ck.sameSite = c.sameSite;
                            return ck;
                        });
                        try {
                            await client.send('Network.setCookies', { cookies: cdpCookies });
                            logMsg(`✓ Restored ${cdpCookies.length} session cookies via CDP Network.setCookies.`, 'success');
                        } catch(cdpErr) {
                            await page.setCookie(...rawCookies);
                            logMsg(`✓ Restored ${rawCookies.length} session cookies via page.setCookie.`, 'success');
                        }
                    }
                } catch(e) {
                    logMsg(`⚠️ Cookie restore notice: ${e.message}`, 'warn');
                }
            }
        } catch(err) {
            logMsg(`❌ Error launching headless browser: ${err.message}`, 'error');
            return { success: false, error: err.message };
        }
    } else {
        let isConnected = false;
        try {
            const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
            if (v.ok) isConnected = true;
        } catch(e) {}

        if (!isConnected) {
            logMsg('📱 Launching Chrome Mobile Browser session (port 9222)...', 'info');
            try {
                execSync('schtasks /run /tn "TestInteractiveChrome"');
            } catch(e) {
                exec('cmd.exe /c "' + path.join(__dirname, 'Open_AliExpress_Mobile.bat') + '"');
            }

            for (let i = 0; i < 7; i++) {
                await sleep(1000);
                try {
                    const v = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
                    if (v.ok) {
                        isConnected = true;
                        break;
                    }
                } catch(e) {}
            }
        }

        if (!isConnected) {
            logMsg('❌ Error: Could not connect to Chrome on port 9222.', 'error');
            session.tasks.dailyCollect.status = 'Failed (Chrome not responding)';
            saveSessionHistory(session);
            return { success: false, error: 'Could not connect to Chrome' };
        }

        browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
        const pages = await browser.pages();
        page = pages.find(p => p.url().includes('coin')) || pages[0] || await browser.newPage();
    }

    session.browserOpenedAt = new Date().toLocaleTimeString();
    logMsg(`✓ Browser active at ${session.browserOpenedAt}. Mode: ${isHeadlessMode ? 'Headless Server' : 'Desktop 9222'}.`, 'success');

    try {
        // 1. Full iPhone Emulation & CDP Client Hints override
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

        logMsg('Navigating to AliExpress Coins Index...', 'info');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // Allow dynamic scripts, user session, and coin animations to hydrate
        await sleep(6000);

        // ==========================================
        // TASK 1: Check and Click Daily Collect Button
        // ==========================================
        logMsg('🔍 Step 1: Checking daily Collect button...', 'info');
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
            }

            const bodyText = (document.body.innerText || '').toLowerCase();
            const all = Array.from(document.querySelectorAll('*'));

            // 1. Check for genuine active Collect / Check-in buttons first
            const sBtn = document.getElementById('signButton') ||
                         document.querySelector('.aecoin-checkInButton-jC2Uo') ||
                         document.querySelector('.aecoin-signButton-gaDga') ||
                         document.querySelector('.aecoin-checkInAura-36sJZ');
            if (sBtn) {
                const aura = sBtn.closest('.aecoin-signButtonWrapper-21Q3m') || sBtn.closest('div') || sBtn;
                smartClick(aura);
                smartClick(sBtn);
                return { status: 'clicked' };
            }

            // Look for button or clickable element with text "Collect", "Check in", "Claim", "Get coins"
            const btn = all.find(e => /^(collect|check[\s-]?in|claim|get\s*coins)$/i.test((e.innerText || '').trim())) ||
                        all.find(e => {
                            const t = (e.innerText || '').trim().toLowerCase();
                            return (t.includes('collect') || t.includes('check in')) && t.length < 25 && !t.includes('tomorrow');
                        });
            if (btn) {
                smartClick(btn.closest('button, [role="button"], div') || btn);
                return { status: 'clicked' };
            }

            // 2. Check if daily checkin is already completed:
            // Look for "Tomorrow" in streak cards, "Signed", "Checked in", "Collected", "days streak"
            const hasTomorrow = all.some(e => /tomorrow/i.test((e.innerText || '').trim()) && e.children.length === 0);
            const isAlreadyClaimed = all.some(e => {
                const t = (e.innerText || '').trim().toLowerCase();
                return t === 'collected' || t === 'already collected' || t === 'come back tomorrow' || t === 'signed' || t === 'checked in';
            });

            if (isAlreadyClaimed || hasTomorrow || bodyText.includes('days streak')) {
                return { status: 'already_collected' };
            }

            return { status: 'not_found' };
        });

        if (collectResult.status === 'clicked') {
            session.tasks.dailyCollect.status = 'Claimed (+10 to +70 Coins)';
            session.tasks.dailyCollect.details = 'Clicked daily check-in button, waited 60s';
            logMsg('🎉 Daily Collect button found & clicked! Waiting 60 seconds...', 'success');
            await sleep(60000);
            logMsg('✓ 60-second wait complete for Daily Collect.', 'info');
        } else if (collectResult.status === 'already_collected') {
            session.tasks.dailyCollect.status = 'Already Collected Today ✓';
            session.tasks.dailyCollect.details = 'Streak active, next check-in available tomorrow';
            logMsg('✓ Daily check-in was already completed today (Streak active).', 'info');
        } else {
            session.tasks.dailyCollect.status = 'Not Found';
            session.tasks.dailyCollect.details = 'Collect button not currently visible';
            logMsg('ℹ️ Collect button not visible at this time.', 'info');
        }

        // ==========================================
        // Helper: Multi-Step Progressive Scroll & Hydration
        // ==========================================
        async function hydrateAndRevealTasks() {
            logMsg('📜 Progressively scrolling down to hydrate virtualized task items...', 'info');
            // Scroll down in steps from 300px to 1500px to ensure lazy Weex/Rax components mount into DOM
            for (let y = 300; y <= 1500; y += 250) {
                await page.evaluate((pos) => window.scrollTo(0, pos), y);
                await sleep(350);
            }

            // Check if there is an "Earn more" or expand button to click
            await page.evaluate(() => {
                const all = Array.from(document.querySelectorAll('*'));
                const earnMore = all.find(e => /earn\s*more/i.test((e.innerText || '').trim()) && e.children.length === 0);
                if (earnMore) {
                    const clickable = earnMore.closest('button, [role="button"], div, a') || earnMore;
                    try { clickable.click(); } catch(e) {}
                }
            });
            await sleep(800);

            // Frame tasks nicely in viewport
            await page.evaluate(() => window.scrollTo(0, 800));
            await sleep(800);

            // Take and save diagnostic screenshot
            try {
                const debugPath = path.join(__dirname, 'debug_task_view.png');
                await page.screenshot({ path: debugPath });
                logMsg('📷 Saved diagnostic screenshot to debug_task_view.png', 'info');
            } catch(e) {}
        }

        // ==========================================
        // Helper: Find, Click and Actively Browse (65s with scrolling)
        // ==========================================
        async function runSpecificTask(keywords, taskLabel) {
            logMsg(`🔍 Checking task: "${taskLabel}"...`, 'info');
            
            if (!page.url().includes('coin-index')) {
                await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
                await sleep(4000);
            }

            await hydrateAndRevealTasks();

            const taskStatus = await page.evaluate((kwList) => {
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
                }

                const all = Array.from(document.querySelectorAll('*'));

                // 1. Search for title element matching any keyword in kwList
                let matchEl = null;
                for (const kw of kwList) {
                    const lowerKw = kw.toLowerCase();
                    matchEl = all.find(el => {
                        const t = (el.innerText || '').trim().toLowerCase();
                        return t.includes(lowerKw) && el.children.length === 0;
                    });
                    if (!matchEl) {
                        matchEl = all.find(el => {
                            const t = (el.innerText || '').trim().toLowerCase();
                            return t.includes(lowerKw) && el.children.length <= 2 && t.length < 80;
                        });
                    }
                    if (matchEl) break;
                }

                if (!matchEl) {
                    // Collect visible text snippets on the page for debugging
                    const snippets = all
                        .filter(e => e.children.length === 0 && (e.innerText || '').trim().length > 3 && (e.innerText || '').trim().length < 50)
                        .map(e => e.innerText.trim())
                        .filter(t => /earn|task|coin|explore|browse|view|order|shop|item|point/i.test(t))
                        .slice(0, 10);
                    return { found: false, reason: 'Task title not visible', snippets };
                }

                // 2. Climb up to the row/card container
                let row = matchEl;
                let actionBtn = null;
                for (let i = 0; i < 7; i++) {
                    if (row.parentElement && row.parentElement !== document.body) {
                        row = row.parentElement;
                        const children = Array.from(row.querySelectorAll('*'));
                        
                        // Priority A: Element with +5 or +10 or +number
                        actionBtn = children.find(c => /^\+\s*\d+/.test((c.innerText || '').trim()) && c.children.length === 0) ||
                                    children.find(c => /^\+\s*\d+/.test((c.innerText || '').trim()) && c.children.length <= 2);
                        
                        // Priority B: Element with action text "Go", "Browse", "Explore", "Claim", "Start"
                        if (!actionBtn) {
                            actionBtn = children.find(c => /^(go|browse|explore|claim|start)$/i.test((c.innerText || '').trim()) && c.children.length === 0);
                        }

                        // Priority C: button or role="button" containing "+"
                        if (!actionBtn) {
                            actionBtn = children.find(c => (c.tagName === 'BUTTON' || c.getAttribute('role') === 'button') && (c.innerText || '').includes('+'));
                        }

                        if (actionBtn) break;
                    }
                }

                const rowText = row ? row.innerText.replace(/\n+/g, ' | ') : '';

                if (!actionBtn) {
                    const isCompleted = /completed|done|\b(\d+)\/\1\b/i.test(rowText);
                    return {
                        found: false,
                        reason: isCompleted ? 'Task already completed for today' : 'Action button not found in row',
                        rowText
                    };
                }

                // Ensure the button is scrolled into view and clickable
                try { actionBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
                const clickable = actionBtn.closest('[role="button"], button, div') || actionBtn;
                smartClick(clickable);

                return {
                    found: true,
                    buttonText: actionBtn.innerText.trim(),
                    rowText: rowText.slice(0, 120)
                };
            }, keywords);

            if (!taskStatus.found) {
                logMsg(`ℹ️ "${taskLabel}": ${taskStatus.reason}`, 'info');
                if (taskStatus.snippets && taskStatus.snippets.length > 0) {
                    logMsg(`   Visible page snippets: ${taskStatus.snippets.join(' | ')}`, 'info');
                }
                return { success: false, reason: taskStatus.reason };
            }

            logMsg(`✓ Found and clicked "${taskLabel}" (${taskStatus.buttonText})!`, 'success');
            logMsg('⏳ Waiting 3s for destination page/tab to load...', 'info');
            await sleep(3000);

            // Detect if a new tab opened or page navigated
            const allPages = await browser.pages();
            const targetPage = allPages[allPages.length - 1];
            const isNewTab = allPages.length > 1;
            logMsg(`📄 Active Target: ${targetPage.url().slice(0, 80)}... (New Tab: ${isNewTab})`, 'info');

            // Actively browse and scroll for 65 seconds
            logMsg(`⏳ Browsing "${taskLabel}" for 65 seconds with active scroll telemetry...`, 'info');
            const browseStart = Date.now();
            let step = 0;
            while (Date.now() - browseStart < 65000) {
                step++;
                const scrollDelta = (step % 2 === 0) ? 350 : 250;
                try {
                    await targetPage.evaluate((d) => window.scrollBy(0, d), scrollDelta);
                } catch(e) {}
                await sleep(4000);

                const elapsed = Math.round((Date.now() - browseStart) / 1000);
                if (elapsed % 15 === 0) {
                    logMsg(`... ${elapsed}s / 65s (active browsing on ${taskLabel})`, 'info');
                }
            }

            logMsg(`🎉 65-second active browsing requirement completed for "${taskLabel}"!`, 'success');

            // Close secondary tab if opened, or navigate back
            if (isNewTab) {
                logMsg('Closing secondary task tab and returning to Coin Hub...', 'info');
                try { await targetPage.close(); } catch(e) {}
            } else {
                logMsg('Navigating back to main Coin Hub...', 'info');
                await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
            }

            await sleep(4000);
            return { success: true, details: taskStatus.rowText };
        }

        // ==========================================
        // TASK 2: Explore sponsored items (+5, up to 6x/day)
        // ==========================================
        const sponsoredKeywords = ['explore sponsored items', 'sponsored items', 'sponsored products', 'sponsor'];
        const sponsoredResult = await runSpecificTask(sponsoredKeywords, 'Explore sponsored items');
        if (sponsoredResult.success) {
            session.tasks.exploreSponsored.status = `Completed (+5 Coins)`;
            session.tasks.exploreSponsored.details = `Browsed 65s with active scrolling telemetry (${sponsoredResult.details})`;
        } else {
            session.tasks.exploreSponsored.status = 'Not Available (Completed or in cooldown)';
            session.tasks.exploreSponsored.details = sponsoredResult.reason;
        }

        // ==========================================
        // TASK 3: Browse recently viewed items (+5)
        // ==========================================
        const viewedKeywords = ['browse recently viewed items', 'recently viewed items', 'viewed items', 'recently viewed', 'viewed'];
        const viewedResult = await runSpecificTask(viewedKeywords, 'Browse recently viewed items');
        if (viewedResult.success) {
            session.tasks.browseViewed.status = `Completed (+5 Coins)`;
            session.tasks.browseViewed.details = `Browsed 65s with active scrolling telemetry (${viewedResult.details})`;
        } else {
            session.tasks.browseViewed.status = 'Not Available (Completed or in cooldown)';
            session.tasks.browseViewed.details = viewedResult.reason;
        }

        // ==========================================
        // Final Live Balance Scraping
        // ==========================================
        logMsg('📊 Scraping updated real-time balance from DOM...', 'info');
        await sleep(2000);
        const liveBalance = await page.evaluate(() => {
            let coins = null, worth = null, streak = null;

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

            const all = Array.from(document.querySelectorAll('*'));
            const worthEl = all.find(e => (e.innerText || '').includes('worth') && e.children.length === 0);
            if (worthEl) {
                const wm = worthEl.innerText.match(/worth\s*([A-Z\$0-9\.]+)/i);
                if (wm) worth = wm[1];
            }

            const streakEl = all.find(e => (e.innerText || '').includes('days streak') && (e.innerText || '').length < 30);
            if (streakEl) streak = streakEl.innerText.replace(/\s+/g, ' ').trim();

            return { coins, worth, streak };
        });

        session.balanceAfter = liveBalance.coins || session.balanceBefore;
        session.worth = liveBalance.worth || session.worth;
        session.streak = liveBalance.streak || 'Active';

        logMsg(`🪙 Live Balance Scraped: ${session.balanceAfter} Coins (${session.worth}) | Streak: ${session.streak}`, 'success');

        // Save to account.json
        if (liveBalance.coins && fs.existsSync(ACCOUNT_FILE)) {
            try {
                const acc = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
                acc.coins = liveBalance.coins;
                if (liveBalance.worth) acc.worth = liveBalance.worth;
                if (liveBalance.streak) acc.streak = liveBalance.streak;
                acc.lastCollected = new Date().toISOString();
                fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(acc, null, 2));
                logMsg('✓ Live balance persisted to account.json.', 'success');
            } catch(e) {}
        }

        // Persist refreshed session cookies (captures all domains via CDP)
        try {
            let refreshedCookies = [];
            try {
                const client = await page.target().createCDPSession();
                const res = await client.send('Network.getAllCookies');
                if (res && Array.isArray(res.cookies) && res.cookies.length > 0) {
                    refreshedCookies = res.cookies;
                }
            } catch(e) {}
            if (refreshedCookies.length === 0) {
                refreshedCookies = await page.cookies();
            }
            if (refreshedCookies && refreshedCookies.length > 0) {
                const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');
                fs.writeFileSync(COOKIES_FILE, JSON.stringify(refreshedCookies, null, 2));
                logMsg(`✓ Refreshed ${refreshedCookies.length} session cookies to session_cookies.json.`, 'info');
            }
        } catch(e) {}

        // ==========================================
        // CLOSE CHROME COMPLETELY (All windows and processes)
        // ==========================================
        session.browserClosedAt = new Date().toLocaleTimeString();
        session.endTime = session.browserClosedAt;
        session.durationSeconds = Math.round((Date.now() - startTimestamp) / 1000);

        logMsg(`🔒 Closing Chrome browser and all mobile windows at ${session.browserClosedAt}...`, 'info');
        await closeAllMobileWindows(browser);
        browser = null;
        logMsg(`✓ All mobile windows closed cleanly. Total cycle duration: ${session.durationSeconds}s.`, 'success');

        saveSessionHistory(session);
        return { success: true, session, balance: liveBalance };

    } catch(err) {
        logMsg(`❌ Error during task run: ${err.message}`, 'error');
        session.endTime = new Date().toLocaleTimeString();
        session.browserClosedAt = session.endTime;
        session.durationSeconds = Math.round((Date.now() - startTimestamp) / 1000);
        saveSessionHistory(session);

        await closeAllMobileWindows(browser);
        browser = null;
        return { success: false, error: err.message, session };
    }
}

if (require.main === module) {
    runSmartCollector();
}

module.exports = { runSmartCollector, closeAllMobileWindows, HISTORY_FILE, LOG_FILE };
