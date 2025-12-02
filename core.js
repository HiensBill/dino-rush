// === 1. API Address ===
const API_URL = "https://dino-rank-v-xahmxdfdpw.cn-shenzhen.fcapp.run"; 

// === 2. Core Constants ===
const LOGICAL_WIDTH = 800;
const LOGICAL_HEIGHT = 200;
const GROUND_Y = 185;

const UI_FONT = '"Microsoft YaHei", "PingFang SC", "Segoe UI", system-ui, sans-serif';

// === Dino Sprite ===
const dinoImg = new Image();
dinoImg.src = 'dino.png';
let dinoImgLoaded = false;
dinoImg.onload = () => {
    dinoImgLoaded = true;
};

// === 3. DOM Elements ===
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('container');
const messageDiv = document.getElementById('game-message');
const scoreText = document.getElementById('final-score');
const userInfoDiv = document.getElementById('userInfo');
const loginBtnOver = document.getElementById('loginBtnOver');

// === 4. Global Variables ===
const STATE = { PLAYING: 0, GAME_OVER: 1, CARD_SELECT: 2 };
let currentState = STATE.PLAYING;
let gameSpeed = 6.5;
let score = 0;
let animationId = null;
let shake = 0;

// 帧率无关：上一帧时间 & 时间缩放
let lastFrameTime = 0;
let timeScale = 1;

let lastBuffScore = 0;
let activeBuffs = { shield: false, tripleJump: 0, mini: 0, feather: 0, greed: 0 };
const BUFF_DURATION = 15;
let currentCards = [];
let currentUser = null;

const BIOMES = [
    { id: 0, name: 'Classic Wasteland', bg: '#f7f7f7', fg: '#535353', dino: '#535353', particle: 'none' },       
    { id: 1, name: 'Neon City', bg: '#202124', fg: '#00e676', dino: '#dcdcdc', particle: 'firefly' },    
    { id: 2, name: 'Mars Storm', bg: '#4e2727', fg: '#ffb74d', dino: '#dcdcdc', particle: 'dust' },       
    { id: 3, name: 'Ice Age', bg: '#e0f7fa', fg: '#006064', dino: '#535353', particle: 'snow' }        
];
let currentBiome = BIOMES[0];

// Entities
var particles = [];
var weatherParticles = [];
var obstacles = [];
var clouds = [];
var spawnTimer = 0;
var nextSpawnDist = 0;

console.log("Game Loaded: v9.2 Final UI Fix");

// === 5. Initialization ===
function initCanvas() {
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
}
initCanvas();

try {
    const savedUser = localStorage.getItem('dino_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        if (userInfoDiv) userInfoDiv.innerText = `👤 ${currentUser.nickname}`;
    }
} catch (e) {}

// === 6. Interaction Functions ===
window.showLogin = () => document.getElementById('loginModal').style.display = 'flex';
window.closeModal = (id) => document.getElementById(id).style.display = 'none';

window.doLogin = () => {
    const phone = document.getElementById('inputPhone').value.trim(); // 这里的 phone 实际是玩家ID
    const nick = document.getElementById('inputNick').value.trim();
    if (!phone) { 
        alert('请输入玩家ID（可以是手机号）'); 
        return; 
    }
    currentUser = { phone, nickname: nick || phone };
    localStorage.setItem('dino_user', JSON.stringify(currentUser));
    if (userInfoDiv) userInfoDiv.innerText = `👤 ${currentUser.nickname}`;
    window.closeModal('loginModal');
    if (score > 5) uploadScore(score);
    if (loginBtnOver) loginBtnOver.style.display = 'none';
};


// 干净版排行榜逻辑
window.showRank = () => {
    const modal = document.getElementById('rankModal');
    const list = document.getElementById('rankList');
    const loading = document.getElementById('rankLoading');

    modal.style.display = 'flex';
    list.innerHTML = '';
    loading.style.display = 'block';
    loading.innerText = '正在连接服务器...';

    fetch(API_URL + '/rank')
        .then(r => r.json())
        .then(d => {
            console.log('RANK_RESPONSE:', d);
            loading.style.display = 'none';
            list.innerHTML = '';

            // 兼容 [ ... ] 或 { data: [ ... ] }
            const data = Array.isArray(d) ? d : (Array.isArray(d.data) ? d.data : []);

            if (!data.length) {
                loading.style.display = 'block';
                loading.innerText = '暂无记录，快去刷个高分吧！';
                return;
            }

			data.forEach((item, idx) => {
			    const li = document.createElement('li');
			    li.className = 'rank-item';
			
			    let m = `${idx + 1}.`;
			    if (idx === 0) m = '🥇';
			    else if (idx === 1) m = '🥈';
			    else if (idx === 2) m = '🥉';
			
			    const name = item.nickname || '玩家';
			    const scoreVal = (item.high_score !== undefined ? item.high_score : item.score) ?? 0;
			
			    const leftSpan = document.createElement('span');
			    leftSpan.textContent = `${m} ${name}`;
			
			    const rightStrong = document.createElement('strong');
			    rightStrong.textContent = String(scoreVal);
			
			    li.appendChild(leftSpan);
			    li.appendChild(rightStrong);
			    list.appendChild(li);
			});
        })
        .catch(err => {
            console.error('RANK_ERROR:', err);
            loading.style.display = 'block';
            loading.innerText = '加载失败';
        });
};

window.restartGame = () => {
    messageDiv.style.display = 'none';
    if (document.body.classList) document.body.classList.add('game-started');
    start();
};

function uploadScore(s) {
    if (!currentUser || s < 5) return;
    fetch(API_URL + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentUser.phone, nickname: currentUser.nickname, score: s })
    }).then(r => r.json()).then(d => { if (d.newRecord) console.log("新纪录！"); }).catch(console.error);
}

// === 7. Draw Functions ===
function drawBlockyDino(ctx, x, y, w, h, color) {
    if (activeBuffs.shield) {
        ctx.save();
        ctx.strokeStyle = '#00c851'; ctx.lineWidth = 3;
        ctx.shadowBlur = 10; ctx.shadowColor = '#00ffff';
        ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.fillRect(x + w * 0.45, y, w * 0.55, h * 0.35);
    ctx.clearRect(x + w * 0.75, y + h * 0.2, w * 0.25, h * 0.08);

    const isDark = (currentBiome.bg === '#202124' || currentBiome.bg === '#4e2727');
    ctx.fillStyle = isDark ? '#000' : '#fff'; ctx.fillRect(x + w * 0.55, y + h * 0.05, w * 0.12, h * 0.12);
    ctx.fillStyle = isDark ? '#fff' : '#000'; ctx.fillRect(x + w * 0.62, y + h * 0.08, w * 0.05, h * 0.05);

    ctx.fillStyle = color;
    ctx.fillRect(x + w * 0.35, y + h * 0.35, w * 0.5, h * 0.35);
    ctx.fillRect(x + w * 0.45, y + h * 0.25, w * 0.2, h * 0.1);

    ctx.fillRect(x, y + h * 0.25, w * 0.1, h * 0.15);
    ctx.fillRect(x + w * 0.1, y + h * 0.35, w * 0.1, h * 0.15);
    ctx.fillRect(x + w * 0.2, y + h * 0.45, w * 0.15, h * 0.15);

    ctx.fillRect(x + w * 0.85, y + h * 0.45, w * 0.1, h * 0.08);
    ctx.fillRect(x + w * 0.92, y + h * 0.53, w * 0.03, h * 0.08);

    ctx.fillRect(x + w * 0.4, y + h * 0.7, w * 0.18, h * 0.2); ctx.fillRect(x + w * 0.35, y + h * 0.9, w * 0.15, h * 0.1);
    ctx.fillRect(x + w * 0.65, y + h * 0.7, w * 0.18, h * 0.2); ctx.fillRect(x + w * 0.65, y + h * 0.9, w * 0.15, h * 0.1);
}

function drawBlockyCactus(ctx, x, y, w, h, color) {
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(x + w * 0.25, y + h * 0.05, w * 0.5, h * 0.95);
    ctx.fillStyle = '#1e8449'; ctx.fillRect(x + w * 0.35, y + h * 0.1, w * 0.1, h * 0.85); ctx.fillRect(x + w * 0.55, y + h * 0.1, w * 0.1, h * 0.85);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(x, y + h * 0.2, w * 0.25, h * 0.15); ctx.fillRect(x, y + h * 0.05, w * 0.15, h * 0.2);
    ctx.fillRect(x + w * 0.75, y + h * 0.3, w * 0.25, h * 0.15); ctx.fillRect(x + w * 0.85, y + h * 0.15, w * 0.15, h * 0.2);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + w * 0.3, y, w * 0.1, h * 0.05); ctx.fillRect(x + w * 0.6, y - h * 0.02, w * 0.1, h * 0.06);
}

function drawBlockyBird(ctx, x, y, w, h, isHighRisk) {
    const bodyColor = isHighRisk ? '#ff3333' : currentBiome.fg;
    const wingColor = isHighRisk ? '#ff8a80' : currentBiome.fg;
    const ux = w / 10; const uy = h / 6;
    let wingFlap = Math.floor(Date.now() / 150) % 2 === 0;

    ctx.fillStyle = bodyColor;
    ctx.fillRect(x, y + uy * 2.5, ux * 4, uy * 1);
    ctx.fillRect(x + ux * 2, y + uy * 1.5, ux * 2, uy * 2);
    ctx.fillRect(x + ux * 4, y + uy * 1, ux * 2, uy * 1.5);
    ctx.fillRect(x + ux * 4, y + uy * 3, ux * 3, uy * 2);
    ctx.fillRect(x + ux * 7, y + uy * 3.5, ux * 2, uy * 1);

    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x + ux * 2.5, y + uy * 2.7, ux * 0.8, uy * 0.6);

    ctx.globalAlpha = 0.8; ctx.fillStyle = wingColor; ctx.fillRect(x + ux * 4, y + uy * 2.5, ux * 2, uy * 1.5);
    if (wingFlap) { ctx.fillRect(x + ux * 4, y + uy * 1, ux * 2, uy * 1.5); ctx.fillRect(x + ux * 2, y, ux * 3, uy * 1.5); ctx.fillRect(x + ux * 6, y + uy * 1.5, ux * 2, uy * 1); }
    else { ctx.fillRect(x + ux * 4, y + uy * 3.5, ux * 2, uy * 1.5); ctx.fillRect(x + ux * 2, y + uy * 4.5, ux * 3, uy * 1.5); ctx.fillRect(x + ux * 6, y + uy * 4, ux * 2, uy * 1); }
    ctx.globalAlpha = 1.0;
}

function drawShockwave(ctx, x, y, w, h) {
    ctx.fillStyle = '#ff0000'; ctx.fillRect(x, y + h * 0.3, w * 0.6, h * 0.4); ctx.fillRect(x + w * 0.2, y + h * 0.1, w * 0.4, h * 0.8);
    ctx.fillStyle = '#ffff00'; ctx.fillRect(x + w * 0.2, y + h * 0.3, w * 0.2, h * 0.4);
    if (Math.random() > 0.3) { ctx.fillStyle = '#ff5722'; ctx.fillRect(x + w * 0.6, y + h * 0.2, w * 0.2, h * 0.6); }
}

function drawAbyss(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(200, 0, 0, 0.15)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c0392b'; const spikeW = 20;
    for (let i = 0; i < w / spikeW; i++) { ctx.fillRect(x + i * spikeW + 5, y + h - 15, 10, 15); }
}
function drawNeonSpike(ctx, x, y, w, h) {
    ctx.fillStyle = '#00e676'; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
    ctx.fillStyle = '#b9f6ca'; ctx.fillRect(x + w * 0.4, y + h * 0.4, w * 0.2, h * 0.6);
}
function drawMarsRock(ctx, x, y, w, h) {
    ctx.fillStyle = '#ef6c00'; ctx.fillRect(x + w * 0.1, y + h * 0.2, w * 0.8, h * 0.8);
    ctx.fillStyle = '#ffe0b2'; ctx.fillRect(x + w * 0.2, y + h * 0.2, w * 0.2, h * 0.2);
}
function drawIceShard(ctx, x, y, w, h) {
    ctx.fillStyle = '#4dd0e1'; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.8, y + h * 0.6); ctx.lineTo(x + w * 0.6, y + h); ctx.lineTo(x + w * 0.4, y + h); ctx.lineTo(x + w * 0.2, y + h * 0.6); ctx.fill();
    ctx.fillStyle = '#e0f7fa'; ctx.fillRect(x + w * 0.45, y + h * 0.1, w * 0.1, h * 0.8);
}

// === 8. Classes ===
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 4 + 2; this.life = 20;
        this.vx = (Math.random() - 0.5) * 4; this.vy = -Math.random() * 2; this.gravity = 0.1;
    }
    update() { this.x += this.vx * timeScale; this.y += this.vy * timeScale; this.vy += this.gravity * timeScale; this.life -= timeScale; }
    draw() { ctx.globalAlpha = Math.max(0, this.life / 20); ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.size, this.size); ctx.globalAlpha = 1.0; }
}

class WeatherParticle {
    constructor(type) { this.type = type; this.reset(); }
    reset() {
        if (this.type === 'snow') {
            this.x = Math.random() * LOGICAL_WIDTH; this.y = -10;
            this.vx = (Math.random() - 0.5); this.vy = Math.random() + 1; this.size = Math.random() * 3 + 2;
        } else if (this.type === 'firefly') {
            this.x = Math.random() * LOGICAL_WIDTH; this.y = LOGICAL_HEIGHT + 10;
            this.vx = (Math.random() - 0.5) * 0.5; this.vy = -Math.random() - 0.5; this.size = Math.random() * 2 + 1;
        } else if (this.type === 'dust') {
            this.x = LOGICAL_WIDTH + 10; this.y = Math.random() * LOGICAL_HEIGHT;
            this.vx = -Math.random() * 5 - 5; this.vy = (Math.random() - 0.5); this.size = Math.random() * 2 + 1;
        } else { this.x = -100; }
    }
    update() {
        this.x += this.vx * timeScale; this.y += this.vy * timeScale;
        if ((this.type === 'snow' && this.y > LOGICAL_HEIGHT) || (this.type === 'firefly' && this.y < 0) || (this.type === 'dust' && this.x < 0)) this.reset();
    }
    draw(color) {
        if (this.type === 'none') return; ctx.fillStyle = color;
        if (this.type === 'snow') { ctx.beginPath(); ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.globalAlpha = 0.6; ctx.fillRect(this.x, this.y, this.size, this.size); ctx.globalAlpha = 1.0; }
    }
}

class Cloud {
    constructor() {
        this.x = Math.random() * LOGICAL_WIDTH;
        this.y = Math.random() * (LOGICAL_HEIGHT / 2.5);
        this.width = 50 + Math.random() * 40;
        this.height = 25 + Math.random() * 15;
        this.speed = 0.5;
    }
    update() { this.x -= this.speed * timeScale; if (this.x + this.width < 0) this.x = LOGICAL_WIDTH + 10; }
    draw() {
        const isDark = (currentBiome.bg === '#202124' || currentBiome.bg === '#4e2727');
        const main = isDark ? 'rgba(255,255,255,0.2)' : '#fff';
        const shadow = isDark ? 'rgba(0,0,0,0.3)' : '#e0e0e0';
        ctx.fillStyle = shadow; ctx.beginPath(); ctx.arc(this.x + this.width * 0.35, this.y + this.height * 0.6, this.height * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + this.width * 0.65, this.y + this.height * 0.6, this.height * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = main; ctx.beginPath(); ctx.arc(this.x + this.width * 0.25, this.y + this.height * 0.5, this.height * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + this.width * 0.5, this.y + this.height * 0.4, this.height * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.x + this.width * 0.75, this.y + this.height * 0.5, this.height * 0.35, 0, Math.PI * 2); ctx.fill();
    }
}

class Obstacle {
    constructor(type, xOffset = 0, options = {}) {
        this.x = LOGICAL_WIDTH + xOffset;
        this.markedForDeletion = false;
        this.type = type;

        if (typeof xOffset === 'object') { options = xOffset; xOffset = 0; this.x = LOGICAL_WIDTH; }

        this.speedMod = options.speedMod || 1.0;
        this.isHighRisk = options.isHighRisk || false;
        this.baseY = 0; this.waveOffset = Math.random() * Math.PI * 2; this.isWavy = false;

        if (this.type === 'bird') {
            this.width = 60; this.height = 36;
            if (score < 20) {
                this.baseY = LOGICAL_HEIGHT - 45 - Math.random() * 100;
            } else {
                if (options.yPos === 'high') this.baseY = 50;
                else if (options.yPos === 'mid') this.baseY = 100;
                else this.baseY = 155;
            }
            this.y = this.baseY;
            this.speedMod = 1.2;
            if (score > 40) this.isWavy = true;
        } else if (this.type === 'speedster') {
            this.width = 60; this.height = 30;
            this.y = 150;
            this.speedMod = 1.5;
            this.isHighRisk = true;
        } else if (this.type === 'gap') {
            this.width = 500; this.height = 40;
            this.y = 160;
            this.speedMod = 1.0;
        } else {
            this.type = 'cactus';
            const r = Math.random();
            if (r > 0.7) { this.width = 32; this.height = 65; }
            else if (r > 0.4) { this.width = 28; this.height = 50; }
            else { this.width = 20; this.height = 35; }
            this.y = GROUND_Y - this.height;
        }
    }
    update() {
        if (currentState === STATE.PLAYING) {
            this.x -= gameSpeed * this.speedMod * timeScale;
            if (this.isWavy) { this.y = this.baseY + Math.sin(Date.now() * 0.006 + this.waveOffset) * 30; }
        }
        this.draw();
    }
    draw() {
        if (this.type === 'bird') drawBlockyBird(ctx, this.x, this.y, this.width, this.height, this.isHighRisk);
        else if (this.type === 'speedster') drawShockwave(ctx, this.x, this.y, this.width, this.height);
        else if (this.type === 'gap') drawAbyss(ctx, this.x, this.y, this.width, this.height);
        else {
            if (currentBiome.id === 0) drawBlockyCactus(ctx, this.x, this.y, this.width, this.height);
            else if (currentBiome.id === 1) drawNeonSpike(ctx, this.x, this.y, this.width, this.height);
            else if (currentBiome.id === 2) drawMarsRock(ctx, this.x, this.y, this.width, this.height);
            else drawIceShard(ctx, this.x, this.y, this.width, this.height);
        }
    }
}

const dino = {
    x: 40, y: 153, width: 44, height: 47, dy: 0, gravity: 0.6, grounded: false,
    isCharging: false, chargePower: 0, maxCharge: 100, chargeRate: 5, minJump: -10, maxJump: -22, jumpCount: 0, landingFrames: 0,

    getMaxJumps: function () { return score < activeBuffs.tripleJump ? 3 : 2; },
    getSize: function () { const s = score < activeBuffs.mini ? 0.75 : 1.0; return { w: this.width * s, h: this.height * s }; },

    draw: function () {
        ctx.save();
        const s = this.getSize();
        const drawY = this.y + (this.height - s.h);

        if (this.isCharging) {
            const p = this.chargePower / this.maxCharge;
            const cx = this.x + s.w / 2; const cy = drawY + s.h;
            ctx.translate(cx, cy); ctx.scale(1 + 0.2 * p, 1 - 0.3 * p); ctx.translate(-cx, -cy);
        } else if (this.landingFrames > 0) {
            const cx = this.x + s.w / 2; const cy = drawY + s.h;
            ctx.translate(cx, cy); ctx.scale(1.2, 0.75); ctx.translate(-cx, -cy);
        }

        if (this.isCharging && currentState !== STATE.GAME_OVER) {
            const bx = this.x + (s.w - 40) / 2; const by = drawY - 18;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, 40, 6);
            const p = this.chargePower / this.maxCharge;
            ctx.fillStyle = p > 0.8 ? '#ff4444' : (p > 0.5 ? '#ffbb33' : '#2ecc71'); ctx.fillRect(bx + 1, by + 1, 38 * p, 4);
        }

        // 如果使用 PNG 贴图，则在这里画恐龙；否则回退到原来的像素方块恐龙
        if (activeBuffs.shield && dinoImgLoaded) {
            ctx.save();
            ctx.strokeStyle = '#00c851';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ffff';
            ctx.beginPath();
            ctx.arc(this.x + s.w / 2, drawY + s.h / 2, s.w * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        if (dinoImgLoaded) {
            ctx.drawImage(
                dinoImg,
                0, 0, dinoImg.width, dinoImg.height, // 源区域：整张图
                this.x, drawY, s.w, s.h              // 目标区域：恐龙在游戏里的逻辑大小
            );
        } else {
            // 图片还没加载好时，先继续用老的像素恐龙顶一下
            drawBlockyDino(ctx, this.x, drawY, s.w, s.h, currentBiome.dino);
        }

        ctx.restore();
    },


    update: function () {
        if (currentState !== STATE.PLAYING) { this.draw(); return; }

        const wasGrounded = this.grounded;

        if (this.isCharging && this.chargePower < this.maxCharge) {
            this.chargePower += this.chargeRate * timeScale;
        }

        let g = (score < activeBuffs.feather ? 0.4 : this.gravity);
        this.dy += g * timeScale;
        this.y += this.dy * timeScale;

        const floorY = GROUND_Y - this.height;

        if (this.y >= floorY) {
            this.y = floorY;
            this.dy = 0;
            this.grounded = true;
            this.jumpCount = 0;
            if (!wasGrounded) {
                this.landingFrames = 6; spawnDust(this.x + this.width / 2, this.y + this.height, 8);
                if (this.chargePower > 50) shake = 5;
            }
        } else {
            this.grounded = false;
            // Fix: Only break charge if moving upwards significantly
            if (this.dy < -2) {
                this.isCharging = false;
                this.chargePower = 0;
            }
        }

        if (this.landingFrames > 0) {
            this.landingFrames -= timeScale;
            if (this.landingFrames < 0) this.landingFrames = 0;
        }
        this.draw();
    },

    handlePress: function () {
        if (this.isCharging) return;
        if (this.grounded) {
            this.isCharging = true; this.chargePower = 0;
        } else if (this.jumpCount < this.getMaxJumps()) {
            this.dy = -10;
            this.jumpCount++;
            spawnDust(this.x + this.width / 2, this.y + this.height, 5);
        }
    },

handleRelease: function () {
    // 只要当前处于蓄力状态，就让它起跳
    if (this.isCharging) {
        const p = Math.min(this.chargePower, this.maxCharge) / this.maxCharge;
        this.dy = -8 + (-7 * p);
        this.grounded = false;
        this.isCharging = false;
        this.jumpCount = 1;
        this.chargePower = 0;
        spawnDust(this.x + this.width / 2, this.y + this.height, 6);
    }
}

};

// === Logic Tools ===
function spawnDust(x, y, count) { for (let i = 0; i < count; i++) { let p = new Particle(x, y, '#999'); particles.push(p); } }
function spawnExplosion(x, y, color) { for (let i = 0; i < 30; i++) { let p = new Particle(x, y, color); particles.push(p); } shake = 20; }

function spawnManager() {
    const rand = Math.random();
    if (score < 20) {
        if (score >= 5 && rand < 0.6) {
            const rY = Math.random(); let yT = 'mid'; if (rY < 0.33) yT = 'low'; else if (rY > 0.66) yT = 'high';
            obstacles.push(new Obstacle('bird', 0, { yPos: yT }));
        } else {
            if (rand > 0.85) { obstacles.push(new Obstacle('cactus')); obstacles.push(new Obstacle('cactus', 35)); if (Math.random() > 0.5) obstacles.push(new Obstacle('cactus', 70)); } else { obstacles.push(new Obstacle('cactus')); }
        }
    }
    else if (score < 40) {
        if (rand < 0.4) {
            if (Math.random() < 0.5) { obstacles.push(new Obstacle('bird', 0, { yPos: 'high' })); obstacles.push(new Obstacle('bird', 0, { yPos: 'low' })); }
            else { obstacles.push(new Obstacle('bird', 0, { yPos: 'mid' })); obstacles.push(new Obstacle('bird', 60, { yPos: 'mid' })); }
        } else if (rand < 0.7) { obstacles.push(new Obstacle('bird', 0, { yPos: 'mid' })); }
        else { obstacles.push(new Obstacle('cactus')); }
    }
    else if (score < 60) {
        if (rand < 0.3) obstacles.push(new Obstacle('gap'));
        else if (rand < 0.7) obstacles.push(new Obstacle('bird', 0, { yPos: 'mid' }));
        else obstacles.push(new Obstacle('cactus'));
    }
    else {
        if (rand < 0.25) obstacles.push(new Obstacle('speedster'));
        else if (rand < 0.5) obstacles.push(new Obstacle('gap'));
        else if (rand < 0.75) { obstacles.push(new Obstacle('bird', 0, { yPos: 'high' })); obstacles.push(new Obstacle('bird', 40, { yPos: 'low' })); }
        else obstacles.push(new Obstacle('bird', 0, { yPos: 'mid', isHighRisk: true }));
    }
}

// === Card Logic (FIXED) ===
const BUFF_DEFINITIONS = [
    { id: 'shield', name: '护盾', desc: '抵挡一次伤害', color: '#00C851' },
    { id: 'tripleJump', name: '三段跳', desc: '在空中可以跳第二次', color: '#33b5e5' },
    { id: 'mini', name: '缩小', desc: '缩小身形', color: '#aa66cc' },
    { id: 'feather', name: '变轻', desc: '减缓下落速度', color: '#ffbb33' },
    { id: 'greed', name: '贪婪', desc: '双倍得分', color: '#ff4444' }
];

function triggerCardSelect() {
    currentState = STATE.CARD_SELECT; currentCards = []; let pool = [...BUFF_DEFINITIONS];
    for (let i = 0; i < 3; i++) { if (pool.length === 0) break; const idx = Math.floor(Math.random() * pool.length); currentCards.push(pool[idx]); pool.splice(idx, 1); }
}


// 画圆角矩形的工具函数
function drawRoundedRect(ctx, x, y, w, h, r) {
    // r 不能超过宽高的一半
    r = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}



function drawCards() {
    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const cardW = 140, cardH = 160, gap = 20;
    const startX = (LOGICAL_WIDTH - (3 * cardW + 2 * gap)) / 2;
    const startY = (LOGICAL_HEIGHT - cardH) / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px ' + UI_FONT;
    ctx.fillText("选择升级", LOGICAL_WIDTH / 2, startY - 30);

    for (let i = 0; i < currentCards.length; i++) {
        const c = currentCards[i], x = startX + i * (cardW + gap), y = startY;

        // 圆角卡片背景
        ctx.fillStyle = '#fff';
        drawRoundedRect(ctx, x, y, cardW, cardH, 16);
        ctx.fill();

        // 圆角彩色边框
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, x, y, cardW, cardH, 16);
        ctx.stroke();

        ctx.fillStyle = c.color;
        ctx.font = 'bold 20px ' + UI_FONT;
        ctx.fillText(c.name, x + cardW / 2, y + 40);

        ctx.fillStyle = '#555';
        ctx.font = '14px ' + UI_FONT;
        ctx.fillText(c.desc, x + cardW / 2, y + 80);

	// Draw Icon Placeholder（改成圆角方块）
	ctx.fillStyle = c.color;
	// 在卡片底部画一个 30×30 的圆角方块，圆角半径 6
	drawRoundedRect(ctx, x + cardW / 2 - 15, y + 110, 30, 30, 6);
	ctx.fill();

        c.hitbox = { x, y, w: cardW, h: cardH };
    }
    ctx.restore();
}

function applyBuff(id) { if (id === 'shield') activeBuffs.shield = true; else activeBuffs[id] = score + BUFF_DURATION; currentState = STATE.PLAYING; lastBuffScore = score; }

// === Game Loop ===
function start() {
    currentState = STATE.PLAYING; gameSpeed = 6.5; score = 0; lastBuffScore = 0;
    activeBuffs = { shield: false, tripleJump: 0, mini: 0, feather: 0, greed: 0 };
    obstacles.length = 0; particles = []; weatherParticles = [];

    for (let i = 0; i < 30; i++) weatherParticles.push(new WeatherParticle('none', LOGICAL_WIDTH, LOGICAL_HEIGHT));
    dino.y = GROUND_Y - 47;
    dino.dy = 0;
    dino.grounded = true;
    dino.isCharging = false;

    spawnTimer = 0;
    nextSpawnDist = 200;

    clouds.length = 0;
    for (let i = 0; i < 3; i++) { let c = new Cloud(); c.x = Math.random() * LOGICAL_WIDTH; clouds.push(c); }

    messageDiv.style.display = 'none';
    if (animationId) cancelAnimationFrame(animationId);
    lastFrameTime = 0;
    animationId = requestAnimationFrame(animate);
}

function animate(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    timeScale = delta / (1000 / 60);
    if (timeScale < 0.5) timeScale = 0.5;
    if (timeScale > 2.0) timeScale = 2.0;

    animationId = requestAnimationFrame(animate);

    ctx.save();
    if (shake > 0) { let dx = (Math.random() - 0.5) * shake; let dy = (Math.random() - 0.5) * shake; ctx.translate(dx, dy); shake *= 0.9; if (shake < 0.5) shake = 0; }

    const bIdx = Math.min(Math.floor(score / 20), BIOMES.length - 1); currentBiome = BIOMES[bIdx];
    container.style.backgroundColor = currentBiome.bg;
    if (score < 20) gameSpeed = 6.5 + (score / 20); else if (score < 40) gameSpeed = 9; else gameSpeed = 11;

    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.fillStyle = currentBiome.bg; ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.strokeStyle = currentBiome.fg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(LOGICAL_WIDTH, GROUND_Y); ctx.stroke();

    for (let p of weatherParticles) { p.type = currentBiome.particle; if (p.type !== 'none') { p.update(); p.draw(currentBiome.fg); } }

    for (let i = 0; i < particles.length; i++) {
        let p = particles[i]; p.update(); p.draw();
        if (p.life <= 0) { particles.splice(i, 1); i--; }
    }

    if (currentState === STATE.CARD_SELECT) {
        dino.draw(); obstacles.forEach(o => o.draw());
        drawCards();
        ctx.restore(); return;
    }

    if (currentState === STATE.GAME_OVER) {
        dino.draw(); obstacles.forEach(o => o.draw());
        if (particles.length === 0) { ctx.restore(); return; }
    } else {
        if (Math.random() < 0.02 * timeScale) clouds.push(new Cloud());
        for (let i = 0; i < clouds.length; i++) {
            clouds[i].update();
            clouds[i].draw();
            if (clouds[i].x < -150) { clouds.splice(i, 1); i--; }
        }
        if (score > 0 && score % 10 === 0 && score !== lastBuffScore) { triggerCardSelect(); ctx.restore(); return; }

        dino.update();

        spawnTimer += gameSpeed * timeScale;
        if (spawnTimer > nextSpawnDist) {
            spawnManager(); spawnTimer = 0;
            let minGap = 400 + (gameSpeed * 10); let variance = 200; nextSpawnDist = minGap + Math.random() * variance;
        }

        const dSize = dino.getSize();
        const dinoHitbox = { x: dino.x + 5, y: dino.y + (dino.height - dSize.h) + 5, w: dSize.w - 10, h: dSize.h - 10 };

        for (let i = 0; i < obstacles.length; i++) {
            let ob = obstacles[i]; ob.update();
            if (ob.x + ob.width < 0) { obstacles.splice(i, 1); score += (score < activeBuffs.greed ? 2 : 1); i--; }
            let pad = 8;
            if (dinoHitbox.x < ob.x + ob.width - pad && dinoHitbox.x + dinoHitbox.w > ob.x + pad &&
                dinoHitbox.y < ob.y + ob.height - pad && dinoHitbox.y + dinoHitbox.h > ob.y + pad) {
                if (activeBuffs.shield) { activeBuffs.shield = false; spawnExplosion(dino.x, dino.y, '#00ff00'); obstacles.splice(i, 1); i--; }
                else {
                    spawnExplosion(dino.x, dino.y, '#555');
                    currentState = STATE.GAME_OVER;
                    if (window.uploadScore) window.uploadScore(score);
                    if (window.showGameOver) window.showGameOver();
                }
            }
        }
    }

    drawHUD();
    ctx.restore();
}

function drawHUD() {
    // ===== ① 左上角 DOM：得分 / 速度（更新数字） =====
    const scoreDisplay = document.getElementById('scoreDisplay');
    const speedDisplay = document.getElementById('speedDisplay');

    if (scoreDisplay) {
        // 左上角：得分：123
        scoreDisplay.innerText = `得分：${Math.floor(score)}`;
    }
    if (speedDisplay) {
        // 左上角：速度：6.5
        speedDisplay.innerText = `速度：${gameSpeed.toFixed(1)}`;
    }

    // ===== ② 右上角（画在 canvas 上）：得分 / 速度 左对齐 =====
    //ctx.fillStyle = currentBiome.fg;
    //ctx.textAlign = "right";

    //const hudX = 750;  // 可以按你喜好微调
    // 得分
    //ctx.font = "bold 20px Courier New";
    //ctx.fillText(`得分：${Math.floor(score)}`, hudX, 30);
    // 速度
    //ctx.font = "12px Courier New";
    //ctx.fillText(`速度：${gameSpeed.toFixed(1)}`, hudX, 48);

    // ===== 左上角 Buff 图标（圆角） =====
    let iconX = 30;
    const iconY = 30;

    const drawBuffIcon = (isActive, color, label) => {
        if (!isActive) return;

        ctx.save();

        // 背景白底圆角方块
        ctx.fillStyle = 'rgba(255,255,255,1)';
        drawRoundedRect(ctx, iconX - 12, iconY - 12, 24, 24, 6);
        ctx.fill();

        // 彩色边框
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, iconX - 12, iconY - 12, 24, 24, 6);
        ctx.stroke();

        // 中间的文字
        ctx.fillStyle = color;
	ctx.font = '12px ' + UI_FONT;
        ctx.textAlign = "center";
        ctx.fillText(label, iconX, iconY + 4);

        ctx.restore();
        iconX += 30;  // 下一格往右移
    };

    // 护盾：布尔值
    drawBuffIcon(activeBuffs.shield, '#00C851', '盾');
    // 其他 buff：当前分数 < 结束分数 时为激活状态
    drawBuffIcon(score < activeBuffs.tripleJump, '#33b5e5', '跳');   // 三段跳
    drawBuffIcon(score < activeBuffs.mini,        '#aa66cc', '小');   // 迷你
    drawBuffIcon(score < activeBuffs.feather,     '#ffbb33', '轻');   // 轻身
    drawBuffIcon(score < activeBuffs.greed,       '#ff4444', '2x');   // 双倍分

}



// HTML Interface
window.showGameOver = function () {
    messageDiv.style.display = 'block';
    scoreText.innerHTML = `SCORE: ${score}`;
    if (!currentUser) loginBtnOver.style.display = 'block'; else loginBtnOver.style.display = 'none';
};

function handleStart(e) {
    const isTouch = (e.type === 'touchstart');
    const isUiTap =
  e.target.closest('.ui-layer') ||
  e.target.closest('.btn') ||
  e.target.closest('.modal');


    // 点在 UI / 按钮上 —— 直接交给浏览器，让 click 正常触发
    if (isUiTap) return;

    // 只有真正点在游戏区域的触摸才阻止默认行为（防止双指缩放、滑动页面等）
    if (isTouch && e.cancelable) e.preventDefault();

    if (currentState === STATE.CARD_SELECT) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = LOGICAL_WIDTH / rect.width;
        const scaleY = LOGICAL_HEIGHT / rect.height;
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        for (let card of currentCards) {
            if (card.hitbox &&
                x >= card.hitbox.x && x <= card.hitbox.x + card.hitbox.w &&
                y >= card.hitbox.y && y <= card.hitbox.y + card.hitbox.h) {
                applyBuff(card.id);
                return;
            }
        }
        return;
    }

    if (currentState === STATE.GAME_OVER) {
        return;
    }

    dino.handlePress();
}

function handleEnd() { if (currentState === STATE.PLAYING) dino.handleRelease(); }

document.addEventListener('touchstart', handleStart, { passive: false });
document.addEventListener('touchend', handleEnd);
// 有些手机会触发 touchcancel，也当成“松手”处理
document.addEventListener('touchcancel', handleEnd);

document.addEventListener('mousedown', handleStart);
document.addEventListener('mouseup', handleEnd);

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') handleStart(e);
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') handleEnd(e);
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') handleEnd(e); });

start();
