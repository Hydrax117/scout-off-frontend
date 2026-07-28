import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger } from '@/lib/logger';

/**
 * CSP Report Endpoint
 * Handles Content Security Policy violation reports
 *
 * This endpoint receives CSP violation reports from browsers
 * and logs them for monitoring and debugging purposes.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (
    mediaType !== 'application/csp-report' &&
    mediaType !== 'application/json'
  ) {
    return new NextResponse('Unsupported Media Type', { status: 415 });
  }

  try {
    const report = await request.json();

    log.info('CSP violation report received', {
      userAgent: request.headers.get('user-agent'),
      report,
    });

    // Return 204 No Content as per CSP specification
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error('Failed to process CSP report', {
      reason: error instanceof Error ? error.message : String(error),
    });
    // Still return 204 to avoid cascading errors
    return new NextResponse(null, { status: 204 });
  }
}

/**
 * GET handler for endpoint verification
 * Returns 405 Method Not Allowed for GET requests
 */
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405 });
}
