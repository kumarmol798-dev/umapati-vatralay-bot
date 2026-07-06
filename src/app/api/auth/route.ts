import { NextRequest, NextResponse } from "next/server";
import { connectDB, Credential, verifyPassword, seedDefaultUser } from "@/lib/mongodb";

// POST /api/auth — Verify username and password
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username aur password daalo" },
        { status: 400 }
      );
    }

    await connectDB();
    await seedDefaultUser();

    const user = await Credential.findOne({ username });
    if (!user) {
      return NextResponse.json(
        { error: "Galat username ya password" },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Galat username ya password" },
        { status: 401 }
      );
    }

    // Simple token — base64 of username + timestamp
    const token = Buffer.from(`${username}:${Date.now()}`).toString("base64");
    return NextResponse.json({ success: true, token });
  } catch {
    return NextResponse.json(
      { error: "Kuch gadbad ho gayi" },
      { status: 500 }
    );
  }
}