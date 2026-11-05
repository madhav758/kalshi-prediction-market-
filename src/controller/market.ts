


// create market,getmarkets, placebet , getbets

import { Market } from "../model/market";
import { Ask } from "../model/order";
import { OrderBook } from "../model/orderBook";
import { User } from "../model/user";
import { WalletEvent } from "../model/walletEvent";
import { createMarketSchema, createOrderSchema, placeBetSchema } from "../types/market";
import type { Request, Response } from "express";


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
            expiry: new Date(),
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
        const markets = await Market.find().populate("creatorId", "username")
        console.log(markets);
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

    const unresolvedMarketOrderbook = await OrderBook.find({ marketId: data.marketId })


    let remainingQty = data.qty;
    let filledQty = 0;
    let pendingOrder = null;
    if (data.type === "buy") {
        //find yes or no orderbook using side.
        const orderBook = await OrderBook.findOne({
            marketId: data.marketId,
            type: data.side,
        })
        if (!orderBook) {
            return res.status(404).json({
                message: "Order book not found"
            })
        }
        //price* qty 
        const totalPrice = data.amount * data.qty;
        //check the buyer has enough balance 
        const user = await User.findById(req.userId);
        if (user?.balance < totalPrice) {
            return res.json({
                message: "insufficient balance"
            })
        }
        //find ask for the same side priced at or below the buyers limit sort by lowest price and then oldest order 
        const matchingAsks = await Ask.find({
            orderBookId: orderBook._id,
            stockType: data.type,
            price: { $lte: data.amount },
            qty: { $gt: 0 }
        }).sort({ price: 1, createdAt: 1, _id: 1 })
        //match the cheapest asks first 
        for (const ask of matchingAsks) {
            if (remainingQty == 0) break;


        }
        //Transfer matches contracts from seller to the buyer and pay the seller 
        //saved the unmatched quantity as a pending bid.






    }


}