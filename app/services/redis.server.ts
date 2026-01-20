import Redis from "ioredis";
import { REDIS_URL, validateEnv } from "~/lib/constants";

declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
  // eslint-disable-next-line no-var
  var __redisSubscriber: Redis | undefined;
}

validateEnv();

const createClient = () => new Redis(REDIS_URL);

export const redis = global.__redisClient ?? createClient();
if (!global.__redisClient) {
  global.__redisClient = redis;
}

export const redisSubscriber = global.__redisSubscriber ?? createClient();
if (!global.__redisSubscriber) {
  global.__redisSubscriber = redisSubscriber;
}
