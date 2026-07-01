import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

const chatSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

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

    // Fetch all products from the database
    const products = await db.product.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Build product list string with dates
    const productList = products
      .map((p) => {
        const date = new Date(p.createdAt).toLocaleDateString("en-IN", {
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
1. Sabhi variants dikhao with date aur price — jaise:
   "Suit (DC)" ke 2 variant mile hain:
   • ₹1200 per pcs — (added: 01 Jul '26) — PURANA
   • ₹1500 per pcs — (added: 05 Jul '26) — NAYA
2. Customer se puchho: "Aapko kaunsa chahiye — purana wala ya naya wala?"
3. Jab customer bataye (jaise "naya", "latest", "2nd", date batai), to wahi price batao.
4. Agar customer sirf naam bole aur specify na kare, to sab variants dikhao aur puchho kaunsa chahiye.`;
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

    // Call LLM
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: message },
      ],
      thinking: { type: "disabled" },
    });

    const response =
      completion.choices[0]?.message?.content ||
      "Maaf karo, abhi reply nahi de pa raha.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}