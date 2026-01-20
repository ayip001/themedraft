import { PrismaClient } from "@prisma/client";
import {
  DAILY_SPEND_CAP_USD,
  DEFAULT_CREDITS_LIMIT,
  validateEnv,
} from "~/lib/constants";

validateEnv();

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();
if (!global.__prisma) {
  global.__prisma = prisma;
}

export async function ensureShop(shopId: string) {
  const existing = await prisma.shop.findUnique({ where: { id: shopId } });
  if (existing) {
    return existing;
  }

  return prisma.shop.create({
    data: {
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

export async function requireShopId(request: Request) {
  const url = new URL(request.url);
  const shopId =
    url.searchParams.get("shop") ??
    request.headers.get("X-Shopify-Shop-Domain");

  if (!shopId) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  await ensureShop(shopId);
  return shopId;
}
