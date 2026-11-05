import mongoose from "mongoose";

const userModel = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    lockedBalance: {
        type: Number,
        required: true,
        default: 0,
    }
})
export const User = mongoose.model("User", userModel);
