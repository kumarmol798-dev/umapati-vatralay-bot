import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB, Product } from "@/lib/mongodb";
import { GoogleGenerativeAI } from "@google/generative-ai";

const chatSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const fullPrompt = `${systemPrompt}\n\nCustomer: ${userMessage}\n\nJawab:`;

  const result = await model.generateContent(fullPrompt);
  const response = result.response.text();
  return response;
}

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

    const systemPrompt = `Tum Umapati Vatralay ke assistant ho. Tumhari job hai customers ko product ke baare mein batana.

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