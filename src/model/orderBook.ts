import mongoose from "mongoose";
import { Market } from "./market";

const OrderBookSchema = new mongoose.Schema({
    marketId: {
        type: mongoose.Schema.ObjectId,
        ref: "Market",
        required: true,

    },
    type: {
        type: String,
        enum: ["yes", "no"],
        required: true,
    }

})


// Ensure each market only has one YES book and one NO book
OrderBookSchema.index({ marketId: 1, type: 1 }, { unique: true })

export const OrderBook = mongoose.model("OrderBook", OrderBookSchema);