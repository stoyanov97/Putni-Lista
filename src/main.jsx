import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// След ново публикуване старите файлове на сайта изчезват. Ако страницата е
// отворена отпреди това и не намери файл (напр. при експорт), презареждаме я
// веднъж, за да вземе новата версия. Флагът пази от безкрайно презареждане.
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('reloaded-after-deploy')) return
  event.preventDefault()
  sessionStorage.setItem('reloaded-after-deploy', '1')
  window.location.reload()
})
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('reloaded-after-deploy'), 10000))

createRoot(document.getElementById('root')).render(<App />)
