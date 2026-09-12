/* Reuse signed URLs so unchanged private photos remain browser-cacheable. */
const PREFIX = 'tanneros:photo-url:v1:';
const TTL_SECONDS = 3600;
const REUSE_MS = 50 * 60 * 1000;

const cacheKey = (bucket, path) => `${PREFIX}${bucket}:${path}`;

function read(bucket, path) {
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey(bucket, path)) || 'null');
    if (value?.url && Number(value.expiresAt) > Date.now()) return value.url;
    sessionStorage.removeItem(cacheKey(bucket, path));
  } catch (_) { /* Cache access can be disabled by the browser. */ }
  return null;
}

function write(bucket, path, url) {
  if (!url) return;
  try {
    sessionStorage.setItem(cacheKey(bucket, path), JSON.stringify({ url, expiresAt: Date.now() + REUSE_MS }));
  } catch (_) { /* This cache is an optimization, not a requirement. */ }
}

export async function getSignedPhotoUrls(supabase, bucket, paths) {
  const result = {};
  const missing = [];
  [...new Set((paths || []).filter(Boolean))].forEach((path) => {
    const cached = read(bucket, path);
    if (cached) result[path] = cached;
    else missing.push(path);
  });
  if (!missing.length) return result;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_SECONDS);
  if (error) throw error;
  (data || []).forEach((row) => {
    if (!row?.signedUrl || row.error) return;
    result[row.path] = row.signedUrl;
    write(bucket, row.path, row.signedUrl);
  });
  return result;
}

export async function getSignedPhotoUrl(supabase, bucket, path) {
  if (!path) return null;
  const urls = await getSignedPhotoUrls(supabase, bucket, [path]);
  return urls[path] || null;
}
