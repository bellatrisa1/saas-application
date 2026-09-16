import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/domain";
export function sameOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured) throw new AppError(503, "APP_ORIGIN is not configured");
  if (request.headers.get("origin") !== new URL(configured).origin)
    throw new AppError(403, "Request origin is not allowed");
}
export async function limitedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(413, "Request body is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function body(request: Request) {
  const text = new TextDecoder().decode(await limitedBody(request, 64000));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(400, "Invalid JSON");
  }
}
export function respond(fn: () => Promise<unknown>) {
  return fn()
    .then((data) =>
      NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      }),
    )
    .catch((error: unknown) => {
      if (error instanceof ZodError)
        return NextResponse.json(
          {
            error: "Please check the submitted fields",
            details: error.flatten(),
          },
          { status: 422 },
        );
      if (error instanceof AppError)
        return NextResponse.json(
          { error: error.message, details: error.details },
          { status: error.status },
        );
      if (typeof error === "object" && error !== null && "code" in error) {
        if (error.code === "23505")
          return NextResponse.json(
            { error: "This record already exists" },
            { status: 409 },
          );
        if (error.code === "23503")
          return NextResponse.json(
            { error: "A referenced record is unavailable or still in use" },
            { status: 409 },
          );
      }
      console.error("Unhandled request failure", error);
      return NextResponse.json(
        { error: "The server could not complete this request" },
        { status: 500 },
      );
    });
}
