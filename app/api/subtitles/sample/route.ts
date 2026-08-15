import { NextResponse } from 'next/server';

const FA_SAMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
سلام! این یک زیرنویس نمونه فارسی است.

2
00:00:06.000 --> 00:00:10.000
خوش آمدید به Streamor — پخش همزمان فیلم و سریال.
`;

const EN_SAMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
Hello! This is a sample English subtitle.

2
00:00:06.000 --> 00:00:10.000
Welcome to Streamor — watch movies and series together.
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = (searchParams.get('lang') || 'fa').toLowerCase();

  const body = ['en', 'eng', 'english'].includes(lang) ? EN_SAMPLE_VTT : FA_SAMPLE_VTT;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
