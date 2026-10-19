import store from "../store.js";
import config from "../config.js";
import { WebSocket } from "ws";

export function broadcastStats(gameId = config.DEFAULT_GAME_ID) {
  let totalPlayers = 0;
  let levelCounts = {};

  store.clients.forEach((data) => {
    if (data.gameId === gameId) {
      totalPlayers++;
      if (data.levelId && data.levelId.trim() !== "") {
        levelCounts[data.levelId] = (levelCounts[data.levelId] || 0) + 1;
      }
    }
  });

  let levelStatsArray = [];
  for (let level in levelCounts) {
    levelStatsArray.push({ LevelId: level, PlayerCount: levelCounts[level] });
  }

  const statsPacket = JSON.stringify({
    Type: "Stats",
    TotalPlayers: totalPlayers,
    LevelStats: levelStatsArray,
  });

  store.clients.forEach((clientData, clientWs) => {
    if (clientData.gameId === gameId && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(statsPacket);
    }
  });
}

export function getPublicRoomsArray(gameId = config.DEFAULT_GAME_ID) {
  const list = [];
  store.rooms.forEach((room) => {
    if (room.gameId === gameId && !room.isPrivate) {
      list.push({
        Id: room.id,
        Number: room.number,
        Code: room.code,
        CurrentPlayers: room.clients.size,
        MaxPlayers: room.maxPlayers,
        IsPrivate: false,
        LevelId: room.levelId,
      });
    }
  });
  return list;
}

export function broadcastRoomsList(gameId = config.DEFAULT_GAME_ID) {
  const packet = JSON.stringify({
    Type: "RoomsList",
    Rooms: getPublicRoomsArray(gameId),
  });

  store.clients.forEach((clientData, ws) => {
    if (clientData.gameId === gameId && ws.readyState === WebSocket.OPEN) {
      ws.send(packet);
    }
  });
}

export function sendRoomUpdate(room) {
  const roomData = {
    Type: "RoomJoined",
    Room: {
      Id: room.id,
      Number: room.number,
      Code: room.code,
      CurrentPlayers: room.clients.size,
      MaxPlayers: room.maxPlayers,
      IsPrivate: room.isPrivate,
      LevelId: room.levelId,
    },
  };
  const packet = JSON.stringify(roomData);

  room.clients.forEach((clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(packet);
    }
  });
}

export function generate4DigitCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (Array.from(store.rooms.values()).some((r) => r.code === code));
  return code;
}

export function createRoom(ws, maxPlayers = 4, isPrivate = false, levelId = "") {
  leaveCurrentRoom(ws);

  const client = store.clients.get(ws);
  const currentGameId = client ? client.gameId : config.DEFAULT_GAME_ID;

  store.roomIndexCounter++;
  const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const roomCode = generate4DigitCode();

  const room = {
    id: roomId,
    gameId: currentGameId,
    region: config.REGION_ID,
    number: store.roomIndexCounter,
    code: roomCode,
    isPrivate: isPrivate,
    maxPlayers: Math.max(2, Math.min(maxPlayers, 10)),
    levelId: levelId,
    clients: new Set([ws]),
  };

  store.rooms.set(roomId, room);

  if (client) {
    client.roomId = roomId;
    client.levelId = levelId;
  }

  sendRoomUpdate(room);
  if (!isPrivate) broadcastRoomsList(currentGameId);
  broadcastStats(currentGameId);

  return room;
}

export function joinRoom(ws, room) {
  if (!room) return false;

  if (room.clients.size >= room.maxPlayers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ Type: "RoomError", Message: "Комната заполнена" }));
    }
    return false;
  }

  leaveCurrentRoom(ws);

  room.clients.add(ws);
  const client = store.clients.get(ws);
  if (client) {
    client.roomId = room.id;
    client.levelId = room.levelId;
  }

  sendRoomUpdate(room);
  if (!room.isPrivate) broadcastRoomsList(room.gameId);
  broadcastStats(room.gameId);

  return true;
}

export function leaveCurrentRoom(ws) {
  const client = store.clients.get(ws);
  if (!client || !client.roomId) return;

  const room = store.rooms.get(client.roomId);
  if (room) {
    room.clients.delete(ws);

    if (room.clients.size === 0) {
      store.rooms.delete(room.id);
    } else {
      sendRoomUpdate(room);
    }

    if (!room.isPrivate) {
      broadcastRoomsList(room.gameId);
    }
  }

  const prevGameId = client.gameId;
  client.roomId = "";

  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ Type: "RoomLeft" }));
    } catch (e) {}
  }

  broadcastStats(prevGameId);
}

export function cleanupClient(ws) {
  const client = store.clients.get(ws);
  const gameId = client ? client.gameId : config.DEFAULT_GAME_ID;
  leaveCurrentRoom(ws);
  store.clients.delete(ws);
  broadcastStats(gameId);
}
