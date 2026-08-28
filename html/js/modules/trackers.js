// Operational Trackers Module (OSHA Days Safe & Configurable Production Tracker)

export async function updateTrackers() {
    try {
        // Fetch the JSON config file
        const res = await fetch('assets/data/trackers.json?t=' + new Date().getTime());
        const data = await res.json();
        
        // Update OSHA Counter
        if (data.last_incident_date) {
            const lastIncident = new Date(data.last_incident_date);
            const today = new Date();
            
            // Calculate total day boundaries cleanly
            const diffTime = today.getTime() - lastIncident.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const safeDays = isNaN(diffDays) ? "!!" : diffDays;
            
            const oshaEl = document.getElementById('osha-counter');
            if (oshaEl) oshaEl.innerText = safeDays;
            const hOsha = document.getElementById('header-osha-counter');
            if (hOsha) hOsha.innerText = safeDays;
        }
        
        // Update Production Tracker (Configurable: Blend Recipe / Heat # / Daily Target / etc)
        const trackerVal = (data.production_tracker_value !== undefined && data.production_tracker_value !== null && data.production_tracker_value !== '')
            ? data.production_tracker_value
            : data.blend_recipe;

        const rawTrackerLabel = (data.production_tracker_label && data.production_tracker_label.trim())
            ? data.production_tracker_label.trim()
            : 'Active Blend Recipe #';

        if (trackerVal !== undefined && trackerVal !== null && trackerVal !== '') {
            let displayVal = trackerVal.toString().trim();
            const hasHash = rawTrackerLabel.includes('#');

            // If label contains '#' and value doesn't already start with '#', prepend '#'
            if (hasHash && !displayVal.startsWith('#')) {
                displayVal = '#' + displayVal;
            }

            // Remove '#' from displayed title for clean appearance
            const displayLabel = rawTrackerLabel.replace(/#/g, '').replace(/\s+/g, ' ').trim();
            const titleText = displayLabel.endsWith(':') ? displayLabel : displayLabel + ':';
            const headerLabelText = displayLabel.replace(/^Active\s+/i, '').trim();
            const cleanHeaderLabel = (headerLabelText.endsWith(':') ? headerLabelText : headerLabelText + ':').toUpperCase();

            const mainTitle = document.getElementById('blend-widget-title');
            if (mainTitle) mainTitle.innerText = titleText;

            const mainDisplay = document.getElementById('blend-recipe-display');
            if (mainDisplay) mainDisplay.innerText = displayVal;

            const hLabel = document.getElementById('header-blend-label');
            if (hLabel) hLabel.innerText = cleanHeaderLabel;

            const hBlend = document.getElementById('header-blend-display');
            if (hBlend) hBlend.innerText = displayVal;
        }
    } catch (e) {
        const osha = document.getElementById('osha-counter');
        if (osha) osha.innerText = "Err";
        const hOsha = document.getElementById('header-osha-counter');
        if (hOsha) hOsha.innerText = "Err";
        
        const blend = document.getElementById('blend-recipe-display');
        if (blend) blend.innerText = "Err";
        const hBlend = document.getElementById('header-blend-display');
        if (hBlend) hBlend.innerText = "Err";
    }
}
