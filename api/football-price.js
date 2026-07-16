// Football/soccer trading card pricing via eBay's Browse API (sold/active
// listings) — requires a free eBay Developer account + app credentials.
// Until EBAY_APP_TOKEN is configured, this returns a "not configured" flag
// so the frontend can show a manual-price fallback instead of erroring.
export default async function handler(req, res) {
  const { name } = req.query
  if (!name) {
    res.status(400).json({ error: 'Missing name query param' })
    return
  }

  const token = process.env.EBAY_APP_TOKEN
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

    const prices = (data.itemSummaries || [])
      .map((item) => Number(item.price?.value))
      .filter((p) => !Number.isNaN(p))

    const average = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
    res.status(200).json({ configured: true, average, sampleSize: prices.length })
  } catch (err) {
    res.status(500).json({ configured: true, error: 'Failed to fetch eBay price data' })
  }
}
