const puppeteer = require('puppeteer-core');
(async () => {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('coin-index')) || pages[0];
    
    const details = await page.evaluate(() => {
      // Find all buttons or tasks
      const all = Array.from(document.querySelectorAll('*'));
      const streakEl = all.find(e => (e.innerText || '').includes('streak') && e.children.length === 0);
      const todayEl = all.find(e => (e.innerText || '').includes('Today') && (e.innerText || '').includes('+10'));
      
      const taskBtns = all.filter(el => /^\+\d+$/.test((el.innerText || '').trim()) && el.children.length === 0)
        .map(b => b.innerText.trim());
      
      return {
        streakText: streakEl ? streakEl.innerText : null,
        todayText: todayEl ? todayEl.innerText.replace(/\n+/g, ' ') : null,
        taskButtons: taskBtns
      };
    });
    
    console.log('Task Details:', JSON.stringify(details, null, 2));
    await browser.disconnect();
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
