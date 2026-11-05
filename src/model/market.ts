import mongoose from "mongoose";
import { User } from "./user";

const marketModel = new mongoose.Schema({
    // initialWager, title , side ,creatorId,expiry ,resolution, 
    title: {
        type: String,
        required: true,
    },
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: User,
        required: true,
    },
    expiry: {
        type: Date,
        required: true,
    },
    totalIssued: {
        type: Number,
        default: 0,
    },
    resolution: {
        type: String,
        enum: ["yes", "no", null],
        default: null,
    },
})
export const Market = mongoose.model("Market", marketModel);
