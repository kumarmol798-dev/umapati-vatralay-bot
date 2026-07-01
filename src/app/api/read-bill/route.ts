import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

const readBillSchema = z.object({
  image: z.string().min(1, "Image base64 is required"),
  mimeType: z.string().min(1, "MIME type is required"),
});

interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = readBillSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { image: base64Image, mimeType } = parsed.data;

    // Call VLM to analyze the bill image
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Ye ek stock bill ya invoice ka photo hai. Isme se saare products aur unke prices extract karo. Ek JSON array return karo jisme har product ka naam, price, aur unit (jaise kg, pcs, liter etc.) ho. Sirf JSON return karo, koi extra text nahi. Format: [{\"name\": \"product name\", \"price\": 123, \"unit\": \"kg\"}]. Agar koi field unclear ho to best guess karo.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const rawResponse = completion.choices[0]?.message?.content || "";

    // Try to parse JSON from the VLM response
    let extractedProducts: ExtractedProduct[] = [];
    let products: Array<{
      id: string;
      name: string;
      price: number;
      unit: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    try {
      // Extract JSON array from response (VLM might wrap it in markdown code blocks)
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ExtractedProduct[];
        if (Array.isArray(parsed)) {
          extractedProducts = parsed;
        }
      }
    } catch {
      console.warn("Could not parse JSON from VLM response, returning raw text");
    }

    // Save extracted products to the database
    if (extractedProducts.length > 0) {
      for (const item of extractedProducts) {
        if (item.name && item.price) {
          const created = await db.product.create({
            data: {
              name: item.name,
              price: Number(item.price),
              unit: item.unit || "pcs",
            },
          });
          products.push(created);
        }
      }
    }

    // Build Hindi response message
    let hindiMessage: string;
    if (products.length > 0) {
      const lines = products.map(
        (p) => `• ${p.name} — ₹${p.price} per ${p.unit}`
      );
      hindiMessage =
        `Bill se ${products.length} product successfully add ho gaye hain:\n\n` +
        lines.join("\n");
    } else {
      hindiMessage =
        rawResponse ||
        "Bill se products identify nahi ho paye. Kripya saaf photo upload karein.";
    }

    return NextResponse.json({
      response: hindiMessage,
      products,
    });
  } catch (error) {
    console.error("Error reading bill:", error);
    return NextResponse.json(
      { error: "Failed to read bill image" },
      { status: 500 }
    );
  }
}