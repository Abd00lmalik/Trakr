import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import PDFDocument from "pdfkit";
import type {
  DownloadableArtifact,
  GeneratedDocumentType,
  ProfileEvidence,
} from "@/lib/types/opportunities";
import { storeArtifact } from "@/lib/artifacts/store";

type RenderItem = {
  text: string;
  evidenceClaimIds: string[];
  placeholder: boolean;
};

type RenderSection = {
  id: string;
  heading: string;
  items: RenderItem[];
};

export type RenderableResume = {
  title: string;
  documentType: GeneratedDocumentType;
  sections: RenderSection[];
};

function artifactType(documentType: GeneratedDocumentType) {
  return ["academic_cv", "research_cv", "scholarship_cv"].includes(
    documentType,
  )
    ? ("cv" as const)
    : ("resume" as const);
}

function filenameStem(title: string, suffix: string) {
  const stem = title
    .split("-")[0]
    .trim()
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 70);
  return `${stem || "trakr"}-${suffix}`;
}

function docxParagraphs(document: RenderableResume) {
  const paragraphs: Paragraph[] = [];
  const identity = document.sections.find((section) => section.id === "identity");
  const name = identity?.items[0]?.text ?? document.title;
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: name, bold: true, size: 34 })],
    }),
  );
  for (const item of identity?.items.slice(1) ?? []) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: item.text,
            italics: item.placeholder,
            color: item.placeholder ? "666666" : "222222",
            size: 19,
          }),
        ],
      }),
    );
  }

  for (const section of document.sections.filter(
    (candidate) => candidate.id !== "identity" && candidate.items.length,
  )) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 220, after: 80 },
        border: {
          bottom: { color: "2F6B62", size: 8, style: "single", space: 4 },
        },
        children: [
          new TextRun({
            text: section.heading.toUpperCase(),
            bold: true,
            color: "1D4F48",
            size: 21,
          }),
        ],
      }),
    );
    for (const item of section.items) {
      paragraphs.push(
        new Paragraph({
          bullet: section.id === "summary" ? undefined : { level: 0 },
          spacing: { after: 70, line: 270 },
          children: [
            new TextRun({
              text: item.text,
              italics: item.placeholder,
              color: item.placeholder ? "666666" : "222222",
              size: 20,
            }),
          ],
        }),
      );
    }
  }
  return paragraphs;
}

async function renderDocx(document: RenderableResume) {
  const output = new Document({
    creator: "Trakr",
    title: document.title,
    description:
      "Evidence-linked application document generated from user-confirmed facts.",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: docxParagraphs(document),
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20, color: "222222" },
          paragraph: { spacing: { line: 270 } },
        },
      },
    },
  });
  return Buffer.from(await Packer.toBuffer(output));
}

async function renderPdf(document: RenderableResume) {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margins: { top: 46, right: 48, bottom: 46, left: 48 },
      info: {
        Title: document.title,
        Author: "Trakr",
        Subject: "Evidence-linked application document",
      },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    const usableWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const identity = document.sections.find((section) => section.id === "identity");
    const name = identity?.items[0]?.text ?? document.title;
    pdf
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#183F39")
      .text(name, { align: "center", width: usableWidth });
    for (const item of identity?.items.slice(1) ?? []) {
      pdf
        .moveDown(0.18)
        .font(item.placeholder ? "Helvetica-Oblique" : "Helvetica")
        .fontSize(9.5)
        .fillColor(item.placeholder ? "#666666" : "#333333")
        .text(item.text, { align: "center", width: usableWidth });
    }

    for (const section of document.sections.filter(
      (candidate) => candidate.id !== "identity" && candidate.items.length,
    )) {
      if (pdf.y > pdf.page.height - 105) pdf.addPage();
      pdf.moveDown(0.7);
      const headingY = pdf.y;
      pdf
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#1D4F48")
        .text(section.heading.toUpperCase(), { width: usableWidth });
      pdf
        .moveTo(pdf.page.margins.left, headingY + 14)
        .lineTo(pdf.page.width - pdf.page.margins.right, headingY + 14)
        .lineWidth(0.7)
        .strokeColor("#3B8177")
        .stroke();
      pdf.moveDown(0.45);

      for (const item of section.items) {
        if (pdf.y > pdf.page.height - 75) pdf.addPage();
        const prefix = section.id === "summary" ? "" : "- ";
        pdf
          .font(item.placeholder ? "Helvetica-Oblique" : "Helvetica")
          .fontSize(9.7)
          .fillColor(item.placeholder ? "#666666" : "#222222")
          .text(`${prefix}${item.text}`, {
            width: usableWidth,
            lineGap: 2,
            paragraphGap: 3,
          });
      }
    }
    pdf.end();
  });
}

export function optimizationDocument(
  generation: RenderableResume,
  rewrites: Array<{
    original: string;
    suggested: string;
    evidenceClaimIds: string[];
  }>,
) {
  const rewriteMap = new Map(
    rewrites.map((rewrite) => [rewrite.original.trim(), rewrite]),
  );
  return {
    ...generation,
    sections: generation.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const rewrite = rewriteMap.get(item.text.trim());
        return rewrite
          ? {
              text: rewrite.suggested,
              evidenceClaimIds: rewrite.evidenceClaimIds,
              placeholder: false,
            }
          : item;
      }),
    })),
  };
}

export async function createResumeArtifacts(input: {
  document: RenderableResume;
  regenerateAction: DownloadableArtifact["regenerateAction"];
  suffix: string;
}) {
  const [docx, pdf] = await Promise.all([
    renderDocx(input.document),
    renderPdf(input.document),
  ]);
  const stem = filenameStem(input.document.title, input.suffix);
  const type = artifactType(input.document.documentType);
  return Promise.all([
    storeArtifact({
      artifactType: type,
      format: "docx",
      filename: `${stem}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: docx,
      regenerateAction: input.regenerateAction,
    }),
    storeArtifact({
      artifactType: type,
      format: "pdf",
      filename: `${stem}.pdf`,
      mimeType: "application/pdf",
      content: pdf,
      regenerateAction: input.regenerateAction,
    }),
  ]);
}

export function assertRenderableEvidence(
  document: RenderableResume,
  evidence: ProfileEvidence[],
) {
  const authorized = new Set(
    evidence
      .filter(
        (item) =>
          item.source === "explicit" &&
          item.confirmed !== false &&
          (item.allowedUse ?? []).includes("generation"),
      )
      .map((item) => item.claimId)
      .filter((claimId): claimId is string => Boolean(claimId)),
  );
  for (const item of document.sections.flatMap((section) => section.items)) {
    if (item.placeholder) continue;
    if (
      !item.evidenceClaimIds.length ||
      item.evidenceClaimIds.some((claimId) => !authorized.has(claimId))
    ) {
      throw new Error("Artifact content is not fully linked to authorized evidence.");
    }
  }
}
