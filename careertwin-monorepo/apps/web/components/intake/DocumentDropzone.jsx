"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileText, AlertCircle, X, Info } from "lucide-react";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".csv"];
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function DocumentDropzone({ files, onFilesChange }) {
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const inputRef = useRef(null);

  const validateAndAddFiles = (fileList) => {
    setErrorMsg(null);
    const newFiles = Array.from(fileList);
    const validFiles = [];
    let err = null;

    for (const file of newFiles) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
        err = `Unsupported file format "${file.name}". Accepted formats: PDF, DOCX, CSV.`;
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        err = `File "${file.name}" exceeds maximum allowed size of 10MB.`;
        break;
      }
      validFiles.push({
        id: Math.random().toString(36).substr(2, 9),
        rawFile: file,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + " MB",
        type: ext.replace(".", "").toUpperCase(),
        status: "Selected locally",
      });
    }

    if (err) {
      setErrorMsg(err);
    } else if (validFiles.length > 0) {
      onFilesChange([...files, ...validFiles]);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndAddFiles(e.target.files);
    }
  };

  const removeFile = (id) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.code === "Space") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="space-y-4">
      <div
        tabIndex={0}
        role="button"
        aria-label="Upload candidate documents"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#10D97A]/50 ${
          dragActive
            ? "border-[#10D97A] bg-[#10D97A]/5"
            : "border-[#343434] bg-[#1A1A1A]/40 hover:border-[#343434]/80 hover:bg-[#1A1A1A]"
        }`}
        data-testid="document-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.csv"
          onChange={handleChange}
          className="hidden"
          data-testid="file-upload-input"
        />
        <div className="w-10 h-10 rounded-full border border-[#343434] bg-[#1A1A1A] flex items-center justify-center mx-auto mb-3 text-[#10D97A]">
          <UploadCloud className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium text-[#F2F2F2]">
          Drag & drop candidate documents here, or <span className="text-[#10D97A]">browse files</span>
        </p>
        <p className="text-[10px] text-[#A3A3A3] mt-1 font-mono">
          Supported formats: PDF, DOCX, CSV (Max 10MB per file)
        </p>
        <p className="text-[10px] text-amber-300 mt-1 font-mono font-medium" data-testid="intake-handoff-notice">
          Candidate files are not submitted through this form. Contact the pilot administrator for the approved transfer process.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-[#A3A3A3] uppercase tracking-wider">
              Selected Candidate Documents ({files.length})
            </p>
          </div>

          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2 text-xs text-amber-300">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Candidate files are not submitted through this form. Contact the pilot administrator for the approved transfer process.
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <FileText className="h-4 w-4 text-[#10D97A] shrink-0" />
                  <span className="text-[#F2F2F2] truncate">{file.name}</span>
                  <span className="text-[9px] font-mono text-[#A3A3A3] shrink-0">({file.size})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded border border-[#343434] bg-[#111111] text-[9px] font-mono text-amber-400">
                    Selected locally
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="p-1 text-[#A3A3A3] hover:text-rose-400 transition-colors"
                    aria-label={`Remove ${file.name}`}
                    data-testid={`remove-file-${file.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
