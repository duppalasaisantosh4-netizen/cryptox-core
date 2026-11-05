'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEPOSIT_URL = process.env.DEPOSIT_URL || '';
const WITHDRAW_URL = process.env.WITHDRAW_URL || '';

const ROOM_IDS = ['TON', 'NOT', 'XCOIN'];
const ROOM_START_OFFSETS_MS = { TON: 0, NOT: 2000, XCOIN: 4000 };
const MAX_MULTIPLIER = 35;
const GROWTH_RATE_PER_MS = 0.00012;
const WAITING_MS = 6000;
const CRASHED_MS = 3000;
const TICK_MS = 100;
const HISTORY_LIMIT = 24;
const SEED_CHAIN_LENGTH = 10000;
const INSTANT_BUST_MODULUS = 33;
const DAILY_TAP_LIMIT = 300;
const TAPS_PER_REWARD = 10;
const TAP_REWARD = 0.1;
const MIN_MARGIN = 0.1;
const MAX_MARGIN = 1000;
const TAP_RATE_WINDOW_MS = 1000;
const TAP_RATE_MAX = 25;
const INIT_DATA_MAX_AGE_S = 86400;
const SSE_MAX_BUFFER_BYTES = 1024 * 1024;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const INDEX_PATH = path.join(__dirname, 'index.html');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000',
};

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    console.log('[supabase] client initialised');
  } catch (err) {
    supabase = null;
    console.error('[supabase] client initialisation failed:', err.message);
  }
} else {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY not set - wallet routes will respond 503');
}

if (!TELEGRAM_BOT_TOKEN) {
  console.warn('[telegram] TELEGRAM_BOT_TOKEN not set - user_id query parameters are trusted without initData verification');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function crashPointFromHash(hashHex) {
  const h = Number.parseInt(hashHex.slice(0, 13), 16);
  const e = 2 ** 52;
  if (h % INSTANT_BUST_MODULUS === 0) return 1;
  const raw = Math.floor((100 * e - h) / (e - h)) / 100;
  return Math.min(Math.max(raw, 1), MAX_MULTIPLIER);
}

function multiplierAt(elapsedMs) {
  return Math.floor(Math.exp(GROWTH_RATE_PER_MS * Math.max(0, elapsedMs)) * 100) / 100;
}

function buildSeedChain(length) {
  const chain = new Array(length);
  let seed = crypto.randomBytes(32).toString('hex');
  for (let i = 0; i < length; i += 1) {
    chain[i] = seed;
    seed = sha256(seed);
  }
  return chain;
}

function refreshSeedChain(room) {
  room.chain = buildSeedChain(SEED_CHAIN_LENGTH);
  room.chainIndex = room.chain.length - 1;
  room.terminalHash = sha256(room.chain[room.chain.length - 1]);
  console.log(`[engine] ${room.id} seed chain ready - terminal hash ${room.terminalHash}`);
}

function startRound(room, now) {
  if (room.chainIndex < 0) refreshSeedChain(room);
  room.serverSeed = room.chain[room.chainIndex];
  room.chainIndex -= 1;
  room.nonce += 1;
  room.serverSeedHash = sha256(room.serverSeed);
  room.roundHash = hmacSha256(room.serverSeed, `${room.clientSeed}:${room.nonce}`);
  room.crashPoint = crashPointFromHash(room.roundHash);
  room.state = 'waiting';
  room.phaseStartedAt = now;
  room.multiplier = 1;
  room.bets = new Map();
}

function createRoom(id, now) {
  const room = {
    id,
    clientSeed: sha256(`${id}:${crypto.randomBytes(16).toString('hex')}`).slice(0, 32),
    chain: [],
    chainIndex: -1,
    terminalHash: '',
    nonce: 0,
    state: 'waiting',
    phaseStartedAt: now,
    serverSeed: '',
    serverSeedHash: '',
    roundHash: '',
    crashPoint: 1,
    multiplier: 1,
    history: [],
    bets: new Map(),
  };
  refreshSeedChain(room);
  startRound(room, now - (ROOM_START_OFFSETS_MS[id] || 0));
  return room;
}

const rooms = new Map();
{
  const now = Date.now();
  for (const id of ROOM_IDS) rooms.set(id, createRoom(id, now));
}

function crashRoom(room, now) {
  room.state = 'crashed';
  room.multiplier = room.crashPoint;
  room.phaseStartedAt = now;

  const record = {
    room: room.id,
    roundId: room.nonce,
    nonce: room.nonce,
    crashPoint: room.crashPoint,
    serverSeed: room.serverSeed,
    serverSeedHash: room.serverSeedHash,
    clientSeed: room.clientSeed,
    hash: room.roundHash,
    endedAt: now,
  };
  room.history.unshift(record);
  if (room.history.length > HISTORY_LIMIT) room.history.length = HISTORY_LIMIT;

  let liquidated = 0;
  for (const bet of room.bets.values()) {
    if (bet.confirmed && !bet.cashedOut) liquidated += 1;
  }
  if (room.bets.size > 0) {
    console.log(`[engine] ${room.id} #${room.nonce} crashed @ ${room.crashPoint.toFixed(2)}x - ${liquidated}/${room.bets.size} margins liquidated`);
  }

  broadcast('history', { room: room.id, history: room.history });
}

function advanceRoom(room, now) {
  const elapsed = now - room.phaseStartedAt;

  if (room.state === 'waiting') {
    if (elapsed >= WAITING_MS) {
      room.state = 'running';
      room.phaseStartedAt = now;
      room.multiplier = 1;
    }
    return;
  }

  if (room.state === 'running') {
    const current = multiplierAt(elapsed);
    if (current >= room.crashPoint) {
      crashRoom(room, now);
    } else {
      room.multiplier = current;
    }
    return;
  }

  if (room.state === 'crashed' && elapsed >= CRASHED_MS) {
    startRound(room, now);
  }
}

function publicRoomState(room, now) {
  const elapsed = now - room.phaseStartedAt;
  return {
    id: room.id,
    state: room.state,
    multiplier: room.multiplier,
    crashPoint: room.state === 'crashed' ? room.crashPoint : null,
    roundId: room.nonce,
    serverSeedHash: room.serverSeedHash,
    clientSeed: room.clientSeed,
    elapsed,
    countdown: room.state === 'waiting' ? Math.max(0, WAITING_MS - elapsed) : 0,
    players: room.bets.size,
  };
}

const sseClients = new Set();

function sseFrame(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function broadcast(event, payload) {
  if (sseClients.size === 0) return;
  const frame = sseFrame(event, payload);
  for (const res of sseClients) {
    if (res.writableEnded || res.destroyed) {
      sseClients.delete(res);
      continue;
    }
    if (res.writableLength > SSE_MAX_BUFFER_BYTES) {
      sseClients.delete(res);
      res.destroy();
      continue;
    }
    res.write(frame);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) advanceRoom(room, now);
  if (sseClients.size > 0) {
    broadcast('tick', { t: now, rooms: Array.from(rooms.values(), (room) => publicRoomState(room, now)) });
  }
}, TICK_MS);

function helloPayload() {
  const now = Date.now();
  const histories = {};
  const terminalHashes = {};
  for (const room of rooms.values()) {
    histories[room.id] = room.history;
    terminalHashes[room.id] = room.terminalHash;
  }
  return {
    t: now,
    config: {
      maxMultiplier: MAX_MULTIPLIER,
      growthRate: GROWTH_RATE_PER_MS,
      waitingMs: WAITING_MS,
      crashedMs: CRASHED_MS,
      tickMs: TICK_MS,
      dailyTapLimit: DAILY_TAP_LIMIT,
      tapsPerReward: TAPS_PER_REWARD,
      tapReward: TAP_REWARD,
      instantBustModulus: INSTANT_BUST_MODULUS,
      minMargin: MIN_MARGIN,
      maxMargin: MAX_MARGIN,
      walletEnabled: Boolean(supabase),
      depositUrl: DEPOSIT_URL,
      withdrawUrl: WITHDRAW_URL,
    },
    rooms: Array.from(rooms.values(), (room) => publicRoomState(room, now)),
    histories,
    terminalHashes,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(payload);
}

function requireMethod(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { ok: false, error: `Method ${req.method} not allowed` });
  return false;
}

function requireSupabase(res) {
  if (supabase) return true;
  sendJson(res, 503, { ok: false, error: 'Wallet service is not configured', code: 'WALLET_OFFLINE' });
  return false;
}

function verifyTelegramInitData(initData) {
  if (!initData) return { ok: false };
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return { ok: false };
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const receivedBuffer = Buffer.from(receivedHash.toLowerCase(), 'hex');
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return { ok: false };
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) return { ok: false };

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (err) {
    return { ok: false };
  }
  if (!user || !user.id) return { ok: false };
  return { ok: true, userId: String(user.id) };
}

function resolveUserId(req, url) {
  const requested = (url.searchParams.get('user_id') || '').trim();

  if (TELEGRAM_BOT_TOKEN) {
    const verification = verifyTelegramInitData(String(req.headers['x-telegram-init-data'] || ''));
    if (!verification.ok) return { status: 401, error: 'Telegram authentication failed' };
    if (requested && requested !== verification.userId) {
      return { status: 403, error: 'user_id does not match the Telegram session' };
    }
    return { userId: verification.userId };
  }

  if (!USER_ID_PATTERN.test(requested)) return { status: 400, error: 'Missing or invalid user_id' };
  return { userId: requested };
}

async function callRpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const rpcError = new Error(error.message || `RPC ${fn} failed`);
    rpcError.code = error.code;
    throw rpcError;
  }
  return data;
}

function normalizeWallet(data) {
  return {
    user_id: data.user_id,
    deposit_balance: Number(data.deposit_balance) || 0,
    bonus_balance: Number(data.bonus_balance) || 0,
    daily_taps: Number(data.daily_taps) || 0,
  };
}

const tapBuckets = new Map();

function allowTap(userId, now) {
  const bucket = tapBuckets.get(userId);
  if (!bucket || now - bucket.windowStart >= TAP_RATE_WINDOW_MS) {
    tapBuckets.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (bucket.count >= TAP_RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, bucket] of tapBuckets) {
    if (now - bucket.windowStart > 60000) tapBuckets.delete(userId);
  }
}, 60000).unref();

function userBets(userId) {
  const bets = {};
  for (const room of rooms.values()) {
    const bet = room.bets.get(userId);
    if (!bet) continue;
    bets[room.id] = {
      roundId: room.nonce,
      amount: bet.amount,
      source: bet.source,
      confirmed: bet.confirmed,
      cashedOut: bet.cashedOut,
      cashoutMultiplier: bet.cashoutMultiplier,
      payout: bet.payout,
    };
  }
  return bets;
}

let indexCache = null;
try {
  indexCache = fs.readFileSync(INDEX_PATH);
} catch (err) {
  console.error('[http] index.html could not be read at boot:', err.message);
}

function serveIndex(req, res) {
  if (!requireMethod(req, res, ['GET', 'HEAD'])) return;
  const send = (buffer) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : buffer);
  };
  if (indexCache) return send(indexCache);
  fs.readFile(INDEX_PATH, (err, buffer) => {
    if (err) return sendJson(res, 500, { ok: false, error: 'index.html is missing' });
    indexCache = buffer;
    send(buffer);
  });
}

function handleLiveTicker(req, res) {
  if (!requireMethod(req, res, ['GET'])) return;

  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true, 30000);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  res.write(`:${' '.repeat(2048)}\n\n`);
  res.write('retry: 2000\n\n');
  res.write(sseFrame('hello', helloPayload()));

  sseClients.add(res);

  const cleanup = () => {
    sseClients.delete(res);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

async function handleCreditTap(req, res, url) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  if (!requireSupabase(res)) return;
  const identity = resolveUserId(req, url);
  if (identity.error) return sendJson(res, identity.status, { ok: false, error: identity.error });

  if (!allowTap(identity.userId, Date.now())) {
    return sendJson(res, 429, { ok: false, error: 'Tapping too fast', code: 'RATE_LIMITED' });
  }

  try {
    const data = await callRpc('credit_tap', { p_user_id: identity.userId });
    return sendJson(res, 200, {
      ok: true,
      wallet: normalizeWallet(data),
      credited: Boolean(data.credited),
      limit_reached: Boolean(data.limit_reached),
      daily_limit: DAILY_TAP_LIMIT,
      taps_per_reward: TAPS_PER_REWARD,
      reward: TAP_REWARD,
    });
  } catch (err) {
    console.error('[credit-tap] rpc failed:', err.message);
    return sendJson(res, 500, { ok: false, error: 'Could not credit tap' });
  }
}

async function handleWallet(req, res, url) {
  if (!requireMethod(req, res, ['GET'])) return;
  if (!requireSupabase(res)) return;
  const identity = resolveUserId(req, url);
  if (identity.error) return sendJson(res, identity.status, { ok: false, error: identity.error });

  try {
    const data = await callRpc('ensure_wallet', { p_user_id: identity.userId });
    return sendJson(res, 200, { ok: true, wallet: normalizeWallet(data), bets: userBets(identity.userId) });
  } catch (err) {
    console.error('[wallet] rpc failed:', err.message);
    return sendJson(res, 500, { ok: false, error: 'Could not load wallet' });
  }
}

async function handleOpenMargin(req, res, url) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireSupabase(res)) return;
  const identity = resolveUserId(req, url);
  if (identity.error) return sendJson(res, identity.status, { ok: false, error: identity.error });
  const userId = identity.userId;

  const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
  if (!room) return sendJson(res, 400, { ok: false, error: 'Unknown trading room' });

  const amount = round2(Number(url.searchParams.get('amount')));
  if (!Number.isFinite(amount) || amount < MIN_MARGIN || amount > MAX_MARGIN) {
    return sendJson(res, 400, { ok: false, error: `Margin must be between $${MIN_MARGIN.toFixed(2)} and $${MAX_MARGIN.toFixed(2)}` });
  }
  if (room.state !== 'waiting') {
    return sendJson(res, 409, { ok: false, error: 'Round already in flight - wait for the next takeoff', code: 'ROUND_LOCKED' });
  }
  if (room.bets.has(userId)) {
    return sendJson(res, 409, { ok: false, error: 'You already have an open margin in this round', code: 'ALREADY_OPEN' });
  }

  const roundId = room.nonce;
  const bet = { amount, source: null, confirmed: false, cashedOut: false, cashoutMultiplier: null, payout: 0 };
  room.bets.set(userId, bet);

  let debit;
  try {
    debit = await callRpc('debit_wallet', { p_user_id: userId, p_amount: amount });
  } catch (err) {
    if (room.bets.get(userId) === bet) room.bets.delete(userId);
    if (/INSUFFICIENT_FUNDS/.test(err.message)) {
      return sendJson(res, 402, { ok: false, error: 'Insufficient balance', code: 'INSUFFICIENT_FUNDS' });
    }
    console.error('[open-margin] debit failed:', err.message);
    return sendJson(res, 500, { ok: false, error: 'Could not open margin' });
  }

  bet.source = debit.source;
  bet.confirmed = true;

  const roundStillValid = room.nonce === roundId && room.bets.get(userId) === bet && room.state !== 'crashed';
  if (!roundStillValid) {
    if (room.bets.get(userId) === bet) room.bets.delete(userId);
    try {
      const refund = await callRpc('credit_payout', { p_user_id: userId, p_amount: amount, p_source: debit.source });
      return sendJson(res, 409, {
        ok: false,
        error: 'Round ended before your margin was confirmed - refunded',
        code: 'REFUNDED',
        wallet: normalizeWallet(refund),
      });
    } catch (err) {
      console.error(`[open-margin] CRITICAL refund failed for ${userId} amount ${amount}:`, err.message);
      return sendJson(res, 500, { ok: false, error: 'Refund failed - contact support' });
    }
  }

  return sendJson(res, 200, {
    ok: true,
    room: room.id,
    roundId,
    amount,
    source: debit.source,
    wallet: normalizeWallet(debit),
  });
}

async function handleCashOut(req, res, url) {
  if (!requireMethod(req, res, ['POST'])) return;
  if (!requireSupabase(res)) return;
  const identity = resolveUserId(req, url);
  if (identity.error) return sendJson(res, identity.status, { ok: false, error: identity.error });
  const userId = identity.userId;

  const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
  if (!room) return sendJson(res, 400, { ok: false, error: 'Unknown trading room' });

  const bet = room.bets.get(userId);
  if (!bet) return sendJson(res, 404, { ok: false, error: 'No open margin in this round', code: 'NO_MARGIN' });
  if (!bet.confirmed) return sendJson(res, 409, { ok: false, error: 'Margin is still being confirmed', code: 'PENDING' });
  if (bet.cashedOut) return sendJson(res, 409, { ok: false, error: 'Already cashed out', code: 'ALREADY_CASHED' });
  if (room.state === 'waiting') return sendJson(res, 409, { ok: false, error: 'Round has not taken off yet', code: 'NOT_STARTED' });
  if (room.state !== 'running') return sendJson(res, 409, { ok: false, error: 'Crashed before cash out', code: 'CRASHED' });

  const multiplier = multiplierAt(Date.now() - room.phaseStartedAt);
  if (multiplier >= room.crashPoint) {
    return sendJson(res, 409, { ok: false, error: 'Crashed before cash out', code: 'CRASHED' });
  }

  bet.cashedOut = true;
  bet.cashoutMultiplier = multiplier;
  bet.payout = round2(bet.amount * multiplier);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const data = await callRpc('credit_payout', { p_user_id: userId, p_amount: bet.payout, p_source: bet.source });
      return sendJson(res, 200, {
        ok: true,
        room: room.id,
        roundId: room.nonce,
        multiplier,
        payout: bet.payout,
        source: bet.source,
        wallet: normalizeWallet(data),
      });
    } catch (err) {
      lastError = err;
    }
  }
  console.error(`[cash-out] CRITICAL payout failed for ${userId} amount ${bet.payout}:`, lastError && lastError.message);
  return sendJson(res, 500, { ok: false, error: 'Payout failed - contact support', code: 'PAYOUT_FAILED' });
}

function handleHealth(req, res) {
  const now = Date.now();
  sendJson(res, 200, {
    ok: true,
    uptime: Math.round(process.uptime()),
    walletEnabled: Boolean(supabase),
    sseClients: sseClients.size,
    rooms: Array.from(rooms.values(), (room) => publicRoomState(room, now)),
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  switch (url.pathname) {
    case '/':
    case '/index.html':
      return serveIndex(req, res);
    case '/live-ticker':
      return handleLiveTicker(req, res);
    case '/credit-tap':
      return handleCreditTap(req, res, url);
    case '/wallet':
      return handleWallet(req, res, url);
    case '/open-margin':
      return handleOpenMargin(req, res, url);
    case '/cash-out':
      return handleCashOut(req, res, url);
    case '/health':
      return handleHealth(req, res);
    case '/favicon.ico':
      res.writeHead(204);
      return res.end();
    default:
      return sendJson(res, 404, { ok: false, error: 'Not found' });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[http] unhandled error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Internal server error' });
    } else {
      res.end();
    }
  });
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 0;

server.listen(PORT, () => {
  console.log(`[http] Crypto X engine listening on :${PORT}`);
  for (const room of rooms.values()) {
    console.log(`[engine] ${room.id} client seed ${room.clientSeed}`);
  }
});

function shutdown(signal) {
  console.log(`[http] ${signal} received - closing ${sseClients.size} live streams`);
  for (const res of sseClients) res.end();
  sseClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
