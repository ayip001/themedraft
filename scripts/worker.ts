import { startGenerationWorker } from "~/services/generation/worker.server";

startGenerationWorker();

process.on("SIGINT", () => {
  process.exit(0);
});
