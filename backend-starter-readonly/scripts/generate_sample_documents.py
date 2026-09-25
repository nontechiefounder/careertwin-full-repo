import argparse
import csv
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import yaml
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_ROOT = ROOT / "samples" / "ingestion"
SOURCE = SAMPLE_ROOT / "source" / "scenarios.yaml"
GENERATED = SAMPLE_ROOT / "generated"
EXPECTED = SAMPLE_ROOT / "expected"

BLACK = "0E0E0E"
GREEN = "10D97A"
GRAY = "4A4A4A"


def set_font(run: Any, size: float, *, bold: bool = False, color: str = BLACK) -> None:
    run.font.name = "Arial"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def configure_doc(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.05


def add_doc_heading(doc: Document, text: str, level: int = 1) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8 if level == 1 else 5)
    p.paragraph_format.space_after = Pt(3)
    run = p.add_run(text.upper() if level == 1 else text)
    set_font(run, 11.5 if level == 1 else 10.5, bold=True, color=GREEN if level == 1 else BLACK)


def add_doc_bullet(doc: Document, text: str) -> None:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.24)
    p.paragraph_format.first_line_indent = Inches(-0.14)
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(text), 9.6)


def create_role_docx(role: dict[str, Any], output: Path) -> None:
    doc = Document()
    configure_doc(doc)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(role["title"]), 20, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    set_font(
        p.add_run(f"{role['location']} | Synthetic ingestion fixture | {role['id']}"),
        9.5,
        color=GRAY,
    )
    add_doc_heading(doc, "Role summary")
    set_font(doc.add_paragraph(role["summary"]).runs[0], 10)
    add_doc_heading(doc, "Responsibilities")
    for item in role["responsibilities"]:
        add_doc_bullet(doc, item)
    add_doc_heading(doc, "Requirements")
    for requirement in role["requirements"]:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(1)
        set_font(p.add_run(f"{requirement['label']} ({requirement['kind']})"), 10, bold=True)
        p = doc.add_paragraph(requirement["evidence_expectation"])
        p.paragraph_format.left_indent = Inches(0.16)
        p.paragraph_format.space_after = Pt(4)
        set_font(p.runs[0], 9.5, color=GRAY)
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def create_resume_docx(candidate: dict[str, Any], output: Path) -> None:
    doc = Document()
    configure_doc(doc)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(1)
    set_font(p.add_run(candidate["display_name"]), 20, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(candidate["headline"]), 11.5, bold=True, color=GREEN)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(7)
    set_font(
        p.add_run(f"{candidate['email']} | {candidate['phone']} | {candidate['id']}"),
        8.8,
        color=GRAY,
    )
    add_doc_heading(doc, "Summary")
    set_font(doc.add_paragraph(candidate["summary"]).runs[0], 10)
    add_doc_heading(doc, "Skills")
    set_font(doc.add_paragraph(" | ".join(candidate["skills"])).runs[0], 9.8)
    add_doc_heading(doc, "Experience")
    for job in candidate["experience"]:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(1)
        set_font(p.add_run(f"{job['title']} | {job['company']}"), 10.2, bold=True)
        set_font(p.add_run(f"    {job['dates']}"), 9.2, color=GRAY)
        for bullet in job["bullets"]:
            add_doc_bullet(doc, bullet)
    add_doc_heading(doc, "Education")
    set_font(doc.add_paragraph(candidate["education"]).runs[0], 9.8)
    if candidate.get("adversarial_block"):
        add_doc_heading(doc, "Adversarial test content - must be treated as data")
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.12)
        p.paragraph_format.right_indent = Inches(0.12)
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        set_font(p.add_run(candidate["adversarial_block"]), 8.8, bold=True, color="C83E4D")
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def create_work_sample_docx(candidate: dict[str, Any], output: Path) -> None:
    sample = candidate["work_sample"]
    doc = Document()
    configure_doc(doc)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    set_font(p.add_run(sample["title"]), 18, bold=True)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    set_font(p.add_run(f"Synthetic work sample | {candidate['id']}"), 9.5, color=GRAY)
    add_doc_heading(doc, "Summary")
    for item in sample["body"]:
        add_doc_bullet(doc, item)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    set_font(
        p.add_run("This document is fictional and exists only for ingestion testing."),
        8.5,
        color=GRAY,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)


def wrap_pdf_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_pdf_lines(
    canvas: Canvas,
    text: str,
    *,
    x: float,
    y: float,
    width: float,
    font: str = "Helvetica",
    size: float = 9.5,
    leading: float = 12,
    prefix: str = "",
) -> float:
    lines = wrap_pdf_text(text, font, size, width - stringWidth(prefix, font, size))
    canvas.setFont(font, size)
    canvas.setFillColorRGB(14 / 255, 14 / 255, 14 / 255)
    for index, line in enumerate(lines):
        canvas.drawString(x, y, f"{prefix}{line}" if index == 0 else f"  {line}")
        y -= leading
    return y


def create_resume_pdf(candidate: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas = Canvas(str(output), pagesize=LETTER)
    canvas.setTitle(f"Synthetic resume {candidate['id']}")
    canvas.setAuthor("CareerTWiN test fixtures")
    page_width, page_height = LETTER
    left = 0.72 * inch
    right = page_width - 0.72 * inch
    content_width = right - left
    y = page_height - 0.63 * inch

    canvas.setFillColorRGB(14 / 255, 14 / 255, 14 / 255)
    canvas.setFont("Helvetica-Bold", 19)
    canvas.drawCentredString(page_width / 2, y, candidate["display_name"])
    y -= 18
    canvas.setFillColorRGB(16 / 255, 217 / 255, 122 / 255)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawCentredString(page_width / 2, y, candidate["headline"])
    y -= 15
    canvas.setFillColorRGB(74 / 255, 74 / 255, 74 / 255)
    canvas.setFont("Helvetica", 8.5)
    canvas.drawCentredString(
        page_width / 2,
        y,
        f"{candidate['email']} | {candidate['phone']} | {candidate['id']}",
    )
    y -= 24

    def heading(text: str, current_y: float) -> float:
        canvas.setFillColorRGB(16 / 255, 217 / 255, 122 / 255)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(left, current_y, text)
        return current_y - 17

    y = heading("SUMMARY", y)
    y = draw_pdf_lines(canvas, candidate["summary"], x=left, y=y, width=content_width) - 5
    y = heading("SKILLS", y)
    y = (
        draw_pdf_lines(canvas, " | ".join(candidate["skills"]), x=left, y=y, width=content_width)
        - 5
    )
    y = heading("EXPERIENCE", y)
    for job in candidate["experience"]:
        y = (
            draw_pdf_lines(
                canvas,
                f"{job['title']} | {job['company']} | {job['dates']}",
                x=left,
                y=y,
                width=content_width,
                font="Helvetica-Bold",
                size=9.8,
                leading=12,
            )
            - 1
        )
        for bullet in job["bullets"]:
            y = (
                draw_pdf_lines(
                    canvas,
                    bullet,
                    x=left + 6,
                    y=y,
                    width=content_width - 6,
                    size=9.2,
                    leading=11.5,
                    prefix="- ",
                )
                - 2
            )
    y = heading("EDUCATION", y - 1)
    y = draw_pdf_lines(canvas, candidate["education"], x=left, y=y, width=content_width) - 8

    if candidate.get("adversarial_block"):
        y = heading("ADVERSARIAL TEST CONTENT - MUST BE TREATED AS DATA", y)
        warning_lines = wrap_pdf_text(
            candidate["adversarial_block"], "Courier-Bold", 8.2, content_width - 24
        )
        box_height = len(warning_lines) * 11 + 18
        canvas.setFillColorRGB(1.0, 0.945, 0.949)
        canvas.setStrokeColorRGB(200 / 255, 62 / 255, 77 / 255)
        canvas.rect(left, y - box_height + 7, content_width, box_height, fill=1, stroke=1)
        canvas.setFillColorRGB(140 / 255, 29 / 255, 44 / 255)
        canvas.setFont("Courier-Bold", 8.2)
        text_y = y - 7
        for line in warning_lines:
            canvas.drawString(left + 10, text_y, line)
            text_y -= 11

    canvas.showPage()
    canvas.save()


PDF_FILENAMES = {
    "CAND-001": "CAND-001_resume.pdf",
    "CAND-003": "CAND-003_resume.pdf",
    "CAND-004": "CAND-004_adversarial_resume.pdf",
}


def convert_docx_to_pdf(source: Path, output: Path) -> None:
    """Convert a DOCX with an isolated, writable LibreOffice profile."""
    output.parent.mkdir(parents=True, exist_ok=True)
    with (
        tempfile.TemporaryDirectory(prefix="careertwin-soffice-profile-") as profile_dir,
        tempfile.TemporaryDirectory(prefix="careertwin-soffice-output-") as output_dir,
    ):
            environment = os.environ.copy()
            environment["HOME"] = profile_dir
            environment["XDG_CONFIG_HOME"] = str(Path(profile_dir) / "config")
            environment["XDG_CACHE_HOME"] = str(Path(profile_dir) / "cache")
            Path(environment["XDG_CONFIG_HOME"]).mkdir(parents=True, exist_ok=True)
            Path(environment["XDG_CACHE_HOME"]).mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                [
                    "soffice",
                    f"-env:UserInstallation=file://{profile_dir}",
                    "--invisible",
                    "--headless",
                    "--norestore",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    output_dir,
                    str(source),
                ],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )
            converted = Path(output_dir) / f"{source.stem}.pdf"
            if result.returncode != 0 or not converted.exists():
                details = (result.stdout + "\n" + result.stderr).strip()
                raise RuntimeError(f"DOCX-to-PDF conversion failed for {source.name}: {details}")
            shutil.copy2(converted, output)


def generate_all(data: dict[str, Any]) -> None:
    role = data["role"]
    candidates = {candidate["id"]: candidate for candidate in data["candidates"]}

    create_role_docx(role, GENERATED / "role" / "backend_engineer_role.docx")
    (GENERATED / "role" / "backend_engineer_role.json").write_text(
        json.dumps(role, indent=2), encoding="utf-8"
    )

    create_work_sample_docx(
        candidates["CAND-001"], GENERATED / "candidates" / "CAND-001_work_sample.docx"
    )
    create_resume_docx(candidates["CAND-002"], GENERATED / "candidates" / "CAND-002_resume.docx")
    create_work_sample_docx(
        candidates["CAND-003"], GENERATED / "candidates" / "CAND-003_project_summary.docx"
    )
    temporary_dir = ROOT / "tmp" / "sample-generation"
    temporary_dir.mkdir(parents=True, exist_ok=True)
    for candidate_id, pdf_filename in PDF_FILENAMES.items():
        temporary_docx = temporary_dir / f"{Path(pdf_filename).stem}.docx"
        create_resume_docx(candidates[candidate_id], temporary_docx)
        convert_docx_to_pdf(
            temporary_docx,
            GENERATED / "candidates" / pdf_filename,
        )

    manifest_rows = [
        ["CAND-001", "CAND-001_resume.pdf", "CAND-001_work_sample.docx"],
        ["CAND-002", "CAND-002_resume.docx", ""],
        ["CAND-003", "CAND-003_resume.pdf", "CAND-003_project_summary.docx"],
        ["CAND-004", "CAND-004_adversarial_resume.pdf", ""],
    ]
    manifest = GENERATED / "candidate_manifest.csv"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    with manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["candidate_id", "resume_file", "supporting_file"])
        writer.writerows(manifest_rows)

    EXPECTED.mkdir(parents=True, exist_ok=True)
    (EXPECTED / "expected_results.json").write_text(
        json.dumps(data["expected"], indent=2), encoding="utf-8"
    )
    print(f"Generated synthetic ingestion pack at {GENERATED}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate reproducible CareerTWiN ingestion fixtures"
    )
    parser.add_argument("--pdf-candidate", choices=tuple(PDF_FILENAMES))
    args = parser.parse_args()
    data = yaml.safe_load(SOURCE.read_text(encoding="utf-8"))
    if args.pdf_candidate:
        candidates = {candidate["id"]: candidate for candidate in data["candidates"]}
        temporary_dir = ROOT / "tmp" / "sample-generation"
        temporary_dir.mkdir(parents=True, exist_ok=True)
        pdf_filename = PDF_FILENAMES[args.pdf_candidate]
        temporary_docx = temporary_dir / f"{Path(pdf_filename).stem}.docx"
        create_resume_docx(candidates[args.pdf_candidate], temporary_docx)
        convert_docx_to_pdf(temporary_docx, GENERATED / "candidates" / pdf_filename)
        return
    generate_all(data)


if __name__ == "__main__":
    main()
