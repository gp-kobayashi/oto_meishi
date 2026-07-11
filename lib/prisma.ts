import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined.");
}

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClient = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
});

export const prisma = global.prisma ?? prismaClient;
if (process.env.NODE_ENV !== "production") global.prisma = prisma;
