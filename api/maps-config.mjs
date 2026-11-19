import { headers as securityHeaders } from '../scripts/build.mjs';

const SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const GBP_SHARE_URL = 'https://share.google/qxRaiWqPZy8jyHRL2';
const EMBED_VIEW_BASE = 'https://www.google.com/maps/embed/v1/view';
const EMBED_PLACE_BASE = 'https://www.google.com/maps/embed/v1/place';
const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache
const SERVICE_AREA_LABEL = 'Shreveport & Bossier City, LA';

function readMapsApiKey(env = process.env) {
  return String(
    env.GOOGLE_MAPS_API_KEY ||
      env.VITE_GOOGLE_MAPS_API_KEY ||
      env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
  ).trim();
}

export function createMapsConfigService({
  env = process.env,
  fetchFn = globalThis.fetch,
  nowFn = () => Date.now()
} = {}) {
  let cachedAreaLookup = null;

  async function lookupServiceAreaCoordinates(apiKey) {
    const now = nowFn();
    if (cachedAreaLookup && cachedAreaLookup.expiresAt > now) {
      return cachedAreaLookup.location;
    }

    if (typeof fetchFn !== 'function') {
      return null;
    }

    try {
      const response = await fetchFn(PLACES_TEXT_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
          'X-Goog-Maps-Solution-ID': SOLUTION_ID
        },
        body: JSON.stringify({
          textQuery: 'Shreveport Bossier City LA',
          languageCode: 'en',
          regionCode: 'US',
          pageSize: 1
        }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json().catch(() => null);
      const firstPlace = Array.isArray(data?.places) && data.places.length > 0 ? data.places[0] : null;
      const lat = firstPlace?.location?.latitude;
      const lng = firstPlace?.location?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        cachedAreaLookup = { location: null, expiresAt: now + PLACE_CACHE_TTL_MS };
        return null;
      }

      const location = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6))
      };
      cachedAreaLookup = { location, expiresAt: now + PLACE_CACHE_TTL_MS };
      return location;
    } catch {
      return null;
    }
  }

  async function getMapsConfigAsync() {
    const apiKey = readMapsApiKey(env);
    if (!apiKey) {
      return {
        ok: true,
        configured: false,
        profileUrl: GBP_SHARE_URL,
        attributionId: SOLUTION_ID
      };
    }

    // Use Places API (New) to center a clean service-area map view without exposing a street address.
    // Note: Maps Embed API /v1/* rejects `solution_id` with 400 Unexpected parameter, so attribution
    // is sent via the Places API X-Goog-Maps-Solution-ID header only.
    const areaCenter = await lookupServiceAreaCoordinates(apiKey);

    let embedUrl = '';
    if (areaCenter) {
      const viewParams = new URLSearchParams({
        key: apiKey,
        center: `${areaCenter.latitude},${areaCenter.longitude}`,
        zoom: '11',
        language: 'en',
        region: 'US'
      });
      embedUrl = `${EMBED_VIEW_BASE}?${viewParams.toString()}`;
    } else {
      const placeParams = new URLSearchParams({
        key: apiKey,
        q: 'Shreveport, LA',
        zoom: '11',
        language: 'en',
        region: 'US'
      });
      embedUrl = `${EMBED_PLACE_BASE}?${placeParams.toString()}`;
    }

    return {
      ok: true,
      configured: true,
      embedUrl,
      embedTitle: 'Smarts Pro Solutions Service Area — Shreveport & Bossier City, LA',
      locationLabel: SERVICE_AREA_LABEL,
      profileUrl: GBP_SHARE_URL,
      attributionId: SOLUTION_ID
    };
  }

  return {
    getMapsConfigAsync
  };
}

export const defaultMapsConfigService = createMapsConfigService();

/**
 * Vercel Serverless Function: GET /api/maps-config
 * Returns Google Maps Embed API configuration sourced from server environment secrets
 * so API keys are never hardcoded in static HTML/JS bundles.
 */
export default async function handler(req, res) {
  Object.entries(securityHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }));
    return;
  }

  const payload = await defaultMapsConfigService.getMapsConfigAsync();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
}
