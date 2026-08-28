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
    else if (type === 'snow') {
        let particles = [];
        for (let i = 0; i < 100; i++) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 2.5 + 1, s: Math.random() * 1.5 + 0.8, a: Math.random() * Math.PI * 2 });
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
    else if (type === 'holiday-christmas') {
        // Intricate 6-point crystal snowflakes and soft drifting snow
        let snowflakes = [];
        for (let i = 0; i < 30; i++) {
            snowflakes.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 8 + 6,
                speedY: Math.random() * 1.0 + 0.5,
                speedX: Math.random() * 0.4 - 0.2,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.02,
                alpha: Math.random() * 0.5 + 0.35
            });
        }
        function drawChristmas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            snowflakes.forEach(p => {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.strokeStyle = `rgba(255, 255, 255, ${p.alpha})`;
                ctx.lineWidth = 1.5;
                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                ctx.shadowBlur = 4;
                for (let arm = 0; arm < 6; arm++) {
                    ctx.rotate(Math.PI / 3);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(0, p.size);
                    ctx.moveTo(0, p.size * 0.5);
                    ctx.lineTo(p.size * 0.25, p.size * 0.75);
                    ctx.moveTo(0, p.size * 0.5);
                    ctx.lineTo(-p.size * 0.25, p.size * 0.75);
                    ctx.stroke();
                }
                ctx.restore();
                p.y += p.speedY;
                p.x += p.speedX;
                p.rot += p.rotSpeed;
                if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
            });
            weatherAnimFrame = requestAnimationFrame(drawChristmas);
        }
        drawChristmas();
    }
    else if (type === 'holiday-halloween') {
        // Flying Bats & Floating Ghosts & Glowing Embers
        let entities = [];
        for (let i = 0; i < 8; i++) {
            entities.push({
                type: 'bat',
                x: Math.random() * canvas.width,
                y: Math.random() * (canvas.height * 0.6),
                size: Math.random() * 12 + 10,
                speedX: Math.random() * 2 + 1.5,
                flap: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 4; i++) {
            entities.push({
                type: 'ghost',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 20 + 16,
                speedY: Math.random() * 0.6 + 0.3,
                sway: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 25; i++) {
            entities.push({
                type: 'ember',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 2.5 + 1,
                speedY: Math.random() * 0.8 + 0.4,
                color: Math.random() > 0.4 ? 'rgba(249, 115, 22, 0.7)' : 'rgba(192, 132, 252, 0.6)'
            });
        }

        function drawHalloween() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            entities.forEach(p => {
                if (p.type === 'bat') {
                    p.flap += 0.15;
                    p.x += p.speedX;
                    if (p.x > canvas.width + 40) { p.x = -40; p.y = Math.random() * (canvas.height * 0.6); }

                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.fillStyle = 'rgba(20, 10, 25, 0.9)';
                    ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
                    ctx.shadowBlur = 6;
                    // Bat body
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.size * 0.25, p.size * 0.45, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Bat wings
                    const wingY = Math.sin(p.flap) * (p.size * 0.6);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(p.size * 0.6, -wingY - p.size * 0.8, p.size * 1.5, -wingY);
                    ctx.quadraticCurveTo(p.size * 0.7, -wingY * 0.2, 0, p.size * 0.3);
                    ctx.quadraticCurveTo(-p.size * 0.7, -wingY * 0.2, -p.size * 1.5, -wingY);
                    ctx.quadraticCurveTo(-p.size * 0.6, -wingY - p.size * 0.8, 0, 0);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'ghost') {
                    p.sway += 0.03;
                    p.y -= p.speedY;
                    if (p.y < -50) { p.y = canvas.height + 50; p.x = Math.random() * canvas.width; }

                    ctx.save();
                    ctx.translate(p.x + Math.sin(p.sway) * 20, p.y);
                    ctx.fillStyle = 'rgba(192, 132, 252, 0.3)';
                    ctx.shadowColor = 'rgba(192, 132, 252, 0.7)';
                    ctx.shadowBlur = 15;
                    ctx.beginPath();
                    ctx.arc(0, -p.size * 0.4, p.size * 0.5, Math.PI, 0);
                    ctx.lineTo(p.size * 0.5, p.size * 0.6);
                    ctx.quadraticCurveTo(p.size * 0.25, p.size * 0.4 + Math.sin(p.sway * 2) * 5, 0, p.size * 0.6);
                    ctx.quadraticCurveTo(-p.size * 0.25, p.size * 0.8 - Math.sin(p.sway * 2) * 5, -p.size * 0.5, p.size * 0.6);
                    ctx.closePath();
                    ctx.fill();
                    // Ghost Eyes
                    ctx.fillStyle = 'rgba(10, 5, 15, 0.85)';
                    ctx.beginPath();
                    ctx.arc(-p.size * 0.2, -p.size * 0.4, p.size * 0.08, 0, Math.PI * 2);
                    ctx.arc(p.size * 0.2, -p.size * 0.4, p.size * 0.08, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else if (p.type === 'ember') {
                    p.y -= p.speedY;
                    if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
                    ctx.beginPath();
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 8;
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            weatherAnimFrame = requestAnimationFrame(drawHalloween);
        }
        drawHalloween();
    }
    else if (type === 'holiday-thanksgiving') {
        // Detailed Falling Maple & Oak Leaves
        const leafColors = ['#eab308', '#d97706', '#dc2626', '#b45309', '#f97316'];
        let leaves = [];
        for (let i = 0; i < 28; i++) {
            leaves.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 9 + 8,
                speedY: Math.random() * 1.2 + 0.6,
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
                p.x += Math.sin(p.sway) * 1.5;
                if (p.y > canvas.height + 25) { p.y = -25; p.x = Math.random() * canvas.width; }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 6;
                // 5-point maple leaf outline
                const s = p.size;
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.lineTo(s * 0.3, -s * 0.5);
                ctx.lineTo(s * 0.8, -s * 0.6);
                ctx.lineTo(s * 0.5, -s * 0.1);
                ctx.lineTo(s * 0.9, s * 0.2);
                ctx.lineTo(s * 0.4, s * 0.4);
                ctx.lineTo(s * 0.6, s * 0.8);
                ctx.lineTo(s * 0.1, s * 0.6);
                ctx.lineTo(0, s * 1.1); // Stem
                ctx.lineTo(-s * 0.1, s * 0.6);
                ctx.lineTo(-s * 0.6, s * 0.8);
                ctx.lineTo(-s * 0.4, s * 0.4);
                ctx.lineTo(-s * 0.9, s * 0.2);
                ctx.lineTo(-s * 0.5, -s * 0.1);
                ctx.lineTo(-s * 0.8, -s * 0.6);
                ctx.lineTo(-s * 0.3, -s * 0.5);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            });
            weatherAnimFrame = requestAnimationFrame(drawThanksgiving);
        }
        drawThanksgiving();
    }
    else if (type === 'holiday-newyear') {
        // Rising Champagne Bubbles with Specular Glint & Golden Sparkles
        let particles = [];
        for (let i = 0; i < 35; i++) {
            particles.push({
                type: 'bubble',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 5 + 3,
                speedY: Math.random() * 1.5 + 0.8,
                sway: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 25; i++) {
            particles.push({
                type: 'sparkle',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 7 + 4,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.05,
                color: Math.random() > 0.4 ? '#fbbf24' : '#38bdf8'
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
                    ctx.shadowColor = 'rgba(251, 191, 36, 0.8)';
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    // Bubble highlight
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
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
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 10;
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
        // Detailed 4-Leaf Clovers & Shiny Gold Coins
        let items = [];
        for (let i = 0; i < 20; i++) {
            items.push({
                type: 'clover',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 8 + 7,
                speedY: Math.random() * 0.9 + 0.4,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.03,
                sway: Math.random() * Math.PI * 2
            });
        }
        for (let i = 0; i < 14; i++) {
            items.push({
                type: 'coin',
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 7 + 6,
                speedY: Math.random() * 1.1 + 0.6,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.04
            });
        }

        function drawStPatricks() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            items.forEach(p => {
                p.rot += p.rotSpeed;
                p.y += p.speedY;
                if (p.y > canvas.height + 25) { p.y = -25; p.x = Math.random() * canvas.width; }

                if (p.type === 'clover') {
                    p.sway += 0.03;
                    p.x += Math.sin(p.sway) * 1.0;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = '#22c55e';
                    ctx.shadowColor = 'rgba(34, 197, 94, 0.8)';
                    ctx.shadowBlur = 8;
                    const s = p.size;
                    // Draw 4 distinct heart petals
                    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
                        ctx.save();
                        ctx.rotate(angle);
                        ctx.beginPath();
                        ctx.arc(s * 0.4, -s * 0.2, s * 0.35, 0, Math.PI * 2);
                        ctx.arc(s * 0.4, s * 0.2, s * 0.35, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                    // Clover stem
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(s * 0.4, s * 0.8, s * 0.6, s * 1.3);
                    ctx.lineWidth = s * 0.25;
                    ctx.strokeStyle = '#15803d';
                    ctx.stroke();
                    ctx.restore();
                } else if (p.type === 'coin') {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = '#fbbf24';
                    ctx.shadowColor = 'rgba(251, 191, 36, 0.85)';
                    ctx.shadowBlur = 10;
                    // Outer coin body
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.radius, p.radius * 0.65, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Inner engraved border
                    ctx.strokeStyle = '#b45309';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.radius * 0.75, p.radius * 0.45, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            });
            weatherAnimFrame = requestAnimationFrame(drawStPatricks);
        }
        drawStPatricks();
    }
    else if (type === 'holiday-july4') {
        // Multi-Stage Patriotic Fireworks with Exploding Trails
        let fireworks = [];
        function createFirework() {
            const sx = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
            const sy = Math.random() * (canvas.height * 0.45) + canvas.height * 0.08;
            const palettes = [
                ['#ef4444', '#ffffff', '#3b82f6'],
                ['#fbbf24', '#ffffff', '#ef4444'],
                ['#38bdf8', '#ef4444', '#ffffff']
            ];
            const palette = palettes[Math.floor(Math.random() * palettes.length)];
            const sparkCount = 35;
            for (let i = 0; i < sparkCount; i++) {
                const angle = (Math.PI * 2 / sparkCount) * i + (Math.random() * 0.2);
                const speed = Math.random() * 3.5 + 1.5;
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
            if (fireworkTimer % 75 === 0) createFirework();

            for (let i = fireworks.length - 1; i >= 0; i--) {
                const f = fireworks[i];
                ctx.save();
                ctx.beginPath();
                ctx.fillStyle = f.color;
                ctx.globalAlpha = f.alpha;
                ctx.shadowColor = f.color;
                ctx.shadowBlur = 8;
                ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                f.x += f.vx;
                f.y += f.vy;
                f.vy += 0.04; // Gravity
                f.vx *= 0.98; // Drag
                f.alpha -= 0.014; // Fade
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
