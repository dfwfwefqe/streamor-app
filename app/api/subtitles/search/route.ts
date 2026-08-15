import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || '8e2be4aa080a70388e9d3514dcc73339';
const LANGS = new Set(['per', 'fas', 'fa', 'farsi', 'persian', 'eng', 'en', 'english']);

const OPENSUBS_BASE = 'https://opensubtitles-v3.strem.fun';
const SUBSDL_BASE = 'https://subdl.strem.fun';
const TMDB_BASE = 'https://api.themoviedb.org/3';

const IMDB_RE = /\btt\d{5,12}\b/i;

/**
 * Normalize an IMDb id so the OpenSubtitles Stremio addon accepts it:
 * it requires the `tt` prefix (e.g. `tt0137523`), never a bare number.
 */
function normalizeImdbId(id: string): string {
  if (!id) return '';
  const t = String(id).trim();
  const m = t.match(/\btt\d+\b/i) || t.match(/\b\d{6,8}\b/);
  if (!m) return '';
  const raw = m[0];
  return raw.toLowerCase().startsWith('tt') ? raw.toLowerCase() : `tt${raw}`;
}

/** Pull an IMDb id out of arbitrary text (query/tmdbId). */
function imdbFromText(text: string): string {
  if (!text) return '';
  const m = String(text).match(IMDB_RE);
  return m ? normalizeImdbId(m[0]) : '';
}

async function tmdbExternalId(mediaType: 'movie' | 'tv', id: string): Promise<string> {
  if (!TMDB_API_KEY) return '';
  try {
    const res = await fetch(
      `${TMDB_BASE}/${mediaType}/${encodeURIComponent(id)}/external_ids?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return '';
    const ext = await res.json();
    return normalizeImdbId(ext?.imdb_id || '');
  } catch {
    return '';
  }
}

/**
 * Resolve an IMDb id from a text query via TMDB search:
 * search/multi -> TMDB id -> external_ids -> imdb_id (with tt).
 */
async function imdbIdFromQuery(query: string, isSeries: boolean): Promise<string> {
  // A query that is already an imdb id shortcuts everything.
  const direct = imdbFromText(query);
  if (direct) return direct;
  if (!TMDB_API_KEY) return '';
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&api_key=${encodeURIComponent(TMDB_API_KEY)}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const results = (data?.results || []) as any[];

    const targetType = isSeries ? 'tv' : 'movie';
    const match =
      results.find((r) => r?.media_type === targetType) ||
      results.find((r) => r?.media_type === 'movie' || r?.media_type === 'tv');

    if (match?.id) {
      const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
      const imdb = await tmdbExternalId(mediaType, String(match.id));
      if (imdb) return imdb;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Ask a Stremio subtitle addon for subs for an imdb id.
 * The addons only accept `type/id.json` where id is a `tt...` imdb id
 * (optionally `imdbId:season:episode` for series) — never a text query.
 */
async function fetchAddonSubtitles(
  mediaType: 'movie' | 'series',
  imdbId: string,
  season?: string,
  episode?: string
): Promise<any[]> {
  const suffix =
    mediaType === 'series'
      ? `${imdbId}:${season || '1'}:${episode || '1'}`
      : imdbId;
  const bases = [OPENSUBS_BASE, SUBSDL_BASE];

  for (const base of bases) {
    const url = `${base}/subtitles/${mediaType}/${encodeURIComponent(suffix)}.json`;
    try {
      const res = await fetch(url, { next: { revalidate: 21600 } });
      if (!res.ok) continue;
      const data = await res.json();
      const subs = (data?.subtitles || []) as any[];
      if (subs.length) return subs;
    } catch {
      // try next provider
    }
  }
  return [];
}

function mapSubtitles(subs: any[]): any[] {
  return subs
    .filter((s) => s && LANGS.has(String(s.lang || '').toLowerCase()) && typeof s.url === 'string')
    .slice(0, 35)
    .map((s, index) => {
      const isEn = ['eng', 'en', 'english'].includes(String(s.lang).toLowerCase());
      const langVal = String(s.lang || '').toLowerCase();
      return {
        id: String(s.id ?? `${langVal}-${index}`),
        lang: isEn ? 'en' : 'fa',
        label: `${isEn ? 'English' : 'فارسی'} #${index + 1}`,
        url: s.url,
      };
    });
}

/**
 * Self-contained fallback subtitles that always render in the dropdown,
 * even when no imdb id could be resolved (test/custom videos) or when the
 * online providers return nothing. They point at our own sample endpoint so
 * they keep working regardless of external availability.
 */
function fallbackSubtitles(): any[] {
  return [
    {
      id: 'sample-fa',
      lang: 'fa',
      label: 'فارسی (نمونه / Sample)',
      url: '/api/subtitles/sample?lang=fa',
    },
    {
      id: 'sample-en',
      lang: 'en',
      label: 'English (Sample)',
      url: '/api/subtitles/sample?lang=en',
    },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get('tmdbId');
  const query = searchParams.get('query');
  const isSeries = searchParams.get('isSeries') === 'true';
  const season = searchParams.get('season') || undefined;
  const episode = searchParams.get('episode') || undefined;

  if (!tmdbId && !query) {
    return NextResponse.json({ subtitles: [] });
  }

  try {
    const mediaType = isSeries ? 'series' : 'movie';

    // 1) Resolve an imdb id (tt...) from tmdbId / query.
    let imdbId =
      (tmdbId ? imdbFromText(tmdbId) || normalizeImdbId(tmdbId) : '') ||
      (query ? imdbFromText(query) : '');

    if (!imdbId && TMDB_API_KEY) {
      if (tmdbId) imdbId = await tmdbExternalId(isSeries ? 'tv' : 'movie', tmdbId);
      if (!imdbId && query) imdbId = await imdbIdFromQuery(query, isSeries);
    }

    // 2) Ask the Stremio subtitle addons for real subs when we have an id.
    let subtitles: any[] = [];
    if (imdbId) {
      const raw = await fetchAddonSubtitles(mediaType, imdbId, season, episode);
      subtitles = mapSubtitles(raw);
    }

    return NextResponse.json({ subtitles, resolvedImdbId: imdbId });
  } catch (error) {
    console.error('Subtitle Search Error:', error);
    return NextResponse.json({ subtitles: [], resolvedImdbId: '' });
  }
}
