import { json } from "@remix-run/node";
import { prisma } from "../db.server";

export async function loader() {
  try {
    console.log("Testing database connection...");
    
    // Test the connection
    await prisma.$queryRaw`SELECT 1 as test`;
    
    return json({
      success: true,
      message: "Database connection successful",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Database test error:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 