import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { StoreProvider } from './lib/store'

if (import.meta.env.DEV) {
  // render highlighter for dev builds only; never shipped
  import('react-scan').then(({ scan }) => scan({ enabled: new URLSearchParams(location.search).has('scan') })).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider><App /></StoreProvider>
  </StrictMode>
)
