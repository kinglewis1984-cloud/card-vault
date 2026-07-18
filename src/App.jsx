import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function variantLabel(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

// Opens an image full-size in a new tab so it can be checked against the
// physical card. stopPropagation matters where the image sits inside a
// clickable button/tile (e.g. a match result) so zooming doesn't also
// trigger that button's own click action.
function openImage(e, url) {
  e.stopPropagation()
  window.open(url, '_blank', 'noopener')
}

function AuthGate() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function sendMagicLink(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="auth-gate">
      <h1>CARD VAULT</h1>
      <p className="tagline">Your Pokemon &amp; football card portfolio, tracked live.</p>
      <form onSubmit={sendMagicLink}>
        {sent ? (
          <p className="hint-text">Check your email for a sign-in link.</p>
        ) : (
          <>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit">Sign in</button>
            {error && <p className="hint-text error">{error}</p>}
          </>
        )}
      </form>
    </div>
  )
}

// Search + pick UI shared between adding a new card and re-matching an
// existing one. Parent owns name/selectedCard/selectedVariant so both flows
// can persist them however they need (insert vs. update).
function PokemonMatchPicker({ name, onNameChange, selectedCard, selectedVariant, onSelect, onClear }) {
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState([])

  async function search() {
    if (!name.trim()) return
    setSearching(true)
    onClear()
    setMatches([])
    try {
      const r = await fetch(`/api/pokemon-price?name=${encodeURIComponent(name.trim())}`)
      const data = await r.json()
      setMatches(data.results || [])
    } catch {
      setMatches([])
    }
    setSearching(false)
  }

  function pick(card) {
    onSelect(card, card.variants[0]?.key || '')
    setMatches([])
  }

  return (
    <>
      <div className="name-search-row">
        <input
          type="text"
          placeholder="Card name (e.g. Charizard, Tonali auto)"
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value)
            if (selectedCard) onClear()
          }}
          required
        />
        <button type="button" onClick={search} disabled={searching || !name.trim()}>
          {searching ? '…' : 'Find'}
        </button>
      </div>

      {matches.length > 0 && (
        <div className="match-list">
          {matches.map((m) => (
            <button type="button" key={m.id} className="match-item" onClick={() => pick(m)}>
              {m.image && (
                <img
                  className="zoomable"
                  src={m.image}
                  alt={m.name}
                  onClick={(e) => openImage(e, m.image)}
                />
              )}
              <span>
                <strong>{m.name}</strong>
                <span className="hint-text">
                  {m.set} #{m.number}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!searching && matches.length === 0 && name && !selectedCard && (
        <p className="hint-text">Click "Find" to match this to a real card and its print/variant.</p>
      )}

      {selectedCard && (
        <div className="selected-card">
          {selectedCard.image && (
            <img
              className="zoomable"
              src={selectedCard.image}
              alt={selectedCard.name}
              onClick={(e) => openImage(e, selectedCard.image)}
            />
          )}
          <div className="selected-card-body">
            <strong>{selectedCard.name}</strong>
            <span className="hint-text">
              {selectedCard.set} #{selectedCard.number}
            </span>
            {selectedCard.variants.length > 0 ? (
              <select
                value={selectedVariant}
                onChange={(e) => onSelect(selectedCard, e.target.value)}
              >
                {selectedCard.variants.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label} — £{v.price.toFixed(2)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="hint-text">No print/variant breakdown available</span>
            )}
            <button type="button" className="change-match-btn" onClick={onClear}>
              Change
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Football/soccer has no fixed card database to match against (eBay is
// live listings, not a catalog), so this just previews real listings for
// the typed name so the user can sanity-check it finds the right thing —
// there's nothing to "select", the price fetch always re-searches by name.
function FootballFinder({ name, onNameChange }) {
  const [searching, setSearching] = useState(false)
  const [listings, setListings] = useState(null)
  const [notConfigured, setNotConfigured] = useState(false)

  async function search() {
    if (!name.trim()) return
    setSearching(true)
    setNotConfigured(false)
    try {
      const r = await fetch(`/api/football-price?name=${encodeURIComponent(name.trim())}`)
      const data = await r.json()
      if (!data.configured) {
        setNotConfigured(true)
        setListings(null)
      } else {
        setListings(data.listings || [])
      }
    } catch {
      setListings([])
    }
    setSearching(false)
  }

  return (
    <>
      <div className="name-search-row">
        <input
          type="text"
          placeholder="Card name (e.g. Tonali auto)"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
        <button type="button" onClick={search} disabled={searching || !name.trim()}>
          {searching ? '…' : 'Find'}
        </button>
      </div>

      {notConfigured && (
        <p className="hint-text">eBay pricing isn't set up yet — this card will show no price for now.</p>
      )}
      {listings && listings.length === 0 && (
        <p className="hint-text">No matching listings found — try adjusting the name.</p>
      )}
      {listings && listings.length > 0 && (
        <div className="match-list">
          {listings.map((item, i) => (
            <a key={i} className="match-item" href={item.url} target="_blank" rel="noreferrer">
              {item.image && <img src={item.image} alt={item.title} />}
              <span>
                <strong>{item.title}</strong>
                <span className="hint-text">
                  {item.price != null ? `£${item.price.toFixed(2)}` : 'No price'}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  )
}

function AddCardForm({ userId, onAdded }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('football')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const [selectedCard, setSelectedCard] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState('')

  function handleSelect(card, variant) {
    setSelectedCard(card)
    setSelectedVariant(variant)
    setName(card.name)
  }

  function clearSelection() {
    setSelectedCard(null)
    setSelectedVariant('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)

    let imageUrl = null
    if (imageFile) {
      const path = `${userId}/${Date.now()}-${imageFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('card-images')
        .upload(path, imageFile)
      if (!uploadError) {
        const { data } = supabase.storage.from('card-images').getPublicUrl(path)
        imageUrl = data.publicUrl
      }
    }

    const { error } = await supabase.from('cards').insert({
      user_id: userId,
      name: name.trim(),
      category,
      image_url: imageUrl,
      purchase_price: purchasePrice ? Number(purchasePrice) : null,
      purchase_date: purchaseDate || null,
      pokemon_card_id: category === 'pokemon' ? selectedCard?.id ?? null : null,
      pokemon_variant: category === 'pokemon' ? selectedVariant || null : null,
    })

    setSaving(false)
    if (!error) {
      setName('')
      setPurchasePrice('')
      setPurchaseDate('')
      setImageFile(null)
      clearSelection()
      onAdded()
    }
  }

  return (
    <form className="add-card-form" onSubmit={handleSubmit}>
      <h2>Add a Card</h2>
      {category === 'pokemon' ? (
        <PokemonMatchPicker
          name={name}
          onNameChange={setName}
          selectedCard={selectedCard}
          selectedVariant={selectedVariant}
          onSelect={handleSelect}
          onClear={clearSelection}
        />
      ) : (
        <FootballFinder name={name} onNameChange={setName} />
      )}

      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value)
          clearSelection()
        }}
      >
        <option value="football">Football</option>
        <option value="pokemon">Pokemon</option>
      </select>
      <input
        type="number"
        step="0.01"
        placeholder="Purchase price (£)"
        value={purchasePrice}
        onChange={(e) => setPurchasePrice(e.target.value)}
      />
      <input
        type="date"
        value={purchaseDate}
        onChange={(e) => setPurchaseDate(e.target.value)}
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Adding…' : 'Add Card'}
      </button>
    </form>
  )
}

function EditCardForm({ card, onSaved, onCancel }) {
  const [name, setName] = useState(card.name)
  const [selectedCard, setSelectedCard] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(card.pokemon_variant || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!card.pokemon_card_id) return
    const variantParam = card.pokemon_variant
      ? `&variant=${encodeURIComponent(card.pokemon_variant)}`
      : ''
    fetch(`/api/pokemon-price?id=${encodeURIComponent(card.pokemon_card_id)}${variantParam}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.results?.[0]) setSelectedCard(data.results[0])
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSelect(c, variant) {
    setSelectedCard(c)
    setSelectedVariant(variant)
    setName(c.name)
  }

  function clearSelection() {
    setSelectedCard(null)
    setSelectedVariant('')
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('cards')
      .update({
        name: name.trim(),
        pokemon_card_id: card.category === 'pokemon' ? selectedCard?.id ?? null : null,
        pokemon_variant: card.category === 'pokemon' ? selectedVariant || null : null,
      })
      .eq('id', card.id)
    setSaving(false)
    if (!error) onSaved()
  }

  return (
    <div className="edit-card-form">
      {card.category === 'pokemon' ? (
        <PokemonMatchPicker
          name={name}
          onNameChange={setName}
          selectedCard={selectedCard}
          selectedVariant={selectedVariant}
          onSelect={handleSelect}
          onClear={clearSelection}
        />
      ) : (
        <FootballFinder name={name} onNameChange={setName} />
      )}
      <div className="edit-actions">
        <button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="change-match-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function CardTile({ card, livePrice, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const displayPrice = livePrice ?? card.purchase_price
  const gain =
    livePrice != null && card.purchase_price
      ? livePrice - card.purchase_price
      : null

  return (
    <div className="card-tile">
      {card.image_url ? (
        <img
          className="zoomable"
          src={card.image_url}
          alt={card.name}
          onClick={(e) => openImage(e, card.image_url)}
        />
      ) : (
        <div className="card-tile-noimg">No photo</div>
      )}
      <div className="card-tile-body">
        {editing ? (
          <EditCardForm
            card={card}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false)
              onUpdated(card.id)
            }}
          />
        ) : (
          <>
            <span className={'category-badge ' + card.category}>{card.category}</span>
            <h3>{card.name}</h3>
            {card.pokemon_variant && (
              <p className="hint-text">{variantLabel(card.pokemon_variant)}</p>
            )}
            {card.purchase_price != null && (
              <p className="hint-text">Bought: £{card.purchase_price.toFixed(2)}</p>
            )}
            <p className="current-price">
              {displayPrice != null ? `£${Number(displayPrice).toFixed(2)}` : 'No price data'}
            </p>
            {card.category === 'football' && livePrice != null && (
              <p className="hint-text">Avg. asking price (eBay)</p>
            )}
            {card.category === 'football' && (
              <a
                className="sold-link"
                href={`https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(card.name)}&LH_Sold=1&LH_Complete=1`}
                target="_blank"
                rel="noreferrer"
              >
                View sold prices ↗
              </a>
            )}
            {gain != null && (
              <p className={'gain' + (gain >= 0 ? ' up' : ' down')}>
                {gain >= 0 ? '+' : ''}£{gain.toFixed(2)}
              </p>
            )}
            <div className="tile-actions">
              <button className="edit-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="delete-btn" onClick={() => onDelete(card.id)}>
                Remove
              </button>
              {card.pokemon_card_id && (
                <span className="matched-badge" title="Matched to a real card">✓</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [cards, setCards] = useState([])
  const [livePrices, setLivePrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [matchedFirst, setMatchedFirst] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadCards() {
    if (!session) return
    setLoading(true)
    const { data } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false })
    setCards(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    cards.forEach((card) => {
      if (livePrices[card.id] !== undefined) return

      let url
      if (card.category === 'pokemon' && card.pokemon_card_id) {
        url = `/api/pokemon-price?id=${encodeURIComponent(card.pokemon_card_id)}`
        if (card.pokemon_variant) url += `&variant=${encodeURIComponent(card.pokemon_variant)}`
      } else if (card.category === 'pokemon') {
        url = `/api/pokemon-price?name=${encodeURIComponent(card.name)}`
      } else {
        url = `/api/football-price?name=${encodeURIComponent(card.name)}`
      }

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const price =
            card.category === 'pokemon'
              ? data.results?.[0]?.price ?? null
              : data.average ?? null
          setLivePrices((prev) => ({ ...prev, [card.id]: price }))
        })
        .catch(() => setLivePrices((prev) => ({ ...prev, [card.id]: null })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  async function deleteCard(id) {
    if (!window.confirm('Remove this card from your vault?')) return
    await supabase.from('cards').delete().eq('id', id)
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleCardUpdated(id) {
    setLivePrices((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    await loadCards()
  }

  if (!session) {
    return <AuthGate />
  }

  const totalValue = cards.reduce((sum, card) => {
    const price = livePrices[card.id] ?? card.purchase_price ?? 0
    return sum + Number(price || 0)
  }, 0)

  const matchedValue = cards.reduce((sum, card) => {
    if (!card.pokemon_card_id) return sum
    const price = livePrices[card.id] ?? card.purchase_price ?? 0
    return sum + Number(price || 0)
  }, 0)

  const sortedCards = matchedFirst
    ? [...cards].sort((a, b) => (b.pokemon_card_id ? 1 : 0) - (a.pokemon_card_id ? 1 : 0))
    : cards

  const pageCount = Math.max(1, Math.ceil(sortedCards.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const displayCards = sortedCards.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="app-root">
      <header className="site-header">
        <div>
          <h1>CARD VAULT</h1>
          <p className="tagline">
            Total portfolio value: £{totalValue.toFixed(2)}
            <span className="matched-value"> · Matched portfolio value: £{matchedValue.toFixed(2)}</span>
          </p>
        </div>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <main className="layout">
        <AddCardForm userId={session.user.id} onAdded={loadCards} />

        <section className="card-grid-section">
          <div className="collection-header">
            <h2>Your Collection ({cards.length})</h2>
            <div className="collection-controls">
              <label className="matched-first-toggle">
                <input
                  type="checkbox"
                  checked={matchedFirst}
                  onChange={(e) => setMatchedFirst(e.target.checked)}
                />
                Matched cards first
              </label>
              <label className="page-size-select">
                Per page:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
          </div>
          {loading && <p className="hint-text">Loading…</p>}
          {!loading && cards.length === 0 && (
            <p className="hint-text">No cards yet — add your first one above.</p>
          )}
          <div className="card-grid">
            {displayCards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                livePrice={livePrices[card.id]}
                onDelete={deleteCard}
                onUpdated={handleCardUpdated}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <div className="pagination">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              <span className="hint-text">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
              >
                Next
              </button>
            </div>
          )}
        </section>

        <section className="game-section">
          <h2>🎮 Shadow Takedown — Play Now</h2>
          <p className="hint-text">
            A stealth game I built — 20 levels, kill-cams, weapon unlocks.{' '}
            <a href="https://shadow-takedown.vercel.app" target="_blank" rel="noreferrer">
              Play fullscreen ↗
            </a>
          </p>
          <div className="game-embed-wrap">
            <iframe
              src="https://shadow-takedown.vercel.app"
              title="Shadow Takedown"
              allow="fullscreen; gamepad"
              allowFullScreen
            />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p className="mission">
          Card Vault is a personal portfolio tracker for Pokemon and football/soccer trading
          cards — built to keep collection value in one place, for free.
        </p>
        <p className="data-attribution">
          Pokemon pricing from the{' '}
          <a href="https://pokemontcg.io" target="_blank" rel="noreferrer">
            Pokemon TCG API
          </a>{' '}
          (TCGPlayer &amp; Cardmarket market data). Football/soccer pricing from{' '}
          <a href="https://developer.ebay.com" target="_blank" rel="noreferrer">
            eBay's Browse API
          </a>{' '}
          — average active listing prices, not confirmed sold prices. Prices are indicative
          only and may not be fully accurate or up to date.
        </p>
      </footer>
    </div>
  )
}
