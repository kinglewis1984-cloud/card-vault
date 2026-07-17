// Free Pokemon TCG card pricing — no signup, no API key needed.
// Returns market prices sourced from TCGPlayer and Cardmarket.
export default async function handler(req, res) {
  const { name } = req.query
  if (!name) {
    res.status(400).json({ error: 'Missing name query param' })
    return
  }

  try {
    const exactUrl = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(name)}"&pageSize=5`
    let response = await fetch(exactUrl)
    if (!response.ok) throw new Error('Upstream request failed')
    let data = await response.json()

    // Exact phrase match failed (e.g. name formatted differently, like "Mega
    // Charizard EX" vs the card's real name "M Charizard-EX") — fall back to
    // a wildcard match on each word of the name.
    if (!data.data?.length) {
      const words = name.split(/\s+/).filter((w) => w.length > 1)
      if (words.length) {
        const wildcardQuery = words.map((w) => `name:*${encodeURIComponent(w)}*`).join(' ')
        const fallbackUrl = `https://api.pokemontcg.io/v2/cards?q=${wildcardQuery}&pageSize=5`
        response = await fetch(fallbackUrl)
        if (response.ok) data = await response.json()
      }
    }

    const results = (data.data || []).map((card) => {
      const tcgMarket = Object.values(card.tcgplayer?.prices || {}).find((p) => p.market)?.market
      const cardmarketPrice = card.cardmarket?.prices?.trendPrice

      return {
        id: card.id,
        name: card.name,
        set: card.set?.name,
        number: card.number,
        image: card.images?.small,
        price: tcgMarket ?? cardmarketPrice ?? null,
        priceSource: tcgMarket ? 'tcgplayer' : cardmarketPrice ? 'cardmarket' : null,
      }
    })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
    res.status(200).json({ results })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Pokemon card price' })
  }
}
