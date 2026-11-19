


// create market,getmarkets, placebet , getbets



import { Types } from "mongoose";
import { Fill } from "../model/fill";
import { Market } from "../model/market";
import { Ask, Bid } from "../model/order";
import { OrderBook } from "../model/orderBook";
import { StockBalance } from "../model/stockBalance";
import { User } from "../model/user";

import { createMarketSchema, createOrderSchema, deleteOrderSchema, mintSchema } from "../types/market";
import type { Request, Response } from "express";
import { WalletEvent } from "../model/walletEvent";
import { engine } from "../engine";
import { client } from "../redis";

const STREAM = "order_stream";
const GROUP = "engine_group";
const CONSUMER = "worker-1";



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




export async function createMarket(req: Request, res: Response) {
    try {
        // validate the title from teh req.body 
        // reada the creatorId from the autheticated user 
        //create market in mongodb
        //crate yes orderbook 
        //create no orderbook 
        // return the marketId
        const { success, data } = createMarketSchema.safeParse(req.body);

        if (!success) {
            return res.status(400).json({
                message: "wrong input"
            })
        }
        const creatorId = req.userId;

        const market = await Market.create({
            ...data,
            creatorId,
            expiry: data.expiry,
        })

        await OrderBook.create([
            {
                marketId: market._id,
                type: "yes"
            },
            {
                marketId: market._id,
                type: "no"
            }
        ])
        await client.del("market:all");

        //return the market id 
        return res.status(200).json({
            marketId: market._id
        })

    } catch (error) {
        res.status(400).json({
            message: error
        })

    }
}















export async function getmarkets(req: Request, res: Response) {

    try {
        const cachedMarket = await client.get("market:all");
        if (cachedMarket) return res.json(JSON.parse(cachedMarket));

        const markets = await Market.find().populate("creatorId", "username")
        console.log(markets);
        await client.set("market:all", JSON.stringify(markets));
        await client.expire("market:all", 30);
        return res.status(200).json(markets);

    } catch (error) {
        return res.status(400).json({
            message: error
        })
    }
}



export async function createOrder(req: Request, res: Response) {
    // get the req.body(marketId, type, side, price, qty) for the createOrderSchema ad safe parse it 
    // find unresolved market
    // find that market's order book for the requested side
    // find authenticated user

    const { success, data } = createOrderSchema.safeParse(req.body);
    if (!success) {
        return res.status(409).json({
            message: "Invalid input!"
        })
    }

    const unresolvedMarket = await Market.findOne({
        _id: data.marketId,
        resolution: null
    })

    if (!unresolvedMarket) {
        return res.status(409).json({
            message: "cant find market must be already resolved!"
        })
    }




    //find yes or no orderbook using side.
    const orderbook = await OrderBook.findOne({
        marketId: data.marketId,
        type: data.side,
    })
    if (!orderbook) {
        return res.status(404).json({
            message: "Order book not found"
        })
    }
    //get the user
    const user = await User.findById(req.userId);
    if (!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    //maxPrice =price* qty this is the amount that must be locked
    const maxPrice = data.amount * data.qty;


    if (data.type === "buy") {

        //check the buyer has enough balance if yes then lock the price.
        if (user?.balance < maxPrice) {
            return res.json({
                message: "insufficient balance"
            })
        }
        user.balance -= maxPrice;
        user.lockedBalance += maxPrice;
        await user.save();


    }
    //SELL ORDER
    else {
        // ensure user owns enough unlocked contracts in teh stockBalance
        // lock the contracts being offered
        const maxContracts = data.qty

        const stockbalance = await StockBalance.findOne({
            userId: req.userId,
            marketId: data.marketId,
            type: data.side,
        })
        if (!stockbalance || (stockbalance.qty - stockbalance.locked) < maxContracts) {
            return res.status(400).json({
                message: "Insufficient unlocked shares"
            })
        }

        stockbalance.locked += maxContracts;
        await stockbalance.save();



    }
    //push to queue redis stream
    const orderId = new Types.ObjectId().toString();
    await client.xadd("order_stream", "*", "action", "create", "payload", JSON.stringify({
        orderId,
        orderBookId: orderbook._id.toString(),
        marketId: data.marketId,
        userId: req.userId!,
        type: data.type,
        side: data.side,
        price: data.amount,
        qty: data.qty,
    }))
    // 3. Respond immediately without waiting for matching
    return res.status(202).json({
        message: "Order queued",
        orderId,
        status: "QUEUED",
    });



}














export async function deleteOrder(req: Request, res: Response) {
    const { success, data } = deleteOrderSchema.safeParse(req.body);
    if (!success) {
        return res.status(409).json({
            message: "invalid Input!"
        })
    }
    // of buy order then  remove the amount from the users locked balance and add them to the balance 
    // if sell , remove the locked stock qty  from the users stockBalance 
    if (data.orderType === "buy") {

        const pendingBid = await Bid.findOne({
            _id: data.orderId,
            userId: req.userId,
        })
        if (!pendingBid) {
            return res.status(400).json({
                message: "no pendng bids"
            })
        }
        await client.xadd("order_stream",
            "*",
            "action", "cancel",
            "payload", JSON.stringify({
                orderId: data.orderId,
                orderType: data.orderType,
                userId: req.userId,
                orderBookId: pendingBid.orderBookId.toString()
            })
        )
        return res.status(202).json({
            message: "Cancel request queued",
            orderId: data.orderId,
            status: "CANCEL_QUEUED",
        });

        // return res.status(200).json({ message: "Buy order canceled", refund });
    } else {
        const pendingAsk = await Ask.findOne({
            _id: data.orderId,
            userId: req.userId,
        })
        if (!pendingAsk) {
            return res.status(400).json({
                message: "No peding asks"
            })
        }
        await client.xadd("order_stream",
            "*",
            "action", "cancel",
            "payload", JSON.stringify({
                orderId: data.orderId,
                orderType: data.orderType,
                userId: req.userId,
                orderBookId: pendingAsk.orderBookId.toString()
            })
        )
        return res.status(202).json({
            message: "Cancel request queued",
            orderId: data.orderId,
            status: "CANCEL_QUEUED",
        });
    }

}
















//User Positions / Portfolio
export async function getUserPositions(req: Request, res: Response) {
    try {
        const positions = await StockBalance.find({
            userId: req.userId,
            qty: { $gt: 0 }
        }).populate("marketId");

        return res.status(200).json(positions);
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching user positions",
            error: error.message
        });
    }
}














//User Active Orders
export async function getUserOrders(req: Request, res: Response) {
    try {
        const [bids, asks] = await Promise.all([
            Bid.find({ userId: req.userId, qty: { $gt: 0 } }).populate("orderBookId"),
            Ask.find({ userId: req.userId, qty: { $gt: 0 } }).populate("orderBookId")
        ]);

        return res.status(200).json({
            bids,
            asks
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching active orders",
            error: error.message
        });
    }
}















//Orderbook Depth 
export async function getOrderBookDepth(req: Request, res: Response) {
    try {
        const { marketId } = req.params;

        // Fetch both YES and NO orderbooks for this market
        const [yesBook, noBook] = await Promise.all([
            OrderBook.findOne({ marketId, type: "yes" }),
            OrderBook.findOne({ marketId, type: "no" })
        ]);

        if (!yesBook && !noBook) {
            return res.status(404).json({
                message: "Orderbooks not found for this market"
            });
        }

        // Worker (Terminal 2) owns the live in-memory engine and syncs depth to Redis;
        // reading engine.getDepth() here in Express (Terminal 1) would return stale boot-time RAM.
        const [yesRaw, noRaw] = await Promise.all([
            yesBook ? client.get(`depth:${yesBook._id.toString()}`) : null,
            noBook ? client.get(`depth:${noBook._id.toString()}`) : null,
        ]);

        const yesDepth = yesRaw ? JSON.parse(yesRaw) : { bids: [], asks: [] };
        const noDepth = noRaw ? JSON.parse(noRaw) : { bids: [], asks: [] };
        //  Return the grouped depth
        return res.status(200).json({
            yes: yesDepth,
            no: noDepth
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error fetching orderbook depth",
            error: error.message
        });
    }
}














export async function mint(req: Request, res: Response) {
    try {
        const { success, data } = mintSchema.safeParse(req.body);
        if (!success) {
            return res.status(400).json({ message: "Invalid input!" });
        }

        // 1. Make sure market exists and is not resolved
        const market = await Market.findOne({
            _id: data.marketId,
            resolution: null,
        });
        if (!market) {
            return res.status(404).json({ message: "Market not found or already resolved" });
        }

        // 2. Check user has enough cash (1 YES + 1 NO pair = 100 units)
        const cost = data.qty * 100;
        const user = await User.findById(req.userId);
        if (!user || user.balance < cost) {
            return res.status(400).json({ message: "Insufficient balance" });
        }

        // 3. Deduct cash from user
        user.balance -= cost;
        await user.save();

        // 4. Credit equal YES and NO shares using your existing helper!
        await addToStockBalance(user._id, data.marketId, "yes", data.qty);
        await addToStockBalance(user._id, data.marketId, "no", data.qty);

        // 5. Track total minted pairs on the market
        market.totalIssued += data.qty;
        await market.save();

        return res.status(200).json({
            message: "Minted contracts successfully",
            yes: data.qty,
            no: data.qty,
            cost,
        });
    } catch (error: any) {
        return res.status(500).json({
            message: "Error minting contracts",
            error: error.message,
        });
    }
}



