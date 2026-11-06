import type { NextFunction, Request, Response } from "express";
import "dotenv/config"
import jwt from "jsonwebtoken"
// 1. Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export default function auth(req: Request, res: Response, next: NextFunction) {
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
