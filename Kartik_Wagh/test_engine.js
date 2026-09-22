const { io } = require("socket.io-client");
const http = require("http");
const app = require("express")();
const { Server } = require("socket.io");
const cors = require("cors");
const { initAuctionEngine, auctions } = require("./sockets/auctionEngine");

async function runVerification() {
  console.log("🧪 Starting Automated Verification of Real-Time Auction Engine...");

  // Start temporary test server
  const server = http.createServer(app);
  const testIo = new Server(server, { cors: { origin: "*" } });
  initAuctionEngine(testIo);

  const TEST_PORT = 5099;
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`[TEST SERVER] Listening on http://localhost:${TEST_PORT}`);

  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  const socketA = io(SERVER_URL);
  const socketB = io(SERVER_URL);
  const socketC = io(SERVER_URL);

  await new Promise((res) => socketA.on("connect", res));
  await new Promise((res) => socketB.on("connect", res));
  await new Promise((res) => socketC.on("connect", res));
  console.log("✅ 3 Sockets connected successfully.");

  // Test 1: Join & Init
  let initData = null;
  socketA.on("auction:init", (data) => {
    initData = data;
  });

  socketA.emit("auction:join", {
    auctionId: "AUC_VINTAGE_99",
    username: "Vikram",
    simulatedWallet: 200000
  });

  await new Promise((r) => setTimeout(r, 200));
  if (initData && initData.item.currentBid === 50000) {
    console.log("✅ Test 1 Passed: auction:join & auction:init hydration verified.");
  } else {
    throw new Error("Test 1 Failed: auction:init not received or invalid");
  }

  // Join B and C
  socketB.emit("auction:join", { auctionId: "AUC_VINTAGE_99", username: "Ananya", simulatedWallet: 500000 });
  socketC.emit("auction:join", { auctionId: "AUC_VINTAGE_99", username: "Viewer C", simulatedWallet: 100000 });
  await new Promise((r) => setTimeout(r, 200));

  // Test 2: Valid Bid by Vikram (₹52,000)
  let bidSuccessData = null;
  socketC.on("bid:success", (data) => {
    bidSuccessData = data;
  });

  socketA.emit("bid:place", { auctionId: "AUC_VINTAGE_99", amount: 52000 });
  await new Promise((r) => setTimeout(r, 200));

  if (bidSuccessData && bidSuccessData.currentBid === 52000 && bidSuccessData.highestBidder.username === "Vikram") {
    console.log("✅ Test 2 Passed: bid:place -> bid:success broadcast to room verified.");
  } else {
    throw new Error("Test 2 Failed: bid:success not broadcasted correctly");
  }

  // Test 3: Self-outbid prevention
  let rejectedReason = null;
  socketA.once("bid:rejected", (data) => {
    rejectedReason = data.reason;
  });

  socketA.emit("bid:place", { auctionId: "AUC_VINTAGE_99", amount: 54000 });
  await new Promise((r) => setTimeout(r, 200));

  if (rejectedReason && rejectedReason.includes("already hold the highest bid")) {
    console.log("✅ Test 3 Passed: Self-outbid prohibition verified.");
  } else {
    throw new Error("Test 3 Failed: Self-outbid check failed");
  }

  // Test 4: Sub-minimum increment rejection
  let subMinRejected = null;
  socketB.once("bid:rejected", (data) => {
    subMinRejected = data.reason;
  });

  // Current bid is 52000, min increment is 2000 -> required is 54000. Try 53000
  socketB.emit("bid:place", { auctionId: "AUC_VINTAGE_99", amount: 53000 });
  await new Promise((r) => setTimeout(r, 200));

  if (subMinRejected && subMinRejected.includes("Minimum required bid is ₹54,000")) {
    console.log("✅ Test 4 Passed: Minimum increment enforcement verified.");
  } else {
    throw new Error(`Test 4 Failed: Sub-min rejected expected but got: ${subMinRejected}`);
  }

  // Test 5: Outbid targeted alert to Vikram when Ananya bids ₹56,000
  let outbidReceivedA = null;
  let outbidReceivedC = null;
  socketA.once("bid:outbid", (data) => { outbidReceivedA = data; });
  socketC.once("bid:outbid", (data) => { outbidReceivedC = data; });

  socketB.emit("bid:place", { auctionId: "AUC_VINTAGE_99", amount: 56000 });
  await new Promise((r) => setTimeout(r, 200));

  if (outbidReceivedA && outbidReceivedA.message.includes("Ananya") && !outbidReceivedC) {
    console.log("✅ Test 5 Passed: Targeted outbid alert delivered exclusively to previous leader.");
  } else {
    throw new Error("Test 5 Failed: Targeted outbid notification error");
  }

  // Test 6: Anti-Snipe Extension
  auctions["AUC_VINTAGE_99"].timeRemainingSeconds = 10; // set time < 15s
  let extendedData = null;
  socketA.on("auction:extended", (data) => { extendedData = data; });

  // Vikram bids ₹60,000 at 10s remaining
  socketA.emit("bid:place", { auctionId: "AUC_VINTAGE_99", amount: 60000 });
  await new Promise((r) => setTimeout(r, 200));

  if (extendedData && extendedData.timeRemaining === 20 && auctions["AUC_VINTAGE_99"].timeRemainingSeconds >= 19) {
    console.log("✅ Test 6 Passed: Anti-snipe extension to 20s verified.");
  } else {
    throw new Error(`Test 6 Failed: Anti-snipe failed. Extended data: ${JSON.stringify(extendedData)}`);
  }

  // Disconnect sockets and close test server
  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();
  server.close();

  console.log("\n🎉 ALL 6 AUTOMATED VERIFICATION SUITES PASSED FLAWLESSLY!\n");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("❌ Verification Suite Failed:", err);
  process.exit(1);
});
