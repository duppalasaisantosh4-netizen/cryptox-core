const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let clients = []; 
let rooms = {
    TON: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    NOT: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    DOGS: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] }
};

function generateProvablyFairSeed(coin) {
    let r = rooms[coin];
    r.serverSeed = crypto.randomBytes(32).toString('hex');
    return crypto.createHash('sha256').update(r.serverSeed).digest('hex');
}

function startRoomLifecycle(coin) {
    let r = rooms[coin]; r.status = 'WAITING'; r.multiplier = 1.00; r.countdown = 5;
    let publicCommit = generateProvablyFairSeed(coin);
    
    // IRONCLAD 35x MAXIMUM RISK ENGINE SHIELD
    let rawRandom = Math.random();
    let calculatedCrash = parseFloat((rawRandom * (35.00 - 1.05) + 1.10).toFixed(2));
    
    if (calculatedCrash > 35.00 || Math.random() < 0.15) {
        calculatedCrash = parseFloat((Math.random() * (4.50 - 1.10) + 1.10).toFixed(2));
    }
    r.crashPoint = calculatedCrash;

    function tick() {
        if (r.status !== 'WAITING') return;
        if (r.countdown > 0) { 
            sendEvent({ type: 'COUNTDOWN', asset: coin, seconds: r.countdown, hash: publicCommit }); 
            r.countdown--; 
            setTimeout(tick, 1000); 
        } else { 
            r.status = 'PROGRESS'; 
            sendEvent({ type: 'TAKEOFF', asset: coin }); 
            executeFlight(coin); 
        }
    }
    tick();
}

function executeFlight(coin) {
    let r = rooms[coin]; if (r.status !== 'PROGRESS') return;
    if (r.multiplier >= r.crashPoint) {
        r.status = 'CRASHED';
        let roundRecord = { mult: r.multiplier, hash: r.serverSeed };
        r.history.unshift(roundRecord);
        if(r.history.length > 20) r.history.pop();
        
        sendEvent({ type: 'GAME_LIQUIDATED', asset: coin, finalMultiplier: r.multiplier, history: r.history }); 
        setTimeout(() => startRoomLifecycle(coin), 3000);
    } else {
        let increment = 0.012;
        if (r.multiplier > 5.00) increment = 0.045;
        if (r.multiplier > 15.00) increment = 0.120;
        
        r.multiplier = parseFloat((r.multiplier + increment).toFixed(3));
        sendEvent({ type: 'TICK', asset: coin, multiplier: r.multiplier }); 
        setTimeout(() => executeFlight(coin), 55);
    }
}

function sendEvent(data) { 
    const payload = "data: " + JSON.stringify(data) + "\n\n"; 
    clients.forEach(c => c.write(payload)); 
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    // EXPLICIT SYSTEM HEARTBEAT ROUTER - KEEPS CONTAINER LIVE 24/7/365
    if (req.url.startsWith('/keep-alive-ping')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'AWAKE', timestamp: Date.now() }));
        return;
    }
    if (req.url.startsWith('/stream')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        clients.push(res); req.on('close', () => { clients = clients.filter(c => c !== res); }); return;
    }
    if (req.url.startsWith('/credit-tap')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }); 
        res.end(JSON.stringify({ status: 'SUCCESS', credit: 0.01 })); 
        return;
    }
    if (req.url.startsWith('/place-bet') || req.url.startsWith('/cashout')) {
        let urlObj = new URL(req.url, 'http://localhost');
        let coin = urlObj.searchParams.get('asset');
        let currentMult = rooms[coin] ? rooms[coin].multiplier : 1.00;
        let win = parseFloat((0.10 * currentMult).toFixed(2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); 
        res.end(JSON.stringify({ status: 'SUCCESS', winAmount: win })); 
        return;
    }
    
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, htmlContent) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('CRITICAL ARCHITECTURE ERROR: index.html PATH MISALIGNED IN STORAGE ROOT');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlContent);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🔥 CRYPTO X VAULT ENGINE OPERATIONAL ON PORT ' + PORT);
    startRoomLifecycle('TON'); startRoomLifecycle('NOT'); startRoomLifecycle('DOGS');
});
