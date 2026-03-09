import { NextRequest, NextResponse } from 'next/server';
import { apiError, createRequestId } from '@/lib/api/error-response';

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  const baseUrl = process.env.CONVERTER_API_BASE_URL || process.env.NEXT_PUBLIC_CONVERTER_API_BASE_URL;
  if (!baseUrl) {
    return apiError(503, {
      errorCode: 'CONVERTER_UNAVAILABLE',
      reason: 'Document conversion is not available in this beta. Export the file to PDF first.',
      requestId,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(400, {
      errorCode: 'INVALID_FORM_DATA',
      reason: 'Invalid form data',
      requestId,
    });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return apiError(400, {
      errorCode: 'MISSING_FILE',
      reason: 'Missing file',
      requestId,
    });
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return apiError(upstream.status, {
        errorCode: 'CONVERSION_FAILED',
        reason: text || 'Conversion failed',
        requestId,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/pdf',
      },
    });
  } catch (error) {
    return apiError(500, {
      errorCode: 'CONVERTER_RUNTIME_ERROR',
      reason: error instanceof Error ? error.message : 'Conversion failed',
      requestId,
    });
  }
}
