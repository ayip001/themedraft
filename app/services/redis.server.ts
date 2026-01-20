import Redis from "ioredis";
import { REDIS_URL } from "~/lib/constants";

declare global {
  var redisClientGlobal: Redis | undefined;
  var redisSubscriberGlobal: Redis | undefined;
}

const redisOptions = {
  maxRetriesPerRequest: null,
};

const redisClient =
  global.redisClientGlobal ?? new Redis(REDIS_URL, redisOptions);
const redisSubscriber =
  global.redisSubscriberGlobal ?? new Redis(REDIS_URL, redisOptions);

redisClient.on("connect", () => console.log("Redis Client connected"));
redisClient.on("error", (err) => console.error("Redis Client error:", err));

redisSubscriber.on("connect", () => console.log("Redis Subscriber connected"));
redisSubscriber.on("error", (err) =>
  console.error("Redis Subscriber error:", err),
);

if (process.env.NODE_ENV !== "production") {
  global.redisClientGlobal = redisClient;
  global.redisSubscriberGlobal = redisSubscriber;
}

export { redisClient, redisSubscriber };
