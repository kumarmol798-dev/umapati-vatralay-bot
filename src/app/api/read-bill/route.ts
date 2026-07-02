import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, Product } from "@/lib/mongodb";
import { GoogleGenerativeAI } from "@google/generative-ai";

const readBillSchema = z.object({
  image: z.string().min(1, "Image base64 is required"),
  mimeType: z.string().min(1, "MIME type is required"),
});

interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
}

const BILL_PROMPT = `Ye ek stock bill ya invoice ka photo hai. Isme se saare products aur unke prices extract karo.

STRICTLY return ONLY a valid JSON array. No extra text, no explanation, no markdown.
Example: [{"name": "product name", "price": 123, "unit": "pcs"}]

Rules:
- "name" = product name (string)
- "price" = product price (number only, no ₹ symbol, no commas)
- "unit" = unit like pcs, kg, liter, meter, box, pack, dozen (string, default "pcs")
- Extract ALL items from the bill
- If unit is not clear, use "pcs"`;

async function callGeminiVision(base64Image: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType,
        data: base64Image,
      },
    },
    { text: BILL_PROMPT },
  ]);

  return result.response.text();
}

async function callZAIVision(base64Image: string, mimeType: string): Promise<string> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const result = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: BILL_PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });

  return result.choices[0]?.message?.content || "";
}

async function callVisionLLM(base64Image: string, mimeType: string): Promise<string> {
  // Try Gemini first (for Vercel)
  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGeminiVision(base64Image, mimeType);
    } catch (err) {
      console.warn("[read-bill] Gemini failed, falling back to ZAI:", err);
    }
  }
  // Fallback to z-ai-web-dev-sdk (for local dev)
  return await callZAIVision(base64Image, mimeType);
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

    // Call Vision LLM with fallback
    let rawResponse = await callVisionLLM(base64Image, mimeType);
    console.log("[read-bill] LLM raw response:", rawResponse.substring(0, 500));

    // Try multiple parsing strategies
    let extractedProducts: ExtractedProduct[] = [];

    // Strategy 1: Direct JSON parse
    try {
      const parsed = JSON.parse(rawResponse);
      if (Array.isArray(parsed)) {
        extractedProducts = parsed;
      }
    } catch {
      // Strategy 2: Extract from markdown code block
      try {
        const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          if (Array.isArray(parsed)) {
            extractedProducts = parsed;
          }
        }
      } catch {
        // Strategy 3: Find first [...] in the response
        try {
          const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              extractedProducts = parsed;
            }
          }
        } catch {
          console.warn("[read-bill] All JSON parse strategies failed");
        }
      }
    }

    // Sanitize
    const validProducts = extractedProducts.filter(
      (p) => p.name && typeof p.price === "number" && p.price > 0
    );

    // Save to MongoDB
    await connectDB();
    const savedProducts: Array<{
      id: string;
      name: string;
      price: number;
      unit: string;
      createdAt: string;
    }> = [];

    for (const item of validProducts) {
      try {
        const created = await Product.create({
          name: String(item.name).trim(),
          price: Number(item.price),
          unit: String(item.unit || "pcs").trim(),
        });
        savedProducts.push({
          id: String(created._id),
          name: created.name,
          price: created.price,
          unit: created.unit,
          createdAt: (created.createdAt as Date).toISOString(),
        });
      } catch (saveErr) {
        console.error("[read-bill] Failed to save:", item.name, saveErr);
      }
    }

    // Build Hindi response
    let hindiMessage: string;
    if (savedProducts.length > 0) {
      const lines = savedProducts.map((p) => {
        const date = new Date(p.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });
        return `• ${p.name} — ₹${p.price} per ${p.unit} (${date})`;
      });
      hindiMessage =
        `Bill se ${savedProducts.length} product add ho gaye hain:\n\n` +
        lines.join("\n");
    } else {
      hindiMessage =
        rawResponse ||
        "Bill se products identify nahi ho paye. Kripya saaf photo upload karein.";
    }

    return NextResponse.json({
      response: hindiMessage,
      products: savedProducts,
    });
  } catch (error) {
    console.error("[read-bill] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read bill image" },
      { status: 500 }
    );
  }
}