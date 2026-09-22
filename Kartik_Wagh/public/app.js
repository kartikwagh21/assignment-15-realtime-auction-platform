/**
 * AURELIA LIVE BIDDING FLOOR - Client Socket Controller
 * Pure Socket.io bidirectional event handler & Web Audio sound engine
 */

// Deployment-ready: connect to current window origin (no hardcoded host/port)
const socket = io();

// State
let currentAuctionId = "AUC_VINTAGE_99";
let currentUser = {
  username: "",
  wallet: 200000
};
let currentItem = null;
let currentBid = 50000;
let minIncrement = 2000;
let highestBidder = null;
let auctionStatus = "active";
let soundEnabled = false;

// Audio Synthesizer (Web Audio API - zero external assets)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === "bid") {
      // Pleasant rising 2-tone chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      osc2.frequency.setValueAtTime(880, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.25); // D6

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.35);

    } else if (type === "outbid") {
      // Urgent double warning tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.setValueAtTime(370, now + 0.12); // F#4
      osc.frequency.setValueAtTime(440, now + 0.24);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);

    } else if (type === "snipe") {
      // Sci-fi energizing pulse
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.3);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);

    } else if (type === "gavel") {
      // Low impact hammer strike
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (err) {
    console.warn("Audio playback exception:", err);
  }
}

// DOM References
const elements = {
  userModal: document.getElementById("userModal"),
  joinForm: document.getElementById("joinForm"),
  usernameInput: document.getElementById("usernameInput"),
  walletPreset: document.getElementById("walletPreset"),
  userNameDisplay: document.getElementById("userNameDisplay"),
  userInitial: document.getElementById("userInitial"),
  walletDisplay: document.getElementById("walletDisplay"),
  viewerCountDisplay: document.getElementById("viewerCountDisplay"),
  soundToggleBtn: document.getElementById("soundToggleBtn"),
  soundIcon: document.getElementById("soundIcon"),
  resetAuctionBtn: document.getElementById("resetAuctionBtn"),
  
  // Lot Dossier
  lotTitle: document.getElementById("lotTitle"),
  lotDescription: document.getElementById("lotDescription"),
  startingPriceDisplay: document.getElementById("startingPriceDisplay"),
  minIncrementDisplay: document.getElementById("minIncrementDisplay"),
  
  // Desk & Clock
  auctionStatusBadge: document.getElementById("auctionStatusBadge"),
  auctionStatusText: document.getElementById("auctionStatusText"),
  countdownWidget: document.getElementById("countdownWidget"),
  timerSeconds: document.getElementById("timerSeconds"),
  antiSnipeTag: document.getElementById("antiSnipeTag"),
  
  // Price Ticker
  priceTickerBox: document.getElementById("priceTickerBox"),
  currentBidDisplay: document.getElementById("currentBidDisplay"),
  highestBidderDisplay: document.getElementById("highestBidderDisplay"),
  extensionNotice: document.getElementById("extensionNotice"),
  extensionNoticeText: document.getElementById("extensionNoticeText"),
  
  // Bidding Form
  bidForm: document.getElementById("bidForm"),
  bidAmountInput: document.getElementById("bidAmountInput"),
  minRequiredBidLabel: document.getElementById("minRequiredBidLabel"),
  placeBidBtn: document.getElementById("placeBidBtn"),
  bidBtnAmount: document.getElementById("bidBtnAmount"),
  bidFeedbackNotice: document.getElementById("bidFeedbackNotice"),
  
  // Shortcuts
  quickBidBtns: document.querySelectorAll(".quick-bid-btn"),
  
  // Ledger
  bidHistoryList: document.getElementById("bidHistoryList"),
  bidCountBadge: document.getElementById("bidCountBadge"),
  emptyLedger: document.getElementById("emptyLedger"),
  
  // Outbid & Toasts
  outbidBanner: document.getElementById("outbidBanner"),
  outbidMessage: document.getElementById("outbidMessage"),
  quickReclaimBtn: document.getElementById("quickReclaimBtn"),
  dismissOutbidBtn: document.getElementById("dismissOutbidBtn"),
  toastContainer: document.getElementById("toastContainer"),
  
  // Sold Modal
  soldModal: document.getElementById("soldModal"),
  soldTitle: document.getElementById("soldTitle"),
  soldHammerPrice: document.getElementById("soldHammerPrice"),
  soldWinnerName: document.getElementById("soldWinnerName"),
  soldCloseBtn: document.getElementById("soldCloseBtn")
};

// Utilities
function formatCurrency(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN");
}

function formatTimer(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function showToast(message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "ℹ️";
  if (type === "error") icon = "🚫";
  if (type === "snipe") icon = "⚡";
  if (type === "success") icon = "✓";

  toast.innerHTML = `<span>${icon}</span><div>${message}</div>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function recalculateBidInputs() {
  const minRequired = currentBid + minIncrement;
  elements.minRequiredBidLabel.textContent = `Min ${formatCurrency(minRequired)}`;
  elements.bidAmountInput.min = minRequired;
  
  // If input is empty or below minimum, set to minimum
  const val = Number(elements.bidAmountInput.value);
  if (!val || val < minRequired) {
    elements.bidAmountInput.value = minRequired;
    elements.bidBtnAmount.textContent = formatCurrency(minRequired);
  } else {
    elements.bidBtnAmount.textContent = formatCurrency(val);
  }

  // Update shortcut buttons
  elements.quickBidBtns.forEach((btn) => {
    const inc = Number(btn.dataset.inc);
    btn.onclick = () => {
      const newTarget = currentBid + inc;
      elements.bidAmountInput.value = newTarget;
      elements.bidBtnAmount.textContent = formatCurrency(newTarget);
      elements.bidAmountInput.focus();
    };
  });
}

function updatePriceDisplay(amount, bidder) {
  currentBid = Number(amount);
  highestBidder = bidder;

  elements.currentBidDisplay.textContent = Number(amount).toLocaleString("en-IN");
  
  // Price pulse animation
  elements.priceTickerBox.classList.remove("price-flash");
  void elements.priceTickerBox.offsetWidth; // Trigger reflow
  elements.priceTickerBox.classList.add("price-flash");

  if (bidder) {
    const isMe = bidder.username && bidder.username.toLowerCase() === currentUser.username.toLowerCase();
    if (isMe) {
      elements.highestBidderDisplay.innerHTML = `${bidder.username} <span class="you-tag">YOU (Leading)</span>`;
      elements.highestBidderDisplay.className = "leader-value you-lead";
      // Hide outbid banner if we are leading
      elements.outbidBanner.classList.add("hidden");
    } else {
      elements.highestBidderDisplay.textContent = bidder.username;
      elements.highestBidderDisplay.className = "leader-value";
    }
  } else {
    elements.highestBidderDisplay.textContent = "None (Starting Price)";
    elements.highestBidderDisplay.className = "leader-value";
  }

  recalculateBidInputs();
}

function renderBidHistory(bidHistory) {
  if (!bidHistory || bidHistory.length === 0) {
    elements.bidHistoryList.innerHTML = `
      <div class="empty-ledger-state" id="emptyLedger">
        <span>No bids placed yet. Be the first to place an opening bid!</span>
      </div>
    `;
    elements.bidCountBadge.textContent = "0 Bids Placed";
    return;
  }

  elements.bidCountBadge.textContent = `${bidHistory.length} Bid${bidHistory.length === 1 ? "" : "s"} Placed`;
  
  const html = bidHistory.map((b, index) => {
    const isLeading = index === 0 && auctionStatus === "active";
    const isMe = b.bidder && b.bidder.toLowerCase() === currentUser.username.toLowerCase();
    
    return `
      <div class="ledger-row ${isLeading ? 'row-leading' : ''}">
        <span class="row-time">${b.timestamp || '--:--:--'}</span>
        <span class="row-bidder">
          ${b.bidder} ${isMe ? '<span class="you-tag">YOU</span>' : ''}
        </span>
        <span class="row-amount">${formatCurrency(b.amount)}</span>
        <span class="row-status">
          ${isLeading 
            ? '<span class="status-badge-leading">LEADING</span>' 
            : '<span class="status-badge-outbid">OUTBID</span>'}
        </span>
      </div>
    `;
  }).join("");

  elements.bidHistoryList.innerHTML = html;
}

// -------------------------------------------------------------
// Socket Event Listeners
// -------------------------------------------------------------

// 1. Initial State Hydration
socket.on("auction:init", (data) => {
  console.log("[SOCKET: auction:init]", data);
  currentItem = data.item;
  auctionStatus = data.item.status;
  minIncrement = data.item.minIncrement || 2000;

  elements.lotTitle.textContent = data.item.title;
  elements.lotDescription.textContent = data.item.description;
  elements.startingPriceDisplay.textContent = formatCurrency(data.item.startingPrice);
  elements.minIncrementDisplay.textContent = formatCurrency(data.item.minIncrement);

  updatePriceDisplay(data.item.currentBid, data.item.highestBidder);
  renderBidHistory(data.bidHistory || []);

  if (typeof data.timeRemaining === "number") {
    elements.timerSeconds.textContent = formatTimer(data.timeRemaining);
  }

  if (data.item.status === "ended") {
    setAuctionEndedState(data.item.highestBidder ? data.item.highestBidder.username : "No Bids", data.item.currentBid);
  } else {
    resetAuctionActiveState();
  }
});

// 2. Server 1-Second Time Tick
socket.on("auction:time_tick", ({ timeRemaining }) => {
  elements.timerSeconds.textContent = formatTimer(timeRemaining);

  // Anti-Snipe Warning visual pulse under 15 seconds
  if (timeRemaining < 15 && timeRemaining > 0) {
    elements.countdownWidget.classList.add("warning-pulse");
    elements.antiSnipeTag.style.display = "block";
  } else {
    elements.countdownWidget.classList.remove("warning-pulse");
  }
});

// 3. User Joined / Viewer Count Update
socket.on("user:joined", ({ username, totalViewers }) => {
  elements.viewerCountDisplay.textContent = totalViewers || 1;
});

// 4. Successful Bid Placement Broadcast
socket.on("bid:success", (data) => {
  console.log("[SOCKET: bid:success]", data);
  updatePriceDisplay(data.currentBid, data.highestBidder);
  renderBidHistory(data.bidHistory);
  
  if (typeof data.timeRemaining === "number") {
    elements.timerSeconds.textContent = formatTimer(data.timeRemaining);
  }

  playSound("bid");
  showToast(`New leading bid: ${formatCurrency(data.currentBid)} by ${data.highestBidder.username}`, "success", 3000);
});

// 5. Targeted Outbid Notification (Sent ONLY to previous leader)
socket.on("bid:outbid", ({ message }) => {
  console.log("[SOCKET: bid:outbid TARGETED]", message);
  
  // Show outbid banner
  elements.outbidMessage.textContent = message;
  elements.outbidBanner.classList.remove("hidden");

  // Show outbid error toast
  showToast(message, "error", 6000);
  
  // Sound alarm
  playSound("outbid");

  // Set quick reclaim button
  elements.quickReclaimBtn.onclick = () => {
    const minRequired = currentBid + minIncrement;
    elements.bidAmountInput.value = minRequired;
    elements.bidBtnAmount.textContent = formatCurrency(minRequired);
    elements.bidForm.requestSubmit();
    elements.outbidBanner.classList.add("hidden");
  };
});

// 6. Bid Rejection Message
socket.on("bid:rejected", ({ reason }) => {
  console.warn("[SOCKET: bid:rejected]", reason);
  showToast(reason, "error", 5000);
  
  elements.bidFeedbackNotice.textContent = reason;
  elements.bidFeedbackNotice.className = "feedback-notice error";
  elements.bidFeedbackNotice.classList.remove("hidden");

  setTimeout(() => {
    elements.bidFeedbackNotice.classList.add("hidden");
  }, 5000);
});

// 7. Anti-Snipe Extension Broadcast
socket.on("auction:extended", ({ timeRemaining, message }) => {
  console.log("[SOCKET: auction:extended]", message);
  
  elements.timerSeconds.textContent = formatTimer(timeRemaining);
  
  // Visual flash on timer
  elements.countdownWidget.classList.add("extended-flash");
  setTimeout(() => elements.countdownWidget.classList.remove("extended-flash"), 1500);

  elements.extensionNoticeText.textContent = message;
  elements.extensionNotice.classList.remove("hidden");
  
  setTimeout(() => {
    elements.extensionNotice.classList.add("hidden");
  }, 5000);

  playSound("snipe");
  showToast(message, "snipe", 4500);
});

// 8. Auction Sold / Concluded Broadcast
socket.on("auction:sold", ({ winner, finalPrice }) => {
  console.log("[SOCKET: auction:sold]", { winner, finalPrice });
  setAuctionEndedState(winner, finalPrice);
  playSound("gavel");

  elements.soldTitle.textContent = currentItem ? currentItem.title : "1967 Vintage Fender Stratocaster";
  elements.soldHammerPrice.textContent = `Final Sold Price: ${formatCurrency(finalPrice)}`;
  elements.soldWinnerName.textContent = winner;
  elements.soldModal.classList.remove("hidden");
});

function setAuctionEndedState(winner, finalPrice) {
  auctionStatus = "ended";
  elements.auctionStatusBadge.className = "auction-status-badge status-ended";
  elements.auctionStatusText.textContent = "AUCTION CONCLUDED";
  elements.placeBidBtn.disabled = true;
  elements.bidAmountInput.disabled = true;
  elements.quickBidBtns.forEach((btn) => (btn.disabled = true));
  elements.outbidBanner.classList.add("hidden");
}

function resetAuctionActiveState() {
  auctionStatus = "active";
  elements.auctionStatusBadge.className = "auction-status-badge";
  elements.auctionStatusText.textContent = "LIVE BIDDING";
  elements.placeBidBtn.disabled = false;
  elements.bidAmountInput.disabled = false;
  elements.quickBidBtns.forEach((btn) => (btn.disabled = false));
  elements.soldModal.classList.add("hidden");
  elements.countdownWidget.classList.remove("warning-pulse");
  recalculateBidInputs();
}

// -------------------------------------------------------------
// UI Event Handlers
// -------------------------------------------------------------

// Bid Input Dynamic Calculation
elements.bidAmountInput.addEventListener("input", (e) => {
  const val = Number(e.target.value);
  elements.bidBtnAmount.textContent = val > 0 ? formatCurrency(val) : "₹0";
});

// Submit Authoritative Bid
elements.bidForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  if (auctionStatus !== "active") {
    showToast("This auction round has ended. Click 'Reset Lot' at the top right to start a new round.", "error");
    return;
  }

  const amount = Number(elements.bidAmountInput.value);
  if (!amount || isNaN(amount)) {
    showToast("Please enter a valid numeric bid amount.", "error");
    return;
  }

  // Pre-check simulated wallet balance
  if (amount > currentUser.wallet) {
    showToast(`Cannot place bid of ${formatCurrency(amount)}. Simulated wallet balance is only ${formatCurrency(currentUser.wallet)}.`, "error");
    return;
  }

  console.log(`[CLIENT] Placing bid of ₹${amount} in ${currentAuctionId}`);

  // Emit bid:place to server
  socket.emit("bid:place", {
    auctionId: currentAuctionId,
    amount: amount
  });
});

// Dismiss Outbid Banner
elements.dismissOutbidBtn.addEventListener("click", () => {
  elements.outbidBanner.classList.add("hidden");
});

// Close Sold Modal
elements.soldCloseBtn.addEventListener("click", () => {
  elements.soldModal.classList.add("hidden");
});

// Audio Toggle Button
elements.soundToggleBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    getAudioContext();
    elements.soundIcon.textContent = "🔊";
    elements.soundToggleBtn.querySelector(".btn-text").textContent = "Audio On";
    showToast("Audio cues enabled", "info", 2000);
    playSound("bid");
  } else {
    elements.soundIcon.textContent = "🔇";
    elements.soundToggleBtn.querySelector(".btn-text").textContent = "Audio Off";
  }
});

// Reset Auction Demo Helper (Instant 1-click reset)
elements.resetAuctionBtn.addEventListener("click", () => {
  socket.emit("auction:restart", { auctionId: currentAuctionId });
  showToast("Auction reset to starting state (60s round, ₹50,000 opening bid)", "info", 3000);
});


// Preset Buttons in Username Modal
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    elements.usernameInput.value = btn.dataset.name;
  });
});

// Handle User Join
elements.joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = elements.usernameInput.value.trim() || `Bidder_${Math.floor(Math.random() * 900 + 100)}`;
  const wallet = Number(elements.walletPreset.value) || 200000;

  currentUser.username = name;
  currentUser.wallet = wallet;

  elements.userNameDisplay.textContent = name;
  elements.userInitial.textContent = name.charAt(0).toUpperCase();
  elements.walletDisplay.textContent = formatCurrency(wallet);

  // Hide join modal
  elements.userModal.classList.add("hidden");

  // Emit auction:join to server
  socket.emit("auction:join", {
    auctionId: currentAuctionId,
    username: name,
    simulatedWallet: wallet
  });
});
