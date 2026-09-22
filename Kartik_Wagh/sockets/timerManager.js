/**
 * Timer Manager - Server-side authoritative countdown clock & multi-lot synchronizer
 */

function startAuctionTimer(io, auction, auctions) {
  // Clear any existing timer interval for this auction
  if (auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }

  auction.timerInterval = setInterval(() => {
    if (auction.status !== "active") {
      clearInterval(auction.timerInterval);
      auction.timerInterval = null;
      return;
    }

    auction.timeRemainingSeconds -= 1;

    // Broadcast 1-second time tick to the auction room
    io.to(auction.id).emit("auction:time_tick", {
      auctionId: auction.id,
      timeRemaining: Math.max(0, auction.timeRemainingSeconds)
    });

    // Auction completion when timer reaches zero
    if (auction.timeRemainingSeconds <= 0) {
      clearInterval(auction.timerInterval);
      auction.timerInterval = null;
      auction.timeRemainingSeconds = 0;
      auction.status = "ended";

      const winner = auction.highestBidder ? auction.highestBidder.username : "No Bids (Reserve Unmet)";
      const finalPrice = auction.currentBid;

      console.log(`[AUCTION ENDED] Lot: ${auction.id} | Winner: ${winner} | Final Price: ₹${finalPrice.toLocaleString('en-IN')}`);

      // Finalize wallet settlement if won
      if (auction.highestBidder && auction.highestBidder.socketId) {
        const { socketRegistry } = require("./auctionEngine");
        if (socketRegistry) {
          const winnerRecord = socketRegistry.get(auction.highestBidder.socketId);
          if (winnerRecord) {
            winnerRecord.totalWallet -= finalPrice;
            winnerRecord.activeHoldAmount = Math.max(0, winnerRecord.activeHoldAmount - finalPrice);

            io.to(auction.highestBidder.socketId).emit("wallet:update", {
              total: winnerRecord.totalWallet,
              available: winnerRecord.availableWallet,
              held: winnerRecord.activeHoldAmount,
              message: `🎉 Congratulations! You won ${auction.title} for ₹${finalPrice.toLocaleString('en-IN')}. Settlement completed.`
            });
          }
        }
      }

      // Broadcast auction:sold to the entire room
      io.to(auction.id).emit("auction:sold", {
        auctionId: auction.id,
        lotTitle: auction.title,
        lotNumber: auction.lotNumber,
        winner: winner,
        finalPrice: finalPrice,
        status: "ended",
        nextAuctionId: auction.nextAuctionId
      });
    }
  }, 1000);
}

function stopAuctionTimer(auction) {
  if (auction && auction.timerInterval) {
    clearInterval(auction.timerInterval);
    auction.timerInterval = null;
  }
}

module.exports = {
  startAuctionTimer,
  stopAuctionTimer
};
