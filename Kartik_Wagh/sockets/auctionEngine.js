/**
 * Auction Engine - Authoritative Bidding, Anti-Snipe and Outbid Alert Manager
 */
const { v4: uuidv4 } = require("uuid");
const { startAuctionTimer, stopAuctionTimer } = require("./timerManager");

// In-Memory Auction State Store
const auctions = {
  "AUC_VINTAGE_99": {
    id: "AUC_VINTAGE_99",
    title: "1967 Vintage Fender Stratocaster",
    description: "Original sunburst finish, alder body with maple neck, authentic 1967 single-coil pickups. Certified museum-grade provenance with original hardshell case.",
    startingPrice: 50000,
    currentBid: 50000,
    highestBidder: null, // { socketId, username }
    minIncrement: 2000,
    timeRemainingSeconds: 60,
    status: "active", // "upcoming", "active", "ended"
    bidHistory: [],
    timerInterval: null
  }
};

// Viewer tracking per room: Map<auctionId, Set<socketId>>
const roomViewers = new Map();
// Socket metadata store: Map<socketId, { username, auctionId, wallet }>
const socketRegistry = new Map();

function getViewerCount(auctionId) {
  const viewers = roomViewers.get(auctionId);
  return viewers ? viewers.size : 0;
}

function initAuctionEngine(io) {
  // Start server-side countdown timers for active auctions
  Object.values(auctions).forEach((auction) => {
    if (auction.status === "active") {
      startAuctionTimer(io, auction, auctions);
    }
  });

  io.on("connection", (socket) => {
    console.log(`[SOCKET CONNECTED] Socket ID: ${socket.id}`);

    // Event: auction:join
    socket.on("auction:join", ({ auctionId, username, simulatedWallet }) => {
      const auction = auctions[auctionId || "AUC_VINTAGE_99"];
      if (!auction) {
        socket.emit("bid:rejected", { reason: "Requested auction does not exist." });
        return;
      }

      const cleanUsername = (username && username.trim()) ? username.trim() : `Bidder_${socket.id.substring(0, 5)}`;
      const wallet = typeof simulatedWallet === "number" ? simulatedWallet : 200000;

      socket.username = cleanUsername;
      socket.auctionId = auction.id;
      socket.wallet = wallet;

      socketRegistry.set(socket.id, {
        username: cleanUsername,
        auctionId: auction.id,
        wallet: wallet
      });

      // Join socket room
      socket.join(auction.id);

      // Track viewer in room
      if (!roomViewers.has(auction.id)) {
        roomViewers.set(auction.id, new Set());
      }
      roomViewers.get(auction.id).add(socket.id);

      console.log(`[USER JOINED] ${cleanUsername} (${socket.id}) joined room ${auction.id}. Total viewers: ${getViewerCount(auction.id)}`);

      // 1. Hydrate state to the newly joined client (auction:init)
      socket.emit("auction:init", {
        item: {
          id: auction.id,
          title: auction.title,
          description: auction.description,
          startingPrice: auction.startingPrice,
          currentBid: auction.currentBid,
          highestBidder: auction.highestBidder,
          minIncrement: auction.minIncrement,
          status: auction.status
        },
        bidHistory: auction.bidHistory,
        timeRemaining: auction.timeRemainingSeconds,
        userWallet: socket.wallet
      });

      // 2. Broadcast updated audience count to all viewers in the room (user:joined)
      io.to(auction.id).emit("user:joined", {
        username: cleanUsername,
        totalViewers: getViewerCount(auction.id)
      });
    });

    // Event: bid:place
    socket.on("bid:place", ({ auctionId, amount }) => {
      const targetAuctionId = auctionId || socket.auctionId || "AUC_VINTAGE_99";
      const auction = auctions[targetAuctionId];
      const username = socket.username || "Anonymous Bidder";

      if (!auction) {
        socket.emit("bid:rejected", { reason: "Auction room not found." });
        return;
      }

      const numericAmount = Number(amount);

      // 1. Validate auction status & timer
      if (auction.status !== "active" || auction.timeRemainingSeconds <= 0) {
        socket.emit("bid:rejected", {
          reason: "Bidding is closed. This auction has ended."
        });
        return;
      }

      // 2. Validate amount is a valid positive number
      if (isNaN(numericAmount) || numericAmount <= 0) {
        socket.emit("bid:rejected", {
          reason: "Please enter a valid positive bid amount."
        });
        return;
      }

      // 3. Prevent self-outbidding (same socket or same username already holds the lead)
      if (
        auction.highestBidder &&
        (auction.highestBidder.socketId === socket.id ||
         auction.highestBidder.username.toLowerCase() === username.toLowerCase())
      ) {
        socket.emit("bid:rejected", {
          reason: `You already hold the highest bid of ₹${auction.currentBid.toLocaleString('en-IN')}. Self-outbidding is prohibited.`
        });
        return;
      }

      // 4. Enforce minimum bid increment
      const minRequired = auction.currentBid + auction.minIncrement;
      if (numericAmount < minRequired) {
        socket.emit("bid:rejected", {
          reason: `Bid ₹${numericAmount.toLocaleString('en-IN')} rejected. Minimum required bid is ₹${minRequired.toLocaleString('en-IN')} (current ₹${auction.currentBid.toLocaleString('en-IN')} + ₹${auction.minIncrement.toLocaleString('en-IN')} min increment).`
        });
        return;
      }

      // 5. Check simulated wallet balance
      if (socket.wallet !== undefined && numericAmount > socket.wallet) {
        socket.emit("bid:rejected", {
          reason: `Insufficient simulated balance (₹${socket.wallet.toLocaleString('en-IN')}). Cannot place bid of ₹${numericAmount.toLocaleString('en-IN')}.`
        });
        return;
      }

      // --- VALID BID ATOMIC EXECUTION ---
      const previousHighestBidder = auction.highestBidder;

      // Update state atomically
      auction.currentBid = numericAmount;
      auction.highestBidder = {
        socketId: socket.id,
        username: username
      };

      const bidRecord = {
        id: uuidv4(),
        bidder: username,
        amount: numericAmount,
        timestamp: new Date().toLocaleTimeString("en-IN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      };

      // Unshift into bid history
      auction.bidHistory.unshift(bidRecord);

      console.log(`[NEW LEADING BID] Room: ${auction.id} | Amount: ₹${numericAmount.toLocaleString('en-IN')} | Bidder: ${username}`);

      // 6. Anti-Snipe Protection: If < 15 seconds remaining, reset timer to 20 seconds
      if (auction.timeRemainingSeconds < 15) {
        auction.timeRemainingSeconds = 20;
        console.log(`[ANTI-SNIPE TRIGGERED] Extended room ${auction.id} clock to 20s due to late bid from ${username}`);

        // Broadcast auction:extended to the entire room
        io.to(auction.id).emit("auction:extended", {
          auctionId: auction.id,
          timeRemaining: auction.timeRemainingSeconds,
          message: `⚡ Anti-Snipe Extended: Clock reset to 20s after late bid by ${username}!`
        });
      }

      // 7. Broadcast bid:success to the entire room
      io.to(auction.id).emit("bid:success", {
        auctionId: auction.id,
        currentBid: auction.currentBid,
        highestBidder: auction.highestBidder,
        bidHistory: auction.bidHistory,
        timeRemaining: auction.timeRemainingSeconds
      });

      // 8. Targeted outbid notification: Privately emit ONLY to previous leader
      if (
        previousHighestBidder &&
        previousHighestBidder.socketId &&
        previousHighestBidder.socketId !== socket.id
      ) {
        io.to(previousHighestBidder.socketId).emit("bid:outbid", {
          auctionId: auction.id,
          message: `⚠️ Outbid Alert! ${username} just placed a higher bid of ₹${numericAmount.toLocaleString('en-IN')}. Bid now to reclaim the lead!`
        });
        console.log(`[OUTBID SENT] Targeted notification dispatched to ${previousHighestBidder.username} (${previousHighestBidder.socketId})`);
      }
    });

    // Event: auction:restart (Demo & Testing helper)
    socket.on("auction:restart", ({ auctionId }) => {
      const targetId = auctionId || "AUC_VINTAGE_99";
      const auction = auctions[targetId];
      if (auction) {
        stopAuctionTimer(auction);
        auction.currentBid = auction.startingPrice;
        auction.highestBidder = null;
        auction.timeRemainingSeconds = 60;
        auction.status = "active";
        auction.bidHistory = [];
        startAuctionTimer(io, auction, auctions);

        console.log(`[AUCTION RESET] Room ${targetId} reset to starting conditions.`);

        io.to(auction.id).emit("auction:init", {
          item: {
            id: auction.id,
            title: auction.title,
            description: auction.description,
            startingPrice: auction.startingPrice,
            currentBid: auction.currentBid,
            highestBidder: null,
            minIncrement: auction.minIncrement,
            status: auction.status
          },
          bidHistory: [],
          timeRemaining: auction.timeRemainingSeconds,
          userWallet: socket.wallet || 200000
        });

        io.to(auction.id).emit("auction:extended", {
          auctionId: auction.id,
          timeRemaining: 60,
          message: "🔄 Auction has been reset for a new live round (60s)."
        });
      }
    });

    // Disconnect handling
    socket.on("disconnect", () => {
      console.log(`[SOCKET DISCONNECTED] Socket ID: ${socket.id}`);
      if (socket.auctionId && roomViewers.has(socket.auctionId)) {
        const viewers = roomViewers.get(socket.auctionId);
        viewers.delete(socket.id);
        if (viewers.size === 0) {
          roomViewers.delete(socket.auctionId);
        }

        io.to(socket.auctionId).emit("user:joined", {
          username: socket.username || "A bidder",
          totalViewers: getViewerCount(socket.auctionId)
        });
      }
      socketRegistry.delete(socket.id);
    });
  });
}

module.exports = {
  initAuctionEngine,
  auctions
};
