import { useState, useMemo } from 'react'
import _ from 'lodash'
import moment from 'moment'
import './App.css'

// Intentionally heavy imports to inflate bundle size
const heavyData = _.range(0, 5000).map((i) => ({
  id: i,
  label: `Item ${i}`,
  createdAt: moment().subtract(i, 'days').format('YYYY-MM-DD'),
}))

function ExpensiveComponent() {
  // Expensive computation on every render
  const value = useMemo(() => {
    let total = 0
    for (let i = 0; i < 2000000; i++) {
      total += Math.sqrt(i)
    }
    return total
  }, [])

  return <span>{value.toFixed(0)}</span>
}

function SlowButton({ count, onClick }: { count: number; onClick: () => void }) {
  // Bad: inline arrow function creates a new function on every render
  return (
    <button className="slow-button" onClick={() => onClick()}>
      Count is {count}
    </button>
  )
}

function ListItem({ item }: { item: { id: number; label: string; createdAt: string } }) {
  return (
    <div className="list-item">
      {/* a11y: missing alt text */}
      <img src="/hero-large.png" width="40" height="40" />
      <span>{item.label}</span>
      <span className="muted">{item.createdAt}</span>
    </div>
  )
}

function App() {
  const [count, setCount] = useState(0)
  const [filter, setFilter] = useState('')

  // Bad: filters on every render, no memoization
  const visibleItems = heavyData.filter((item) =>
    item.label.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <main className="app">
      <h1>Slow Roast App</h1>

      {/* a11y: image without alt, huge file */}
      <img src="/hero-large.png" className="hero" />

      <section className="controls">
        {/* a11y: input without label */}
        <input
          type="text"
          placeholder="Filter items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <SlowButton count={count} onClick={() => setCount((c) => c + 1)} />
      </section>

      <section className="stats">
        <p>Visible items: {visibleItems.length}</p>
        <p>Expensive number: <ExpensiveComponent /></p>
      </section>

      {/* Bad: huge list rendered unconditionally */}
      <ul className="item-list">
        {visibleItems.map((item) => (
          <ListItem key={item.id} item={item} />
        ))}
      </ul>

      {/* a11y: clickable div, low contrast text */}
      <div className="footer-link" onClick={() => alert('clicked')}>
        Click here for more info
      </div>
    </main>
  )
}

export default App
