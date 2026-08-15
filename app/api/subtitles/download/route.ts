import { NextResponse } from 'next/server';
import zlib from 'zlib';
import AdmZip from 'adm-zip';

function srtToWebVtt(srt: string): string {
  let input = srt.replace(/^\uFEFF/, '');
  input = input.replace(/\r\n|\r/g, '\n');

  const lines: string[] = ['WEBVTT', ''];
  const blocks = input.trim().split(/\n{2,}/);

  for (const block of blocks) {
    const blockLines = block.split('\n');
    const timeIdx = blockLines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;

    const timing = blockLines[timeIdx].replace(/(\d+),(\d+)/g, '$1.$2');
    const text = blockLines.slice(timeIdx + 1).filter((l) => l.trim() !== '');

    lines.push(timing);
    lines.push(...text);
    lines.push('');
  }

  return lines.join('\n');
}

function decodeBuffer(buf: Buffer): string {
  // Try UTF-8 first
  try {
    const utf8Str = buf.toString('utf-8');
    if (!utf8Str.includes('')) {
      return utf8Str;
    }
  } catch {}

  // Fallback to windows-1256 / latin1
  try {
    const decoder = new TextDecoder('windows-1256');
    return decoder.decode(buf);
  } catch {
    return buf.toString('utf-8');
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ success: false, text: '' }, { status: 400 });
  }
  if (url.startsWith('/')) {
    url = new URL(url, request.url).toString();
  }
  if (!/^https?:\/\//.test(url)) {
    return NextResponse.json({ success: false, text: '' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, text: '' }, { status: 502 });
    }

    const arrayBuf = await res.arrayBuffer();
    let buffer: Buffer = Buffer.from(arrayBuf);

    // Check if Gzip (magic number 1f 8b)
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        buffer = Buffer.from(zlib.gunzipSync(buffer));
      } catch (gzErr) {
        console.warn('Gunzip error:', gzErr);
      }
    }

    // Check if Zip archive (PK\x03\x04)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const subEntry = entries.find((e: any) => /\.(srt|vtt)$/i.test(e.entryName)) || entries[0];
        if (subEntry) {
          buffer = Buffer.from(subEntry.getData());
        }
      } catch (zipErr) {
        console.warn('Zip extract error:', zipErr);
      }
    }

    const decodedText = decodeBuffer(buffer);
    const vtt = /^\s*WEBVTT/i.test(decodedText) ? decodedText : srtToWebVtt(decodedText);

    return NextResponse.json({ success: true, text: vtt });
  } catch (error: any) {
    console.error('Subtitle Download Error:', error);
    return NextResponse.json({ success: false, text: '', error: error?.message || 'Download failed' }, { status: 502 });
  }
}
