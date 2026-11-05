import mongoose from "mongoose";


const OrderSchema = new mongoose.Schema({
    orderBookId: {
        type: mongoose.Schema.ObjectId,
        ref: "OrderBook",
        required: true,
    },
    userId: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
    },
    stockType: {
        type: String,
        enum: ["yes", "no"],
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
},
    {
        timestamps: true,
    })

export const Bid = mongoose.model("Bid", OrderSchema);
export const Ask = mongoose.model("Ask", OrderSchema);
