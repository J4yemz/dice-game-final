const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

// Serve only public assets/pages needed by the app.
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/src', express.static(path.join(__dirname, 'src')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin_temp.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin_temp.html'));
});

// ── Dice colors ─────────────────────────────────────────────────
const diceColors = [
  { name: 'RED', value: 'rgb(255, 0, 0)' },
  { name: 'ORANGE', value: 'rgb(255, 165, 0)' },
  { name: 'YELLOW', value: 'rgb(255, 215, 0)' },
  { name: 'GREEN', value: 'rgb(0, 128, 0)' },
  { name: 'BLUE', value: '#0049ff' },
  { name: 'PURPLE', value: 'rgb(128, 0, 128)' }
];

function generateRandomResults(count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(diceColors[Math.floor(Math.random() * diceColors.length)]);
  }
  return results;
}

// ── State ────────────────────────────────────────────────────────
let riggedColors = null;   // null = random,  array of color names = rigged
let persistRig = false;    // if true, rigged result stays until manually cleared
let lastRoll3 = null;      // last actual roll result for 3 dice
let lastRoll30 = null;     // last actual roll result for 30 dice

// Pre-computed next results for 3 and 30 dice (shown to admin in advance)
let nextRoll3 = generateRandomResults(3);
let nextRoll30 = generateRandomResults(30);

// ── WebSocket handling ──────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // ── Player requests ────────────────────────────────────────
    if (msg.type === 'roll') {
      const count = Math.min(Math.max(Number(msg.count) || 1, 1), 100);

      let results;

      if (riggedColors && riggedColors.length > 0) {
        // Use the rigged colors (pad / trim to match requested count)
        results = [];
        for (let i = 0; i < count; i++) {
          const colorName = riggedColors[i % riggedColors.length];
          const found = diceColors.find(c => c.name === colorName.toUpperCase());
          results.push(found || diceColors[Math.floor(Math.random() * diceColors.length)]);
        }

        // Clear rig after use (unless persist is on)
        if (!persistRig) {
          riggedColors = null;
        }
      } else {
        // Use pre-computed result for 3 or 30 dice, random for others
        if (count === 3) {
          results = nextRoll3;
        } else if (count === 30) {
          results = nextRoll30;
        } else {
          results = generateRandomResults(count);
        }
      }

      ws.send(JSON.stringify({ type: 'roll-result', results }));

      // Store last roll for 3 and 30 dice
      if (count === 3) lastRoll3 = results;
      if (count === 30) lastRoll30 = results;

      // Regenerate next results for 3 and 30 dice
      if (count === 3) nextRoll3 = generateRandomResults(3);
      if (count === 30) nextRoll30 = generateRandomResults(30);

      // Broadcast to all clients (so admin can see the roll)
      const rollBroadcast = JSON.stringify({ type: 'roll-broadcast', results, count });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(rollBroadcast);
        }
      });

      // Broadcast updated next results to admin
      broadcastAdminState();
    }

    // ── Admin requests ─────────────────────────────────────────
    if (msg.type === 'admin-set-color') {
      // msg.colors = ['RED'] or ['RED', 'BLUE', 'GREEN']
      riggedColors = msg.colors || null;
      persistRig = !!msg.persist;
      console.log(`[ADMIN] Rigged colors set to: ${riggedColors ? riggedColors.join(', ') : 'NONE (random)'} | persist: ${persistRig}`);
      broadcastAdminState();
    }

    if (msg.type === 'admin-clear') {
      riggedColors = null;
      persistRig = false;
      console.log('[ADMIN] Rig cleared — back to random');
      broadcastAdminState();
    }

    if (msg.type === 'admin-get-state') {
      ws.send(JSON.stringify({
        type: 'admin-state',
        riggedColors,
        persistRig,
        lastRoll3,
        lastRoll30,
        nextRoll3,
        nextRoll30
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

function broadcastAdminState() {
  const stateMsg = JSON.stringify({
    type: 'admin-state',
    riggedColors,
    persistRig,
    lastRoll3,
    lastRoll30,
    nextRoll3,
    nextRoll30
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(stateMsg);
    }
  });
}

server.listen(PORT, () => {
  console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
  console.log(`  🎲  Dice game:  http://localhost:${PORT}/`);
  console.log(`  🔧  Admin panel: http://localhost:${PORT}/admin.html\n`);
});
