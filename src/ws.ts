import { WebSocket, WebSocketServer } from 'ws';
import { clientMessageSchema, type ServerMessage } from './types/ws';
import { client } from "./redis";

const wss = new WebSocketServer({ port: 8080 });



console.log("Websocket server running in ws://localhost:8080")


function send(ws: WebSocket, msg: ServerMessage) {
    //helper functio to send ws and servermessage  when open 
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg))
    }
}

class RoomManager {
    //marketId and sockets 
    private rooms = new Map<string, Set<WebSocket>>();
    // soockets and marketIds
    private socketRooms = new Map<WebSocket, Set<string>>();


    subscribe(ws: WebSocket, marketId: string) {
        //add ws to rooms.get(marketId) and add marketId to socketRooms.get(ws) 
        //create set if missing
        //check if rooms has the marketId if not make it and add the ws to the set 

        if (!this.rooms.has(marketId)) this.rooms.set(marketId, new Set());
        this.rooms.get(marketId)!.add(ws);

        if (!this.socketRooms.has(ws)) this.socketRooms.set(ws, new Set());
        this.socketRooms.get(ws)!.add(marketId);
    }
    unsubscribe(ws: WebSocket, marketId: string) {
        //delete ws from the rooms set if rooms.size() === 0 delete the room from the rooms 
        //delete the marketId from the socketRooms.get(ws)
        const room = this.rooms.get(marketId);
        if (room) {
            room.delete(ws);
            if (room.size === 0) {
                this.rooms.delete(marketId);
            }
        }

        const markets = this.socketRooms.get(ws);
        if (markets) {
            markets.delete(marketId);
            if (markets.size === 0) {
                this.socketRooms.delete(ws);
            }
        }

    }
    close(ws: WebSocket) {
        // Loop over socketRooms.get(ws) and call this.unsubscribe(ws, marketId) for each one,
        //  then this.socketRooms.delete(ws).
        const markets = this.socketRooms.get(ws);
        if (!markets) return;

        for (const marketId of [...markets]) {
            this.unsubscribe(ws, marketId);
        }



    }
    broadcast(marketId: string, msg: ServerMessage) {
        //that loops the room's Set and calls send.
        const room = this.rooms.get(marketId);
        if (!room) {
            return;
        }
        for (const client of [...room]) {
            send(client, msg);
        }
    }
}
const roomManager = new RoomManager();




const sub = client.duplicate();
sub.subscribe('trade_events', (err) => {
    if (err) console.log(err);
    else console.log("subscribed to trade events!!")
})

sub.on("message", (channel, rawMsg) => {
    if (channel !== "trade_events") return;
    const event = JSON.parse(rawMsg);
    roomManager.broadcast(event.marketId, event);

})



wss.on("connection", (ws) => {
    console.log("client connected")
    ws.send("Hello ws")

    ws.on("message", (raw) => {
        let json: unknown;
        try {
            json = JSON.parse(raw.toString());
        } catch (error) {
            return send(ws, { type: "error", message: "Invalid JSON" })
        }
        const { success, data } = clientMessageSchema.safeParse(json);
        if (!success) {
            return send(ws, { type: "error", message: "Invalid inpput " })

        }
        switch (data.type) {
            case "ping":
                send(ws, { type: "pong" })
                break;
            case "subscribe":
                roomManager.subscribe(ws, data.marketId);
                send(ws, { type: "subscribed", marketId: data.marketId })
                break;
            case "unsubscribe":
                roomManager.unsubscribe(ws, data.marketId);
                send(ws, { type: "unsubscribed", marketId: data.marketId })
                break;

            default:
                break;
        }
    })
    ws.on("close", () => {
        roomManager.close(ws);
        console.log("client disconnected")
    })
    ws.on("error", (err) => {
        console.log(err);
    })

})



