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

    // Build product list string
    const productList = products
      .map((p) => `- ${p.name}: ₹${p.price} per ${p.unit}`)
      .join("\n");

    const systemPrompt = `Tum Umapati Vatralay ke assistant ho. Tumhari job hai customers ko product ke baare mein batana. Ye products available hain:
${productList || "(Koi product abhi available nahi hai)"}

Agar customer koi product pooche jo list mein hai to uska price batao. Agar product na mile to bolo ki wo available nahi hai. Hamesha Hindi/Hinglish mein reply karo. Short aur sweet raho.`;

    // Call LLM
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: message },
      ],
      thinking: { type: "disabled" },
    });

    const response = completion.choices[0]?.message?.content || "Maaf karo, abhi reply nahi de pa raha.";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}