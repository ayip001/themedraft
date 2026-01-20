import "dotenv/config";
import { startGenerationWorker } from "~/services/generation/worker.server";

console.log("Worker process starting up...");
startGenerationWorker();

process.on("SIGINT", () => {
  process.exit(0);
});
