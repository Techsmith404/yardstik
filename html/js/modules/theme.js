// Dynamic Seasonal Holiday Stylesheets Module

export function getSeasonalTheme(date = new Date()) {
    const urlParams = new URLSearchParams(window.location.search);
    const mockTheme = (urlParams.get('holiday') || urlParams.get('theme') || '').toLowerCase().trim();
    
    if (mockTheme) {
        if (mockTheme === 'none' || mockTheme === 'default' || mockTheme === 'false') return 'default';
        return mockTheme;
    }

    const month = date.getMonth(); // 0-indexed (0 = Jan, 9 = Oct, 10 = Nov, 11 = Dec)
    const day = date.getDate();

    // Halloween: Oct 15 - Oct 31
    if (month === 9 && day >= 15) {
        return 'halloween';
    }

    // Thanksgiving / Autumn Harvest: Nov 15 - Nov 30
    if (month === 10 && day >= 15 && day <= 30) {
        return 'thanksgiving';
    }

    // Christmas & Winter Holidays: Dec 1 - Dec 26
    if (month === 11 && day >= 1 && day <= 26) {
        return 'christmas';
    }

    // New Year's: Dec 27 - Jan 5
    if ((month === 11 && day >= 27) || (month === 0 && day <= 5)) {
        return 'newyear';
    }

    // St. Patrick's Day: Mar 14 - Mar 18
    if (month === 2 && day >= 14 && day <= 18) {
        return 'stpatricks';
    }

    // 4th of July / Independence Day: Jul 1 - Jul 7
    if (month === 6 && day >= 1 && day <= 7) {
        return 'july4';
    }

    return 'default';
}

export function applyTheme(themeName) {
    let themeLink = document.getElementById('seasonal-theme-link');
    
    if (!themeName || themeName === 'default' || themeName === 'none') {
        if (themeLink) themeLink.remove();
        console.log('Active Theme: Default');
        return;
    }

    if (!themeLink) {
        themeLink = document.createElement('link');
        themeLink.id = 'seasonal-theme-link';
        themeLink.rel = 'stylesheet';
        document.head.appendChild(themeLink);
    }

    const themeHref = `css/themes/theme-${themeName}.css?v=4.1`;
    if (themeLink.getAttribute('href') !== themeHref) {
        themeLink.href = themeHref;
        console.log(`Active Seasonal Theme: ${themeName}`);
    }
}

export function initSeasonalTheme() {
    const currentTheme = getSeasonalTheme();
    applyTheme(currentTheme);

    // Re-check every hour for seamless midnight date rollover
    setInterval(() => {
        const theme = getSeasonalTheme();
        applyTheme(theme);
    }, 3600000);
}
