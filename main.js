const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { WebSocketServer } = require("ws");

let mainWindow;
let wss;
const connectedClients = new Map();
let clientIdCounter = 0;

// ─── Electron Window ──────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "renderer", "icon.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ─── WebSocket Server ─────────────────────────────────
function startWebSocketServer() {
  wss = new WebSocketServer({ port: 8765 });

  wss.on("connection", (ws) => {
    const clientId = ++clientIdCounter;
    connectedClients.set(clientId, ws);

    console.log(`[WS] Extension connected (id: ${clientId})`);

    // Notify renderer about connection
    mainWindow?.webContents.send("extension-status", {
      connected: true,
      clientCount: connectedClients.size,
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log(`[WS] Received:`, msg);

        // Forward results to renderer
        if (msg.type === 'picker-result' || msg.type === 'picker-cancelled') {
          mainWindow?.webContents.send(msg.type, msg);
        } else {
          mainWindow?.webContents.send("action-result", msg);
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    });

    ws.on("close", () => {
      connectedClients.delete(clientId);
      console.log(`[WS] Extension disconnected (id: ${clientId})`);
      mainWindow?.webContents.send("extension-status", {
        connected: connectedClients.size > 0,
        clientCount: connectedClients.size,
      });
    });

    ws.on("error", (err) => {
      console.error(`[WS] Error:`, err);
    });
  });

  console.log("[WS] Server listening on ws://localhost:8765");
}

// ─── IPC Handlers ─────────────────────────────────────

// Execute a single action
ipcMain.handle("execute-action", async (_event, action) => {
  const payload = JSON.stringify({ type: "execute", action });
  let sent = false;

  for (const [, ws] of connectedClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
      sent = true;
      break; // Send to the first connected extension
    }
  }

  return { sent };
});

// Execute a full task (list of actions)
ipcMain.handle("execute-task", async (_event, actions) => {
  const payload = JSON.stringify({ type: "execute-task", actions });
  let sent = false;

  for (const [, ws] of connectedClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
      sent = true;
      break;
    }
  }

  return { sent };
});

// Start element picker in extension
ipcMain.handle("start-picker", async () => {
  const payload = JSON.stringify({ type: "start-picker" });
  let sent = false;

  for (const [, ws] of connectedClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
      sent = true;
      break;
    }
  }

  return { sent };
});

// Get extension connection status
ipcMain.handle("get-status", async () => {
  return {
    connected: connectedClients.size > 0,
    clientCount: connectedClients.size,
  };
});

// Window controls
ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle("window-close", () => mainWindow?.close());

// ─── App Lifecycle ────────────────────────────────────
app.whenReady().then(() => {
  startWebSocketServer();
  createWindow();
});

app.on("window-all-closed", () => {
  wss?.close();
  app.quit();
});
