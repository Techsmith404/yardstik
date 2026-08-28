// Live Team Message Board & Digital Bulletin Module (Issue #13)
import { containsProfanity } from './profanity.js';

export let cachedMessageBoard = {
    settings: { enabled: true, require_approval: false },
    categories: [],
    messages: []
};

let currentPage = 0;
const PAGE_SIZE = 6;
let rotationInterval = null;

export async function fetchMessageBoard() {
    try {
        const res = await fetch('/api/message-board?t=' + Date.now());
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                cachedMessageBoard = data;
                renderMessageBoard(currentPage);
            }
        }
    } catch (e) {
        console.warn('Could not load message board:', e);
    }
}

function timeAgo(timestamp) {
    const elapsed = Date.now() - timestamp;
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderMessageBoard(page = 0) {
    const grid = document.getElementById('message-board-grid');
    const headerInfo = document.getElementById('mb-header-info');
    const pageIndicator = document.getElementById('mb-page-indicator');
    if (!grid) return;

    const messages = (cachedMessageBoard.messages || []).filter(m => m.status === 'approved');
    const categories = cachedMessageBoard.categories || [];
    const catMap = {};
    categories.forEach(c => catMap[c.id] = c);

    if (headerInfo) {
        headerInfo.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 8px;">
                <span class="pulse-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                ${messages.length} ${messages.length === 1 ? 'Message' : 'Messages'}
            </span>
        `;
    }

    if (messages.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 450px; background: rgba(0,0,0,0.25); border: 2px dashed rgba(255,255,255,0.15); border-radius: 16px; padding: 40px; text-align: center;">
                <div style="font-size: 3.5rem; color: var(--brand-blue, #38bdf8); margin-bottom: 15px;"><i class="fa-solid fa-comments"></i></div>
                <h2 style="font-size: 2rem; color: #fff; margin-bottom: 10px; font-family: 'Outfit', sans-serif;">Live Team Message Board</h2>
                <p style="font-size: 1.15rem; color: var(--text-secondary, #94a3b8); max-width: 600px; line-height: 1.5; margin-bottom: 25px;">
                    Be the first to share a safety shoutout, shift handoff note, or breakroom idea! Scan the mobile QR code in the bottom corner to post.
                </p>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
                    ${categories.map(c => `
                        <span style="background: rgba(255,255,255,0.06); border: 1px solid ${c.color}55; color: ${c.color}; padding: 6px 14px; border-radius: 20px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="${c.icon}"></i> ${escapeHtml(c.name)}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
        if (pageIndicator) pageIndicator.innerText = '';
        return;
    }

    const totalPages = Math.ceil(messages.length / PAGE_SIZE);
    currentPage = page % totalPages;
    const startIdx = currentPage * PAGE_SIZE;
    const pageItems = messages.slice(startIdx, startIdx + PAGE_SIZE);

    if (pageIndicator) {
        pageIndicator.innerText = totalPages > 1 ? `Page ${currentPage + 1} of ${totalPages}` : '';
    }

    grid.innerHTML = pageItems.map(msg => {
        const cat = catMap[msg.category_id] || { name: 'General', color: '#38bdf8', icon: 'fa-solid fa-comment' };
        const authorDisplay = msg.is_anonymous ? 'Anonymous' : escapeHtml(msg.author);
        const shiftDisplay = escapeHtml(msg.shift || 'Plant');
        const isPinned = !!msg.pinned;
        const reactions = msg.reactions || {};
        const thumbsCount = reactions.thumbsup || 0;
        const heartCount = reactions.heart || 0;
        const fireCount = reactions.fire || 0;

        return `
            <div class="widget message-card ${isPinned ? 'message-pinned' : ''}" style="
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 20px 22px;
                border-radius: 14px;
                background: ${isPinned ? 'linear-gradient(145deg, rgba(56, 189, 248, 0.12) 0%, rgba(20, 30, 45, 0.85) 100%)' : 'var(--card-bg)'};
                border: 1px solid ${isPinned ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255,255,255,0.08)'};
                border-left: 5px solid ${cat.color};
                box-shadow: ${isPinned ? '0 0 25px rgba(56, 189, 248, 0.2), 0 8px 24px rgba(0,0,0,0.3)' : '0 6px 18px rgba(0,0,0,0.25)'};
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                overflow: hidden;
            ">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="background: ${cat.color}22; border: 1px solid ${cat.color}66; color: ${cat.color}; padding: 3px 9px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="${cat.icon}" style="font-size: 0.8rem;"></i> ${escapeHtml(cat.name)}
                        </span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${isPinned ? '<span style="color: #38bdf8; font-size: 0.75rem; font-weight: bold; display: inline-flex; align-items: center; gap: 4px; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-thumbtack"></i> PINNED</span>' : ''}
                            <span style="color: var(--text-secondary); font-size: 0.8rem; opacity: 0.8;">${timeAgo(msg.timestamp)}</span>
                        </div>
                    </div>

                    <p style="font-size: clamp(0.95rem, 1.1vw, 1.15rem); color: #ffffff; line-height: 1.45; margin: 0 0 16px 0; word-break: break-word;">
                        ${escapeHtml(msg.text)}
                    </p>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; margin-top: auto;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 26px; height: 26px; border-radius: 50%; background: ${msg.is_anonymous ? '#64748b' : 'var(--brand-blue, #38bdf8)'}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: #fff;">
                            ${msg.is_anonymous ? '?' : authorDisplay.charAt(0).toUpperCase()}
                        </div>
                        <span style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0;">${authorDisplay}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.75;">• ${shiftDisplay}</span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${thumbsCount > 0 ? `<span style="font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 12px; color: #fff;">👍 ${thumbsCount}</span>` : ''}
                        ${heartCount > 0 ? `<span style="font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 12px; color: #fff;">❤️ ${heartCount}</span>` : ''}
                        ${fireCount > 0 ? `<span style="font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 12px; color: #fff;">🔥 ${fireCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function advanceMessageBoardSlide() {
    const messages = (cachedMessageBoard.messages || []).filter(m => m.status === 'approved');
    const totalPages = Math.ceil(messages.length / PAGE_SIZE);
    if (totalPages > 1) {
        currentPage = (currentPage + 1) % totalPages;
        renderMessageBoard(currentPage);
    }
}
