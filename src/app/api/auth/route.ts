import { NextRequest, NextResponse } from "next/server";

// POST /api/auth — Verify username and password
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    const validUser = process.env.AUTH_USERNAME || "admin";
    const validPass = process.env.AUTH_PASSWORD || "admin123";

    if (username === validUser && password === validPass) {
      // Simple token — base64 of username + timestamp
      const token = Buffer.from(`${username}:${Date.now()}`).toString("base64");
      return NextResponse.json({ success: true, token });
    }

    return NextResponse.json(
      { error: "Galat username ya password" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}