import { createApp } from "./app.js";
import { getDb } from "./db/index.js";
import { config } from "./config.js";

const db = getDb();
const { app } = createApp({ db });

app.listen(config.port, () => {
  console.log(`Maldo API server running on port ${config.port}`);
  console.log(`Health check: http://localhost:${config.port}/health`);
  console.log(`Network: Sepolia`);
});
