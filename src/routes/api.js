import express from "express";
import store from "../store.js";
import { getCachedNick, setCachedNick, checkNicknameApi } from "../services/nickname.js";

const router = express.Router();

router.get("/auth/check_nick.php", async (req, res) => {
  const nickname = (req.query.nickname || "").toString().trim();
  const isDebug = req.query.debug !== undefined;

  if (!nickname || nickname.length < 3 || nickname.length > 15) {
    return res.status(400).json({ result: "error", message: "Invalid length" });
  }

  const cachedResult = getCachedNick(nickname);
  if (cachedResult) {
    return res.json({ result: cachedResult, source: "cache" });
  }

  try {
    const resultJson = await checkNicknameApi(nickname);

    if (resultJson?.result?.final?.check?.check_result !== undefined) {
      const checkResult = resultJson.result.final.check.check_result;
      let isBanned = false;

      if (Array.isArray(checkResult)) {
        isBanned = checkResult.some((v) => v !== "clean" && v !== false && v !== "");
      } else if (typeof checkResult === "string") {
        isBanned = checkResult !== "clean" && checkResult !== "no" && checkResult !== "";
      }

      const verdict = isBanned ? "banned" : "approved";
      setCachedNick(nickname, verdict);

      if (isBanned) {
        const response = { result: "banned", source: "statusnick_api" };
        if (isDebug) response.api_raw = resultJson;
        return res.json(response);
      } else {
        return res.json({ result: "approved", source: "statusnick_api" });
      }
    }
  } catch (err) {
    if (isDebug) {
      return res.json({
        result: "approved",
        source: "fallback",
        curl_error: err.message,
      });
    }
  }

  return res.json({ result: "approved", source: "fallback" });
});

router.get("/api/regions", (req, res) => {
  const activeRegions = [
    {
      id: "spb",
      name: "Russia (Saint Petersburg)",
      host: "wss://hub.ufog.ru",
      active: true,
    },
  ];

  store.externalNodes.forEach((node) => {
    if (Date.now() - node.lastPing < 30000) {
      activeRegions.push({
        id: node.region,
        name: node.name,
        host: node.host,
        active: true,
      });
    }
  });

  return res.json({ regions: activeRegions });
});

router.post("/internal/node-ping", (req, res) => {
  const data = req.body;
  if (data?.nodeId) {
    store.externalNodes.set(data.nodeId, {
      region: data.region,
      name: data.name,
      host: data.host,
      lastPing: Date.now(),
    });
    return res.json({ status: "ok" });
  }
  return res.status(400).json({ error: "Invalid node data" });
});

export default router;
