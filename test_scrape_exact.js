const puppeteer = require('puppeteer-core');
(async () => {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('coin-index')) || pages[0];
    
    const result = await page.evaluate(() => {
      let coins = null;
      let worth = null;
      
      // Method 1: Extract from aecoin-scroll-number odometer
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
      
      // Worth
      const worthEl = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').includes('worth') && e.children.length === 0);
      if (worthEl) {
        const wm = worthEl.innerText.match(/worth\s*([A-Z\$0-9\.]+)/i);
        if (wm) worth = wm[1];
        else worth = worthEl.innerText.trim();
      }
      
      return { coins, worth };
    });
    
    console.log('DOM Extracted Live Balance:', JSON.stringify(result, null, 2));
    await browser.disconnect();
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
