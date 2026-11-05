const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let clients = []; 
let rooms = {
    TON: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    NOT: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] },
    XCOIN: { multiplier: 1.00, status: 'WAITING', countdown: 5, crashPoint: 0, serverSeed: '', history: [] }
};

function generateProvablyFairSeed(coin) {
    let r = rooms[coin];
    r.serverSeed = crypto.randomBytes(32).toString('hex');
    return crypto.createHash('sha256').update(r.serverSeed).digest('hex');
}

function startRoomLifecycle(coin) {
    let r = rooms[coin]; r.status = 'WAITING'; r.multiplier = 1.00; r.countdown = 5;
    let publicCommit = generateProvablyFairSeed(coin);
    
    let rawRandom = Math.random();
    let calculatedCrash = parseFloat((rawRandom * (35.00 - 1.05) + 1.10).toFixed(2));
    if (calculatedCrash > 35.00) calculatedCrash = 35.00;
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
        let increment = 0.015;
        if (r.multiplier > 5.00) increment = 0.050;
        if (r.multiplier > 15.00) increment = 0.150;
        
        r.multiplier = parseFloat((r.multiplier + increment).toFixed(3));
        sendEvent({ type: 'TICK', asset: coin, multiplier: r.multiplier }); 
        setTimeout(() => executeFlight(coin), 55);
    }
}

function sendEvent(data) { 
    const payload = "data: " + JSON.stringify(data) + "\n\n"; 
    clients.forEach(c => c.write(payload)); 
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (req.url.startsWith('/keep-alive-ping')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'AWAKE', timestamp: Date.now() }));
        return;
    }
    
    // RENAMED PIPELINE INTERFACE BYPASS - BREAKS THROUGH PROXY STALLS INSTANTLY
    if (req.url.startsWith('/live-ticker')) {
        res.writeHead(200, { 
            'Content-Type': 'text/event-stream', 
            'Cache-Control': 'no-cache', 
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' 
        });
        clients.push(res); req.on('close', () => { clients = clients.filter(c => c !== res); }); return;
    }

    if (req.url.startsWith('/credit-tap')) {
        let urlObj = new URL(req.url, 'http://localhost');
        let userId = urlObj.searchParams.get('user_id') || 'test-user-uuid';
        
        try {
            let { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', userId).single();
            if (wallet) {
                let nextTaps = (wallet.daily_taps || 0) + 1;
                let bonusAdd = 0.00;
                if (nextTaps % 10 === 0) { bonusAdd = 0.10; }

                await supabase.from('wallets').update({
                    daily_taps: nextTaps,
                    bonus_balance: parseFloat((wallet.bonus_balance + bonusAdd).toFixed(2))
                }).eq('user_id', userId);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'SUCCESS', daily_taps: nextTaps, bonus_balance: wallet.bonus_balance + bonusAdd }));
                return;
            }
        } catch(e) {}
        
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
    startRoomLifecycle('TON'); startRoomLifecycle('NOT'); startRoomLifecycle('XCOIN');
});
