// Free Pokemon TCG card pricing — no signup, no API key needed.
// Returns market prices sourced from TCGPlayer and Cardmarket.
export default async function handler(req, res) {
  const { name } = req.query
  if (!name) {
    res.status(400).json({ error: 'Missing name query param' })
    return
  }

  try {
    const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(name)}"&pageSize=5`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Upstream request failed')
    const data = await response.json()

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
