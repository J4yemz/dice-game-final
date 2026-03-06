const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// ── State ────────────────────────────────────────────────────────
// When riggedColors is set (non-null), the next roll will use these
// colors instead of random ones. After one roll it resets to null.
let riggedColors = null;   // null = random,  array of color names = rigged
let persistRig = false;    // if true, rigged result stays until manually cleared

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
      const diceColors = [
        { name: 'RED', value: 'rgb(255, 0, 0)' },
        { name: 'ORANGE', value: 'rgb(255, 165, 0)' },
        { name: 'YELLOW', value: 'rgb(255, 215, 0)' },
        { name: 'GREEN', value: 'rgb(0, 128, 0)' },
        { name: 'BLUE', value: '#0049ff' },
        { name: 'PURPLE', value: 'rgb(128, 0, 128)' }
      ];

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
          broadcastAdminState();
        }
      } else {
        // Random roll
        results = [];
        for (let i = 0; i < count; i++) {
          results.push(diceColors[Math.floor(Math.random() * diceColors.length)]);
        }
      }

      ws.send(JSON.stringify({ type: 'roll-result', results }));

      // Broadcast to all clients (so admin can see the roll)
      const rollBroadcast = JSON.stringify({ type: 'roll-broadcast', results, count });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(rollBroadcast);
        }
      });
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
        persistRig
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
    persistRig
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
