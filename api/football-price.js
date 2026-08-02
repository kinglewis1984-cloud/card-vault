// Football/soccer trading card pricing via eBay's Browse API (sold/active
// listings) — requires a free eBay Developer account + app credentials.
// Until EBAY_CLIENT_ID/EBAY_CLIENT_SECRET are configured, this returns a
// "not configured" flag so the frontend can show a manual-price fallback.

let cachedToken = null
let cachedTokenExpiry = 0

// eBay's application access tokens expire in ~2 hours, so a static token
// env var would go stale — fetch and cache one ourselves instead, using the
// long-lived Client ID/Secret.
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken

  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  })
  if (!response.ok) return null
  const data = await response.json()

  cachedToken = data.access_token
  cachedTokenExpiry = Date.now() + (data.expires_in - 120) * 1000
  return cachedToken
}

// Cards added by typing the full collector description in — e.g. "Max
// Dowman – 2025-26 Topps Merlin Chrome Premier League, RC (Rookie Card),
// Green Refractor Parallel #97/99" — rarely match any real listing title
// verbatim; real titles don't combine every one of those descriptors in
// that exact wording. Strip the parenthetical notes and print numbering to
// get a plainer query, and fall back further to just the leading words
// (usually the player name) if even that comes back empty.
function cleanupName(raw) {
  return raw
    .replace(/[–—]/g, '-')
    .replace(/\([^)]*\)/g, '')
    .replace(/#?\d+\s*\/\s*\d+/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchQueries(rawName) {
  const queries = [rawName]

  const cleaned = cleanupName(rawName)
  if (cleaned) queries.push(cleaned)

  const beforeDash = cleaned.split(/\s-\s/)[0].trim()
  if (beforeDash) queries.push(beforeDash)

  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 6) queries.push(words.slice(0, 6).join(' '))

  return [...new Set(queries.filter(Boolean))]
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// A plain mean gets dragged around by one wildly over/under-priced listing
// in a small sample — e.g. an unrelated bundle or a job-lot auction mixed in
// with single-card listings. Dropping values outside 1.5x the interquartile
// range before taking the median keeps the estimate close to what most
// listings actually go for. Skipped for very small samples, where IQR isn't
// meaningful and could wipe out most of the data.
function filterOutliers(nums) {
  if (nums.length < 4) return nums
  const sorted = [...nums].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  const filtered = nums.filter((n) => n >= lower && n <= upper)
  return filtered.length ? filtered : nums
}

export default async function handler(req, res) {
  const { name } = req.query
  if (!name) {
    res.status(400).json({ error: 'Missing name query param' })
    return
  }

  const token = await getAccessToken()
  if (!token) {
    res.status(200).json({ configured: false, results: [] })
    return
  }

  try {
    let items = []
    for (const query of buildSearchQueries(name)) {
      const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=212&limit=10`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      let response
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
          },
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!response.ok) throw new Error('Upstream eBay request failed')
      const data = await response.json()
      items = data.itemSummaries || []
      if (items.length) break
    }

    const prices = items.map((item) => Number(item.price?.value)).filter((p) => !Number.isNaN(p))
    const usablePrices = filterOutliers(prices)
    // Field is still called "average" for the frontend's sake, but it's a
    // median of the outlier-filtered prices now, not a plain mean.
    const average = usablePrices.length ? median(usablePrices) : null

    // Real listings (not just the average) so the caller can show what the
    // search term actually matched — there's no fixed card database for
    // football cards to pick an exact one from, unlike Pokemon.
    const listings = items.slice(0, 8).map((item) => ({
      title: item.title,
      image: item.image?.imageUrl,
      price: Number(item.price?.value) || null,
      url: item.itemWebUrl,
    }))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
    res.status(200).json({ configured: true, average, sampleSize: usablePrices.length, listings })
  } catch (err) {
    res.status(500).json({ configured: true, error: 'Failed to fetch eBay price data' })
  }
}
