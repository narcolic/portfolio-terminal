import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { hydrateStart } from '@tanstack/start-client-core/client'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

hydrateStart().then((router) => {
  root.render(<RouterProvider router={router} />)
}).catch((error) => {
  console.error('Start hydration failed', error)
})
