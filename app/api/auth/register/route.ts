import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ success: false, message: "Username and password are required." }, { status: 400 });
    }
    if (username.trim().length < 3) {
      return NextResponse.json({ success: false, message: "Username must be at least 3 characters." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, message: "Password must be at least 6 characters." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ success: false, message: "Username already taken." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, password: passwordHash },
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ success: false, message: "Unexpected server error." }, { status: 500 });
  }
}
