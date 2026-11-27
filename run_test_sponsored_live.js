const puppeteer = require('puppeteer-core');

(async () => {
    console.log('Connecting to Chrome on port 9222...');
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('coin')) || pages[0];

    console.log('Scrolling down to reveal tasks...');
    await page.evaluate(() => window.scrollBy(0, 350));
    await new Promise(r => setTimeout(r, 1500));

    // Find and inspect the Explore sponsored items button
    const btnInfo = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const titleEl = all.find(e => (e.innerText || '').trim() === 'Explore sponsored items' && e.children.length === 0);
        if (!titleEl) return { found: false, error: 'Title not found' };

        let row = titleEl;
        let btn = null;
        for (let i = 0; i < 6; i++) {
            if (row.parentElement && row.parentElement !== document.body) {
                row = row.parentElement;
                btn = Array.from(row.querySelectorAll('*')).find(c => /^\+\d+/.test((c.innerText || '').trim()) && c.children.length === 0);
                if (btn) break;
            }
        }

        if (!btn) return { found: false, error: 'Button not found in row' };

        const target = btn.closest('[role="button"], div, button') || btn;
        return {
            found: true,
            title: titleEl.innerText,
            buttonText: btn.innerText,
            rowText: row.innerText.replace(/\n+/g, ' | '),
            targetHtml: target.outerHTML.slice(0, 200)
        };
    });

    console.log('Button Info:', JSON.stringify(btnInfo, null, 2));

    if (!btnInfo.found) {
        console.log('Cannot proceed with test: button not found.');
        await browser.disconnect();
        return;
    }

    console.log('\n--- CLICKING "Explore sponsored items" (+5) ---');
    await page.evaluate(() => {
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
        const titleEl = all.find(e => (e.innerText || '').trim() === 'Explore sponsored items' && e.children.length === 0);
        let row = titleEl;
        for (let i = 0; i < 6; i++) {
            if (row.parentElement && row.parentElement !== document.body) {
                row = row.parentElement;
                const btn = Array.from(row.querySelectorAll('*')).find(c => /^\+\d+/.test((c.innerText || '').trim()) && c.children.length === 0);
                if (btn) {
                    const target = btn.closest('[role="button"], div, button') || btn;
                    smartClick(target);
                    break;
                }
            }
        }
    });

    console.log('Clicked! Waiting 3 seconds to see if navigation or modal happens...');
    await new Promise(r => setTimeout(r, 3000));

    // Check all open pages/tabs in the browser
    const allPages = await browser.pages();
    console.log(`Active pages count: ${allPages.length}`);
    for (let i = 0; i < allPages.length; i++) {
        console.log(`Page [${i}]: ${allPages[i].url()}`);
    }

    // Identify active target page
    const activePage = allPages[allPages.length - 1];
    console.log('Active Page URL:', activePage.url());

    // Take screenshot at 5s
    await activePage.screenshot({ path: 'sponsored_test_5s.png' });
    console.log('Screenshot 5s captured.');

    // Now simulate realistic browsing with periodic scrolling for 65 seconds
    console.log('\nBrowsing sponsored page for 65 seconds with scrolling simulation...');
    const startTime = Date.now();
    let scrollStep = 0;
    while (Date.now() - startTime < 65000) {
        scrollStep++;
        const delta = (scrollStep % 2 === 0) ? 350 : 250;
        await activePage.evaluate((d) => window.scrollBy(0, d), delta);
        await new Promise(r => setTimeout(r, 4000));
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed % 15 === 0) {
            console.log(`... elapsed: ${elapsed}s / 65s (active browsing)`);
            await activePage.screenshot({ path: `sponsored_test_${elapsed}s.png` });
        }
    }

    console.log('65 seconds complete! Final screenshot...');
    await activePage.screenshot({ path: 'sponsored_test_final.png' });

    // Inspect if there is any floating claim button or reward text
    const floatingRewards = await activePage.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const texts = all.filter(e => {
            const t = (e.innerText || '').toLowerCase();
            return (t.includes('coin') || t.includes('claim') || t.includes('congrat') || t.includes('+5')) && e.children.length === 0;
        }).map(e => e.innerText.trim());
        return Array.from(new Set(texts));
    });

    console.log('Floating/Reward Texts:', floatingRewards);

    // Navigate back or close tab if new tab
    if (allPages.length > 1) {
        console.log('Closing secondary sponsored tab...');
        await activePage.close();
    } else {
        console.log('Navigating back to main coin index...');
        await page.goto('https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=pc302', { waitUntil: 'domcontentloaded' });
    }

    await new Promise(r => setTimeout(r, 4000));

    // Check new coin balance
    const updatedState = await page.evaluate(() => {
        let coins = null, worth = null;
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
        const worthEl = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').includes('worth') && e.children.length === 0);
        if (worthEl) {
            const wm = worthEl.innerText.match(/worth\s*([A-Z\$0-9\.]+)/i);
            if (wm) worth = wm[1];
        }
        return { coins, worth };
    });

    console.log('\n--- LIVE BALANCE AFTER SPONSORED ADS TEST ---');
    console.log(JSON.stringify(updatedState, null, 2));

    await browser.disconnect();
})();
