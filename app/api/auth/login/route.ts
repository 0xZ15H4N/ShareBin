import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ success: false, message: "Username and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ success: false, message: "Unexpected server error." }, { status: 500 });
  }
}
