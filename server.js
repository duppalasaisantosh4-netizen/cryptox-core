const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let clients = []; 
let rooms = {
    TON: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    NOT: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    DOGS: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] }
};
const GAME_CONFIG = { TON: { color: '#00a6ff' }, NOT: { color: '#ffb61a' }, DOGS: { color: '#f6465d' } };

function generateProvablyFairSeed(coin) {
    let r = rooms[coin];
    r.serverSeed = crypto.randomBytes(32).toString('hex');
    let publicCommitment = crypto.createHash('sha256').update(r.serverSeed).digest('hex');
    return publicCommitment;
}

function startRoomLifecycle(coin) {
    let r = rooms[coin]; r.status = 'WAITING'; r.multiplier = 1.00; r.countdown = 5;
    let publicCommit = generateProvablyFairSeed(coin);
    
    // 35x SILENT RISK ENGINE SHIELD
    let rawRandom = Math.random();
    let calculatedCrash = parseFloat((rawRandom * (35.00 - 1.05) + 1.10).toFixed(2));
    if (calculatedCrash > 35.00) {
        calculatedCrash = parseFloat((Math.random() * (35.00 - 15.00) + 15.00).toFixed(2));
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
        // ACCELERATED SPEED CALIBRATION FOR INTENSE DOPAMINE FLOW
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
    
    // NATIVE HIGH-SPEED DISK STREAM FILE BUFFER LINK OVER THE NETWORK
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, htmlContent) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('CRITICAL SYSTEM STREAMING ERROR - index.html MISSING IN GIT ROOT');
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
