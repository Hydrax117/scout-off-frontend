'use client';

import { useState, ChangeEvent } from 'react';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import Spinner from '@/components/ui/Spinner';

/** Accepted MIME types for client-side validation */
export const ACCEPTED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'image/jpeg',
  'image/png',
] as const;

/** Accepted file extensions label shown to users */
export const ACCEPTED_TYPES_LABEL = 'MP4, MOV, JPEG, PNG';

/** Maximum file size enforced on the client: 50 MB */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '50 MB';

/**
 * Validate a File against accepted types and size limit.
 * Returns an error string, or null when the file is valid.
 */
export function validateFile(file: File): string | null {
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `File type "${file.type || 'unknown'}" is not supported. Please upload ${ACCEPTED_TYPES_LABEL}.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `File is too large (${sizeMB} MB). Maximum size is ${MAX_FILE_SIZE_LABEL}.`;
  }
  return null;
}

interface VideoUploadProps {
  onUpload: (cid: string) => void;
  /** Propagate a validation or upload error from outside (e.g. parent state) */
  error?: string;
  /** Called whenever client-side file validation produces an error (or null to clear) */
  onValidationError?: (error: string | null) => void;
}

export default function VideoUpload({
  onUpload,
  error,
  onValidationError,
}: VideoUploadProps) {
  const [fileName, setFileName] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    progress,
    phase,
    uploading: isUploading,
    canResume,
    upload,
    resume,
  } = useChunkedUpload();
  const isProcessing = isUploading && phase === 'processing';

  const displayError = error ?? localError;
  const errorId = displayError ? 'video-upload-error' : undefined;

  const handleUploadResult = (cid: string | null, uploadError: string | null) => {
    if (cid) {
      setLocalError(null);
      onValidationError?.(null);
      onUpload(cid);
      return;
    }
    const message = uploadError ?? 'Upload failed. Please try again.';
    setLocalError(message);
    onValidationError?.(message);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Client-side validation ────────────────────────────────────────────────
    const validationError = validateFile(file);
    if (validationError) {
      setLocalError(validationError);
      onValidationError?.(validationError);
      // Reset so the user can pick again
      e.target.value = '';
      return;
    }

    // Clear any previous error
    setLocalError(null);
    onValidationError?.(null);
    setFileName(file.name);

    const outcome = await upload(file);
    handleUploadResult(outcome.cid, outcome.error);
  };

  const handleResume = async () => {
    const outcome = await resume();
    handleUploadResult(outcome.cid, outcome.error);
  };

  return (
    <div className="space-y-1">
      <label
        htmlFor="video-upload-input"
        className="block text-sm font-medium text-gray-300"
      >
        Highlight Reel
      </label>
      <p id="video-upload-hint" className="text-xs text-gray-400">
        Accepted: {ACCEPTED_TYPES_LABEL} · Max {MAX_FILE_SIZE_LABEL}
      </p>
      <div className="relative">
        <input
          id="video-upload-input"
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(',')}
          onChange={handleFileChange}
          disabled={isUploading}
          aria-describedby={
            [errorId, 'video-upload-hint'].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={displayError ? true : undefined}
          className={`w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green transition file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-brand-green file:text-black file:font-medium hover:file:opacity-90 disabled:opacity-50 ${
            displayError ? 'border-red-500' : ''
          }`}
        />
        {isUploading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-brand-green">
              <Spinner size="sm" />
              <span className="text-sm">
                {isProcessing ? 'Processing…' : `Uploading... ${progress}%`}
              </span>
            </div>
          </div>
        )}
      </div>
      {isUploading && (
        <div
          role="progressbar"
          aria-valuenow={isProcessing ? undefined : progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            isProcessing ? 'Processing upload' : 'Upload progress'
          }
          className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden"
        >
          <div
            className={`h-full bg-brand-green transition-[width] duration-200 ${
              isProcessing ? 'animate-pulse w-full' : ''
            }`}
            style={isProcessing ? undefined : { width: `${progress}%` }}
          />
        </div>
      )}
      {displayError && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {displayError}
        </p>
      )}
      {displayError && canResume && !isUploading && (
        <button
          type="button"
          onClick={handleResume}
          className="text-sm text-brand-green hover:opacity-80 transition underline"
        >
          Resume upload
        </button>
      )}
      {fileName && !isUploading && !displayError && (
        <p className="text-sm text-gray-400">Uploaded: {fileName}</p>
      )}
    </div>
  );
}
