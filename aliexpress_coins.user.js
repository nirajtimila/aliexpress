// ==UserScript==
// @name         AliExpress Auto Daily Coins Collector
// @namespace    https://github.com/aliexpress-coin-collector
// @version      1.0.0
// @description  Automatically collects daily coins and bonus tasks on AliExpress Mobile Coins page
// @author       Antigravity
// @match        https://m.aliexpress.com/p/coin-index/index.html*
// @match        https://*.aliexpress.com/p/coin-index/*
// @match        https://m.aliexpress.com/page/coin-index*
// @match        https://coins.aliexpress.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log("%c[AE Coin Collector] Loaded!", "color: #ff5000; font-weight: bold; font-size: 16px;");

    // ================= CONFIGURATION =================
    const CONFIG = {
        checkIntervalMs: 1500,
        maxRetries: 30,
        autoCollectDaily: true,
        autoCollectTasks: false, // Set to true to also auto-click +5/+1 task buttons
        autoCloseDelaySec: 0,   // Set > 0 to auto close window after success (if opened via script)
    };

    let retryCount = 0;
    let isCollected = false;
    let scanTimer = null;

    // ================= SIMULATE TOUCH & CLICK =================
    // AliExpress mobile uses Rax which might listen to Touch, Pointer, or Mouse events
    function robustClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        try {
            const touchObj = new Touch({
                identifier: Date.now(),
                target: el,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                pageX: x + window.scrollX,
                pageY: y + window.scrollY
            });
            const touchInit = {
                bubbles: true,
                cancelable: true,
                view: window,
                touches: [touchObj],
                targetTouches: [touchObj],
                changedTouches: [touchObj]
            };
            el.dispatchEvent(new TouchEvent('touchstart', touchInit));
            el.dispatchEvent(new TouchEvent('touchend', touchInit));
        } catch(e) {}

        try {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch' }));
        } catch(e) {}

        try {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        } catch(e) {}

        el.click();
    }

    // ================= ELEMENT LOCATORS =================
    function findCoinBalance() {
        const candidates = Array.from(document.querySelectorAll("div, span, p"));
        for (const el of candidates) {
            const txt = (el.innerText || "").trim();
            if (/^\d{1,6}$/.test(txt)) {
                const nextOrParent = el.parentElement ? el.parentElement.innerText : "";
                if (nextOrParent.includes("worth") || nextOrParent.includes("Coins helped")) {
                    return txt;
                }
            }
        }
        return null;
    }

    function checkAlreadyCollected() {
        const textNodes = Array.from(document.querySelectorAll("div, span, button, p"));
        for (const el of textNodes) {
            const txt = (el.innerText || "").trim().toLowerCase();
            if (txt === "collected" || 
                txt === "claimed" || 
                txt === "come back tomorrow" || 
                txt === "already collected" || 
                txt.includes("checked in")) {
                return true;
            }
        }
        return false;
    }

    function findCollectButton() {
        const all = Array.from(document.querySelectorAll("button, div, span, a"));
        
        // Priority 1: Exact "Collect" match in leaf or near-leaf elements
        const exactMatches = all.filter(el => {
            const txt = (el.innerText || "").trim();
            return /^collect$/i.test(txt) && el.children.length <= 2;
        });

        if (exactMatches.length > 0) {
            // Find the most clickable parent or self
            const target = exactMatches[0].closest("button, [role='button'], div") || exactMatches[0];
            return target;
        }

        // Priority 2: Look inside Daily coins section
        for (const el of all) {
            const txt = (el.innerText || "").trim();
            if (txt.includes("Daily coins") || txt.includes("Today")) {
                const container = el.closest("[class*='daily'], [class*='card'], [class*='check'], div") || el.parentElement;
                if (container) {
                    const btn = Array.from(container.querySelectorAll("div, button, span")).find(child => {
                        const childTxt = (child.innerText || "").trim();
                        return /collect/i.test(childTxt) && !/collected/i.test(childTxt);
                    });
                    if (btn) return btn;
                }
            }
        }

        // Priority 3: Fallback button with class containing collect
        const classBtn = document.querySelector("[class*='collect-btn'], [class*='collectBtn'], [class*='sign-btn']");
        if (classBtn) return classBtn;

        return null;
    }

    function findTaskButtons() {
        // Find buttons like "+1", "+5", "Go", "Browse"
        const all = Array.from(document.querySelectorAll("div, button, span"));
        const taskBtns = [];

        for (const el of all) {
            const txt = (el.innerText || "").trim();
            if (/^\+\d+$/.test(txt) && el.children.length === 0) {
                const clickable = el.closest("[role='button'], div, button") || el;
                taskBtns.push(clickable);
            }
        }
        return taskBtns;
    }

    // ================= FLOATING HUD UI =================
    function createHUD() {
        if (document.getElementById("ae-coins-hud")) return;

        const hud = document.createElement("div");
        hud.id = "ae-coins-hud";
        hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:6px;">
                <div style="font-weight:bold; color:#ff6000; display:flex; align-items:center; gap:6px;">
                    <span style="font-size:16px;">🪙</span> AliExpress Coins Bot
                </div>
                <div id="ae-hud-status" style="font-size:11px; background:#262b33; padding:2px 8px; border-radius:10px; color:#ffcc00;">
                    Scanning...
                </div>
            </div>
            <div style="font-size:12px; margin-bottom:6px; color:#bbb;">
                Coins Balance: <strong id="ae-hud-balance" style="color:#fff;">--</strong>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:8px;">
                <button id="ae-btn-collect" style="flex:1; background:linear-gradient(90deg, #ff5000, #ff8000); border:none; color:#fff; font-weight:bold; padding:8px 0; border-radius:6px; cursor:pointer;">
                    ⚡ Collect Now
                </button>
                <button id="ae-btn-tasks" style="flex:1; background:#333; border:1px solid #555; color:#fff; font-size:11px; padding:8px 0; border-radius:6px; cursor:pointer;">
                    🎯 Run Tasks
                </button>
            </div>
            <div id="ae-hud-log" style="font-size:11px; color:#888; max-height:80px; overflow-y:auto; background:#12151a; padding:6px; border-radius:4px; font-family:monospace;">
                [Init] Ready. Waiting for page load...
            </div>
        `;

        hud.style.cssText = `
            position: fixed;
            top: 15px;
            right: 15px;
            z-index: 2147483647;
            width: 260px;
            background: rgba(18, 20, 26, 0.94);
            border: 1px solid #ff5000;
            border-radius: 12px;
            padding: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.7);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #eee;
        `;

        document.body.appendChild(hud);

        // Bind HUD events
        document.getElementById("ae-btn-collect").addEventListener("click", () => {
            logHUD("Manual collect triggered.");
            attemptCollect(true);
        });

        document.getElementById("ae-btn-tasks").addEventListener("click", () => {
            logHUD("Executing task collection...");
            runBonusTasks();
        });
    }

    function updateHUD(status, color = "#ffcc00") {
        const el = document.getElementById("ae-hud-status");
        if (el) {
            el.textContent = status;
            el.style.color = color;
        }
        const bal = document.getElementById("ae-hud-balance");
        if (bal) {
            const currentCoins = findCoinBalance();
            if (currentCoins) bal.textContent = currentCoins;
        }
    }

    function logHUD(msg) {
        console.log(`[AE Coin Collector] ${msg}`);
        const logBox = document.getElementById("ae-hud-log");
        if (logBox) {
            const time = new Date().toLocaleTimeString();
            logBox.innerHTML = `<div>[${time}] ${msg}</div>` + logBox.innerHTML;
        }
    }

    // ================= COLLECT ACTIONS =================
    function attemptCollect(force = false) {
        if (isCollected && !force) return;

        // Check if already collected
        if (checkAlreadyCollected()) {
            isCollected = true;
            updateHUD("Already Collected", "#00ff88");
            logHUD("✓ Coins already claimed today!");
            if (scanTimer) clearInterval(scanTimer);
            return;
        }

        const collectBtn = findCollectButton();
        if (collectBtn) {
            logHUD("Found Collect button! Clicking...");
            
            // Visual highlight
            collectBtn.style.outline = "3px solid #00ff88";
            collectBtn.style.transition = "outline 0.3s ease";

            // Click it
            robustClick(collectBtn);

            setTimeout(() => {
                isCollected = true;
                updateHUD("Collected! 🎉", "#00ff88");
                logHUD("✓ Successfully clicked Collect!");
                
                // If tasks enabled, run them
                if (CONFIG.autoCollectTasks) {
                    setTimeout(runBonusTasks, 2000);
                }
            }, 800);

            if (scanTimer) clearInterval(scanTimer);
        } else {
            retryCount++;
            if (retryCount >= CONFIG.maxRetries) {
                updateHUD("Button Not Found", "#ff4444");
                logHUD("Could not locate Collect button after retries.");
                if (scanTimer) clearInterval(scanTimer);
            } else {
                updateHUD(`Scanning (${retryCount}/${CONFIG.maxRetries})...`, "#ffaa00");
            }
        }
    }

    function runBonusTasks() {
        const tasks = findTaskButtons();
        if (tasks.length === 0) {
            logHUD("No extra task buttons (+1/+5) found.");
            return;
        }

        logHUD(`Found ${tasks.length} task buttons. Processing...`);
        let delay = 500;
        tasks.forEach((btn, idx) => {
            setTimeout(() => {
                logHUD(`Clicking task button #${idx + 1}...`);
                btn.style.outline = "2px solid #ffcc00";
                robustClick(btn);
            }, delay);
            delay += 1500;
        });
    }

    // ================= INITIALIZATION =================
    function init() {
        createHUD();
        logHUD("Starting auto-detection...");
        
        // Initial quick try
        attemptCollect();

        // Polling loop to wait for dynamic Rax/React hydration
        scanTimer = setInterval(() => {
            if (!isCollected) {
                attemptCollect();
            }
        }, CONFIG.checkIntervalMs);
    }

    // Run after DOM or load
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
