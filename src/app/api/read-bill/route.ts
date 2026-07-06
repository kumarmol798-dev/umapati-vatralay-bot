import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, Product } from "@/lib/mongodb";

const readBillSchema = z.object({
  image: z.string().min(1, "Image base64 is required"),
  mimeType: z.string().min(1, "MIME type is required"),
});

interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
}

const BILL_PROMPT = `Ye ek stock bill / invoice / credit memo ka photo hai. Isme se saare products extract karo.

STRICTLY return ONLY a valid JSON array. No extra text, no explanation, no markdown.

MOST IMPORTANT RULES:
1. "name" = Bill mein jo "Quality" ya main product category likha hai (jaise "Cott Saree", "Fancy Saree", "Silk Saree"). Agar uske baad "Description" ya "Company" ya koi aur detail di ho, to use BRACKETS mein name ke saath lagao.
   Example: name="Cott Saree (Phuket Cotton Bp B.k)" — yahan "Cott Saree" quality hai aur "Phuket Cotton Bp B.k" description hai.

2. "price" = Sirf PER UNIT RATE. "Amount" ya "Total" ya "Net Amount" NAHI leke aana. Rate column mein jo price hai wahi leni hai.
   Example: Agar Rate=438 aur Quantity=8 hai to price=438 hoga (NOT 3504).

3. "unit" = Bill mein jo unit hai: "Th/PC" ya "Pcs" → "pcs", "Mtr" → "meter", "Kg" → "kg", "Ltr" → "liter". Default "pcs".

4. Har ek row/item ko alag object banao. Koi item miss mat karna.
5. Serial numbers, GST, totals, summary, tax rows — ye skip karo. Sirf actual products lo.

REAL EXAMPLE from a typical saree bill:
Bill mein: Quality="Cott Saree", Description="Phuket Cotton Bp B.k", Rate=438.00, Th/PC=8
Output: {"name": "Cott Saree (Phuket Cotton Bp B.k)", "price": 438, "unit": "pcs"}

Bill mein: Quality="Fancy Saree", Description="Ruby Shagun", Rate=923.00, Th/PC=2
Output: {"name": "Fancy Saree (Ruby Shagun)", "price": 923, "unit": "pcs"}

FULL OUTPUT FORMAT:
[{"name": "Product Name (Description if any)", "price": 123, "unit": "pcs"}]`;

// ─── Groq Vision (for Vercel — 100% free) ────────────────────────────────────

async function callGroqVision(base64Image: string, mimeType: string): Promise<string> {
  const { Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Try multiple vision models in order
  const models = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview",
  ];

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      console.log(`[read-bill] Trying model: ${model}`);
      const result = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
              { type: "text", text: BILL_PROMPT },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      });
      const text = result.choices[0]?.message?.content || "";
      if (text) {
        console.log(`[read-bill] Success with model: ${model}`);
        return text;
      }
    } catch (err) {
      lastError = err as Error;
      console.warn(`[read-bill] Model ${model} failed:`, (err as Error).message);
    }
  }

  throw lastError || new Error("All Groq vision models failed");
}

// ─── z-ai-web-dev-sdk Vision (for local dev only) ────────────────────────────

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

// ─── Vision LLM Router ────────────────────────────────────────────────────────

async function callVisionLLM(base64Image: string, mimeType: string): Promise<string> {
  // On Vercel: use Groq only
  if (process.env.GROQ_API_KEY) {
    return await callGroqVision(base64Image, mimeType);
  }
  // Local dev: use z-ai-web-dev-sdk
  return await callZAIVision(base64Image, mimeType);
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

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

    // Call Vision LLM
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