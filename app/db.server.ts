import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

declare global {
  var __db__: PrismaClient;
}

// This is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// In production, we'll have a single connection to the DB.
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Add connection pooling for serverless environments
    log: ['error', 'warn'],
  });
} else {
  if (!global.__db__) {
    global.__db__ = new PrismaClient({
      log: ['error', 'warn'],
    });
  }
  prisma = global.__db__;
  prisma.$connect();
}

export { prisma };
