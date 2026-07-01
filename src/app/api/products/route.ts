import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, Product } from "@/lib/mongodb";

const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  price: z.number().positive("Price must be a positive number"),
  unit: z.string().optional().default("pcs"),
});

// GET /api/products — Return all products
export async function GET() {
  try {
    await connectDB();
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({
      products: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        price: p.price,
        unit: p.unit,
        createdAt: (p.createdAt as Date).toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST /api/products — Create a new product
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const parsed = createProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, price, unit } = parsed.data;

    const product = await Product.create({ name, price, unit });

    return NextResponse.json(
      {
        id: String(product._id),
        name: product.name,
        price: product.price,
        unit: product.unit,
        createdAt: (product.createdAt as Date).toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}

// DELETE /api/products?id=xxx — Delete a product by ID
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required as query param ?id=xxx" },
        { status: 400 }
      );
    }

    await Product.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product. It may not exist." },
      { status: 500 }
    );
  }
}