// ============================================================
// TAOBAO 11.11 AU$5 VOUCHER SNIPER PRO (BROWSER INJECTOR)
// ============================================================
(async function initTaobaoWebSniper() {
    // Remove any previous instance
    const old = document.getElementById('tb-sniper-panel');
    if (old) old.remove();

    console.log("%c[Taobao Sniper Pro] Initializing...", "color: #ff5000; font-weight: bold; font-size: 16px;");

    // 1. Sync Taobao Atomic Clock
    let serverOffset = 0;
    let rtt = 0;
    async function syncClock() {
        try {
            const t0 = performance.now();
            const res = await fetch("https://acs.m.taobao.com/gw/mtop.common.getTimestamp/");
            const json = await res.json();
            const t1 = performance.now();
            rtt = t1 - t0;
            const serverTime = parseInt(json.data.t, 10);
            serverOffset = (serverTime + (rtt / 2)) - Date.now();
            const offsetEl = document.getElementById('tb-hud-offset');
            if (offsetEl) offsetEl.textContent = (serverOffset >= 0 ? '+' : '') + serverOffset.toFixed(1) + 'ms';
        } catch (e) {
            console.warn("Time sync error, fallback to local clock:", e);
        }
    }
    await syncClock();
    setInterval(syncClock, 3000);

    // 2. State & Variables
    let targetElement = null;
    let isArmed = false;
    let targetHour = 15; // 3:00 PM
    let preFireMs = 80;
    let burstCount = 12;

    // 3. Smart Element Locator
    function scanForAU5Voucher() {
        const all = Array.from(document.querySelectorAll("div, button, span, a, p"));
        
        // Find element containing AU$5 or AU$ 5
        const au5Matches = all.filter(el => {
            const txt = el.innerText || "";
            return (txt.includes("AU$5") || txt.includes("AU$ 5") || txt.includes("5 off")) && 
                   (txt.includes("AU$10") || txt.includes("10") || txt.includes("Platform"));
        });

        if (au5Matches.length === 0) return null;

        // Find the card container
        const card = au5Matches[0].closest("[class*='item'], [class*='card'], [class*='voucher'], div") || au5Matches[0];

        // Find the interactive button inside or adjacent to it
        const candidates = Array.from(card.querySelectorAll("*"));
        const btn = candidates.find(el => {
            const txt = (el.innerText || "").trim();
            return /\d{2}:\d{2}:\d{2}/.test(txt) || txt.includes("Claim") || txt.includes("立即领取");
        });

        return btn || card;
    }

    // 4. Create Modern Floating HUD
    const panel = document.createElement("div");
    panel.id = "tb-sniper-panel";
    panel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        width: 320px;
        background: rgba(18, 20, 29, 0.95);
        color: #e0e6ed;
        border: 2px solid #ff5000;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.7);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        padding: 16px;
        backdrop-filter: blur(8px);
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:800; color:#ff5000; font-size:14px;">⚡ TAOBAO SNIPER PRO</span>
            <span style="font-size:11px; color:#888;">Offset: <b id="tb-hud-offset" style="color:#00e676;">0.0ms</b></span>
        </div>
        
        <div style="background:#090a0f; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-family:monospace; text-align:center;">
            <div style="font-size:11px; color:#888;">TAOBAO SERVER ATOMIC CLOCK</div>
            <div id="tb-hud-clock" style="font-size:20px; font-weight:bold; color:#00e676;">--:--:--.---</div>
        </div>

        <div style="margin-bottom:10px;">
            <div style="font-size:11px; color:#aaa; margin-bottom:4px;">TARGET BUTTON STATUS:</div>
            <div id="tb-hud-target" style="padding:6px 10px; border-radius:6px; background:#121520; border:1px solid #2a3145; font-size:12px; color:#ffaa00;">
                Scanning for AU$5 voucher...
            </div>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:12px;">
            <div style="flex:1;">
                <label style="font-size:10px; color:#888;">TARGET TIME</label>
                <input id="tb-input-time" type="time" step="1" value="15:00:00" style="width:100%; padding:6px; background:#0c0e14; border:1px solid #333; color:#fff; border-radius:4px; font-size:12px; box-sizing:border-box;">
            </div>
            <div style="flex:1;">
                <label style="font-size:10px; color:#888;">PRE-FIRE (MS)</label>
                <input id="tb-input-prefire" type="number" value="80" style="width:100%; padding:6px; background:#0c0e14; border:1px solid #333; color:#fff; border-radius:4px; font-size:12px; box-sizing:border-box;">
            </div>
        </div>

        <div style="display:flex; gap:8px;">
            <button id="tb-btn-test" style="flex:1; padding:8px; background:#2a3145; border:none; color:#fff; border-radius:6px; font-weight:600; cursor:pointer; font-size:12px;">Test Tap</button>
            <button id="tb-btn-arm" style="flex:1.5; padding:8px; background:#ff0055; border:none; color:#fff; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px;">ARM SNIPER</button>
        </div>

        <div id="tb-hud-countdown" style="text-align:center; font-family:monospace; font-weight:bold; font-size:16px; margin-top:10px; color:#ff5000;">
            COUNTDOWN: --:--:--
        </div>
    `;

    document.body.appendChild(panel);

    // Audio synthesizer for countdown beeps
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function beep(freq, duration) {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch(e) {}
    }

    // High frequency clock & countdown loop
    let lastBeep = -1;
    setInterval(() => {
        const nowServer = new Date(Date.now() + serverOffset);
        const timeStr = nowServer.toTimeString().split(' ')[0] + '.' + String(nowServer.getMilliseconds()).padStart(3, '0');
        const clockEl = document.getElementById('tb-hud-clock');
        if (clockEl) clockEl.textContent = timeStr;

        // Calculate target timestamp
        const timeVal = document.getElementById('tb-input-time').value || "15:00:00";
        const [h, m, s] = timeVal.split(':').map(Number);
        const targetDate = new Date(nowServer);
        targetDate.setHours(h, m, s || 0, 0);
        if (targetDate.getTime() < nowServer.getTime() - 2000) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        const diff = targetDate.getTime() - nowServer.getTime();
        const cdEl = document.getElementById('tb-hud-countdown');

        if (diff > 0) {
            const totalSec = Math.floor(diff / 1000);
            const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            const ss = String(totalSec % 60).padStart(2, '0');
            const ms = Math.floor((diff % 1000) / 100);
            if (cdEl) cdEl.textContent = `${hh}:${mm}:${ss}.${ms}`;

            if (isArmed && totalSec <= 5 && totalSec !== lastBeep) {
                lastBeep = totalSec;
                beep(totalSec === 0 ? 1200 : 750, totalSec === 0 ? 0.3 : 0.08);
            }
        } else if (diff > -5000) {
            if (cdEl) cdEl.innerHTML = '<span style="color:#00e676;">⚡ FIRED CLICKS!</span>';
        } else {
            if (cdEl) cdEl.textContent = 'PAST TARGET';
        }
    }, 50);

    // Continuous element scanning and highlighting
    setInterval(() => {
        if (!targetElement) {
            targetElement = scanForAU5Voucher();
        }

        const targetStatusEl = document.getElementById('tb-hud-target');
        if (targetElement) {
            const text = (targetElement.innerText || "").trim().slice(0, 30);
            if (targetStatusEl) targetStatusEl.innerHTML = `🎯 <b style="color:#00e676;">Target Found:</b> "${text}"`;
            targetElement.style.outline = "3px solid #ff0055";
            targetElement.style.boxShadow = "0 0 15px rgba(255,0,85,0.8)";
        } else {
            if (targetStatusEl) targetStatusEl.innerHTML = `<span style="color:#ffaa00;">Voucher not found yet. Click anywhere on voucher to select!</span>`;
        }
    }, 500);

    // Manual click override: if user clicks on screen, select that element
    document.addEventListener('click', (e) => {
        if (e.target.closest('#tb-sniper-panel')) return; // ignore clicks on our HUD
        if (!isArmed) {
            targetElement = e.target;
            targetElement.style.outline = "3px solid #00e676";
            console.log("[Taobao Sniper] Manual target set to:", targetElement);
            beep(900, 0.05);
        }
    }, true);

    // Test tap
    document.getElementById('tb-btn-test').addEventListener('click', () => {
        if (!targetElement) {
            alert("No button selected! Click on the voucher button on your page first.");
            return;
        }
        targetElement.click();
        beep(1000, 0.1);
    });

    // Arming trigger loop
    let armedInterval = null;
    document.getElementById('tb-btn-arm').addEventListener('click', () => {
        const btn = document.getElementById('tb-btn-arm');
        if (isArmed) {
            isArmed = false;
            clearInterval(armedInterval);
            btn.textContent = "ARM SNIPER";
            btn.style.background = "#ff0055";
        } else {
            if (!targetElement) {
                alert("Please click on the AU$5 voucher button first!");
                return;
            }
            isArmed = true;
            btn.textContent = "DISARM";
            btn.style.background = "#2a3145";
            beep(1200, 0.2);

            const prefire = parseInt(document.getElementById('tb-input-prefire').value || 80, 10);
            const timeVal = document.getElementById('tb-input-time').value || "15:00:00";
            const [h, m, s] = timeVal.split(':').map(Number);

            armedInterval = setInterval(() => {
                const nowServer = Date.now() + serverOffset;
                const targetDate = new Date(nowServer);
                targetDate.setHours(h, m, s || 0, 0);
                if (targetDate.getTime() < nowServer - 2000) targetDate.setDate(targetDate.getDate() + 1);

                const diff = targetDate.getTime() - nowServer;

                if (diff <= prefire) {
                    clearInterval(armedInterval);
                    isArmed = false;
                    console.log("%c[Taobao Sniper] >>> FIRING BURST CLICKS! <<<", "color:#00e676; font-size:20px; font-weight:bold;");
                    
                    // High-speed burst clicks
                    for (let i = 0; i < burstCount; i++) {
                        setTimeout(() => {
                            if (targetElement) targetElement.click();
                        }, i * 40);
                    }

                    setTimeout(() => {
                        btn.textContent = "ARM SNIPER";
                        btn.style.background = "#ff0055";
                    }, 2000);
                }
            }, 10);
        }
    });

    console.log("%c[Taobao Sniper Pro] Ready! HUD active on screen.", "color: #00e676; font-weight: bold; font-size: 14px;");
})();
