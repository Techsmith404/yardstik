// Safety Stand-down & Metrics Slideshow Module

export async function updateSafetySlide() {
    try {
        // Shift time forward by 1 hour so the slide automatically rolls over at 11 PM instead of midnight
        const actualNow = new Date();
        const now = new Date(actualNow.getTime() + (60 * 60 * 1000));
        
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        
        // Fetch trackers to check for daily override
        const res = await fetch('assets/data/trackers.json?t=' + new Date().getTime());
        const data = await res.json();
        
        const label = document.getElementById('toolbox-slide-number');
        const img = document.getElementById('slow-slide-img');
        if (!img) return;
        
        if (data.toolbox_override_date === todayStr && data.toolbox_override_file) {
            img.src = `assets/data/${data.toolbox_override_file}?t=${new Date().getTime()}`;
            if (label) label.innerText = `(Safety Stand-down)`;
            return;
        }
        
        // Fallback to normal day-of-year calculation
        const start = new Date(Date.UTC(now.getFullYear(), 0, 0));
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const dayOfYear = Math.round((todayUTC - start) / (1000 * 60 * 60 * 24));
        
        const year = now.getFullYear();
        const isLeap = ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
        
        let slideNum = dayOfYear;
        if (isLeap) {
            if (dayOfYear === 60) {
                slideNum = 20; // Feb 29th uses slide 20
            } else if (dayOfYear > 60) {
                slideNum = dayOfYear - 1; // March 1st goes back to 60, so Dec 31st is 365
            }
        }
        
        const paddedNum = slideNum.toString().padStart(3, '0');
        img.onerror = function() {
            if (!this.src.endsWith('001.png')) {
                this.src = 'assets/safety-slides/001.png';
            }
        };
        img.src = `assets/safety-slides/${paddedNum}.png`;
        if (label) label.innerText = `#${paddedNum}`;
    } catch (e) {
        console.log("Error updating safety slide", e);
    }
}

export async function startSlideshow(jsonPath, imgId, ms) {
    const img = document.getElementById(imgId);
    if (!img) return;
    let idx = 0;
    async function loop() {
        try {
            const res = await fetch(jsonPath + '?t=' + new Date().getTime());
            const files = await res.json();
            if (files.length > 0) {
                const folder = jsonPath.includes('safety') ? 'assets/safety-slides/' : 'assets/metrics/';
                img.src = folder + files[idx % files.length];
                idx++;
            } else {
                img.src = 'assets/placeholder.jpg';
            }
        } catch (e) {}
    }
    loop(); 
    setInterval(loop, ms);
}
