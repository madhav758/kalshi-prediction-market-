// signup signin onramp getProfile, getTransactins

import { onrampSchema, signinSchema, signupSchema } from "../types/auth";
import { WalletEvent } from "../model/walletEvent";
import { User } from "../model/user";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import "dotenv/config"
import type { Request, Response } from "express";

export async function signup(req: Request, res: Response) {
    try {
        const parsed = signupSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues });
        }
        const { username, password } = parsed.data;
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({
                message: "User already exists!"
            })
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        //database entry 
        const user = await User.create({
            username,
            password: hashedPassword,
            balance: 0,
        });
        //return success status
        return res.status(200).json({
            id: user._id,
            message: "User created!"
        })

    } catch (error) {
        return res.status(400).json({
            error: error.message,
        });
    }
}

// Signin
export async function signin(req: Request, res: Response) {
    try {
        const { username, password } = signinSchema.parse(req.body);

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                error: "Invalid credentials",
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).json({
                error: "Invalid credentials",
            });
        }

        const token = jwt.sign(
            { userId: user._id.toString() },
            process.env.JWT_SECRET!
        );

        return res.json({ token });
    } catch (error) {
        return res.status(400).json({
            error: error.message,
        });
    }
}

export async function onramp(req: Request, res: Response) {
    // add fake money to the user
    try {
        const parsedOnramp = onrampSchema.safeParse(req.body);
        if (!parsedOnramp.success) {
            return res.status(400).json({ error: parsedOnramp.error.issues });
        }
        const { amount } = parsedOnramp.data;
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $inc: { balance: amount } },
            { new: true },
        )
        if (!user) {
            return res.status(409).json({
                message: "User not found"
            })
        }
        await WalletEvent.create({
            userId: req.userId,
            tx_type: "onramp",
            amount,
        })

        return res.json({
            balance: user.balance
        });

    } catch (error) {
        return res.status(400).json({
            message: error
        });
    }
}
//Profile
export async function getProfile(req: Request, res: Response) {
    try {
        const userId = req.userId;
        const user = await User.findById(userId).select("-password");
        if (!user) {
            return res.status(409).json({
                message: "No user"
            })
        }
        res.json(user);
    } catch (error) {
        return res.status(400).json({
            message: "error while getting profile"
        })
    }
}

//get wallet history 
export async function getTransactions(req: Request, res: Response) {
    //fetch the wallet history
    try {
        const transactions = await WalletEvent.find({ userId: req.userId });
        return res.json(transactions);
    } catch (error) {
        return res.status(400).json({
            message: "error while fetching the trancactions"
        })
    }
}