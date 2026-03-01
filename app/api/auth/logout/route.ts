import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ data: { success: true }, error: null });
  response.cookies.set({
    name: sessionCookieName,
    value: "",
    path: "/",
    maxAge: 0
  });
  return response;
}