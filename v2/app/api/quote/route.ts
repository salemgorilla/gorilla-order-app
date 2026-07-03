import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const order = await request.json();

  console.log("NEW GORILLA ORDER REQUEST");
  console.log(order);

  return NextResponse.json({
    success: true,
    message: "Quote request received by Gorilla Order API.",
    receivedAt: new Date().toISOString(),
    order,
  });
}