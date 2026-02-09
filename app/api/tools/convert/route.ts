import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const baseUrl = process.env.CONVERTER_API_BASE_URL || process.env.NEXT_PUBLIC_CONVERTER_API_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Converter API not configured. Set CONVERTER_API_BASE_URL.' },
      { status: 501 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: text || 'Conversion failed' },
        { status: upstream.status }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/pdf',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Conversion failed' },
      { status: 500 }
    );
  }
}
