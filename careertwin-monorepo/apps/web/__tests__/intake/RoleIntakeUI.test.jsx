import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DocumentDropzone from "@/components/intake/DocumentDropzone";
import IntakeSection from "@/components/intake/IntakeSection";
import IntakeErrorState from "@/components/intake/IntakeErrorState";

describe("Role Intake & Document Upload UI Components (UX-V2 Day 3 C3)", () => {
  it("validates supported candidate document formats (PDF, DOCX, CSV)", () => {
    const handleFilesChange = vi.fn();
    render(<DocumentDropzone files={[]} onFilesChange={handleFilesChange} />);

    const input = screen.getByTestId("file-upload-input");

    // Valid PDF file upload simulation
    const pdfFile = new File(["dummy pdf content"], "resume.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [pdfFile] } });
    expect(handleFilesChange).toHaveBeenCalledTimes(1);

    // Valid CSV file upload simulation
    const csvFile = new File(["col1,col2"], "candidates.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [csvFile] } });
    expect(handleFilesChange).toHaveBeenCalledTimes(2);
  });

  it("accepts file exactly 10MB and rejects file greater than 10MB", () => {
    const handleFilesChange = vi.fn();
    render(<DocumentDropzone files={[]} onFilesChange={handleFilesChange} />);

    const input = screen.getByTestId("file-upload-input");

    // Exactly 10MB (10 * 1024 * 1024 bytes)
    const exact10MB = new File([new ArrayBuffer(10 * 1024 * 1024)], "exact10mb.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [exact10MB] } });
    expect(handleFilesChange).toHaveBeenCalledTimes(1);

    // Over 10MB (10 * 1024 * 1024 + 1 bytes)
    const over10MB = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], "over10mb.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [over10MB] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds maximum allowed size of 10MB/i);
  });

  it("renders Path B local-only notice and removal control", () => {
    const handleFilesChange = vi.fn();
    const mockFiles = [
      {
        id: "f1",
        name: "resume.pdf",
        size: "1.20 MB",
        type: "PDF",
        status: "Selected locally",
      },
    ];

    render(<DocumentDropzone files={mockFiles} onFilesChange={handleFilesChange} />);

    expect(screen.getByText("Selected locally")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Candidate files are not submitted through this form/i
      )[0]
    ).toBeInTheDocument();

    // Click removal button
    const removeBtn = screen.getByTestId("remove-file-f1");
    fireEvent.click(removeBtn);
    expect(handleFilesChange).toHaveBeenCalledWith([]);
  });

  it("rejects unsupported file formats in DocumentDropzone with clear message", () => {
    const handleFilesChange = vi.fn();
    render(<DocumentDropzone files={[]} onFilesChange={handleFilesChange} />);

    const input = screen.getByTestId("file-upload-input");
    const invalidFile = new File(["binary content"], "executable.exe", { type: "application/x-msdownload" });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(handleFilesChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Unsupported file format "executable.exe"/i);
  });
});
