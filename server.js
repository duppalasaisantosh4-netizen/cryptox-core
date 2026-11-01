const http = require('http');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let clients = []; 
let bonusBalanceSim = 0.00;
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

function sendEvent(data) { 
    const payload = "data: " + JSON.stringify(data) + "\n\n"; 
    clients.forEach(c => c.write(payload)); 
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/stream')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        clients.push(res); req.on('close', () => { clients = clients.filter(c => c !== res); }); return;
    }
    if (req.url.startsWith('/credit-tap')) {
        bonusBalanceSim = parseFloat((bonusBalanceSim + 0.01).toFixed(2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ newBonus: bonusBalanceSim })); return;
    }
    if (req.url.startsWith('/place-bet') || req.url.startsWith('/cashout')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'SUCCESS', winAmount: 0.15 })); return;
    }
    
    // NATIVE HIGH-SPEED DISK STREAM FILE BUFFER LINK OVER THE NETWORK
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, htmlContent) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('CRITICAL SYSTEM STREAMING ERROR');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlContent);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🔥 CRYPTO X VAULT ENGINE OPERATIONAL ON PORT ' + PORT);
    startRoomLifecycle('BTC'); startRoomLifecycle('ETH'); startRoomLifecycle('TON');
});
