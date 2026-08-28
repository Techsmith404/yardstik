// Special Event High-Priority Override Module

export async function fetchSpecialEvent() {
    try {
        const res = await fetch('assets/data/special.json?t=' + new Date().getTime());
        if (!res.ok) throw new Error('No special event');
        const data = await res.json();
        
        // Check end time
        if (data.endTime) {
            const end = new Date(data.endTime).getTime();
            const now = new Date().getTime();
            if (now > end) {
                throw new Error('Event expired');
            }
        }
        
        const viewSpecial = document.getElementById('view-special');
        if (viewSpecial) {
            viewSpecial.setAttribute('data-disabled', 'false');
            const overrideMs = (parseInt(data.duration) || 20) * 1000;
            viewSpecial.setAttribute('data-duration', overrideMs);
            const titleEl = document.getElementById('special-title');
            if (titleEl) titleEl.innerText = data.title || '';
            
            const descEl = document.getElementById('special-desc');
            const descText = data.description || '';
            if (descEl) descEl.innerHTML = descText.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            
            const imgEl = document.getElementById('special-img');
            if (imgEl) {
                if (data.image) {
                    imgEl.src = data.image + '?t=' + new Date().getTime();
                    imgEl.style.display = 'block';
                } else {
                    imgEl.style.display = 'none';
                }
            }
        }
    } catch (e) {
        const viewSpecial = document.getElementById('view-special');
        if (viewSpecial) viewSpecial.setAttribute('data-disabled', 'true');
    }
}
