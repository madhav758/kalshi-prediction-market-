


// create market,getmarkets, placebet , getbets



import type { Types } from "mongoose";
import { Fill } from "../model/fill";
import { Market } from "../model/market";
import { Ask, Bid } from "../model/order";
import { OrderBook } from "../model/orderBook";
import { StockBalance } from "../model/stockBalance";
import { User } from "../model/user";

import { createMarketSchema, createOrderSchema } from "../types/market";
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

    let remainingQty = data.qty;
    let filledQty = 0;
    let pendingOrder = null;
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


        //find ask for the same side priced at or below the buyers limit sort by lowest price and then oldest order 
        const matchingAsks = await Ask.find({
            orderBookId: orderbook._id,
            stockType: data.side,
            price: { $lte: data.amount },
            qty: { $gt: 0 }
        }).sort({ price: 1, createdAt: 1, _id: 1 })

        //match the cheapest asks first 
        for (const ask of matchingAsks) {
            if (remainingQty == 0) break;

            //find the matched quantity 
            const matchedQty = Math.min(remainingQty, ask.qty)

            // the executiton price
            const executionPrice = ask.price;
            //the actual price 
            const actualPrice = matchedQty * executionPrice;

            // reservedforMatch price is the price* matched qty 
            // we need to deduct that frim the locked and refund reservedformatch -actualPrice.
            const reservedforMatch = data.amount * matchedQty;

            const refund = reservedforMatch - actualPrice;

            // to do the exchnage we must first confirm the seller 

            const seller = await User.findById(ask.userId);
            const sellerStock = await StockBalance.findOne({
                userId: ask.userId,
                marketId: data.marketId,
                type: data.side,
            });

            if (!seller || !sellerStock || sellerStock.locked < matchedQty || sellerStock.qty < matchedQty) {
                throw new Error(
                    "Seller balance is inconsistent"
                );
            }

            // Spend the matched part of buyer's
            // locked money and return price improvement.
            // i.e deduct reservedforMatch frim the locked and refund reservedformatch -actualPrice to the buyer 

            user.lockedBalance -= reservedforMatch;
            user.balance += refund;
            seller.balance += actualPrice;
            // Transfer contracts.
            sellerStock.qty -= matchedQty;
            sellerStock.locked -= matchedQty;
            await user.save();
            await seller.save();
            await sellerStock.save();

            //upadate the databases 
            await addToStockBalance(user._id, data.marketId, data.side, matchedQty);


            //record seller and buyher fills
            await Fill.create([
                {
                    orderbookId: orderbook._id,
                    userId: seller._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "sell",
                    isMaker: true
                },
                {
                    orderbookId: orderbook._id,
                    userId: user._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "buy",
                    isMaker: false
                }
            ]);

            //deduct matchedqty frim ask.qty
            ask.qty -= matchedQty;
            if (ask.qty === 0) {
                await Ask.deleteOne({
                    _id: ask._id
                })
            } else {
                await ask.save();
            }
            remainingQty -= matchedQty;
            filledQty += matchedQty;
        }
        if (remainingQty > 0) {
            pendingOrder = await Bid.create({
                orderBookId: orderbook._id,
                userId: user._id,
                stockType: data.side,
                price: data.amount,
                qty: remainingQty,
            })
        }
    }
    //SELL ORDER
    else {
        // ensure user owns enough unlocked contracts in teh stockBalance
        // lock the contracts being offered
        const maxContracts = data.qty;

        const stockbalance = await StockBalance.findOne({
            userId: req.userId,
            marketId: data.marketId,
            type: data.side,
        })
        if (!stockbalance) {
            return res.status(404).json({
                message: "no stocks found"
            })
        }

        stockbalance.locked += maxContracts;
        await stockbalance.save();
        // find the matching contracts in descending order of price.
        const matchingContracts = await Bid.find({
            orderBookId: orderbook._id,
            userId: req.userId,
            stockType: data.side,
            price: { $gte: data.amount },
            qty: { $gt: 0 },
        }).sort({
            price: -1,
            createdAt: 1,
            _id: 1
        });

        //loop through the bids
        for (const bid of matchingContracts) {
            if (remainingQty === 0) break;

            const matchedQty = Math.min(remainingQty, bid.qty);

            const executionPrice = bid.price;

            // the actualstockprice -> bid.price * bid.qty;
            const actualstockprice = matchedQty * executionPrice;

            //buyer
            const buyer = await User.findById(bid.userId)

            if (!buyer || buyer.lockedBalance < actualstockprice) {
                throw new Error("Buyer balance is insufficient")
            }

            //deduct the price from the buyers and move it to the sellers
            buyer.lockedBalance -= actualstockprice;

            //seller recieves the amount 
            user.balance += actualstockprice;

            // transfer contracts 
            stockbalance.locked -= matchedQty;
            stockbalance.qty -= matchedQty;
            await stockbalance.save();
            await buyer.save();
            await user.save();


            await addToStockBalance(
                buyer._id,
                data.marketId,
                data.side,
                matchedQty
            );

            //record seller and buyer fills 

            await Fill.create([
                {
                    orderbookId: orderbook._id,
                    userId: user._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "sell",
                    isMaker: true
                },
                {
                    orderbookId: orderbook._id,
                    userId: buyer._id,
                    price: executionPrice,
                    qty: matchedQty,
                    type: "buy",
                    isMaker: false
                }
            ])
            bid.qty -= matchedQty;
            if (bid.qty === 0) {
                await Bid.deleteOne({
                    _id: bid._id
                })
            }
            remainingQty -= matchedQty;
            filledQty += matchedQty;
        }
        if (remainingQty > 0) {
            await Ask.create({
                orderBookId: orderbook._id,
                userId: user._id,
                stockType: data.side,
                price: data.amount,
                qty: remainingQty
            })
        }
    }
    const status =
        remainingQty === 0
            ? "FILLED"
            : filledQty === 0
                ? "OPEN"
                : "PARTIALLY_FILLED";

    return res.status(201).json({
        message: "Order processed",
        orderId: pendingOrder?._id ?? null,
        marketId: data.marketId,
        type: data.type,
        side: data.side,
        price: data.amount,
        requestedQty: data.qty,
        filledQty,
        remainingQty,
        status
    });
}