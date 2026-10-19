import store from "../store.js";
import config from "../config.js";

export function getCachedNick(nick) {
  const key = nick.toLowerCase();
  const entry = store.nickCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.nickCache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedNick(nick, result) {
  if (store.nickCache.size >= config.MAX_CACHE_ENTRIES) {
    const oldestKey = store.nickCache.keys().next().value;
    store.nickCache.delete(oldestKey);
  }
  store.nickCache.set(nick.toLowerCase(), {
    result,
    expiresAt: Date.now() + config.CACHE_TTL,
  });
}

export async function checkNicknameApi(nickname) {
  const payload = {
    main_token: config.MAIN_TOKEN,
    api_version: "v1",
    query_details: {
      source_token: config.SOURCE_TOKEN,
      text: nickname,
      dictionaries: {
        rus: ["heavy", "expletive", "weapon", "terrorism", "sex"],
        eng: ["heavy"],
      },
      deep_check: "yes",
      translit_check: "yes",
      stylized_check: "yes",
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  const apiResponse = await fetch(config.STATUSNICK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  return await apiResponse.json();
}
