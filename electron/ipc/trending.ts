import { fetchTrending } from '../services/storage/trending.js'
import { registerIpc } from './safeRegister.js'

export function registerTrendingIpc() {
  registerIpc('trending:fetch', async () => fetchTrending())
}
