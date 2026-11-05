// immutable trade execution record
// Every time a buyer matches with a seller, two Fill records are created: one for the maker (who was waiting) and one for the taker (who just arrived).


import mongoose from "mongoose";

const FillSchema = new mongoose.Schema({
    orderbookId: {
        type: mongoose.Schema.ObjectId,
        ref: "OrderBook",
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    qty: {
        type: Number,
        required: true,
    },
    type: {
        type: String,
        enum: ["buy", "sell"],
        required: true,
    },
    isMaker: {
        type: Boolean,
        required: true, // true if order was already resting in book, false if incoming taker
    },
}, {
    timestamps: true
})

export const Fill = mongoose.model("Fill", FillSchema);