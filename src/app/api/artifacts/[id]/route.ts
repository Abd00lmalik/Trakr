import { NextResponse } from "next/server";
import { retrieveArtifact } from "@/lib/artifacts/store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json(
      {
        error: "artifact_authorization_required",
        message: "A valid artifact download token is required.",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }

  const result = await retrieveArtifact(id, token);
  if (result.status === "expired") {
    return NextResponse.json(
      {
        error: "artifact_expired",
        message:
          "This artifact has expired. Regenerate it from the trusted Trakr session.",
      },
      {
        status: 410,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  if (result.status === "not_found") {
    return NextResponse.json(
      {
        error: "artifact_not_found",
        message: "The artifact could not be found or authorized.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }

  return new NextResponse(new Uint8Array(result.artifact.content), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": result.artifact.mimeType,
      "Content-Length": String(result.artifact.sizeBytes),
      "Content-Disposition": `attachment; filename="${result.artifact.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Artifact-SHA256": result.artifact.sha256,
      "Referrer-Policy": "no-referrer",
    },
  });
}
