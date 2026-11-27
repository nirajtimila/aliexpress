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

            // Inject saved session cookies if available
            const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');
            if (fs.existsSync(COOKIES_FILE)) {
                try {
                    const rawCookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
                    if (Array.isArray(rawCookies) && rawCookies.length > 0) {
                        await page.setCookie(...rawCookies);
                        logMsg(`✓ Restored ${rawCookies.length} session cookies from session_cookies.json.`, 'success');
                    }
                } catch(e) {}
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
        await sleep(4000);

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

            const all = Array.from(document.querySelectorAll('*'));
            const isAlreadyClaimed = all.some(e => {
                const t = (e.innerText || '').trim().toLowerCase();
                return t === 'collected' || t === 'already collected' || t === 'come back tomorrow';
            });
            if (isAlreadyClaimed) return { status: 'already_collected' };

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

            const btn = all.find(e => /^collect$/i.test((e.innerText || '').trim())) ||
                        all.find(e => (e.innerText || '').toLowerCase().includes('collect') && (e.innerText || '').length < 20);
            if (btn) {
                smartClick(btn.closest('button, [role="button"], div') || btn);
                return { status: 'clicked' };
            }

            return { status: 'not_found' };
        });

        if (collectResult.status === 'clicked') {
            session.tasks.dailyCollect.status = 'Claimed (+10 Coins)';
            session.tasks.dailyCollect.details = 'Clicked orange Collect button, waited 60s';
            logMsg('🎉 Daily Collect button found & clicked! Waiting 60 seconds...', 'success');
            await sleep(60000);
            logMsg('✓ 60-second wait complete for Daily Collect.', 'info');
        } else if (collectResult.status === 'already_collected') {
            session.tasks.dailyCollect.status = 'Already Collected Today ✓';
            session.tasks.dailyCollect.details = 'Streak active, nothing to claim';
            logMsg('✓ Daily check-in was already claimed today.', 'info');
        } else {
            session.tasks.dailyCollect.status = 'Not Found';
            session.tasks.dailyCollect.details = 'Collect button not currently visible';
            logMsg('ℹ️ Collect button not visible at this time.', 'info');
        }

        // ==========================================
        // Helper: Find, Click and Actively Browse (65s with scrolling)
        // ==========================================
        async function runSpecificTask(taskKeyword, taskLabel) {
            logMsg(`🔍 Checking task: "${taskLabel}"...`, 'info');
            
            if (!page.url().includes('coin-index')) {
                await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
                await sleep(3000);
            }

            // Scroll down into tasks section to ensure lazy elements are hydrated
            await page.evaluate(() => window.scrollBy(0, 350));
            await sleep(1500);

            const taskStatus = await page.evaluate((keyword) => {
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
                const targetText = all.find(el => {
                    const t = (el.innerText || '').trim().toLowerCase();
                    return t.includes(keyword.toLowerCase()) && el.children.length === 0;
                });

                if (!targetText) return { found: false, reason: 'Task title not visible' };

                let row = targetText;
                let btn = null;
                for (let i = 0; i < 6; i++) {
                    if (row.parentElement && row.parentElement !== document.body) {
                        row = row.parentElement;
                        btn = Array.from(row.querySelectorAll('*')).find(c => /^\+\d+/.test((c.innerText || '').trim()) && c.children.length === 0);
                        if (btn) break;
                    }
                }

                if (!btn) return { found: false, reason: 'Task already completed or in cooldown' };

                const clickable = btn.closest('[role="button"], div, button') || btn;
                smartClick(clickable);
                return { found: true, buttonText: btn.innerText.trim(), rowText: row.innerText.replace(/\n+/g, ' | ') };
            }, taskKeyword);

            if (!taskStatus.found) {
                logMsg(`ℹ️ "${taskLabel}": ${taskStatus.reason}`, 'info');
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
        const sponsoredResult = await runSpecificTask('Explore sponsored items', 'Explore sponsored items');
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
        const viewedResult = await runSpecificTask('Browse recently viewed items', 'Browse recently viewed items');
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

        // Persist refreshed session cookies
        try {
            const currentCookies = await page.cookies();
            if (currentCookies && currentCookies.length > 0) {
                const COOKIES_FILE = path.join(__dirname, 'session_cookies.json');
                fs.writeFileSync(COOKIES_FILE, JSON.stringify(currentCookies, null, 2));
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
