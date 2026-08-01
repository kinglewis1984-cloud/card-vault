// Free Pokemon TCG card pricing — no signup, no API key needed.
// Returns market prices sourced from TCGPlayer and Cardmarket.

const VARIANT_LABELS = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  reverseHolofoil: 'Reverse Holofoil',
  '1stEditionNormal': '1st Edition Normal',
  '1stEditionHolofoil': '1st Edition Holofoil',
  unlimited: 'Unlimited',
  unlimitedHolofoil: 'Unlimited Holofoil',
}

function variantLabel(key) {
  return VARIANT_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// api.pokemontcg.io's free (no-API-key) tier is prone to intermittent 500s
// under normal load, unrelated to how much traffic we send it. Retrying a
// few times with backoff rides out those blips instead of surfacing a
// transient failure as "no price data" for a card that has real pricing.
async function fetchWithRetry(url, attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`Upstream ${response.status}`)
    } catch (e) {
      lastError = e
    }
    if (i < attempts - 1) await wait(500 * (i + 1))
  }
  throw lastError
}

// Builds a result that includes every priced print variant (normal, holofoil,
// reverse holofoil, etc.) so the caller can tell them apart, plus a default
// price (the requested variant if given, else the first priced variant).
function buildCardResult(card, requestedVariant) {
  const tcgPrices = card.tcgplayer?.prices || {}
  const variants = Object.entries(tcgPrices)
    .filter(([, p]) => p.market)
    .map(([key, p]) => ({ key, label: variantLabel(key), price: p.market }))

  const cardmarketPrice = card.cardmarket?.prices?.trendPrice

  let price = null
  let priceSource = null
  if (requestedVariant && tcgPrices[requestedVariant]?.market) {
    price = tcgPrices[requestedVariant].market
    priceSource = 'tcgplayer'
  } else if (variants.length) {
    price = variants[0].price
    priceSource = 'tcgplayer'
  } else if (cardmarketPrice) {
    price = cardmarketPrice
    priceSource = 'cardmarket'
  }

  return {
    id: card.id,
    name: card.name,
    set: card.set?.name,
    number: card.number,
    image: card.images?.small,
    variants,
    price,
    priceSource,
  }
}

export default async function handler(req, res) {
  const { name, id, variant } = req.query

  try {
    // Exact lookup by card id (used for re-pricing an already-added card
    // against the specific print/variant the owner picked).
    if (id) {
      const response = await fetchWithRetry(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(id)}`)
      const data = await response.json()
      const results = data.data ? [buildCardResult(data.data, variant)] : []
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
      res.status(200).json({ results })
      return
    }

    if (!name) {
      res.status(400).json({ error: 'Missing name or id query param' })
      return
    }

    const exactUrl = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(name)}"&pageSize=10`
    let response = await fetchWithRetry(exactUrl)
    let data = await response.json()

    // Exact phrase match failed (e.g. name formatted differently, like "Mega
    // Charizard EX" vs the card's real name "M Charizard-EX") — fall back to
    // a wildcard match on each word of the name.
    if (!data.data?.length) {
      const words = name.split(/\s+/).filter((w) => w.length > 1)
      if (words.length) {
        const wildcardQuery = words.map((w) => `name:*${encodeURIComponent(w)}*`).join(' ')
        const fallbackUrl = `https://api.pokemontcg.io/v2/cards?q=${wildcardQuery}&pageSize=10`
        response = await fetchWithRetry(fallbackUrl)
        data = await response.json()
      }
    }

    const results = (data.data || []).map((card) => buildCardResult(card))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800')
    res.status(200).json({ results })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Pokemon card price' })
  }
}
