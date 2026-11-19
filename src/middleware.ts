import type { NextFunction, Request, Response } from "express";
import "dotenv/config"
import jwt from "jsonwebtoken"
import { client } from "./redis";
// 1. Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export function auth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const token = header.split(" ")[1];

    try {
        const payload = jwt.verify(token as string, process.env.JWT_SECRET!) as { userId: string };
        req.userId = payload.userId;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
//rate limiter using redis for limited no of requestes for a given time
export function rateLimiter(limit: number, windowSeconds: number) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const key = `ratealimit:${req.userId}`;
            const count = await client.incr(key);
            if (count == 1) {
                await client.expire(key, windowSeconds);
            }
            if (count > limit) {
                return res.status(429).json({
                    message: "Too many requests. Please slow down."
                });
            }
            next();

        } catch (error) {
            //dont block if redis has a hiccup 
            next();
        }
    }
}
