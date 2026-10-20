import { safeFetch, parseHttpUrl } from './safe-fetch.js';
import { UserError } from './images.js';

const allowedApiHosts = (h) =>
  h === 'open.spotify.com' || h === 'itunes.apple.com';
const allowedImageHosts = (h) =>
  h === 'i.scdn.co' || h.endsWith('.scdn.co') || h.endsWith('.spotifycdn.com') || h.endsWith('.mzstatic.com');

/** open.spotify.com/(intl-de/)show|episode/<id> */
export function parseSpotifyUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || url.hostname !== 'open.spotify.com') return null;
  const m = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(show|episode)\/([A-Za-z0-9]{22})\/?$/);
  if (!m) return null;
  return {
    type: m[1],
    id: m[2],
    url: `https://open.spotify.com/${m[1]}/${m[2]}`,
    embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
  };
}

/** podcasts.apple.com/<land>/podcast/<name>/id<showId>?i=<episodeId> */
export function parseAppleUrl(value) {
  const url = parseHttpUrl(value);
  if (!url || url.hostname !== 'podcasts.apple.com') return null;
  const m = url.pathname.match(/^\/([a-z]{2})\/podcast\/(?:[^/]+\/)?id(\d+)\/?$/);
  if (!m) return null;
  const episodeId = /^\d+$/.test(url.searchParams.get('i') || '') ? url.searchParams.get('i') : null;
  const query = episodeId ? `?i=${episodeId}` : '';
  return {
    country: m[1],
    showId: m[2],
    episodeId,
    url: `https://podcasts.apple.com${url.pathname}${query}`,
    embed: `https://embed.podcasts.apple.com${url.pathname}${query}`,
  };
}

async function getJson(url) {
  const { buffer } = await safeFetch(url, { accept: 'application/json', allowHost: allowedApiHosts, maxBytes: 4_000_000 });
  return JSON.parse(buffer.toString('utf8'));
}

function bigArtwork(url) {
  // Apple liefert Artwork in beliebiger Größe – 1200px statt 600px anfordern
  return url ? url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, '/1200x1200bb.jpg') : null;
}

/** Holt Podcast-Name, Episodentitel, Herausgeber und Cover von Apple und/oder Spotify. */
export async function fetchPodcastMeta({ spotifyUrl, appleUrl }) {
  const result = { podcastName: '', episodeTitle: '', publisher: '', artworkUrl: null, description: '' };
  const apple = appleUrl ? parseAppleUrl(appleUrl) : null;
  const spotify = spotifyUrl ? parseSpotifyUrl(spotifyUrl) : null;
  if (appleUrl && !apple) throw new UserError('Der Apple-Podcasts-Link hat ein unbekanntes Format.');
  if (spotifyUrl && !spotify) throw new UserError('Der Spotify-Link hat ein unbekanntes Format.');
  if (!apple && !spotify) throw new UserError('Bitte einen Spotify- oder Apple-Podcasts-Link angeben.');

  const errors = [];
  if (apple) {
    try {
      const params = new URLSearchParams({ id: apple.showId, country: apple.country });
      if (apple.episodeId) {
        params.set('entity', 'podcastEpisode');
        params.set('limit', '200');
      }
      const data = await getJson(`https://itunes.apple.com/lookup?${params}`);
      const show = data.results?.find((r) => r.kind === 'podcast' || r.wrapperType === 'track');
      if (show) {
        result.podcastName = show.collectionName || show.trackName || '';
        result.publisher = show.artistName || '';
        result.artworkUrl = bigArtwork(show.artworkUrl600 || show.artworkUrl100);
      }
      if (apple.episodeId) {
        const ep = data.results?.find((r) => String(r.trackId) === apple.episodeId);
        if (ep) {
          result.episodeTitle = ep.trackName || '';
          result.description = (ep.description || ep.shortDescription || '').slice(0, 600);
          if (ep.artworkUrl600) result.artworkUrl = bigArtwork(ep.artworkUrl600);
        }
      }
    } catch (err) {
      errors.push(`Apple: ${err.message}`);
    }
  }

  if (spotify) {
    try {
      const data = await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotify.url)}`);
      if (spotify.type === 'show' && !result.podcastName) result.podcastName = data.title || '';
      if (spotify.type === 'episode' && !result.episodeTitle) result.episodeTitle = data.title || '';
      if (!result.artworkUrl && data.thumbnail_url) result.artworkUrl = data.thumbnail_url;
    } catch (err) {
      errors.push(`Spotify: ${err.message}`);
    }
  }

  if (!result.podcastName && !result.episodeTitle && !result.artworkUrl) {
    throw new UserError(`Metadaten konnten nicht abgerufen werden. ${errors.join(' ')}`.trim());
  }
  return result;
}

/** Cover herunterladen (nur von Apple/Spotify-CDNs), damit Besucher keine Drittanbieter-Anfragen auslösen. */
export async function downloadArtwork(artworkUrl) {
  const { buffer } = await safeFetch(artworkUrl, { accept: 'image/*', allowHost: allowedImageHosts, maxBytes: 8_000_000 });
  return buffer;
}
