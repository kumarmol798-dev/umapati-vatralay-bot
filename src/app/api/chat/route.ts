import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, Product } from "@/lib/mongodb";

const chatSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

// ─── Groq (for Vercel — 100% free, no billing) ────────────────────────────────

async function callGroq(systemPrompt: string, userMessage: string): Promise<string> {
  const { Groq } = await import("groq-sdk");
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 512,
  });

  return result.choices[0]?.message?.content || "Koi response nahi aaya.";
}

// ─── z-ai-web-dev-sdk (for local dev only) ────────────────────────────────────

async function callZAI(systemPrompt: string, userMessage: string): Promise<string> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const result = await zai.chat.completions.create({
    model: "gemini-2.0-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  return result.choices[0]?.message?.content || "Koi response nahi aaya.";
}

// ─── LLM Router: Groq first → z-ai fallback (local) ──────────────────────────

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  // On Vercel: use Groq only (ZAI doesn't work on Vercel)
  if (process.env.GROQ_API_KEY) {
    return await callGroq(systemPrompt, userMessage);
  }
  // Local dev: use z-ai-web-dev-sdk
  return await callZAI(systemPrompt, userMessage);
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = chatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { message } = parsed.data;

    // Fetch all products from MongoDB
    await connectDB();
    const products = await Product.find().sort({ createdAt: -1 }).lean();

    // Build product list string with dates
    const productList = products
      .map((p) => {
        const date = new Date(p.createdAt as Date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        });
        return `- ${p.name}: ₹${p.price} per ${p.unit} (added: ${date})`;
      })
      .join("\n");

    // Find duplicate product names
    const nameCount: Record<string, number> = {};
    for (const p of products) {
      const key = p.name.toLowerCase().trim();
      nameCount[key] = (nameCount[key] || 0) + 1;
    }
    const duplicates = Object.entries(nameCount)
      .filter(([, count]) => count > 1)
      .map(([name]) => name);

    let duplicateInstruction = "";
    if (duplicates.length > 0) {
      duplicateInstruction = `
IMPORTANT — Duplicate Products Rule:
In products ke naam do ya zyada baar repeat ho rahe hain (different prices/dates se): ${duplicates.join(", ")}

Jab customer in mein se koi product pooche:
1. Sabhi variants dikhao with date aur price
2. Customer se puchho kaunsa chahiye — purana ya naya
3. Jab customer bataye to wahi price batao.`;
    }

    const systemPrompt = `Tum Umapati Vastralay ke assistant ho. Tumhari job hai customers ko product ke baare mein batana.

Ye products available hain:
${productList || "(Koi product abhi available nahi hai)"}
${duplicateInstruction}

General Rules:
- Agar customer koi product pooche jo list mein hai (sirf ek variant hai) to seedha uska price batao.
- Agar product na mile to bolo ki wo available nahi hai.
- Hamesha Hindi/Hinglish mein reply karo.
- Short aur sweet raho. Price batate time ₹ symbol use karo.`;

    const response = await callLLM(systemPrompt, message);

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process chat message" },
      { status: 500 }
    );
  }
}