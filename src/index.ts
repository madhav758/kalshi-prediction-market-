import express from "express";
import mongoose from "mongoose"
import "dotenv/config";

const app = express();
app.use(express.json());

import authRouter from "./routes/auth"
import marketRouter from "./routes/market"

//routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/market", marketRouter);
// app.use("/api/v1/resolve", resolveRouter);

async function main() {
    await mongoose.connect(process.env.DATABASE_URL!);
    console.log("mongoose connected!");


    app.listen(process.env.PORT || 3000, () => {
        console.log("Server running on port 3000");
    });
}
main();




