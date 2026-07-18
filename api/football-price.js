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
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(name)}&category_ids=212&limit=10`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
      },
    })
    if (!response.ok) throw new Error('Upstream eBay request failed')
    const data = await response.json()

    const items = data.itemSummaries || []
    const prices = items.map((item) => Number(item.price?.value)).filter((p) => !Number.isNaN(p))
    const average = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null

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
    res.status(200).json({ configured: true, average, sampleSize: prices.length, listings })
  } catch (err) {
    res.status(500).json({ configured: true, error: 'Failed to fetch eBay price data' })
  }
}
