/**
 * Auction Engine - Authoritative Multi-Lot Bidding, Anti-Snipe and Outbid Alert Manager
 */
const { v4: uuidv4 } = require("uuid");
const { startAuctionTimer, stopAuctionTimer } = require("./timerManager");

// In-Memory Multi-Lot Auction State Store
const auctions = {
  "AUC_VINTAGE_99": {
    id: "AUC_VINTAGE_99",
    lotNumber: "LOT 99 OF 120",
    category: "RARE MUSICAL INSTRUMENTS",
    title: "1967 Vintage Fender Stratocaster",
    description: "Original 3-tone sunburst nitrocellulose lacquer, select alder body with transitional maple neck, authentic 1967 hand-wound grey bottom single-coil pickups. Certified museum-grade provenance with original hardshell case.",
    condition: "Grade 9.4 / 10 (Museum)",
    startingPrice: 50000,
    currentBid: 50000,
    highestBidder: null, // { socketId, username }
    minIncrement: 2000,
    timeRemainingSeconds: 60,
    status: "active", // "upcoming", "active", "ended"
    bidHistory: [],
    timerInterval: null,
    nextAuctionId: "AUC_ROLEX_100",
    itemType: "guitar"
  },
  "AUC_ROLEX_100": {
    id: "AUC_ROLEX_100",
    lotNumber: "LOT 100 OF 120",
    category: "HAUTE HORLOGERIE & TIMEPIECES",
    title: "1968 Rolex Cosmograph Daytona 'Paul Newman' Ref. 6239",
    description: "Exotic tri-color matte white 'Panda' dial, Valjoux 722 manual-wind chronograph movement, stainless steel case with matching riveted Oyster bracelet. Complete with original box and Swiss chronometer papers.",
    condition: "Collector Grade 9.8 / 10 (Unpolished)",
    startingPrice: 85000,
    currentBid: 85000,
    highestBidder: null,
    minIncrement: 5000,
    timeRemainingSeconds: 60,
    status: "active",
    bidHistory: [],
    timerInterval: null,
    nextAuctionId: "AUC_SHELBY_101",
    itemType: "watch"
  },
  "AUC_SHELBY_101": {
    id: "AUC_SHELBY_101",
    lotNumber: "LOT 101 OF 120",
    category: "HISTORIC COMPETITION AUTOMOBILES",
    title: "1963 Shelby Cobra 289 Factory Competition Roadster",
    description: "Guardsman Blue with Wimbledon White Le Mans racing stripes. All-aluminum body housing original Ford 289ci Hi-Po V8 with quad Weber carburetors. Matching-numbers FIA historic racing pass.",
    condition: "Concours d'Elegance Restoration",
    startingPrice: 120000,
    currentBid: 120000,
    highestBidder: null,
    minIncrement: 10000,
    timeRemainingSeconds: 60,
    status: "active",
    bidHistory: [],
    timerInterval: null,
    nextAuctionId: "AUC_DIAMOND_102",
    itemType: "car"
  },
  "AUC_DIAMOND_102": {
    id: "AUC_DIAMOND_102",
    lotNumber: "LOT 102 OF 120",
    category: "HIGH JEWELLERY & NATURAL DIAMONDS",
    title: "The Aurelia Vivid Pink Diamond (12.4 Carats, Type IIa)",
    description: "Cushion-cut Fancy Vivid Pink diamond possessing natural color saturation and VVS1 clarity. Mounted in platinum and 18k rose gold with twin pear-shaped white diamond shoulders. GIA certified.",
    condition: "Flawless Cut & Polish",
    startingPrice: 150000,
    currentBid: 150000,
    highestBidder: null,
    minIncrement: 10000,
    timeRemainingSeconds: 60,
    status: "active",
    bidHistory: [],
    timerInterval: null,
    nextAuctionId: "AUC_VINTAGE_99",
    itemType: "diamond"
  }
};

// Viewer tracking per room: Map<auctionId, Set<socketId>>
const roomViewers = new Map();
// User registry per socket: Map<socketId, { username, wallet, activeHolds: Map<auctionId, number> }>
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
      const targetId = auctionId || "AUC_VINTAGE_99";
      const auction = auctions[targetId];
      if (!auction) {
        socket.emit("bid:rejected", { reason: "Requested auction does not exist." });
        return;
      }

      // Leave previous room if any
      if (socket.currentAuctionId && socket.currentAuctionId !== targetId) {
        socket.leave(socket.currentAuctionId);
        if (roomViewers.has(socket.currentAuctionId)) {
          roomViewers.get(socket.currentAuctionId).delete(socket.id);
          io.to(socket.currentAuctionId).emit("user:joined", {
            username: socket.username || "A bidder",
            totalViewers: getViewerCount(socket.currentAuctionId)
          });
        }
      }

      const cleanUsername = (username && username.trim()) ? username.trim() : (socket.username || `Bidder_${socket.id.substring(0, 5)}`);
      
      let userRecord = socketRegistry.get(socket.id);
      if (!userRecord) {
        const initialWallet = typeof simulatedWallet === "number" ? simulatedWallet : 200000;
        userRecord = {
          username: cleanUsername,
          totalWallet: initialWallet,
          availableWallet: initialWallet,
          activeHoldAmount: 0
        };
        socketRegistry.set(socket.id, userRecord);
      } else if (username && username.trim()) {
        userRecord.username = cleanUsername;
      }

      socket.username = cleanUsername;
      socket.currentAuctionId = auction.id;

      // Join new socket room
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
          lotNumber: auction.lotNumber,
          category: auction.category,
          title: auction.title,
          description: auction.description,
          condition: auction.condition,
          startingPrice: auction.startingPrice,
          currentBid: auction.currentBid,
          highestBidder: auction.highestBidder,
          minIncrement: auction.minIncrement,
          status: auction.status,
          nextAuctionId: auction.nextAuctionId,
          itemType: auction.itemType
        },
        allLots: Object.values(auctions).map((a) => ({
          id: a.id,
          lotNumber: a.lotNumber,
          title: a.title,
          currentBid: a.currentBid,
          status: a.status
        })),
        bidHistory: auction.bidHistory,
        timeRemaining: auction.timeRemainingSeconds,
        userWallet: {
          total: userRecord.totalWallet,
          available: userRecord.availableWallet,
          held: userRecord.activeHoldAmount
        }
      });

      // 2. Broadcast updated audience count to all viewers in the room (user:joined)
      io.to(auction.id).emit("user:joined", {
        username: cleanUsername,
        totalViewers: getViewerCount(auction.id)
      });
    });

    // Event: bid:place
    socket.on("bid:place", ({ auctionId, amount }) => {
      const targetAuctionId = auctionId || socket.currentAuctionId || "AUC_VINTAGE_99";
      const auction = auctions[targetAuctionId];
      const username = socket.username || "Anonymous Bidder";
      const userRecord = socketRegistry.get(socket.id);

      if (!auction) {
        socket.emit("bid:rejected", { reason: "Auction room not found." });
        return;
      }

      const numericAmount = Number(amount);

      // 1. Validate auction status & timer
      if (auction.status !== "active" || auction.timeRemainingSeconds <= 0) {
        socket.emit("bid:rejected", {
          reason: "Bidding is closed. This auction lot has ended."
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
      if (userRecord) {
        // Effective purchasing power = available wallet + any existing hold on this specific item
        const previousHoldOnThisLot = (auction.highestBidder && auction.highestBidder.socketId === socket.id) ? auction.currentBid : 0;
        const maxAffordable = userRecord.availableWallet + previousHoldOnThisLot;

        if (numericAmount > maxAffordable) {
          socket.emit("bid:rejected", {
            reason: `Insufficient wallet balance. You have ₹${userRecord.availableWallet.toLocaleString('en-IN')} available, but this bid requires ₹${numericAmount.toLocaleString('en-IN')}.`
          });
          return;
        }
      }

      // --- VALID BID ATOMIC EXECUTION ---
      const previousHighestBidder = auction.highestBidder;

      // Release hold from previous highest bidder if different user
      if (previousHighestBidder && previousHighestBidder.socketId) {
        const prevUserRecord = socketRegistry.get(previousHighestBidder.socketId);
        if (prevUserRecord && previousHighestBidder.socketId !== socket.id) {
          prevUserRecord.availableWallet += auction.currentBid;
          prevUserRecord.activeHoldAmount = Math.max(0, prevUserRecord.activeHoldAmount - auction.currentBid);

          // Update previous bidder's wallet UI
          io.to(previousHighestBidder.socketId).emit("wallet:update", {
            total: prevUserRecord.totalWallet,
            available: prevUserRecord.availableWallet,
            held: prevUserRecord.activeHoldAmount,
            message: `₹${auction.currentBid.toLocaleString('en-IN')} hold released back to your available balance.`
          });
        }
      }

      // Place hold on current bidder's wallet
      if (userRecord) {
        userRecord.availableWallet -= numericAmount;
        userRecord.activeHoldAmount += numericAmount;

        socket.emit("wallet:update", {
          total: userRecord.totalWallet,
          available: userRecord.availableWallet,
          held: userRecord.activeHoldAmount,
          message: `₹${numericAmount.toLocaleString('en-IN')} reserved for your leading bid.`
        });
      }

      // Update auction state
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

      console.log(`[NEW LEADING BID] Lot: ${auction.id} | Amount: ₹${numericAmount.toLocaleString('en-IN')} | Bidder: ${username}`);

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
      const targetId = auctionId || socket.currentAuctionId || "AUC_VINTAGE_99";
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

        const userRecord = socketRegistry.get(socket.id);

        io.to(auction.id).emit("auction:init", {
          item: {
            id: auction.id,
            lotNumber: auction.lotNumber,
            category: auction.category,
            title: auction.title,
            description: auction.description,
            condition: auction.condition,
            startingPrice: auction.startingPrice,
            currentBid: auction.currentBid,
            highestBidder: null,
            minIncrement: auction.minIncrement,
            status: auction.status,
            nextAuctionId: auction.nextAuctionId,
            itemType: auction.itemType
          },
          allLots: Object.values(auctions).map((a) => ({
            id: a.id,
            lotNumber: a.lotNumber,
            title: a.title,
            currentBid: a.currentBid,
            status: a.status
          })),
          bidHistory: [],
          timeRemaining: auction.timeRemainingSeconds,
          userWallet: userRecord ? {
            total: userRecord.totalWallet,
            available: userRecord.availableWallet,
            held: userRecord.activeHoldAmount
          } : { total: 200000, available: 200000, held: 0 }
        });

        io.to(auction.id).emit("auction:extended", {
          auctionId: auction.id,
          timeRemaining: 60,
          message: `🔄 ${auction.title} has been reset for a new live round (60s).`
        });
      }
    });

    // Disconnect handling
    socket.on("disconnect", () => {
      console.log(`[SOCKET DISCONNECTED] Socket ID: ${socket.id}`);
      if (socket.currentAuctionId && roomViewers.has(socket.currentAuctionId)) {
        const viewers = roomViewers.get(socket.currentAuctionId);
        viewers.delete(socket.id);
        if (viewers.size === 0) {
          roomViewers.delete(socket.currentAuctionId);
        }

        io.to(socket.currentAuctionId).emit("user:joined", {
          username: socket.username || "A bidder",
          totalViewers: getViewerCount(socket.currentAuctionId)
        });
      }
      socketRegistry.delete(socket.id);
    });
  });
}

module.exports = {
  initAuctionEngine,
  auctions,
  socketRegistry
};
