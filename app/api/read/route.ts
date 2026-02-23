import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";

export async function GET(req: Request) {
  const backend = getBackend();
  await backend.ready;

  const url = new URL(req.url);
  const filePath = url.searchParams.get("path") ?? "";

  if (!filePath) {
    return NextResponse.json({ error: "missing path param" }, { status: 400 });
  }

  // Strip /openfs prefix for the vfs client
  const vfsPath = filePath.startsWith("/openfs/") ? filePath.slice(7) : filePath;

  try {
    const content = await backend.client.read(vfsPath);
    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
