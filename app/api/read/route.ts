import { NextResponse } from "next/server";
import { getBackend } from "@/lib/ax-backend";

export async function GET(req: Request) {
  const backend = getBackend();
  await backend.ready;

  const url = new URL(req.url);
  const filePath = url.searchParams.get("path") ?? "";

  if (!filePath) {
    return NextResponse.json({ error: "missing path param" }, { status: 400 });
  }

  // Strip /ax prefix for the vfs client
  const axPath = filePath.startsWith("/ax/") ? filePath.slice(3) : filePath;

  try {
    const content = await backend.client.read(axPath);
    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
