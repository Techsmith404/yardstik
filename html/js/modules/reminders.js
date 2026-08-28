// Markdown Reminders & Magic Words Parser Module
import { isDesktopMode } from './config.js';

export let remindersList = [];
export let currentReminderIndex = 0;

export function advanceReminderSlide() {
    if (remindersList.length === 0) return null;
    
    const reminder = remindersList[currentReminderIndex];
    
    // Live expiration check
    if (reminder.expireTime && Date.now() > reminder.expireTime) {
        remindersList.splice(currentReminderIndex, 1);
        if (currentReminderIndex >= remindersList.length) {
            currentReminderIndex = 0;
        }
        return advanceReminderSlide();
    }
    const container = document.getElementById('reminders-widget-container');
    const titleEl = document.getElementById('reminders-title');
    
    if (titleEl) {
        titleEl.innerText = reminder.title;
    }
    
    if (container) {
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
    }
    
    // Toggle formatting classes
    const contentContainer = document.getElementById('reminders-content');
    if (contentContainer) {
        if (reminder.splitList) contentContainer.classList.add('split-list');
        else contentContainer.classList.remove('split-list');
        
        if (reminder.isLarge) contentContainer.classList.add('large-text');
        else contentContainer.classList.remove('large-text');
        
        if (reminder.isCenter) contentContainer.classList.add('center-text');
        else contentContainer.classList.remove('center-text');
        
        // Parse body text only (title was extracted)
        const htmlContent = marked.parse(reminder.body.trim());
        contentContainer.innerHTML = htmlContent;
    }
    
    currentReminderIndex = (currentReminderIndex + 1) % remindersList.length;
    
    // Return duration override if !LONG is present
    if (reminder.isLong) return 120000;
    return null;
}

export function renderDesktopReminders() {
    const contentContainer = document.getElementById('reminders-content');
    const titleEl = document.getElementById('reminders-title');
    if (!contentContainer) return;
    
    if (titleEl) titleEl.innerText = "Active Reminders & Notices";
    
    if (remindersList.length === 0) {
        contentContainer.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>';
        return;
    }
    
    let fullHtml = '';
    remindersList.forEach((r) => {
        const parsedBody = marked.parse(r.body.trim());
        let priorityBadge = '';
        if (r.priority === 'critical') {
            priorityBadge = '<span style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">Critical</span>';
        } else if (r.priority === 'high') {
            priorityBadge = '<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">Important</span>';
        }

        fullHtml += `
            <div class="desktop-reminder-item">
                <div class="desktop-reminder-header">
                    <span>${r.title}</span>
                    ${priorityBadge}
                </div>
                <div class="desktop-reminder-body ${r.splitList ? 'split-list' : ''} ${r.isLarge ? 'large-text' : ''} ${r.isCenter ? 'center-text' : ''}">
                    ${parsedBody}
                </div>
            </div>
        `;
    });
    contentContainer.innerHTML = fullHtml;
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
            
            // Parse Countdown Magic Word: !COUNTDOWN MM-DD-HH-mm
            let countdownHtml = "";
            const cdMatch = body.match(/!COUNTDOWN\s+([0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2})/i);
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
            
            if (isDesktopMode) {
                renderDesktopReminders();
            } else {
                // If this is the initial load, render immediately
                const content = document.getElementById('reminders-content');
                if (content && content.innerHTML === 'Loading...') {
                    advanceReminderSlide();
                }
            }
        } else {
            throw new Error('No valid sections found');
        }
    } catch (e) {
        remindersList = [];
        const content = document.getElementById('reminders-content');
        if (content) content.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No active reminders.</span>';
        const container = document.getElementById('reminders-widget-container');
        if (container) {
            container.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            container.style.animation = 'none';
        }
    }
}
