// userId, marketId,type, qty, locked(locked prevents users from selling the same contracts twice (the "double-spending" problem)
//Tracks how many YES and NO contracts a user owns in each market.

import mongoose from "mongoose";


const stockBalanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    marketId: {
        type: mongoose.Schema.ObjectId,
        ref: "Market",
        required: true,
    },
    type: {
        type: String,
        enum: ["yes", "no"],
        required: true,
    },
    qty: {
        type: Number,
        required: true,
        default: 0,
    },
    locked: {
        type: Number,
        required: true,
        default: 0,
    },
})


stockBalanceSchema.index({ marketId: 1, type: 1 }, { unique: true })

export const StockBalance = mongoose.model("StockBalance", stockBalanceSchema)
