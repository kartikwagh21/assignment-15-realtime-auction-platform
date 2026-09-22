# AURELIA Live Auction Floor - Real-Time Bidding Engine (Socket.io)

A mission-critical, low-latency **Real-Time Live Auction & Bidding Platform** built with **Node.js, Express.js, and Socket.io**. Features authoritative server-side bid validation, synchronized countdown timers, targeted private outbid alerts, and an **Anti-Snipe Soft-Close Engine** that extends the clock when late bids arrive.

---

## 🏛️ Live Trading Floor Architecture

```
assignment-15-auction-socket/ (Kartik_Wagh/)
├── public/
│   ├── index.html        # Prestige auction house live floor UI
│   ├── app.js            # Client Socket.io events, Web Audio synthesizer & desk logic
│   └── style.css         # Luxury dark trading terminal styling & animations
├── sockets/
│   ├── auctionEngine.js  # Authoritative validation, anti-snipe logic & outbid dispatch
│   └── timerManager.js   # Authoritative server-side 1-second countdown clock
├── server.js             # Express app, HTTP server & Socket.io initialization
├── package.json          # Dependencies & deployment scripts
└── README.md             # Documentation, protocol spec & test guide
```

---

## ⚡ Socket Event Protocol Specification

### 1. Room & Presence Events

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `auction:join` | Client → Server | `{ auctionId, username, simulatedWallet }` | Joins the live bidding floor room. |
| `auction:init` | Server → Client | `{ item, bidHistory, timeRemaining, userWallet }` | Hydrates the full room state to newly joined bidder. |
| `auction:time_tick` | Server → Room | `{ auctionId, timeRemaining }` | Broadcast every 1 second by server countdown. |
| `user:joined` | Server → Room | `{ username, totalViewers }` | Broadcasts updated live floor audience counter. |

### 2. Live Bidding & Transaction Events

| Event | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `bid:place` | Client → Server | `{ auctionId, amount }` | Bidder submits an authoritative live bid. |
| `bid:success` | Server → Room | `{ currentBid, highestBidder, bidHistory, timeRemaining }` | Broadcasts new leading bid & price ticker update. |
| `bid:outbid` | Server → Client *(Targeted)* | `{ auctionId, message }` | **Privately** sent *only* to the previous highest bidder. |
| `bid:rejected` | Server → Client | `{ reason }` | Authoritative rejection reason for invalid/sub-minimum bid. |
| `auction:extended` | Server → Room | `{ auctionId, timeRemaining, message }` | **Anti-Snipe Protection**: Clock reset to 20s if bid lands at < 15s. |
| `auction:sold` | Server → Room | `{ winner, finalPrice, status }` | Emitted when clock reaches 0s. Seals all further bids. |
| `auction:restart` | Client → Server | `{ auctionId }` | Demo utility to reset lot to 60s and initial price. |

---

## 🛡️ Authoritative Validation Engine Rules

The server never trusts client-side state and authoritatively validates all incoming bids:
1. **Auction Active Check**: Bids are rejected if `status !== "active"` or `timeRemainingSeconds <= 0`.
2. **Self-Outbid Prohibition**: A bidder cannot outbid themselves if their socket ID or username is already the leader.
3. **Minimum Increment Rule**: Every new bid must be `>= currentBid + minIncrement` (e.g. ₹50,000 + ₹2,000 = ₹52,000). Rejections state the exact required minimum amount.
4. **Simulated Balance Check**: Prevents bids exceeding the bidder's virtual wallet.
5. **Anti-Snipe Soft Close**: If a valid bid arrives when `timeRemainingSeconds < 15`, the server automatically sets `timeRemainingSeconds = 20` and broadcasts `auction:extended`.
6. **Targeted Outbid Dispatch**: The server identifies the previous highest bidder's socket ID and emits `bid:outbid` exclusively to them.

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Install Dependencies
```bash
cd Desktop/assignment-15-realtime-auction-platform/Kartik_Wagh
npm install
```

### 2. Start the Server
```bash
npm start
```
*Or for development with automatic restart:*
```bash
npm run dev
```

### 3. Open the Bidding Floor
Visit **[http://localhost:5000](http://localhost:5000)** in your browser.

---

## 🧪 3-Tab Testing & Verification Guide

Follow these steps to demonstrate the complete grading rubric:

### Step 1: Open 3 Separate Browser Tabs / Windows
- **Tab 1**: Open `http://localhost:5000`, enter name **"Vikram"** (Wallet: ₹200,000).
- **Tab 2**: Open `http://localhost:5000` (Incognito / separate window), enter name **"Ananya"** (Wallet: ₹500,000).
- **Tab 3**: Open `http://localhost:5000`, enter name **"Viewer C"**.

### Step 2: Test Real-Time Price Broadcast & Increment Validation
1. In **Tab 1 (Vikram)**, place an opening bid of **₹52,000** (or click `+₹2,000`).
2. Notice:
   - All 3 tabs instantly update the price ticker to **₹52,000**.
   - Bid Ledger records Vikram's bid with timestamp.
   - Vikram's screen shows **"YOU (Leading)"**.

### Step 3: Test Targeted Outbid Alert
1. In **Tab 2 (Ananya)**, place a bid of **₹55,000**.
2. Notice:
   - **Tab 1 (Vikram)** immediately receives a high-contrast **"YOU HAVE BEEN OUTBID!"** banner and audio alert.
   - **Tab 3 (Viewer C)** sees the ticker update to ₹55,000 with NO outbid banner.
   - Vikram clicks **"Reclaim Lead"** on the banner to easily place ₹57,000.

### Step 4: Test Anti-Snipe Soft-Close Extension
1. Watch the countdown timer drop below **15 seconds** (e.g. at 00:10). Notice the clock widget turns amber with warning pulse.
2. In **Tab 2 (Ananya)**, place a bid at 10s remaining.
3. Notice:
   - The clock instantly resets to **00:20** across all 3 screens.
   - An `⚡ Anti-Snipe Protection Triggered` callout banner flashes.

### Step 5: Test Auction Conclusion (`auction:sold`)
1. Let the clock count down to **00:00**.
2. Notice:
   - The saleroom status transitions to **"AUCTION CONCLUDED"**.
   - The **"LOT #99 SOLD!"** modal pops up with the winner's name and hammer price.
   - Gavel audio strike triggers (if audio toggled on).
   - All bidding buttons and inputs become disabled and reject late bids.

---

## ☁️ Deployment to Render.com

The repository is pre-configured and 100% deployment-ready:
- `server.js` dynamically binds to `process.env.PORT || 5000`.
- `public/app.js` connects using relative origin `io()` without hardcoded hostnames.
- `package.json` contains the production `"start": "node server.js"` script.

### Deployment Steps:
1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: real-time live auction platform"
   git branch -M main
   git remote add origin https://github.com/<your-username>/itm-assignment-15-auction-socket.git
   git push -u origin main
   ```
2. **Create Web Service on Render**:
   - Go to [render.com](https://render.com) → **New +** → **Web Service**.
   - Select your GitHub repo `itm-assignment-15-auction-socket`.
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
3. Click **Create Web Service**. Your live URL will be generated

---

*Author: Kartik Wagh | Assignment 15: Real-Time Live Auction & Bidding Platform*
