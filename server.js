const http = require('http');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const FRONTEND_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto X - Premium Master Terminal</title>
    <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body {
            background-color: #05070a; color: #ffffff;
            margin: 0; padding: 10px; display: flex; justify-content: center; align-items: center; min-height: 100vh;
            background: radial-gradient(circle at top right, #111722, #05070a);
        }
        .phone-frame {
            width: 100%; max-width: 410px; height: 830px; background: #090c13;
            border-radius: 40px; border: 4px solid #1a2233; box-shadow: 0 30px 60px rgba(0,0,0,0.8);
            overflow: hidden; display: flex; flex-direction: column; position: relative;
        }
        .phone-header {
            background: #0f131c; padding: 16px 20px; border-bottom: 1px solid #161e2e;
            display: flex; justify-content: space-between; align-items: center;
        }
        .logo-text { font-weight: 900; font-size: 15px; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; }
        .phone-body { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .utility-row { display: flex; justify-content: space-between; width: 100%; gap: 6px; }
        .util-btn {
            background: #111520; border: 1px solid #1f2738; border-radius: 10px; padding: 8px 12px;
            font-size: 11px; font-weight: 700; color: #8493a8; cursor: pointer; text-transform: uppercase;
        }
        .hud-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
        .hud-card {
            background: linear-gradient(135deg, #111520, #0c0f17); border: 1px solid #1f2738;
            border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
        }
        .stat-label { font-size: 11px; color: #6e7c91; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-value { font-size: 18px; font-weight: 800; font-family: monospace; }
        .page { display: none; width: 100%; flex-direction: column; gap: 14px; }
        .active-page { display: flex; }
        .faucet-luxury-box {
            background: linear-gradient(180deg, #101520, #080b12); border: 1px solid #1f2738;
            border-radius: 28px; padding: 26px 16px; text-align: center;
        }
        #node-core {
            width: 130px; height: 130px; border-radius: 65px; background: radial-gradient(circle, #ffb61a, #ea8c00);
            margin: 30px auto; display: flex; align-items: center; justify-content: center;
            font-size: 56px; font-weight: 900; cursor: pointer; box-shadow: 0 0 40px rgba(234,140,0,0.35);
            user-select: none; transition: transform 0.05s ease; position: relative;
        }
        #node-core:active { transform: scale(0.92); }
        .float-coin {
            position: absolute; color: #ffb61a; font-weight: 900; font-size: 26px;
            animation: floatUp 0.5s ease-out forwards; pointer-events: none;
        }
        @keyframes floatUp {
            0% { opacity: 1; transform: translateY(0) scale(0.8); }
            100% { opacity: 0; transform: translateY(-85px) scale(1.4); }
        }
        .chart-luxury-card {
            background: #0f131c; border: 1px solid #1a2233; border-radius: 20px; padding: 14px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .asset-info-bar { display: flex; justify-content: space-between; align-items: center; }
        .asset-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .asset-value { font-family: monospace; font-size: 24px; font-weight: 900; }
        .canvas-frame { width: 100%; height: 95px; background: #05070a; border-radius: 14px; display: block; border: 1px solid #141b26; }
        .control-row { display: flex; gap: 8px; align-items: center; }
        .input-wrapper { position: relative; width: 35%; }
        .input-wrapper::before { content: '$'; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #48546a; font-weight: 700; font-size: 13px; }
        .bet-box {
            width: 100%; background: #131822; color: white; border: 1px solid #1f2738; padding: 12px 10px 12px 22px;
            font-size: 14px; font-weight: 800; border-radius: 12px; outline: none; font-family: monospace;
        }
        .act-btn {
            flex: 1; border: none; padding: 14px; font-size: 12px; font-weight: 800;
            border-radius: 12px; cursor: pointer; color: white; background: #161d29; border: 1px solid #27344a; text-transform: uppercase;
        }
        .nav-btn {
            width: 100%; border: none; padding: 16px; border-radius: 16px; font-weight: 800; font-size: 13px;
            color: white; background: linear-gradient(90deg, #00b06c, #008be3); cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,140,227,0.25); text-transform: uppercase; letter-spacing: 0.5px;
        }
        #ad-lightbox {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(5,7,10,0.95);
            z-index: 100; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center;
        }
        .spinner { width: 50px; height: 50px; border: 5px solid #1a2233; border-top: 5px solid #ffb61a; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
<div class="phone-frame">
    <div id="ad-lightbox">
        <div class="spinner"></div>
        <div style="font-size: 18px; font-weight: 900; color: #ffb61a; text-transform: uppercase;">ADSGRAM VIDEO ACTIVE</div>
        <div style="font-size: 13px; color: #8493a8; margin-top: 10px;" id="ad-status-text">Streaming Ad Bundle 1/3...</div>
    </div>
    <div class="phone-header">
        <span class="logo-text" id="app-logo-text">CRYPTO X CORE</span>
        <div style="width: 8px; height: 8px; background: #02c076; border-radius: 4px; box-shadow: 0 0 8px #02c076;"></div>
    </div>
    <div class="phone-body">
        <div class="utility-row" id="util-bar">
            <button class="util-btn">REFER & EARN 🔗</button>
            <button class="util-btn">HELP & SUPPORT ❓</button>
            <button class="util-btn">ABOUT ℹ️</button>
        </div>
        <div class="hud-grid">
            <div class="hud-card">
                <span class="stat-label">💵 VAULT WALLET</span>
                <span class="stat-value" style="color: #02c076;">$<span id="deposit-display">0.00</span></span>
            </div>
            <div class="hud-card">
                <span class="stat-label">🎁 BONUS MARGIN</span>
                <span class="stat-value" style="color: #ffb61a;"><span id="bonus-display">0.00</span> CHIPS</span>
            </div>
        </div>
        <div id="page-1" class="page active-page">
            <div class="faucet-luxury-box">
                <span class="stat-label" style="font-size:11px; letter-spacing:1px; color:#8493a8;">Sovereign Mining Faucet</span>
                <div style="font-size: 21px; font-weight: 900; margin-top: 8px; color: #ffffff;" id="cycle-text">PROGRESS: 0 / 300 TAPS</div>
                <div id="node-core">X</div>
                <p style="font-size: 12px; color: #536278; margin: 0; line-height: 1.6;">
                    Within 1 minute of 10 taps and a short video bundle, you will earn your first real wager!
                </p>
            </div>
            <button class="nav-btn" onclick="switchPage(2)">Open Execution HUD 🚀</button>
        </div>
        <div id="page-2" class="page">
            <div class="chart-luxury-card" id="card-BTC">
                <div class="asset-info-bar">
                    <span class="asset-badge" style="background: rgba(247,147,26,0.12); color: #F7931A;">Bitcoin Row</span>
                    <span class="asset-value" id="val-BTC" style="color: #F7931A;">--</span>
                </div>
                <canvas class="canvas-frame" id="canvas-BTC" width="370" height="95"></canvas>
                <div class="control-row">
                    <div class="input-wrapper"><input type="number" id="input-BTC" class="bet-box" value="0.10" min="0.01" max="1.00" step="0.01"></div>
                    <button id="btn-BTC" class="act-btn">OPEN BTC POSITION</button>
                </div>
            </div>
            <div class="chart-luxury-card" id="card-ETH">
                <div class="asset-info-bar">
                    <span class="asset-badge" style="background: rgba(160,118,255,0.12); color: #a076ff;">Ethereum Row</span>
                    <span class="asset-value" id="val-ETH" style="color: #a076ff;">--</span>
                </div>
                <canvas class="canvas-frame" id="canvas-ETH" width="370" height="95"></canvas>
                <div class="control-row">
                    <div class="input-wrapper"><input type="number" id="input-ETH" class="bet-box" value="0.10" min="0.01" max="1.00" step="0.01"></div>
                    <button id="btn-ETH" class="act-btn">OPEN ETH POSITION</button>
                </div>
            </div>
                        <div class="chart-luxury-card" id="card-TON">
                <div class="asset-info-bar">
                    <span class="asset-badge" style="background: rgba(0,166,255,0.12); color: #00a6ff;">Toncoin Engine</span>
                    <span class="asset-value" id="val-TON" style="color: #00a6ff;">--</span>
                </div>
                <canvas class="canvas-frame" id="canvas-TON" width="370" height="95"></canvas>
                <div class="control-row">
                    <div class="input-wrapper"><input type="number" id="input-TON" class="bet-box" value="0.10" min="0.01" max="1.00" step="0.01"></div>
                    <button id="btn-TON" class="act-btn">OPEN TON POSITION</button>
                </div>
            </div>
            <button class="nav-btn" style="background: #101520; color: #8493a8; border: 1px solid #1f2738;" onclick="switchPage(1)">◀ Back to Faucet Node</button>
        </div>
    </div>
</div>
<script>
    const eventSource = new EventSource('/stream');
    let depositBal = 0.00; let bonusBal = 0.00;
    let tapCount = 0; let totalClicks = 0;
    let roomStates = { BTC: { hasBet: false, amt: 0, pts: [] }, ETH: { hasBet: false, amt: 0, pts: [] }, TON: { hasBet: false, amt: 0, pts: [] } };

    function switchPage(num) {
        document.getElementById('page-1').classList.toggle('active-page', num === 1);
        document.getElementById('page-2').classList.toggle('active-page', num === 2);
        document.getElementById('util-bar').style.display = (num === 1) ? 'flex' : 'none';
    }

    const nodeCore = document.getElementById('node-core');
    nodeCore.onclick = (e) => {
        if (totalClicks >= 300) return;
        tapCount++; totalClicks++;
        document.getElementById('cycle-text').innerText = 'PROGRESS: ' + totalClicks + ' / 300';
        
        const floatItem = document.createElement('div');
        floatItem.className = 'float-coin'; floatItem.innerText = '+💎';
        floatItem.style.left = (e.offsetX + 40) + 'px'; floatItem.style.top = (e.offsetY + 35) + 'px';
        nodeCore.appendChild(floatItem);
        setTimeout(function() { floatItem.remove(); }, 500);

        if (tapCount >= 10) {
            tapCount = 0;
            triggerMockAdChain();
        }
    };

    function triggerMockAdChain() {
        const lightbox = document.getElementById('ad-lightbox');
        const statusText = document.getElementById('ad-status-text');
        lightbox.style.display = 'flex';
        
        let currentVideo = 1;
        statusText.innerText = 'Streaming Ad Bundle ' + currentVideo + '/3...';
        
        let interval = setInterval(() => {
            currentVideo++;
            if (currentVideo <= 3) {
                statusText.innerText = 'Streaming Ad Bundle ' + currentVideo + '/3...';
            } else {
                clearInterval(interval);
                lightbox.style.display = 'none';
                if(totalClicks >= 300) document.getElementById('cycle-text').innerText = '🔒 FAUCET DRY (300/300)';
                fetch('/credit-tap').then(r => r.json()).then(data => {
                    bonusBal = data.newBonus; document.getElementById('bonus-display').innerText = bonusBal;
                });
            }
        }, 1000);
    }

    function drawCurve(coin, multiplier, color) {
        const canvas = document.getElementById('canvas-' + coin); if(!canvas) return;
        const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = '#121724'; ctx.lineWidth = 1;
        for(let i=30; i<canvas.width; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
        let state = roomStates[coin]; if(multiplier <= 1.00) { state.pts = []; return; }
        let x = Math.min((multiplier - 1.00) * 55 + 20, canvas.width - 20);
        let y = canvas.height - Math.min((multiplier - 1.00) * 16 + 15, canvas.height - 15);
        state.pts.push({x: x, y: y});
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 3;
        for(let i=0; i<state.pts.length; i++) { if(i===0) ctx.moveTo(state.pts[i].x, state.pts[i].y); else ctx.lineTo(state.pts[i].x, state.pts[i].y); }
        ctx.stroke();
    }

    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        let coin = data.asset; if(!roomStates[coin]) return;
        const valText = document.getElementById('val-' + coin);
        const btn = document.getElementById('btn-' + coin);
        const input = document.getElementById('input-' + coin);

        switch(data.type) {
            case 'COUNTDOWN':
                valText.innerText = data.seconds + 's'; valText.style.color = '#ffb61a';
                if(!roomStates[coin].hasBet) {
                    btn.innerText = 'OPEN ' + coin + ' POSITION'; btn.style.background = 'linear-gradient(90deg, #ffb61a, #ea8c00)';
                    btn.disabled = false; input.disabled = false;
                }
                break;
            case 'TAKEOFF':
                input.disabled = true;
                if(roomStates[coin].hasBet) { btn.innerText = 'CASH OUT MARGIN'; btn.style.background = '#02c076'; btn.disabled = false; }
                else { btn.innerText = 'SPECTATING ENGINE'; btn.style.background = '#131824'; btn.disabled = true; }
                break;
            case 'TICK':
                valText.innerText = data.multiplier.toFixed(2) + 'x'; valText.style.color = '#02c076';
                drawCurve(coin, data.multiplier, data.color);
                break;
            case 'GAME_LIQUIDATED':
                valText.innerText = data.finalMultiplier.toFixed(2) + 'x'; valText.style.color = '#f6465d';
                btn.innerText = 'CRASHED LIQUIDATION'; btn.style.background = '#111520'; btn.disabled = true;
                roomStates[coin].hasBet = false;
                break;
        }
    };

    ['BTC', 'ETH', 'TON'].forEach(function(coin) {
        const btn = document.getElementById('btn-' + coin);
        const input = document.getElementById('input-' + coin);
        btn.onclick = function() {
            if(btn.innerText.includes('OPEN')) {
                let amt = parseFloat(input.value); if(amt > bonusBal || amt <= 0) return;
                bonusBal = (bonusBal - amt).toFixed(2); document.getElementById('bonus-display').innerText = bonusBal;
                roomStates[coin].hasBet = true; roomStates[coin].amt = amt;
                fetch('/place-bet?asset=${coin}&amount=${amt}');
                btn.innerText = 'ORDER RUNNING'; btn.style.background = '#111520'; btn.disabled = true;
            } else if(btn.innerText.includes('CASH')) {
                fetch('/cashout?asset=${coin}').then(r => r.json()).then(res => {
                    if(res.status === 'SUCCESS') {
                        depositBal = (parseFloat(depositBal) + res.winAmount).toFixed(2);
                        document.getElementById('deposit-display').innerText = depositBal;
                        btn.innerText = 'FILLED +' + res.winAmount + ' 🏆'; btn.style.background = '#111520'; btn.disabled = true;
                    }
                });
            }
        };
    });
</script>
</body>
</html>
\`;

let clients = []; let bonusBalanceSim = 0.00;
let rooms = {
    BTC: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0 },
    ETH: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0 },
    TON: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0 }
};
const GAME_CONFIG = { BTC: { color: '#ff9900' }, ETH: { color: '#a076ff' }, TON: { color: '#00a6ff' } };

function startRoomLifecycle(coin) {
    let r = rooms[coin]; r.status = 'WAITING'; r.multiplier = 1.00; r.countdown = 5;
    r.crashPoint = parseFloat((Math.random() * (35.00 - 1.10) + 1.10).toFixed(2));
    function tick() {
        if (r.status !== 'WAITING') return;
        if (r.countdown > 0) { sendEvent({ type: 'COUNTDOWN', asset: coin, seconds: r.countdown }); r.countdown--; setTimeout(tick, 1000); }
        else { r.status = 'PROGRESS'; sendEvent({ type: 'TAKEOFF', asset: coin }); executeFlight(coin); }
    }
    tick();
}

function executeFlight(coin) {
    let r = rooms[coin]; if (r.status !== 'PROGRESS') return;
    if (r.multiplier >= r.crashPoint) {
        r.status = 'CRASHED'; sendEvent({ type: 'GAME_LIQUIDATED', asset: coin, finalMultiplier: r.multiplier }); setTimeout(() => startRoomLifecycle(coin), 3000);
    } else {
        r.multiplier = parseFloat((r.multiplier + 0.015).toFixed(3));
        sendEvent({ type: 'TICK', asset: coin, multiplier: r.multiplier, color: GAME_CONFIG[coin].color }); setTimeout(() => executeFlight(coin), 45);
    }
}

function sendEvent(data) { const payload = `data: ${JSON.stringify(data)}\n\n`; clients.forEach(c => c.write(payload)); }

const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    if (urlObj.pathname === '/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        clients.push(res); req.on('close', () => { clients = clients.filter(c => c !== res); }); return;
    }
    if (urlObj.pathname === '/credit-tap') {
        bonusBalanceSim = parseFloat((bonusBalanceSim + 0.01).toFixed(2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ newBonus: bonusBalanceSim })); return;
    }
    if (urlObj.pathname === '/place-bet' || urlObj.pathname === '/cashout') {
        let coin = urlObj.searchParams.get('asset');
        let win = parseFloat((0.10 * rooms[coin].multiplier).toFixed(2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'SUCCESS', winAmount: win })); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(FRONTEND_HTML);
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🔥 CRYPTO X VAULT ENGINE OPERATIONAL ON PORT ' + PORT);
    startRoomLifecycle('BTC');
    startRoomLifecycle('ETH');
    startRoomLifecycle('TON');
});



            
