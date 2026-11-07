import type { Request, Response } from "express";
import { Market } from "../model/market";
import { resolveMarketSchema } from "../types/resolve";
import { StockBalance } from "../model/stockBalance";
import { User } from "../model/user";
import { WalletEvent } from "../model/walletEvent";
import { Ask, Bid } from "../model/order";
import { OrderBook } from "../model/orderBook";

async function resolve(req: Request, res: Response) {
    const { success, data } = resolveMarketSchema.safeParse(req.body)
    if (!success) {
        return res.status(400).json({
            message: "wrong input"
        })
    }

    const market = await Market.findOne({
        _id: data.marketId,
        resolution: null,
    })
    if (!market) {
        return res.status(404).json({
            message: "no market found"
        })
    }

    //only marketcreator ccan resolve
    if (market.creatorId.toString() !== req.userId) {
        return res.status(403).json({
            message: "not market creator"
        })
    }
    if (new Date() < market.expiry) {
        return res.status(400).json({
            message: "Market has not expired yet"
        })
    }
    //---------------------------
    // the market is resolved 

    market.resolution = data.resolution;
    await market.save();

    //payout the winning shares

    const PAYOUT_PER_SHARE = 100;

    const winningPositions = await StockBalance.find({
        marketId: market._id,
        type: data.resolution,
        qty: { $gt: 0 }
    })

    for (const pos of winningPositions) {
        const payoutAmount = pos.qty * PAYOUT_PER_SHARE;
        //Credit the payout to user's balance
        await User.findByIdAndUpdate(pos.userId, {
            $inc: { balance: payoutAmount }
        });
        // Create wallet transaction record for audit trail
        await WalletEvent.create({
            userId: pos.userId,
            tx_type: "payout",
            amount: payoutAmount,
            externalId: market._id
        });
        //Zero out the winning contracts
        pos.qty = 0;
        pos.locked = 0;
        await pos.save();

    }

    const losingSide = data.resolution === "yes" ? "no" : "yes";
    await StockBalance.updateMany({
        marketId: market._id,
        type: losingSide,
    },
        {
            $set: { qty: 0, locked: 0 }
        })

    // return the money to the poending buyers 
    const orderbook = await OrderBook.find({
        marketId: data.marketId,
    })
    const orderbookIds = orderbook.map((ob) => {
        return ob._id
    })
    const pendingBuyers = await Bid.find({
        orderBookId: { $in: orderbookIds },
        qty: { $gt: 0 }
    })
    for (const bid of pendingBuyers) {
        const refund = bid.price * bid.qty;
        await User.findByIdAndUpdate(
            bid.userId,
            {
                $inc: {
                    lockedBalance: -refund,
                    balance: +refund
                }
            }
        )
        // Record the refund in wallet history
        await WalletEvent.create({
            userId: bid.userId,
            tx_type: "refund",
            amount: refund,
            externalId: bid._id
        });
        await Bid.deleteOne({
            _id: bid._id
        })
    }

    //delete remaining opens Asks 
    const openAsks = await Ask.find({
        orderBookId: { $in: orderbookIds },
        qty: { $gt: 0 }
    })
    for (const ask of openAsks) {
        await Ask.deleteOne({
            _id: ask._id
        })
    }
    return res.status(200).json({
        message: "Market resolved successfully",
        marketId: market._id,
        resolution: data.resolution
    });
}

