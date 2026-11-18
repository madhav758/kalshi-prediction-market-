export type Order = {
    orderId: string,
    price: number,
    qty: number,
    type: "buy" | "sell",
    userId: string
}

export type Fill = {
    makerOrderId: string,
    price: number,
    qty: number,
    buyerId: string,
    sellerId: string,
}


// // A "buy" order wants to pay as MUCH as possible (highest price first)
// const bids = [
//     { price: 60, qty: 10, userId: "alice" },
//     { price: 50, qty: 5, userId: "bob" },
//     { price: 48, qty: 20, userId: "carol" },
// ];

// // A "sell" order wants the LOWEST price possible (lowest price first)
// const asks = [
//     { price: 58, qty: 8, userId: "dave" },
//     { price: 60, qty: 15, userId: "eve" },
//     { price: 65, qty: 3, userId: "frank" },
// ];


function match(bids: Order[], asks: Order[]) {
    //check if the bid price is greater than or equal to the ask price ]
    //if yes print the matched trade
    for (const bid of bids) {
        for (const ask of asks) {
            if (bid.price >= ask.price) {
                console.log("MATCH!", { bid, ask });
            }
        }
    }
}

// match(bids, asks);

//puts new people at the back and removeFirst serves the person who arrived first 
export class PriceLevel {
    public price: number;
    public orders: Order[];
    constructor(price: number) {
        this.price = price;
        this.orders = [];
    }
    addOrder(order: Order) {
        this.orders.push(order);
    }
    removeFirst() {
        return this.orders.shift();
    }
}


// // --- TEST PriceLevel ---
// const level58 = new PriceLevel(58);
// // 1. Dave arrives first at price 58
// level58.addOrder({ price: 58, qty: 8, userId: "dave" });
// // 2. Later, Sarah also joins at price 58
// level58.addOrder({ price: 58, qty: 12, userId: "sarah" });
// // 3. Remove the first one: Dave should come out first!
// console.log("First served:", level58.removeFirst());
// // 4. Remove the next: Sarah comes out second!
// console.log("Second served:", level58.removeFirst());
// // 5. Empty queue check: should be undefined
// console.log("Third served (empty):", level58.removeFirst());




export class OrderBook {
    bids: Map<number, PriceLevel> = new Map();
    asks: Map<number, PriceLevel> = new Map();
    // lookup table so we can cancel NY ORDER IN O(1) by its id 
    orderIndex: Map<string, { side: "bid" | "ask", price: number, order: Order }> = new Map();

    getBestBid(): number | null {
        return this.bids.size > 0 ? Math.max(...this.bids.keys()) : null
    }
    getBestAsks(): number | null {
        return this.asks.size > 0 ? Math.min(...this.asks.keys()) : null
    }

    addBid(order: Order): Fill[] {
        if (order.type !== "buy") {
            throw new Error("addBid only accepts buy orders");
        }
        const fills: Fill[] = [];

        while (order.qty > 0) {
            const bestAskPrice = this.getBestAsks();


            if (bestAskPrice && bestAskPrice <= order.price) {

                const level = this.asks.get(bestAskPrice)
                const seller = level!.orders[0];
                const matchedQty = Math.min(order.qty, seller!.qty)

                fills.push({
                    makerOrderId: seller!.orderId,
                    price: bestAskPrice,
                    qty: matchedQty,
                    buyerId: order.userId,
                    sellerId: seller!.userId
                });
                //  Reduce both orders' qty
                order.qty -= matchedQty;
                seller!.qty -= matchedQty;
                if (seller!.qty == 0) {
                    //remove the seller from the front of the line 
                    level?.removeFirst();
                }
                if (level?.orders.length === 0) {
                    this.asks.delete(bestAskPrice);
                }
            }
            else {
                break;
            }
        }
        if (order.qty > 0) {
            this.restOrder(order);
        }
        return fills;
    }
    addAsk(order: Order): Fill[] {
        if (order.type !== "sell") {
            throw new Error("addAsk only accepts sell orders");
        }
        const fills: Fill[] = [];
        //user wants to sell
        //get the best price getBestBid()this is the heighest price at which the user can sell
        //if the sell.price<=getBestBid then we can execute the trade
        //we find the qty avaiable at that price find the matchedqty and execute the trade
        //we update the fill table with the completed order 
        //we remove the old prcice from the level if the level.order.length ==0 then we remove that level as no more level at that price is available 
        //remaing qty must be placed in the asks table and executed with the new price using looping 
        //else we rest the order in the asks table
        while (order.qty > 0) {
            const bestBidPrice = this.getBestBid();
            if (bestBidPrice !== null && bestBidPrice >= order.price) {
                //get the level(PriceLevel)
                // get the buyer
                //get the matchedQty 
                //filter by bestBidPrice
                const level = this.bids.get(bestBidPrice);
                const buyer = level?.orders[0];
                //use min here
                const matchedQty = Math.min(buyer!.qty, order.qty);
                //execute the trade
                fills.push({
                    makerOrderId: buyer!.orderId,
                    price: bestBidPrice,
                    qty: matchedQty,
                    buyerId: buyer!.userId,
                    sellerId: order.userId
                })
                //if qty remaining then we need to push to to tht book and addAsk() again 
                order.qty -= matchedQty;
                buyer!.qty -= matchedQty;
                //remove as the qty finishes
                if (buyer!.qty === 0) {
                    level!.removeFirst();
                }
                if (level?.orders.length === 0) {
                    this.bids.delete(bestBidPrice);
                }
            }
            else {
                break;
            }

        }
        if (order.qty > 0) {
            this.restOrder(order);
        }
        return fills
    }
    delete(orderId: string): boolean {
        // look up the orderId in the orderIndex , remove it from teh PriceLevel
        const entry = this.orderIndex.get(orderId);

        if (!entry) {
            return false;

        }
        //find which book(ask ior bid )
        const book = entry.side === "bid" ? this.bids : this.asks;
        const level = book.get(entry.price);
        //remove the order from that price level
        if (level) {
            level.orders = level.orders.filter(o => o.orderId !== orderId);
        }
        if (level?.orders.length === 0) {
            book.delete(entry.price)
        }
        this.orderIndex.delete(orderId);
        return true;
    }

    // places ONE order on its shelf WITHOUT matching (used only when restoring after a restart)
    restOrder(order: Order) {
        const shelf = order.type === "buy" ? this.bids : this.asks;
        const side = order.type === "buy" ? "bid" : "ask";

        if (!shelf.has(order.price)) {
            shelf.set(order.price, new PriceLevel(order.price));
        }
        shelf.get(order.price)!.addOrder(order);

        this.orderIndex.set(order.orderId, { side, price: order.price, order });
    }



}


//the goal is to different books and then whenever there is an order for
//  any market we can divert the order to the rogth orderbook for that market 
export class Engine {
    // has book that contains all the different orderbooks for different markets 
    // methods: processOrder -> match incomung orders to the right book
    //          cancelOrder-> cancel an order for a orderbook 
    books: Map<string, OrderBook> = new Map();

    processOrder(orderBookId: string, order: Order): Fill[] {
        if (!this.books.get(orderBookId)) {
            this.books.set(orderBookId, new OrderBook());

        }
        const book = this.books.get(orderBookId);
        //if the order type is buy then we return addBid;
        //if the order type is sell then we return addAsk;
        if (order!.type === "buy") {
            return book!.addBid(order);
        }
        else {
            return book!.addAsk(order);
        }
    }
    cancelOrder(orderBookId: string, orderId: string): boolean {
        if (!this.books.get(orderBookId)) {
            return false;
        }
        const book = this.books.get(orderBookId);
        if (!book) return false;
        return book?.delete(orderId);
    }
    getDepth(orderBookId: string) {
        const book = this.books.get(orderBookId);
        if (!book) return { bid: [], ask: [] };
        //return all the bids and asks grouped by price
        const bids = [];
        const asks = [];

        for (const [price, level] of book.bids) {
            let totalQty = 0;
            for (const order of level.orders) {
                totalQty += order.qty;
            }
            bids.push({ price, totalQty })
        }
        //asks
        for (const [price, level] of book.asks) {
            let totalQty = 0;
            for (const order of level.orders) {
                totalQty += order.qty;
            }
            asks.push({ price, totalQty })
        }

        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);
        return { bids, asks };
    }

    hydrate(openOrders: { orderBookId: string; order: Order }[]) {
        for (const item of openOrders) {
            if (!this.books.has(item.orderBookId)) {
                this.books.set(item.orderBookId, new OrderBook());
            }
            this.books.get(item.orderBookId)!.restOrder(item.order);
        }
    }

}
export const engine = new Engine();
