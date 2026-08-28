// Weather Animation, Holiday Atmosphere & Particle FX Module
let weatherAnimFrame = null;
let currentHolidayTheme = null;

export function setHolidayAtmosphereTheme(themeName) {
    currentHolidayTheme = themeName;
}

export function startWeatherAnimation(type) {
    const canvas = document.getElementById('weather-canvas');
    const vignette = document.getElementById('vignette-overlay');
    if (!canvas || !vignette) return;
    const ctx = canvas.getContext('2d');
    
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    if (!window.weatherResizeAttached) {
        window.addEventListener('resize', resize);
        window.weatherResizeAttached = true;
        resize();
    }
    
    if (weatherAnimFrame) cancelAnimationFrame(weatherAnimFrame);
    canvas.style.opacity = '1';
    vignette.style.opacity = '0';
    vignette.style.animation = 'none';
    vignette.style.boxShadow = 'none';
    vignette.style.background = 'transparent';

    const darkOverlay = document.getElementById('dark-overlay');
    if (darkOverlay) {
        darkOverlay.style.opacity = '0';
        darkOverlay.style.animation = 'none';
        darkOverlay.style.background = 'rgba(0,10,20,0.5)';
    }
    
    let particles = [];
    
    // If no severe weather is active, check if a holiday atmospheric particle effect should play
    if (type === 'none' && currentHolidayTheme && currentHolidayTheme !== 'default') {
        type = 'holiday-' + currentHolidayTheme;
    }

    if (type === 'rain') {
        for (let i = 0; i < 80; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, l: Math.random() * 25 + 15, s: Math.random() * 15 + 18 });
        function drawRain() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(200, 225, 255, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            particles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.l * 0.1, p.y + p.l);
                p.y += p.s; p.x -= p.s * 0.1;
                if (p.y > canvas.height) { p.y = -p.l; p.x = Math.random() * canvas.width; }
            });
            ctx.stroke();
            weatherAnimFrame = requestAnimationFrame(drawRain);
        }
        drawRain();
    } 
    else if (type === 'snow' || type === 'holiday-christmas') {
        const count = type === 'snow' ? 100 : 50;
        for (let i = 0; i < count; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 2.5 + 1, s: Math.random() * 1.5 + 0.8, a: Math.random() * Math.PI * 2 });
        function drawSnow() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.beginPath();
            particles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                p.y += p.s; p.x += Math.sin(p.a) * 0.6; p.a += 0.02;
                if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
            });
            ctx.fill();
            weatherAnimFrame = requestAnimationFrame(drawSnow);
        }
        drawSnow();
    }
    else if (type === 'holiday-halloween') {
        // Floating spooky embers & glowing wisps
        for (let i = 0; i < 40; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 3 + 1, s: Math.random() * 0.8 + 0.3, a: Math.random() * Math.PI * 2, color: Math.random() > 0.4 ? 'rgba(249, 115, 22, 0.6)' : 'rgba(168, 85, 247, 0.5)' });
        function drawHalloween() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                ctx.beginPath();
                ctx.fillStyle = p.color;
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.y -= p.s; p.x += Math.sin(p.a) * 0.8; p.a += 0.03;
                if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
            });
            weatherAnimFrame = requestAnimationFrame(drawHalloween);
        }
        drawHalloween();
    }
    else if (type === 'holiday-thanksgiving') {
        // Falling golden & crimson autumn leaves
        const colors = ['rgba(234, 179, 8, 0.6)', 'rgba(217, 119, 6, 0.6)', 'rgba(220, 38, 38, 0.5)'];
        for (let i = 0; i < 35; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 6 + 4, s: Math.random() * 1.2 + 0.6, a: Math.random() * Math.PI * 2, color: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * Math.PI });
        function drawThanksgiving() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, p.size, p.size / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                p.y += p.s; p.x += Math.sin(p.a) * 1.2; p.a += 0.02; p.rot += 0.01;
                if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
            });
            weatherAnimFrame = requestAnimationFrame(drawThanksgiving);
        }
        drawThanksgiving();
    }
    else if (type === 'holiday-newyear') {
        // Rising champagne bubbles & sparkling golden dust
        for (let i = 0; i < 50; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 2.5 + 1, s: Math.random() * 1.2 + 0.5, a: Math.random() * Math.PI * 2, color: Math.random() > 0.3 ? 'rgba(251, 191, 36, 0.6)' : 'rgba(56, 189, 248, 0.5)' });
        function drawNewYear() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                ctx.beginPath();
                ctx.fillStyle = p.color;
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.y -= p.s; p.x += Math.sin(p.a) * 0.5; p.a += 0.04;
                if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
            });
            weatherAnimFrame = requestAnimationFrame(drawNewYear);
        }
        drawNewYear();
    }
    else if (type === 'holiday-stpatricks') {
        // Floating lucky clovers & gold glitter
        for (let i = 0; i < 35; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 3 + 1.5, s: Math.random() * 0.8 + 0.4, a: Math.random() * Math.PI * 2, isGold: Math.random() > 0.6 });
        function drawStPatricks() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                ctx.beginPath();
                ctx.fillStyle = p.isGold ? 'rgba(234, 179, 8, 0.6)' : 'rgba(34, 197, 94, 0.55)';
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.y -= p.s; p.x += Math.sin(p.a) * 0.8; p.a += 0.03;
                if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
            });
            weatherAnimFrame = requestAnimationFrame(drawStPatricks);
        }
        drawStPatricks();
    }
    else if (type === 'holiday-july4') {
        // Patriotic firework bursts
        let fireworks = [];
        function createFirework() {
            const sx = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
            const sy = Math.random() * canvas.height * 0.4 + canvas.height * 0.1;
            const colors = ['#ef4444', '#ffffff', '#3b82f6', '#fbbf24'];
            const sparkColor = colors[Math.floor(Math.random() * colors.length)];
            for (let i = 0; i < 25; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 3 + 1;
                fireworks.push({ x: sx, y: sy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: sparkColor });
            }
        }
        createFirework();
        let fireworkTimer = 0;

        function drawJuly4() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            fireworkTimer++;
            if (fireworkTimer % 90 === 0) createFirework();

            for (let i = fireworks.length - 1; i >= 0; i--) {
                const f = fireworks[i];
                ctx.beginPath();
                ctx.fillStyle = f.color;
                ctx.globalAlpha = f.alpha;
                ctx.arc(f.x, f.y, 2, 0, Math.PI * 2);
                ctx.fill();
                f.x += f.vx; f.y += f.vy + 0.05; f.alpha -= 0.015;
                if (f.alpha <= 0) fireworks.splice(i, 1);
            }
            ctx.globalAlpha = 1;
            weatherAnimFrame = requestAnimationFrame(drawJuly4);
        }
        drawJuly4();
    }
    else if (type === 'tornado') {
        canvas.style.opacity = '0';
        vignette.style.boxShadow = 'inset 0 0 250px rgba(255, 0, 51, 0.8)';
        vignette.style.background = 'rgba(255, 0, 51, 0.05)';
        vignette.style.animation = 'pulse-emergency 2s infinite alternate';
    }
    else if (type === 'storm') {
        canvas.style.opacity = '0';
        if (darkOverlay) {
            darkOverlay.style.opacity = '1';
            darkOverlay.style.background = 'radial-gradient(circle at 20% 30%, rgba(0,5,15,0.95) 0%, transparent 60%), radial-gradient(circle at 80% 60%, rgba(5,10,20,0.85) 0%, transparent 60%), radial-gradient(circle at 40% 10%, rgba(0,0,5,0.9) 0%, transparent 60%), rgba(10, 15, 25, 0.6)';
            darkOverlay.style.backgroundSize = '200% 100%';
            darkOverlay.style.animation = 'fog-drift 25s linear infinite alternate';
        }
        vignette.style.opacity = '1';
        vignette.style.boxShadow = 'inset 0 0 350px rgba(255, 255, 255, 0.4)';
        vignette.style.background = 'transparent';
        vignette.style.animation = 'pulse-lightning 8s infinite';
    }
    else if (type === 'fog') {
        canvas.style.opacity = '0';
        
        if (darkOverlay) {
            darkOverlay.style.opacity = '1';
            darkOverlay.style.background = 'radial-gradient(ellipse at 15% 25%, rgba(180,190,200,0.3) 0%, transparent 25%), radial-gradient(ellipse at 75% 65%, rgba(200,210,220,0.25) 0%, transparent 35%), radial-gradient(ellipse at 45% 85%, rgba(180,190,200,0.2) 0%, transparent 20%), rgba(0,0,0,0)';
            darkOverlay.style.animation = 'fog-drift 12s ease-in-out infinite alternate';
        }
        
        vignette.style.opacity = '1';
        vignette.style.boxShadow = 'none';
        vignette.style.background = 'radial-gradient(ellipse at 85% 15%, rgba(220,230,240,0.35) 0%, transparent 30%), radial-gradient(ellipse at 25% 75%, rgba(180,190,200,0.3) 0%, transparent 40%), radial-gradient(ellipse at 60% 30%, rgba(200,210,220,0.2) 0%, transparent 25%), rgba(200,210,220, 0.05)';
        vignette.style.animation = 'fog-drift-alt 9s ease-in-out infinite alternate';
    }
    else {
        canvas.style.opacity = '0';
    }
}
