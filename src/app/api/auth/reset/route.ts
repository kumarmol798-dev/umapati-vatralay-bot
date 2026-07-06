import { NextRequest, NextResponse } from "next/server";
import { connectDB, Credential, hashPassword, verifyPassword, seedDefaultUser } from "@/lib/mongodb";

// POST /api/auth/reset — Change password (requires old password)
export async function POST(request: NextRequest) {
  try {
    const { username, oldPassword, newPassword } = await request.json();

    if (!username || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: "Sabhi fields bharo" },
        { status: 400 }
      );
    }

    if (newPassword.length < 4) {
      return NextResponse.json(
        { error: "Naya password kam se kam 4 character ka hona chahiye" },
        { status: 400 }
      );
    }

    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: "Naya password purane se alag hona chahiye" },
        { status: 400 }
      );
    }

    await connectDB();
    await seedDefaultUser();

    const user = await Credential.findOne({ username });
    if (!user) {
      return NextResponse.json(
        { error: "Ye username maujood nahi hai" },
        { status: 404 }
      );
    }

    // Verify old password
    if (!verifyPassword(oldPassword, user.passwordHash)) {
      return NextResponse.json(
        { error: "Purana password galat hai" },
        { status: 401 }
      );
    }

    user.passwordHash = hashPassword(newPassword);
    await user.save();

    return NextResponse.json({ success: true, message: "Password badal gaya!" });
  } catch {
    return NextResponse.json(
      { error: "Kuch gadbad ho gayi" },
      { status: 500 }
    );
  }
}