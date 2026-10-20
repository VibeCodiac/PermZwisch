import dns from 'node:dns/promises';
import net from 'node:net';
import { UserError } from './images.js';

// Schutz vor Server-Side Request Forgery: keine Anfragen an interne/private Adressen.
const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
]) blocked.addSubnet(addr, prefix, 'ipv6');

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true;
}

export function parseHttpUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return url;
}

async function assertPublic(url) {
  if (url.port && !['80', '443'].includes(url.port)) throw new UserError('Unzulässiger Port.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new UserError('Diese Adresse kann nicht abgerufen werden.');
  }
}

/**
 * Lädt eine öffentliche URL mit Größen- und Zeitlimit. Weiterleitungen werden einzeln geprüft.
 * `allowHost(hostname)` kann die erlaubten Ziele zusätzlich einschränken.
 */
export async function safeFetch(rawUrl, { maxBytes = 3_000_000, timeout = 8000, accept = '*/*', allowHost } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    const url = parseHttpUrl(current);
    if (!url) throw new UserError('Ungültige URL.');
    if (allowHost && !allowHost(url.hostname)) throw new UserError('Dieser Host ist nicht erlaubt.');
    await assertPublic(url);

    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
      headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; BlogLinkPreview/1.0)' },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) break;
      current = new URL(location, url).href;
      continue;
    }
    if (!res.ok) throw new UserError(`Abruf fehlgeschlagen (HTTP ${res.status}).`);

    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) {
        if (accept.startsWith('text/html')) break; // für Vorschauen reicht der Anfang der Seite
        throw new UserError('Die Datei ist zu groß.');
      }
      chunks.push(chunk);
    }
    return { buffer: Buffer.concat(chunks), contentType: res.headers.get('content-type') || '', url: url.href };
  }
  throw new UserError('Zu viele Weiterleitungen.');
}
