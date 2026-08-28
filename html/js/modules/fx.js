// Weather Animation, Holiday Atmosphere & High-Performance Particle FX Module
let weatherAnimFrame = null;
let currentHolidayTheme = null;

export function setHolidayAtmosphereTheme(themeName) {
    currentHolidayTheme = themeName;
}

export function startWeatherAnimation(type) {
    const canvas = document.getElementById('weather-canvas');
    const vignette = document.getElementById('vignette-overlay');
    if (!canvas || !vignette) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    
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
    
    // If no severe weather is active, check if a holiday atmospheric particle effect should play
    if (type === 'none' && currentHolidayTheme && currentHolidayTheme !== 'default') {
        type = 'holiday-' + currentHolidayTheme;
    }

    if (type === 'rain') {
        let particles = [];
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
        // Clean, elegant ambient falling snow
        let particles = [];
        const count = type === 'snow' ? 100 : 55;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 2.5 + 1,
                s: Math.random() * 1.5 + 0.8,
                a: Math.random() * Math.PI * 2
            });
        }
        function drawSnow() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.beginPath();
            particles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                p.y += p.s;
                p.x += Math.sin(p.a) * 0.6;
                p.a += 0.02;
                if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
            });
            ctx.fill();
            weatherAnimFrame = requestAnimationFrame(drawSnow);
        }
        drawSnow();
    }
    else if (type === 'holiday-halloween') {
        // Floating ghostly wisps, bats & glowing pumpkin embers (high-perf GPU)
        let particles = [];
        for (let i = 0; i < 30; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 3 + 1.5,
                s: Math.random() * 0.9 + 0.4,
                sway: Math.random() * Math.PI * 2,
                color: Math.random() > 0.4 ? 'rgba(249, 115, 22, 0.75)' : 'rgba(192, 132, 252, 0.65)'
            });
        }
        let bats = [];
        for (let i = 0; i < 4; i++) {
            bats.push({
                x: Math.random() * canvas.width,
                y: Math.random() * (canvas.height * 0.5),
                size: Math.random() * 8 + 8,
                s: Math.random() * 1.5 + 1.2,
                flap: Math.random() * Math.PI * 2
            });
        }

        function drawHalloween() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Embers / Wisps
            particles.forEach(p => {
                p.sway += 0.03;
                p.y -= p.s;
                p.x += Math.sin(p.sway) * 0.8;
                if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }

                ctx.beginPath();
                ctx.fillStyle = p.color;
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });

            // Bats
            bats.forEach(b => {
                b.flap += 0.15;
                b.x += b.s;
                if (b.x > canvas.width + 30) { b.x = -30; b.y = Math.random() * (canvas.height * 0.5); }

                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.fillStyle = 'rgba(24, 12, 30, 0.85)';
                const wingY = Math.sin(b.flap) * (b.size * 0.5);
                ctx.beginPath();
                ctx.ellipse(0, 0, b.size * 0.3, b.size * 0.45, 0, 0, Math.PI * 2);
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(b.size * 0.5, -wingY - b.size * 0.6, b.size * 1.3, -wingY);
                ctx.quadraticCurveTo(b.size * 0.6, -wingY * 0.2, 0, b.size * 0.3);
                ctx.quadraticCurveTo(-b.size * 0.6, -wingY * 0.2, -b.size * 1.3, -wingY);
                ctx.quadraticCurveTo(-b.size * 0.5, -wingY - b.size * 0.6, 0, 0);
                ctx.fill();
                ctx.restore();
            });

            weatherAnimFrame = requestAnimationFrame(drawHalloween);
        }
        drawHalloween();
    }
    else if (type === 'holiday-thanksgiving') {
        // Floating autumn leaf flakes (golden amber, copper, and cranberry red)
        const leafColors = ['rgba(234, 179, 8, 0.75)', 'rgba(217, 119, 6, 0.75)', 'rgba(220, 38, 38, 0.7)', 'rgba(180, 83, 9, 0.75)', 'rgba(249, 115, 22, 0.75)'];
        let leaves = [];
        for (let i = 0; i < 28; i++) {
            leaves.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                w: Math.random() * 7 + 6,
                h: Math.random() * 4 + 3,
                speedY: Math.random() * 1.1 + 0.5,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.03,
                sway: Math.random() * Math.PI * 2,
                color: leafColors[Math.floor(Math.random() * leafColors.length)]
            });
        }

        function drawThanksgiving() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            leaves.forEach(p => {
                p.sway += 0.03;
                p.rot += p.rotSpeed;
                p.y += p.speedY;
                p.x += Math.sin(p.sway) * 1.2;
                if (p.y > canvas.height + 15) { p.y = -15; p.x = Math.random() * canvas.width; }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, p.w, p.h, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
            weatherAnimFrame = requestAnimationFrame(drawThanksgiving);
        }
        drawThanksgiving();
    }
    else if (type === 'holiday-newyear') {
        // Rising Champagne Bubbles & Golden Sparkles
        let particles = [];
        for (let i = 0; i < 30; i++) {
            particles.push({
                type: 'bubble',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 5 + 3,
                speedY: Math.random() * 1.5 + 0.8,
                sway: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 20; i++) {
            particles.push({
                type: 'sparkle',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 6 + 3,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.05,
                color: Math.random() > 0.4 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(56, 189, 248, 0.8)'
            });
        }

        function drawNewYear() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                if (p.type === 'bubble') {
                    p.sway += 0.04;
                    p.y -= p.speedY;
                    p.x += Math.sin(p.sway) * 0.6;
                    if (p.y < -15) { p.y = canvas.height + 15; p.x = Math.random() * canvas.width; }

                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
                    ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    // Specular highlight
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.beginPath();
                    ctx.arc(-p.r * 0.35, -p.r * 0.35, p.r * 0.25, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'sparkle') {
                    p.rot += p.rotSpeed;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    const s = p.size;
                    ctx.moveTo(0, -s);
                    ctx.quadraticCurveTo(0, 0, s, 0);
                    ctx.quadraticCurveTo(0, 0, 0, s);
                    ctx.quadraticCurveTo(0, 0, -s, 0);
                    ctx.quadraticCurveTo(0, 0, 0, -s);
                    ctx.fill();
                    ctx.restore();
                }
            });
            weatherAnimFrame = requestAnimationFrame(drawNewYear);
        }
        drawNewYear();
    }
    else if (type === 'holiday-stpatricks') {
        // Floating 4-Leaf Clovers & Gold Coin Tokens
        let items = [];
        for (let i = 0; i < 18; i++) {
            items.push({
                type: 'clover',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 7 + 6,
                speedY: Math.random() * 0.8 + 0.4,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.03,
                sway: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 10; i++) {
            items.push({
                type: 'coin',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 6 + 5,
                speedY: Math.random() * 1.0 + 0.5,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.04
            });
        }

        function drawStPatricks() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            items.forEach(p => {
                p.rot += p.rotSpeed;
                p.y += p.speedY;
                if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }

                if (p.type === 'clover') {
                    p.sway += 0.03;
                    p.x += Math.sin(p.sway) * 0.9;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
                    const s = p.size;
                    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
                        ctx.save();
                        ctx.rotate(angle);
                        ctx.beginPath();
                        ctx.arc(s * 0.4, -s * 0.15, s * 0.3, 0, Math.PI * 2);
                        ctx.arc(s * 0.4, s * 0.15, s * 0.3, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(s * 0.3, s * 0.7, s * 0.5, s * 1.1);
                    ctx.lineWidth = s * 0.2;
                    ctx.strokeStyle = 'rgba(21, 128, 61, 0.9)';
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'coin') {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.radius, p.radius * 0.65, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(180, 83, 9, 0.85)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.restore();
                }
            });
            weatherAnimFrame = requestAnimationFrame(drawStPatricks);
        }
        drawStPatricks();
    }
    else if (type === 'holiday-july4') {
        // Multi-Stage Patriotic Fireworks with Gravity
        let fireworks = [];
        function createFirework() {
            const sx = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
            const sy = Math.random() * (canvas.height * 0.45) + canvas.height * 0.08;
            const palettes = [
                ['rgba(239, 68, 68, 0.9)', 'rgba(255, 255, 255, 0.95)', 'rgba(59, 130, 246, 0.9)'],
                ['rgba(251, 191, 36, 0.9)', 'rgba(255, 255, 255, 0.95)', 'rgba(239, 68, 68, 0.9)'],
                ['rgba(56, 189, 248, 0.9)', 'rgba(239, 68, 68, 0.9)', 'rgba(255, 255, 255, 0.95)']
            ];
            const palette = palettes[Math.floor(Math.random() * palettes.length)];
            const sparkCount = 28;
            for (let i = 0; i < sparkCount; i++) {
                const angle = (Math.PI * 2 / sparkCount) * i + (Math.random() * 0.2);
                const speed = Math.random() * 3 + 1.2;
                fireworks.push({
                    x: sx,
                    y: sy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1.0,
                    color: palette[i % palette.length],
                    size: Math.random() * 2 + 1.5
                });
            }
        }
        createFirework();
        let fireworkTimer = 0;

        function drawJuly4() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            fireworkTimer++;
            if (fireworkTimer % 80 === 0) createFirework();

            for (let i = fireworks.length - 1; i >= 0; i--) {
                const f = fireworks[i];
                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = f.color;
                ctx.globalAlpha = f.alpha;
                ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                f.x += f.vx;
                f.y += f.vy;
                f.vy += 0.04;
                f.vx *= 0.98;
                f.alpha -= 0.014;
                if (f.alpha <= 0) fireworks.splice(i, 1);
            }
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
