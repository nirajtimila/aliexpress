// Runs in MAIN world at document_start to spoof mobile environment
try {
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  Object.defineProperty(navigator, 'userAgent', {
    get: () => IPHONE_UA,
    configurable: true
  });

  Object.defineProperty(navigator, 'platform', {
    get: () => 'iPhone',
    configurable: true
  });

  Object.defineProperty(navigator, 'maxTouchPoints', {
    get: () => 5,
    configurable: true
  });

  // Emulate touch support
  if (!('ontouchstart' in window)) {
    window.ontouchstart = null;
  }
} catch (e) {
  console.warn('[AE Coins] Mobile shim error:', e);
}
