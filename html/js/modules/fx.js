// Weather Animation & Particle FX Module (Rain, Snow, Lightning, Fog, Tornado)
let weatherAnimFrame = null;

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
    
    if (type === 'rain') {
        for(let i=0; i<80; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, l: Math.random()*25+15, s: Math.random()*15+18 });
        function drawRain() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(200, 225, 255, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            particles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.l*0.1, p.y + p.l);
                p.y += p.s; p.x -= p.s*0.1;
                if(p.y > canvas.height) { p.y = -p.l; p.x = Math.random() * canvas.width; }
            });
            ctx.stroke();
            weatherAnimFrame = requestAnimationFrame(drawRain);
        }
        drawRain();
    } 
    else if (type === 'snow') {
        for(let i=0; i<100; i++) particles.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, r: Math.random()*2.5+1, s: Math.random()*2+1, a: Math.random()*Math.PI*2 });
        function drawSnow() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            particles.forEach(p => {
                ctx.moveTo(p.x, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                p.y += p.s; p.x += Math.sin(p.a) * 0.5; p.a += 0.02;
                if(p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
            });
            ctx.fill();
            weatherAnimFrame = requestAnimationFrame(drawSnow);
        }
        drawSnow();
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
