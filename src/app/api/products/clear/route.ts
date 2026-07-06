import { NextResponse } from "next/server";
import { connectDB, Product } from "@/lib/mongodb";

// POST /api/products/clear — Delete ALL products
export async function POST() {
  try {
    await connectDB();
    const result = await Product.deleteMany({});
    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error("Error clearing products:", error);
    return NextResponse.json(
      { error: "Failed to clear products" },
      { status: 500 }
    );
  }
}