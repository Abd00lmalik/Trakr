import { NextResponse } from "next/server";
import {
  buildProfileDraftFromText,
  parseResumeFile,
} from "@/lib/resume/parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "missing_resume",
          message: "Upload a file in the `resume` form field.",
        },
        { status: 400 },
      );
    }

    const resumeText = await parseResumeFile(file);
    if (resumeText.length < 80) {
      return NextResponse.json(
        {
          error: "resume_too_short",
          message: "The uploaded resume did not contain enough readable text.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      fileName: file.name,
      contentType: file.type || "unknown",
      resumeText,
      profileDraft: buildProfileDraftFromText(resumeText),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "resume_parse_failed",
        message: error instanceof Error ? error.message : "Could not parse resume.",
      },
      { status: 400 },
    );
  }
}
