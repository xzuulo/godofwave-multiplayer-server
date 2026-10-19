import dotenv from "dotenv";
dotenv.config();

const config = {
  PORT: process.env.PORT || 8080,
  REGION_ID: process.env.REGION_ID || "spb",
  MAIN_TOKEN: process.env.MAIN_TOKEN,
  SOURCE_TOKEN: process.env.SOURCE_TOKEN,
  STATUSNICK_API_URL: process.env.STATUSNICK_API_URL,
  DEFAULT_GAME_ID: "godofwave",
  CACHE_TTL: 24 * 60 * 60 * 1000,
  MAX_CACHE_ENTRIES: 5000,
};

export default config;
