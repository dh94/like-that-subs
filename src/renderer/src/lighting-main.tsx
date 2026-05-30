import React from 'react'
import ReactDOM from 'react-dom/client'
import './globals.css'
import LightingMonitor from './LightingMonitor'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LightingMonitor />
  </React.StrictMode>
)
