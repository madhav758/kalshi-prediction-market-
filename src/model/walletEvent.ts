import mongoose from "mongoose";

const walletEventSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    tx_type: {
        type: String,
        enum: ["onramp", "payout", "refund"],
        required: true,
    },
    externalId: {
        type: mongoose.Schema.Types.Mixed,
    },
    amount: {
        type: Number,
        required: true,
    },
});

export const WalletEvent = mongoose.model(
    "WalletEvent",
    walletEventSchema
);