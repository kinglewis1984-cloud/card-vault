import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

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

function AddCardForm({ userId, onAdded }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('pokemon')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)

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
    })

    setSaving(false)
    if (!error) {
      setName('')
      setPurchasePrice('')
      setPurchaseDate('')
      setImageFile(null)
      onAdded()
    }
  }

  return (
    <form className="add-card-form" onSubmit={handleSubmit}>
      <h2>Add a Card</h2>
      <input
        type="text"
        placeholder="Card name (e.g. Charizard, Tonali auto)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="pokemon">Pokemon</option>
        <option value="football">Football</option>
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

function CardTile({ card, livePrice, onDelete }) {
  const displayPrice = livePrice ?? card.purchase_price
  const gain =
    livePrice != null && card.purchase_price
      ? livePrice - card.purchase_price
      : null

  return (
    <div className="card-tile">
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} />
      ) : (
        <div className="card-tile-noimg">No photo</div>
      )}
      <div className="card-tile-body">
        <span className={'category-badge ' + card.category}>{card.category}</span>
        <h3>{card.name}</h3>
        {card.purchase_price != null && (
          <p className="hint-text">Bought: £{card.purchase_price.toFixed(2)}</p>
        )}
        <p className="current-price">
          {displayPrice != null ? `£${Number(displayPrice).toFixed(2)}` : 'No price data'}
        </p>
        {gain != null && (
          <p className={'gain' + (gain >= 0 ? ' up' : ' down')}>
            {gain >= 0 ? '+' : ''}£{gain.toFixed(2)}
          </p>
        )}
        <button className="delete-btn" onClick={() => onDelete(card.id)}>
          Remove
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [cards, setCards] = useState([])
  const [livePrices, setLivePrices] = useState({})
  const [loading, setLoading] = useState(true)

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
      const endpoint = card.category === 'pokemon' ? '/api/pokemon-price' : '/api/football-price'
      fetch(`${endpoint}?name=${encodeURIComponent(card.name)}`)
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

  if (!session) {
    return <AuthGate />
  }

  const totalValue = cards.reduce((sum, card) => {
    const price = livePrices[card.id] ?? card.purchase_price ?? 0
    return sum + Number(price || 0)
  }, 0)

  return (
    <div className="app-root">
      <header className="site-header">
        <div>
          <h1>CARD VAULT</h1>
          <p className="tagline">Total portfolio value: £{totalValue.toFixed(2)}</p>
        </div>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <main className="layout">
        <AddCardForm userId={session.user.id} onAdded={loadCards} />

        <section className="card-grid-section">
          <h2>Your Collection ({cards.length})</h2>
          {loading && <p className="hint-text">Loading…</p>}
          {!loading && cards.length === 0 && (
            <p className="hint-text">No cards yet — add your first one above.</p>
          )}
          <div className="card-grid">
            {cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                livePrice={livePrices[card.id]}
                onDelete={deleteCard}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
