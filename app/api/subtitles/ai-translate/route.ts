import { NextResponse } from 'next/server';

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://9router-production-3ae7.up.railway.app/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'sk-e20e4e62dbc9ed32-j0ixdi-b5824ede';
const AI_MODEL = process.env.AI_MODEL || 'qe';

/**
 * Split WebVTT into batches of ~35 cues to avoid token truncation
 * and enable fast concurrent translation.
 */
function splitVttIntoBatches(vttText: string, batchSize = 35): string[] {
  const blocks = vttText.trim().replace(/^WEBVTT\s*/i, '').trim().split(/\n{2,}/);
  const batches: string[] = [];

  for (let i = 0; i < blocks.length; i += batchSize) {
    const slice = blocks.slice(i, i + batchSize);
    batches.push(slice.join('\n\n'));
  }

  return batches.length > 0 ? batches : [vttText];
}

async function translateBatch(batchVtt: string): Promise<string> {
  const prompt = `You are a professional subtitle translator. Translate the following English subtitle cues into natural, modern, colloquial Persian (فارسی روان و محاوره‌ای).
CRITICAL RULES:
1. Preserve every timestamp line (e.g. "00:01:20.000 --> 00:01:23.000") EXACTLY without changing a single digit or arrow.
2. Only translate the spoken text underneath each timestamp.
3. Do NOT add markdown code blocks, backticks, conversational filler, or explanations. Return ONLY the translated subtitle cues.

Input:
${batchVtt}`;

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: 'You are an expert subtitle translator. You output only raw translated subtitle lines with exact timestamps.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI API responded with status ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '';

  // Strip markdown code fences if model returned them
  content = content.replace(/^```[a-z]*\n/i, '').replace(/```$/i, '').trim();

  return content;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vttText } = body;

    if (!vttText || typeof vttText !== 'string' || vttText.trim().length === 0) {
      return NextResponse.json({ error: 'Valid vttText is required' }, { status: 400 });
    }

    const batches = splitVttIntoBatches(vttText, 35);
    console.log(`[AI-Translate] Translating ${batches.length} subtitle batches with model "${AI_MODEL}"...`);

    // Process batches concurrently (limit concurrency to 4 to avoid rate limits)
    const translatedBatches: string[] = [];
    const CHUNK_SIZE = 4;

    for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
      const slice = batches.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(slice.map((b) => translateBatch(b)));
      translatedBatches.push(...results);
    }

    const combinedCues = translatedBatches.join('\n\n');
    const finalVtt = combinedCues.startsWith('WEBVTT') ? combinedCues : `WEBVTT\n\n${combinedCues}`;

    return NextResponse.json({ success: true, translatedVtt: finalVtt });
  } catch (error: any) {
    console.error('[AI-Translate] Error:', error.message || error);
    return NextResponse.json({ error: error.message || 'AI translation failed' }, { status: 500 });
  }
}
