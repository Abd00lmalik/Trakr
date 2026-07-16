import { NextResponse } from "next/server";
import {
  buildProfileDraftFromText,
  parseResumeFile,
} from "@/lib/resume/parser";

export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return json(
        {
          error: "missing_resume",
          message: "Upload a file in the `resume` form field.",
        },
        400,
      );
    }

    const resumeText = await parseResumeFile(file);
    if (resumeText.length < 80) {
      return json(
        {
          error: "resume_too_short",
          message: "The uploaded resume did not contain enough readable text.",
        },
        422,
      );
    }

    return json({
      fileName: file.name,
      contentType: file.type || "unknown",
      resumeText,
      profileDraft: buildProfileDraftFromText(resumeText),
    });
  } catch (error) {
    return json(
      {
        error: "resume_parse_failed",
        message: error instanceof Error ? error.message : "Could not parse resume.",
      },
      400,
    );
  }
}
