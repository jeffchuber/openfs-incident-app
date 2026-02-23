import { NextResponse } from "next/server";
import { getBackend, buildTree } from "@/lib/backend";

export async function GET() {
  const backend = getBackend();
  await backend.ready;

  const tree = await buildTree(backend.client, "/");
  return NextResponse.json(tree);
}
