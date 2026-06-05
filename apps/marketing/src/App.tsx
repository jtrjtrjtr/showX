import { Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { Features } from './pages/Features'
import { Pricing } from './pages/Pricing'
import { Compare } from './pages/Compare'
import { GetStarted } from './pages/GetStarted'
import { Downloads } from './pages/Downloads'
import { Docs } from './pages/Docs'

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
