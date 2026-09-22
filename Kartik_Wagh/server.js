/**
 * Real-Time Auction Platform Server
 * Tech Stack: Node.js, Express.js, Socket.io, CORS, Dotenv
 */
require("dotenv").config();
const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { initAuctionEngine, auctions } = require("./sockets/auctionEngine");

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with cross-origin compatibility
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// REST Endpoints
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get("/api/auctions", (req, res) => {
  const sanitized = Object.values(auctions).map((auc) => ({
    id: auc.id,
    title: auc.title,
    description: auc.description,
    startingPrice: auc.startingPrice,
    currentBid: auc.currentBid,
    highestBidder: auc.highestBidder ? auc.highestBidder.username : null,
    minIncrement: auc.minIncrement,
    timeRemainingSeconds: auc.timeRemainingSeconds,
    status: auc.status,
    totalBids: auc.bidHistory.length
  }));
  res.json({ auctions: sanitized });
});

// Initialize Socket Auction Engine & Timers
initAuctionEngine(io);

// Deployment-ready port selection with automatic fallback for macOS AirPlay
const DEFAULT_PORT = process.env.PORT || 5000;

function startServer(port) {
  const srv = server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Live Auction & Bidding Server running on port ${port}`);
    console.log(`🌐 Local URL: http://localhost:${port}`);
    console.log(`⚡ WebSocket Engine Ready (Socket.io)`);
    console.log(`====================================================`);
  });

  srv.on("error", (err) => {
    if (err.code === "EADDRINUSE" && !process.env.PORT) {
      console.warn(`[WARN] Port ${port} is occupied (common on macOS). Switching to port 5500...`);
      startServer(5500);
    } else {
      console.error("Server error:", err);
    }
  });
}

startServer(DEFAULT_PORT);

