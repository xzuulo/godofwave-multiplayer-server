import { WebSocketServer, WebSocket } from "ws";
import * as url from "url";
import store from "../store.js";
import config from "../config.js";
import {
  getPublicRoomsArray,
  broadcastStats,
  cleanupClient,
  createRoom,
  joinRoom,
  leaveCurrentRoom,
} from "./rooms.js";

export default function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = store.clients.get(ws);
      if (!client) return;

      if (client.isAlive === false) {
        cleanupClient(ws);
        return ws.terminate();
      }

      client.isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ Type: "ping" }));
      }
    });
  }, 15000);

  wss.on("close", () => clearInterval(interval));

  wss.on("connection", (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const gameId = (parsedUrl.query.gameId || config.DEFAULT_GAME_ID).toString();

    store.clients.set(ws, {
      gameId: gameId,
      clientId: "",
      nickname: "Player",
      levelId: "",
      roomId: "",
      isAlive: true,
    });

    ws.send(JSON.stringify({ Type: "RoomsList", Rooms: getPublicRoomsArray(gameId) }));
    broadcastStats(gameId);

    ws.on("message", (message) => {
      try {
        const jsonString = message.toString();
        const data = JSON.parse(jsonString);
        const client = store.clients.get(ws);
        if (!client) return;

        if (data.GameId && data.GameId !== client.gameId) {
          client.gameId = data.GameId;
        }

        if (data.Type === "pong" || data.Type === "ping") {
          client.isAlive = true;
          return;
        }

        if (data.ClientId && data.ClientId.trim() !== "") {
          if (client.clientId !== data.ClientId) {
            store.clients.forEach((otherData, otherWs) => {
              if (
                otherWs !== ws &&
                otherData.clientId === data.ClientId &&
                otherData.gameId === client.gameId
              ) {
                cleanupClient(otherWs);
                try {
                  otherWs.terminate();
                } catch (e) {}
              }
            });
            client.clientId = data.ClientId;
          }
        }

        if (data.Nickname) client.nickname = data.Nickname;

        if (data.Type === "CreateRoom") {
          createRoom(ws, data.MaxPlayers || 4, data.IsPrivate || false, data.LevelId || "");
          return;
        }

        if (data.Type === "JoinRoom") {
          const room = store.rooms.get(data.RoomId);
          if (room && room.gameId === client.gameId) {
            joinRoom(ws, room);
          } else {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ Type: "RoomError", Message: "Комната не найдена" }));
            }
          }
          return;
        }

        if (data.Type === "JoinByCode") {
          const targetCode = (data.Code || "").toString().trim();
          const room = Array.from(store.rooms.values()).find(
            (r) => r.code === targetCode && r.gameId === client.gameId
          );

          if (room) {
            joinRoom(ws, room);
          } else {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ Type: "RoomError", Message: "Неверный код комнаты" }));
            }
          }
          return;
        }

        if (data.Type === "AutoJoin") {
          const targetLevel = data.LevelId || "";
          const availableRooms = Array.from(store.rooms.values())
            .filter(
              (r) =>
                r.gameId === client.gameId &&
                !r.isPrivate &&
                r.levelId === targetLevel &&
                r.clients.size < r.maxPlayers
            )
            .sort((a, b) => b.clients.size - a.clients.size);

          if (availableRooms.length > 0) {
            joinRoom(ws, availableRooms[0]);
          } else {
            createRoom(ws, 4, false, targetLevel);
          }
          return;
        }

        if (data.Type === "LeaveRoom") {
          leaveCurrentRoom(ws);
          return;
        }

        if (data.Type === "LeaveLevel") {
          client.levelId = "";
          broadcastStats(client.gameId);
          return;
        }

        if (data.Type === "GetRooms") {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                Type: "RoomsList",
                Rooms: getPublicRoomsArray(client.gameId),
              })
            );
          }
          return;
        }

        if (data.Type === "pos" || data.Type === "init") {
          const incomingLevelId = data.LevelId || data.levelId;
          if (incomingLevelId && client.levelId !== incomingLevelId) {
            client.levelId = incomingLevelId;
            broadcastStats(client.gameId);
          }

          const targetRoomId = data.RoomId || client.roomId;
          const targetLevelId = data.LevelId || client.levelId;

          if (targetRoomId && store.rooms.has(targetRoomId)) {
            const room = store.rooms.get(targetRoomId);
            room.clients.forEach((otherWs) => {
              if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(jsonString);
              }
            });
          } else if (targetLevelId) {
            store.clients.forEach((otherClient, otherWs) => {
              if (
                otherWs !== ws &&
                otherWs.readyState === WebSocket.OPEN &&
                otherClient.gameId === client.gameId &&
                otherClient.levelId === targetLevelId &&
                !otherClient.roomId
              ) {
                otherWs.send(jsonString);
              }
            });
          }
          return;
        }
      } catch (error) {
        console.error(error.message);
      }
    });

    ws.on("close", () => cleanupClient(ws));
    ws.on("error", () => cleanupClient(ws));
  });
}
