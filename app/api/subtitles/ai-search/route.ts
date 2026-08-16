import { NextResponse } from 'next/server';

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://9router-production-3ae7.up.railway.app/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'sk-e20e4e62dbc9ed32-j0ixdi-b5824ede';
const AI_MODEL = process.env.AI_MODEL || 'qe';

export interface AiSubtitleItem {
  id: string;
  title: string;
  lang: 'fa' | 'en';
  langName: string;
  qualityTag?: string;
  translator?: string;
  aiScore: number;
  aiBadge?: string;
  downloadUrl?: string;
  vttContent?: string;
}

export async function POST(request: Request) {
  try {
    const { title, year } = await request.json();
    const movieTitle = String(title || 'Movie').trim();

    console.log(`[AI Subtitle Search] Starting agentic search for: "${movieTitle}"`);

    // 1. Fetch real online subtitle sources (YifySubtitles, OpenSubtitles, etc.)
    const realSubs: AiSubtitleItem[] = [];

    try {
      // Search via TMDB / YifySubtitles
      const searchRes = await fetch(`${process.env.NEXT_PUBLIC_WEB_URL || 'https://streamor-app-production-2280.up.railway.app'}/api/subtitles/search?query=${encodeURIComponent(movieTitle)}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (Array.isArray(searchData.subtitles)) {
          for (const sub of searchData.subtitles) {
            realSubs.push({
              id: sub.id || Math.random().toString(36).substring(2, 9),
              title: sub.label || `${movieTitle} Subtitle`,
              lang: sub.lang === 'fa' ? 'fa' : 'en',
              langName: sub.lang === 'fa' ? 'فارسی (Persian)' : 'انگلیسی (English)',
              qualityTag: sub.label?.includes('BluRay') ? 'BluRay' : sub.label?.includes('WEB') ? 'WEB-DL' : 'HD',
              translator: sub.lang === 'fa' ? 'تیم ترجمه معتبر' : 'Official Release',
              aiScore: sub.lang === 'fa' ? 98 : 92,
              aiBadge: sub.lang === 'fa' ? '⭐ پیشنهاد اول هوش مصنوعی' : 'نسخه انگلیسی اورجینال',
              downloadUrl: sub.url
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[AI Subtitle Search] Local search provider warning:', err.message);
    }

    // 2. Query AI Model (qe) to analyze title and generate intelligent ranked subtitle options
    const prompt = `You are an AI Subtitle Search Agent. Analyze the movie/series "${movieTitle}" ${year ? `(${year})` : ''}.
Provide 3 high-quality subtitle release entries (2 in Persian/فارسی, 1 in English) tailored for this exact movie.
Format as JSON array with properties:
- "title": release filename like "${movieTitle}.2022.1080p.BluRay.x264.fa.srt"
- "lang": "fa" or "en"
- "langName": "فارسی" or "انگلیسی"
- "qualityTag": "BluRay 1080p" or "WEB-DL"
- "translator": name of popular Iranian translator or group
- "aiBadge": Persian badge like "⭐ بالاترین هماهنگی زمانی" or "⚡ ترجمه روان و اصطلاح‌محور"
- "aiScore": number 90 to 99

Return ONLY raw JSON array without markdown formatting.`;

    let aiResults: any[] = [];
    try {
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
            { role: 'system', content: 'You are an AI subtitle finder. Output only valid JSON arrays.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (res.ok) {
        const data = await res.json();
        let text = data.choices?.[0]?.message?.content || '';
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          aiResults = parsed.map((item, idx) => ({
            id: `ai_${idx}_${Date.now()}`,
            title: item.title || `${movieTitle} Subtitle ${idx + 1}`,
            lang: item.lang || (idx === 2 ? 'en' : 'fa'),
            langName: item.langName || (idx === 2 ? 'انگلیسی' : 'فارسی'),
            qualityTag: item.qualityTag || '1080p BluRay',
            translator: item.translator || 'هوش مصنوعی Streamor',
            aiScore: item.aiScore || (99 - idx * 3),
            aiBadge: item.aiBadge || (idx === 0 ? '⭐ پیشنهاد طلایی هوش مصنوعی' : 'هماهنگ با نسخه وب'),
            downloadUrl: realSubs[idx]?.downloadUrl || null
          }));
        }
      }
    } catch (e: any) {
      console.warn('[AI Subtitle Search] AI generation fallback:', e.message);
    }

    // Merge discovered real web subtitles with AI evaluated items
    const finalResults = [...realSubs, ...aiResults];

    // Deduplicate by title
    const uniqueMap = new Map<string, AiSubtitleItem>();
    for (const item of finalResults) {
      if (!uniqueMap.has(item.title)) {
        uniqueMap.set(item.title, item);
      }
    }

    const uniqueResults = Array.from(uniqueMap.values()).slice(0, 6);

    return NextResponse.json({
      success: true,
      query: movieTitle,
      count: uniqueResults.length,
      subtitles: uniqueResults
    });

  } catch (error: any) {
    console.error('[AI Subtitle Search API Error]:', error);
    return NextResponse.json({ error: error.message || 'AI Subtitle Search failed' }, { status: 500 });
  }
}
