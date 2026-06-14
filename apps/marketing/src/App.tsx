import { Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { TryIt } from './pages/TryIt'
import { Status } from './pages/Status'
import { Downloads } from './pages/Downloads'
import { Docs } from './pages/Docs'
import { Scenarios } from './pages/Scenarios'
import { UserGuide } from './pages/UserGuide'
import { Features } from './pages/Features'

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/try-it" element={<TryIt />} />
          <Route path="/get-started" element={<TryIt />} />
          <Route path="/status" element={<Status />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/guide" element={<UserGuide />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/scenarios" element={<Scenarios />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
