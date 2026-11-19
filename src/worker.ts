import { engine } from "./engine";
import { StockBalance } from "./model/stockBalance";
import mongoose, { Types } from "mongoose";
import { User } from "./model/user";
import { Fill } from "./model/fill";
import { Ask, Bid } from "./model/order";
import { WalletEvent } from "./model/walletEvent";
import { OrderBook } from "./model/orderBook";
import { client } from "./redis";
import "dotenv/config";
//helper function to add the stocks to the stock balance oF a userId marketId side and qty 
async function addToStockBalance(userId: Types.ObjectId | string, marketId: Types.ObjectId | string, side: "yes" | "no", qty: number) {
    await StockBalance.findOneAndUpdate(
        {
            userId,
            marketId,
            type: side
        },
        {
            $inc: { qty }
        },
        {
            upsert: true
        }
    )
}


async function handleCreate(payload: {
    orderId: string;
    orderBookId: string;
    marketId: string;
    userId: string;
    type: "buy" | "sell";
    side: "yes" | "no";
    price: number;
    qty: number;
}) {
    const fills = engine.processOrder(payload.orderBookId, {
        orderId: payload.orderId,
        price: payload.price,
        qty: payload.qty,
        type: payload.type,
        userId: payload.userId,
    });
    let remainingQty = payload.qty;
    let filledQty = 0;
    if (payload.type === 'buy') {


        //get the buyer from teh userId 
        //loop through the fills 
        //matchedQty, executionPrice , actualPrice, refund , reservedForMatch. 
        //get the seller findOne StockBalance 
        //buyer.locekdBalance -= reservedForMatch; buyer.balance+= refund; seller.StockQty -= matchedQty ; seller.locked -= matchedQty;
        //save the Qty using addtoStockBalance for the buyer 
        //create thr fill table
        //update the Ask table delete the Ask if the updatAsk.qty <=0
        //calculaet the re,maing Qty -= matchedQty 
        //if reminingQty then create the Bid 
        // do for the sell type ]
        //get the fills after processing the order in the engine inmemory matching


        const buyer = await User.findById(payload.userId);
        if (!buyer) throw new Error("nuyer not found");
        //match the cheapest asks first 
        for (const fill of fills) {
            if (remainingQty == 0) break;

            //find the matched quantity 
            const matchedQty = fill.qty;

            // the executiton price
            const executionPrice = fill.price;
            //the actual price 
            const actualPrice = matchedQty * executionPrice;

            // reservedforMatch price is the price* matched qty 
            // we need to deduct that frim the locked and refund reservedformatch -actualPrice.
            const reservedforMatch = payload.price * matchedQty;

            const refund = reservedforMatch - actualPrice;

            // to do the exchnage we must first confirm the seller 

            const seller = await User.findById(fill.sellerId);
            const sellerStock = await StockBalance.findOne({
                userId: fill.sellerId,
                marketId: payload.marketId,
                type: payload.side,
            });

            if (!seller || !sellerStock || sellerStock.locked < matchedQty || sellerStock.qty < matchedQty) {
                throw new Error(
                    "Seller balance is inconsistent"
                );
            }

            // Spend the matched part of buyer's
            // locked money and return price improvement.
            // i.e deduct reservedforMatch frim the locked and refund reservedformatch -actualPrice to the buyer 

            buyer.lockedBalance -= reservedforMatch;
            buyer.balance += refund;
            seller.balance += actualPrice;
            // Transfer contracts.
            sellerStock.qty -= matchedQty;
            sellerStock.locked -= matchedQty;
            await buyer.save();
            await seller.save();
            await sellerStock.save();

            //upadate the databases 
            await addToStockBalance(buyer._id, payload.marketId, payload.side, matchedQty);


            //record seller and buyher fills
            await Fill.create([
                {
                    orderbookId: payload.orderBookId,
                    userId: seller._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "sell",
                    isMaker: true
                },
                {
                    orderbookId: payload.orderBookId,
                    userId: buyer._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "buy",
                    isMaker: false
                }
            ]);

            //update the ask if remaing qyt
            const updatedAsk = await Ask.findByIdAndUpdate(
                fill.makerOrderId,
                { $inc: { qty: -matchedQty } },
                { new: true }
            );
            if (updatedAsk && updatedAsk.qty <= 0) {
                await Ask.findByIdAndDelete(fill.makerOrderId);
            }
            remainingQty -= matchedQty;
            filledQty += matchedQty;
        }
        if (remainingQty > 0) {
            await Bid.create({
                _id: payload.orderId,
                orderBookId: payload.orderBookId,
                userId: payload.userId,
                stockType: payload.side,
                price: payload.price,
                qty: remainingQty,
            })
        }


    } else {
        //sell order 
        //get the seller 
        const seller = await User.findById(payload.userId);
        const sellerStock = await StockBalance.findOne({
            userId: payload.userId,
            marketId: payload.marketId,
            type: payload.side,
        })

        if (!seller || !sellerStock) throw new Error("no sellers found!");


        //loop through the bids
        for (const fill of fills) {
            if (remainingQty === 0) break;

            const matchedQty = fill.qty;

            const executionPrice = fill.price;

            // the actualstockprice -> bid.price * bid.qty;
            const actualstockprice = matchedQty * executionPrice;

            //buyer
            const buyer = await User.findById(fill.buyerId);

            if (!buyer || buyer.lockedBalance < actualstockprice) {
                throw new Error("Buyer balance is insufficient")
            }

            //deduct the price from the buyers and move it to the sellers
            buyer.lockedBalance -= actualstockprice;

            //seller recieves the amount 
            seller.balance += actualstockprice;

            // transfer contracts 
            sellerStock.locked -= matchedQty;
            sellerStock.qty -= matchedQty;
            await sellerStock.save();
            await buyer.save();
            await seller.save();


            await addToStockBalance(
                buyer._id,
                payload.marketId,
                payload.side,
                matchedQty
            );

            //record seller and buyer fills 
            await Fill.create([
                {
                    orderbookId: payload.orderBookId,
                    userId: buyer._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "buy",
                    isMaker: true
                },
                {
                    orderbookId: payload.orderBookId,
                    userId: seller._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "sell",
                    isMaker: false
                }
            ]);

            // Update the resting Bid (or delete if qty reaches 0)
            const updatedBid = await Bid.findByIdAndUpdate(
                fill.makerOrderId,
                { $inc: { qty: -matchedQty } },
                { new: true }
            );
            if (updatedBid && updatedBid.qty <= 0) {
                await Bid.findByIdAndDelete(fill.makerOrderId);
            }
            remainingQty -= matchedQty;
            filledQty += matchedQty;
        }
        if (remainingQty > 0) {
            await Ask.create({
                _id: payload.orderId,
                orderBookId: payload.orderBookId,
                userId: payload.userId,
                stockType: payload.side,
                price: payload.price,
                qty: remainingQty,
            })
        }

    }

    await syncDepth(payload.orderBookId);
    console.log(`Processed ${payload.type} order ${payload.orderId} | fills: ${fills.length}`);

}

export async function handleCancel(payload: {
    orderId: string;
    orderBookId: string;
    orderType: "buy" | "sell";
    userId: string;
}) {
    //cancel the order in the ram first if flase that means the order id already fullfilled 
    // delete it from the database 
    //get teh pending bid from teh ask table 

    //delete from inmemonry 
    const removed = engine.cancelOrder(payload.orderBookId.toString(), payload.orderId);
    if (!removed) {
        console.log(`Order ${payload.orderId} already filled or missing, skipping cancel.`);
        return;
    }
    if (payload.orderType == "buy") {
        const pendingBid = await Bid.findByIdAndDelete(payload.orderId);
        if (pendingBid) {
            const refund = pendingBid.price * pendingBid.qty;
            await User.findByIdAndUpdate(pendingBid.userId, {
                $inc: { lockedBalance: -refund, balance: refund },
            });
            await WalletEvent.create({
                userId: payload.userId,
                tx_type: "refund",
                amount: refund,
                externalId: pendingBid._id,
            });
        }
    }
    else {
        const pendingAsk = await Ask.findByIdAndDelete(payload.orderId);
        if (pendingAsk) {
            const orderbook = await OrderBook.findById(pendingAsk.orderBookId);
            if (orderbook) {
                await StockBalance.findOneAndUpdate(
                    { userId: pendingAsk.userId, marketId: orderbook.marketId, type: pendingAsk.stockType },
                    { $inc: { locked: -pendingAsk.qty } }
                );
            }
        }
    }
    console.log(`Canceled order ${payload.orderId}`);
    await syncDepth(payload.orderBookId);
}


const STREAM = "order_stream";
const GROUP = "engine_group";
const CONSUMER = "worker-1";
// Connect DB , Hydrate Engine , Read Stream Forever
async function main() {
    //connect to mongoose
    //get the openBids and openAsks from the ask and bod table and
    //  hydrate the in,memory engine using engine.hydrate
    //create a consunmer group 
    // make it  listens for orders o nteh redis stream 
    // fi the order is to create do handleCreate
    // if the order is to cancel then do handleCancel
    await mongoose.connect(process.env.DATABASE_URL!);
    console.log("database connected!")

    const openBids = await Bid.find({ qty: { $gt: 0 } }).sort({ createdAt: 1 });
    const openAsks = await Ask.find({ qty: { $gt: 0 } }).sort({ createdAt: 1 });

    engine.hydrate([...openBids.map((b) => ({
        orderBookId: b.orderBookId.toString(),
        order: {
            orderId: b._id.toString(),
            qty: b.qty,
            price: b.price,
            type: "buy" as const,
            userId: b.userId.toString(),
        }
    })),
    ...openAsks.map((a) => ({
        orderBookId: a.orderBookId.toString(),
        order: { orderId: a._id.toString(), price: a.price, qty: a.qty, type: "sell" as const, userId: a.userId.toString() },
    })),
    ])
    const bookIds = new Set([
        ...openBids.map((b) => b.orderBookId.toString()),
        ...openAsks.map((a) => a.orderBookId.toString()),
    ]);
    for (const id of bookIds) {
        await syncDepth(id);
    }

    console.log(`Worker: Engine hydrated with ${openBids.length + openAsks.length} open orders`);
    //create the comsunmer group for that we forst crate a consumere group  but hewr w
    // e will createa. while loopp and read rhe data nm teh group 
    try {
        await client.xgroup("CREATE", STREAM, GROUP, "$", "MKSTREAM");
        console.log(`Worker: Created consumer group "${GROUP}"`);

    } catch (error: any) {
        if (!error.message.includes("BUSYGROUP")) throw error;
    }
    console.log("Worker: Listening for orders on Redis Stream...");

    //infint loop that blocks umtil redis pushes a message
    while (true) {
        //read the redis stream
        const response = await client.xreadgroup(
            "GROUP", GROUP, CONSUMER,
            "COUNT", 1,
            "BLOCK", 0,
            "STREAMS", STREAM, ">"
        );
        if (!response) continue;

        for (const [, messages] of response) {
            for (const [messageId, rawFields] of messages) {
                if (!rawFields) continue;
                const action = rawFields[1];
                const data = JSON.parse(rawFields[3]!);


                if (action === "create") {
                    await handleCreate(data);
                } else if (action === "cancel") {
                    await handleCancel(data);
                }

                // Acknowledge message so Redis marks it complete
                await client.xack(STREAM, GROUP, messageId);


            }
        }

    }

}






//helper funciton that calls engine.getDeth and saves it to redis
async function syncDepth(orderBookId: string) {
    //get the depth using engine.getDepth(orderBookId)
    // push it to the redis (figure out what type of resis datset we nened streams or something else)
    //call it when ever there is a hjaandlecreatre or handlecancel and once on hydrate
    const depth = engine.getDepth(orderBookId);
    await client.set(`depth:${orderBookId}`, JSON.stringify(depth));
    await client.publish('trade_events', JSON.stringify({
        event: "orderbook.update", orderBookId, depth
    }))
}

main();