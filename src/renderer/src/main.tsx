import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installPreviewBridge } from './preview'
import './styles.css'

installPreviewBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
