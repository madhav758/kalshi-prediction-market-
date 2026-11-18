import { describe, test, expect, beforeEach } from "bun:test";
import { Engine, OrderBook, PriceLevel } from "./index";
// (You'll import your OrderBook class here)
describe("OrderBook In-Memory Engine", () => {
    let book: OrderBook;

    beforeEach(() => {
        book = new OrderBook(); // fresh book before every test
    });

    // -------------------------------------------------------------------------
    // TEST 1: Full 1-to-1 Match
    // -------------------------------------------------------------------------
    test("should fully match an incoming bid against an existing ask", () => {
        // Seat a seller at 55, qty 5
        const askLevel = new PriceLevel(55);
        askLevel.addOrder({ orderId: "ask1", price: 55, qty: 5, userId: "dave", type: "sell" });
        book.asks.set(55, askLevel);

        // Buyer offers 60 for 5 shares
        const fills = book.addBid({ orderId: "bid1", price: 60, qty: 5, userId: "alice", type: "buy" });

        expect(fills.length).toBe(1);
        expect(fills[0]!.price).toBe(55); // Trades at the maker's (seller's) price!
        expect(fills[0]!.qty).toBe(5);
        expect(fills[0]!.buyerId).toBe("alice");
        expect(fills[0]!.sellerId).toBe("dave");
        expect(book.asks.has(55)).toBe(false); // Dave should be removed
        expect(book.bids.size).toBe(0);        // Alice should NOT be in bids
    });

    // -------------------------------------------------------------------------
    // TEST 2: No Match (Order Rests)
    // -------------------------------------------------------------------------
    test("should rest bid in book when bid price < best ask", () => {
        const askLevel = new PriceLevel(55);
        askLevel.addOrder({ orderId: "ask1", price: 55, qty: 5, userId: "dave", type: "sell" });
        book.asks.set(55, askLevel);

        // Bob bids 40 (too low!)
        const fills = book.addBid({ orderId: "bid2", price: 40, qty: 5, userId: "bob", type: "buy" });

        expect(fills.length).toBe(0);           // No trades
        expect(book.bids.has(40)).toBe(true);   // Bob is resting at 40
        expect(book.asks.has(55)).toBe(true);   // Dave is still at 55
    });

    // -------------------------------------------------------------------------
    // TEST 3: Partial Fill (Buyer wants more than seller has)
    // -------------------------------------------------------------------------
    test("should partially fill buyer and rest the remainder", () => {
        // Dave only has 4 shares at 55
        const askLevel = new PriceLevel(55);
        askLevel.addOrder({ orderId: "ask1", price: 55, qty: 4, userId: "dave", type: "sell" });
        book.asks.set(55, askLevel);

        // Alice wants 10 shares at 55
        const fills = book.addBid({ orderId: "bid1", price: 55, qty: 10, userId: "alice", type: "buy" });

        expect(fills.length).toBe(1);
        expect(fills[0]!.qty).toBe(4);          // Alice got Dave's 4 shares
        expect(book.asks.has(55)).toBe(false); // Dave is completely gone

        // Alice should now be resting in bids for the remaining 6 shares!
        expect(book.bids.has(55)).toBe(true);
        const restingLevel = book.bids.get(55)!;
        expect(restingLevel.orders[0]!.qty).toBe(6);
    });

    // -------------------------------------------------------------------------
    // TEST 4: Price-Time Priority (FIFO fairness)
    // -------------------------------------------------------------------------
    test("should match the oldest order first when prices are identical", () => {
        const askLevel = new PriceLevel(55);
        // Dave arrived first, Sarah arrived second
        askLevel.addOrder({ orderId: "dave1", price: 55, qty: 5, userId: "dave", type: "sell" });
        askLevel.addOrder({ orderId: "sarah1", price: 55, qty: 5, userId: "sarah", type: "sell" });
        book.asks.set(55, askLevel);

        // Buyer only buys 5 shares
        const fills = book.addBid({ orderId: "bid1", price: 55, qty: 5, userId: "alice", type: "buy" });

        expect(fills.length).toBe(1);
        expect(fills[0]!.sellerId).toBe("dave"); // Dave must get filled first!
        expect(askLevel.orders[0]!.userId).toBe("sarah"); // Sarah is still waiting
    });

    // -------------------------------------------------------------------------
    // TEST 5: Order Cancellation
    // -------------------------------------------------------------------------
    test("should successfully cancel a resting order and delete empty levels", () => {
        // Bob places a resting bid
        book.addBid({ orderId: "bid_cancel", price: 45, qty: 10, userId: "bob", type: "buy" });
        expect(book.bids.has(45)).toBe(true);

        // Bob cancels
        const success = book.delete("bid_cancel");
        expect(success).toBe(true);
        expect(book.bids.has(45)).toBe(false); // Level 45 is completely removed!

        // Canceling a non-existent order returns false
        expect(book.delete("fake_id")).toBe(false);
    });
    // -------------------------------------------------------------------------
    // TEST 6: Full Match for incoming Ask (Seller matches with existing Buyer)
    // -------------------------------------------------------------------------
    test("should fully match an incoming ask against an existing bid", () => {
        // 1. Alice is already waiting in the book, bidding 60 for 5 shares
        book.addBid({ orderId: "bid1", price: 60, qty: 5, userId: "alice", type: "buy" });

        // 2. Dave arrives willing to sell for 55 (cheaper than Alice offers!)
        const fills = book.addAsk({ orderId: "ask1", price: 55, qty: 5, userId: "dave", type: "sell" });

        // 3. Verify trade executed
        expect(fills.length).toBe(1);
        expect(fills[0]!.price).toBe(60); // Trades at the maker's (Alice's) price!
        expect(fills[0]!.qty).toBe(5);
        expect(fills[0]!.buyerId).toBe("alice");
        expect(fills[0]!.sellerId).toBe("dave");

        // Alice is fully filled (removed from bids), Dave has nothing left to rest
        expect(book.bids.has(60)).toBe(false);
        expect(book.asks.size).toBe(0);
    });
    // -------------------------------------------------------------------------
    // TEST 7: No Match for incoming Ask (Seller wants too much -> Rests)
    // -------------------------------------------------------------------------
    test("should rest ask in book when ask price > best bid", () => {
        // 1. Bob is offering 40 for 5 shares
        book.addBid({ orderId: "bid2", price: 40, qty: 5, userId: "bob", type: "buy" });

        // 2. Dave arrives asking 55 (too expensive for Bob!)
        const fills = book.addAsk({ orderId: "ask2", price: 55, qty: 5, userId: "dave", type: "sell" });

        // 3. No match should happen!
        expect(fills.length).toBe(0);
        expect(book.asks.has(55)).toBe(true); // Dave is now resting in asks at 55
        expect(book.bids.has(40)).toBe(true); // Bob is still waiting in bids at 40
    });

    test("hydrate restores resting orders without matching them", () => {
        const engine = new Engine();
        engine.hydrate([
            { orderBookId: "b1", order: { orderId: "o1", price: 60, qty: 5, type: "buy", userId: "alice" } },
            { orderBookId: "b1", order: { orderId: "o2", price: 55, qty: 5, type: "sell", userId: "dave" } },
        ]);
        const depth = engine.getDepth("b1");
        expect(depth.bids.length).toBe(1);
        expect(depth.asks.length).toBe(1);
    });
});