// Markdown Reminders & Magic Words Parser Module
import { isDesktopMode, isHandoffActive } from './config.js';

export let remindersList = [];
export let currentReminderIndex = 0;

let reminderScrollPos = 0;
let reminderScrollDirection = 1;
let reminderScrollTimeout = null;
let reminderScrollRaf = null;

export function startRemindersScroll() {
    const content = document.getElementById('reminders-content') || document.querySelector('.reminder-body');
    if (!content) return;

    if (reminderScrollRaf) cancelAnimationFrame(reminderScrollRaf);
    if (reminderScrollTimeout) clearTimeout(reminderScrollTimeout);

    content.scrollTop = 0;
    reminderScrollPos = 0;
    reminderScrollDirection = 1;

    if (content.scrollHeight <= content.clientHeight) return;

    reminderScrollTimeout = setTimeout(() => {
        let lastTime = performance.now();

        function scrollLoop(time) {
            const dt = time - lastTime;
            lastTime = time;

            const viewAnn = document.getElementById('view-announcements');
            if (content.offsetParent === null || (viewAnn && !viewAnn.classList.contains('active') && !isDesktopMode)) {
                return;
            }

            const delta = (30 * dt) / 1000;
            reminderScrollPos += delta * reminderScrollDirection;
            content.scrollTop = reminderScrollPos;

            if (reminderScrollDirection === 1 && reminderScrollPos >= content.scrollHeight - content.clientHeight) {
                reminderScrollPos = content.scrollHeight - content.clientHeight;
                reminderScrollDirection = -1;
                reminderScrollTimeout = setTimeout(() => {
                    lastTime = performance.now();
                    reminderScrollRaf = requestAnimationFrame(scrollLoop);
                }, 2000);
                return;
            }

            if (reminderScrollDirection === -1 && reminderScrollPos <= 0) {
                reminderScrollPos = 0;
                reminderScrollDirection = 1;
                reminderScrollTimeout = setTimeout(() => {
                    lastTime = performance.now();
                    reminderScrollRaf = requestAnimationFrame(scrollLoop);
                }, 2000);
                return;
            }

            reminderScrollRaf = requestAnimationFrame(scrollLoop);
        }

        reminderScrollRaf = requestAnimationFrame(scrollLoop);
    }, 2500);
}

export function renderMultipleRemindersWidgets() {
    const parentContainer = document.getElementById('reminders-side-stats') || document.querySelector('#view-announcements .side-stats');
    const trackWidget = document.getElementById('widget-trackmap');
    const viewAnn = document.getElementById('view-announcements');

    const now = Date.now();
    const activeList = remindersList.filter(r => !r.expireTime || now <= r.expireTime);

    // Also keep #safety-reminders updated for Slide 2
    const safetyTitle = document.getElementById('safety-reminders-title');
    const safetyContent = document.getElementById('safety-reminders-content');
    const safetyContainer = document.getElementById('safety-reminders-container');

    if (activeList.length === 0) {
        if (safetyTitle) safetyTitle.innerText = "Reminders";
        if (safetyContent) safetyContent.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>';
        if (safetyContainer) {
            safetyContainer.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            safetyContainer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            safetyContainer.style.animation = 'none';
        }

        if (!parentContainer) return null;

        if (isHandoffActive) {
            // Full screen track map during handoff mode if no active reminders!
            if (viewAnn) viewAnn.classList.add('no-reminders');
            parentContainer.classList.add('no-reminders');
            parentContainer.style.setProperty('display', 'none', 'important');
            return null;
        } else {
            if (viewAnn) viewAnn.classList.remove('no-reminders');
            parentContainer.classList.remove('no-reminders');
            parentContainer.style.display = 'flex';
            if (trackWidget) {
                trackWidget.style.flex = '1 1 65%';
                trackWidget.style.width = '';
            }
            let singleBox = document.getElementById('reminders-widget-container');
            if (!singleBox) {
                singleBox = document.createElement('div');
                singleBox.id = 'reminders-widget-container';
                singleBox.className = 'widget';
                singleBox.style.cssText = 'flex: 1 1 50%; min-height: 0; display: flex; flex-direction: column; align-items: stretch; overflow: hidden; margin: 0;';
                parentContainer.insertBefore(singleBox, parentContainer.firstChild);
            }
            singleBox.innerHTML = `
                <h3 id="reminders-title">Reminders</h3>
                <div id="reminders-content" style="color: var(--text-muted); font-style: italic; font-size: 0.95rem; padding-right: 5px; flex: 1;">No active reminders.</div>
            `;
            return null;
        }
    }

    // Populate #safety-reminders with the first active reminder
    if (safetyTitle && safetyContent && safetyContainer) {
        const firstReminder = activeList[0];
        safetyTitle.innerText = firstReminder.title;
        if (firstReminder.priority === 'critical') {
            safetyContainer.style.border = '1px solid #ff0033';
            safetyContainer.style.boxShadow = '0 0 20px rgba(255, 0, 51, 0.6)';
            safetyContainer.style.animation = 'pulse-border-glow 1.5s infinite alternate';
            safetyContainer.style.setProperty('--quote-border-color', '#ff0033');
        } else if (firstReminder.priority === 'high') {
            safetyContainer.style.border = '1px solid var(--neon-amber)';
            safetyContainer.style.boxShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
            safetyContainer.style.animation = 'pulse-border-glow 2.5s infinite alternate ease-in-out';
            safetyContainer.style.setProperty('--quote-border-color', 'var(--neon-amber)');
        } else {
            safetyContainer.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            safetyContainer.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            safetyContainer.style.animation = 'none';
            safetyContainer.style.setProperty('--quote-border-color', 'rgba(128, 138, 148, 0.6)');
        }
        if (firstReminder.splitList) safetyContent.classList.add('split-list');
        else safetyContent.classList.remove('split-list');
        if (firstReminder.isLarge) safetyContent.classList.add('large-text');
        else safetyContent.classList.remove('large-text');
        if (firstReminder.isCenter) safetyContent.classList.add('center-text');
        else safetyContent.classList.remove('center-text');
        safetyContent.innerHTML = marked.parse(firstReminder.body.trim());
    }

    if (!parentContainer) return null;

    // Active reminders exist
    if (viewAnn) viewAnn.classList.remove('no-reminders');
    parentContainer.classList.remove('no-reminders');
    parentContainer.style.display = 'flex';
    if (trackWidget) {
        trackWidget.style.flex = '1 1 65%';
        trackWidget.style.width = '';
    }

    // Remove existing reminder cards while keeping panel-safety in desktop mode
    const existingCards = parentContainer.querySelectorAll('.reminder-widget-card, #reminders-widget-container');
    existingCards.forEach(c => c.remove());

    const panelSaf = document.getElementById('panel-safety');

    activeList.forEach((r) => {
        const parsedBody = marked.parse(r.body.trim());
        let priorityBadge = '';
        let widgetBorder = '1px solid rgba(255, 255, 255, 0.12)';
        let widgetShadow = '0 10px 30px rgba(0,0,0,0.5)';
        let widgetAnim = 'none';
        let quoteBorderColor = 'rgba(128, 138, 148, 0.6)';

        if (r.priority === 'critical') {
            priorityBadge = '<span class="reminder-badge badge-critical">Critical</span>';
            widgetBorder = '1px solid #ff0033';
            widgetShadow = '0 0 20px rgba(255, 0, 51, 0.6)';
            widgetAnim = 'pulse-border-glow 1.5s infinite alternate';
            quoteBorderColor = '#ff0033';
        } else if (r.priority === 'high') {
            priorityBadge = '<span class="reminder-badge badge-important">Important</span>';
            widgetBorder = '1px solid var(--neon-amber)';
            widgetShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
            widgetAnim = 'pulse-border-glow 2.5s infinite alternate ease-in-out';
            quoteBorderColor = 'var(--neon-amber)';
        }

        const card = document.createElement('div');
        card.className = 'widget reminder-widget-card';
        card.style.cssText = `flex: 0 0 auto; display: flex; flex-direction: column; align-items: stretch; overflow: visible; margin: 0; border: ${widgetBorder}; box-shadow: ${widgetShadow}; animation: ${widgetAnim}; --quote-border-color: ${quoteBorderColor}; padding: 25px 30px;`;
        card.innerHTML = `
            <h3 style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; font-size: 1.25rem;">
                <span>${r.title}</span>
                ${priorityBadge}
            </h3>
            <div class="reminder-body ${r.splitList ? 'split-list' : ''} ${r.isLarge ? 'large-text' : ''} ${r.isCenter ? 'center-text' : ''}" style="color: var(--text-primary); font-size: 0.95rem; padding-right: 5px;">
                ${parsedBody}
            </div>
        `;

        if (panelSaf && panelSaf.parentElement === parentContainer) {
            parentContainer.insertBefore(card, panelSaf);
        } else {
            parentContainer.appendChild(card);
        }
    });

    const hasLong = activeList.some(r => r.isLong);
    return hasLong ? 120000 : null;
}

export function advanceSingleReminderSlide() {
    const parentContainer = document.getElementById('reminders-side-stats') || document.querySelector('#view-announcements .side-stats');
    const trackWidget = document.getElementById('widget-trackmap');
    if (parentContainer) {
        parentContainer.style.display = 'flex';
        if (trackWidget) {
            trackWidget.style.flex = '1 1 65%';
            trackWidget.style.width = '';
        }
        const cards = parentContainer.querySelectorAll('.reminder-widget-card');
        cards.forEach(c => c.remove());
    }

    const now = Date.now();
    const activeList = remindersList.filter(r => !r.expireTime || now <= r.expireTime);

    const titleEls = document.querySelectorAll('#reminders-title, #safety-reminders-title');
    const contentContainers = document.querySelectorAll('#reminders-content, #safety-reminders-content');
    const containers = document.querySelectorAll('#reminders-widget-container, #safety-reminders-container');

    if (activeList.length === 0) {
        titleEls.forEach(el => el.innerText = "Reminders");
        contentContainers.forEach(el => el.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>');
        containers.forEach(container => {
            container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            container.style.animation = 'none';
        });
        return null;
    }

    if (currentReminderIndex >= activeList.length) {
        currentReminderIndex = 0;
    }

    const reminder = activeList[currentReminderIndex];

    titleEls.forEach(el => {
        el.innerText = reminder.title;
    });

    containers.forEach(container => {
        if (reminder.priority === 'critical') {
            container.style.border = '1px solid #ff0033';
            container.style.boxShadow = '0 0 20px rgba(255, 0, 51, 0.6)';
            container.style.animation = 'pulse-border-glow 1.5s infinite alternate';
            container.style.setProperty('--quote-border-color', '#ff0033');
        } else if (reminder.priority === 'high') {
            container.style.border = '1px solid var(--neon-amber)';
            container.style.boxShadow = '0 0 15px rgba(255, 170, 0, 0.4)';
            container.style.animation = 'pulse-border-glow 2.5s infinite alternate ease-in-out';
            container.style.setProperty('--quote-border-color', 'var(--neon-amber)');
        } else {
            container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            container.style.animation = 'none';
            container.style.setProperty('--quote-border-color', 'rgba(128, 138, 148, 0.6)');
        }
    });

    contentContainers.forEach(contentContainer => {
        if (reminder.splitList) contentContainer.classList.add('split-list');
        else contentContainer.classList.remove('split-list');

        if (reminder.isLarge) contentContainer.classList.add('large-text');
        else contentContainer.classList.remove('large-text');

        if (reminder.isCenter) contentContainer.classList.add('center-text');
        else contentContainer.classList.remove('center-text');

        const htmlContent = marked.parse(reminder.body.trim());
        contentContainer.innerHTML = htmlContent;
    });

    currentReminderIndex = (currentReminderIndex + 1) % activeList.length;
    startRemindersScroll();

    if (reminder.isLong) return 120000;
    return null;
}

export function advanceReminderSlide() {
    if (isHandoffActive || isDesktopMode) {
        return renderMultipleRemindersWidgets();
    } else {
        return advanceSingleReminderSlide();
    }
}

export function renderDesktopReminders() {
    renderMultipleRemindersWidgets();
}

export async function fetchReminders() {
    try {
        const res = await fetch('assets/data/reminders.md?t=' + new Date().getTime());
        if (!res.ok) throw new Error('Not found');
        const rawText = await res.text();
        
        // Split by H1 tags (starts with exactly one # and a space)
        const sections = rawText.split(/^# /m).filter(s => s.trim().length > 0);
        
        let parsedReminders = [];
        
        for (let section of sections) {
            // Extract Title (first line) and Body (the rest)
            const lines = section.split('\n');
            let title = lines[0].trim();
            let body = lines.slice(1).join('\n');
            
            let priority = 'normal';
            let splitList = false;
            let isLarge = false;
            let isCenter = false;
            let isLong = false;
            let isOnly = false;
            
            // Parse Magic Flags from the body
            if (body.match(/<!--\s*priority:\s*high\s*-->/i) || body.match(/!HIGH/i)) priority = 'high';
            if (body.match(/<!--\s*priority:\s*critical\s*-->/i) || body.match(/!CRITICAL/i)) priority = 'critical';
            if (body.match(/<!--\s*format:\s*split\s*-->/i) || body.match(/!SPLIT/i)) splitList = true;
            if (body.match(/!LARGE/i)) isLarge = true;
            if (body.match(/!CENTER/i)) isCenter = true;
            if (body.match(/!LONG/i)) isLong = true;
            if (body.match(/!ONLY/i)) isOnly = true;
            
            // Parse Expire Magic Word: !EXPIRE YYYY-MM-DD-HH
            let expireTime = null;
            const expireMatch = body.match(/!EXPIRE\s+([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
            if (expireMatch) {
                const parts = expireMatch[1].split('-');
                const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), parseInt(parts[3]), 0, 0, 0);
                expireTime = expDate.getTime();
                if (Date.now() > expireTime) {
                    continue; // Skip this slide completely!
                }
                body = body.replace(expireMatch[0], ''); // Clean up text if not expired
            }
            
            // Parse Countdown Magic Word: !COUNTDOWN YYYY-MM-DD-HH or MM-DD-HH-mm
            let countdownHtml = "";
            const cdMatch = body.match(/!COUNTDOWN\s+([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}(?:-[0-9]{2})?|[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
            if (cdMatch) {
                countdownHtml = `<div class="countdown-timer" data-target="${cdMatch[1]}"></div>`;
                body = body.replace(cdMatch[0], ''); // Remove magic word
            }
            
            // Parse QR Magic Word: !QR https://...
            const qrMatch = body.match(/!QR\s+(https?:\/\/[^\s]+)/i);
            if (qrMatch) {
                body = body.replace(qrMatch[0], `<div style="text-align:center; margin: 10px 0;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrMatch[1])}" style="border: 4px solid white; border-radius: 8px;"></div>`);
            }
            
            // Strip the rest of the flags from the body
            body = body.replace(/<!--\s*(priority|format):\s*(high|critical|split)\s*-->/ig, '');
            body = body.replace(/!(HIGH|CRITICAL|SPLIT|LARGE|CENTER|LONG|ONLY)/ig, '');
            
            // Append countdown if exists
            body += countdownHtml;
            
            parsedReminders.push({ 
                title: title, 
                body: body, 
                priority: priority, 
                splitList: splitList,
                isLarge: isLarge,
                isCenter: isCenter,
                isLong: isLong,
                isOnly: isOnly,
                expireTime: expireTime
            });
        }
        
        // Apply !ONLY filter
        const onlyReminders = parsedReminders.filter(r => r.isOnly);
        if (onlyReminders.length > 0) {
            parsedReminders = onlyReminders;
        }
        
        if (parsedReminders.length > 0) {
            remindersList = parsedReminders;
            // Reset index if it's out of bounds after a file update
            if (currentReminderIndex >= remindersList.length) currentReminderIndex = 0;
            
            if (isDesktopMode || isHandoffActive) {
                renderDesktopReminders();
            } else {
                advanceSingleReminderSlide();
            }
        } else {
            throw new Error('No valid sections found');
        }
    } catch (e) {
        remindersList = [];
        if (isDesktopMode || isHandoffActive) {
            renderDesktopReminders();
        } else {
            advanceSingleReminderSlide();
        }
    }
}
