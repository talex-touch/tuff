import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'

app.whenReady().then(genTouchApp)
