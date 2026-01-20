import { PrismaClient } from "@prisma/client";
import { DAILY_SPEND_CAP_USD, DEFAULT_CREDITS_LIMIT } from "~/lib/constants";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const prisma = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export async function ensureShop(shopId: string) {
  return prisma.shop.upsert({
    where: { id: shopId },
    update: {},
    create: {
      id: shopId,
      quota: {
        create: {
          creditsLimit: DEFAULT_CREDITS_LIMIT,
          maxDailySpendUsd: DAILY_SPEND_CAP_USD,
        },
      },
    },
  });
}

export async function ensureQuota(shopId: string) {
  const existing = await prisma.quota.findUnique({ where: { shopId } });
  if (existing) {
    return existing;
  }

  await prisma.shop.upsert({
    where: { id: shopId },
    update: {},
    create: { id: shopId },
  });

  return prisma.quota.create({
    data: {
      shopId,
      creditsLimit: DEFAULT_CREDITS_LIMIT,
      maxDailySpendUsd: DAILY_SPEND_CAP_USD,
    },
  });
}

export default prisma;
