import express from "express";
import http from "http";
import cors from "cors";
import config from "./src/config.js";
import apiRoutes from "./src/routes/api.js";
import setupWebSocket from "./src/websocket/index.js";

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.use("/", apiRoutes);

setupWebSocket(server);

server.listen(config.PORT, () => {
  console.log(`Server started on port ${config.PORT}. Region: ${config.REGION_ID}`);
});
