import { NextResponse } from "next/server";
import { getBackend, serialExec } from "@/lib/ax-backend";

export async function POST(req: Request) {
  const backend = getBackend();
  await backend.ready;

  const body = await req.json();
  const cmd: string = body.cmd;

  if (!cmd || typeof cmd !== "string") {
    return NextResponse.json(
      { stdout: "", stderr: "missing cmd" },
      { status: 400 }
    );
  }

  try {
    const result = await serialExec(backend.bash, cmd);
    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ stdout: "", stderr: msg });
  }
}
