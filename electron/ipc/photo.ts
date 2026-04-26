import { readExif } from '../services/exif/reader.js'
import { makeThumbnail } from '../services/filter-engine/thumbnail.js'
import { importPhotos, listPhotos, removePhotoRecords } from '../services/storage/photoStore.js'
import { registerIpc } from './safeRegister.js'

export function registerPhotoIpc() {
  registerIpc('photo:import', async (paths: unknown) => importPhotos(paths as string[]))
  registerIpc('photo:list', async () => listPhotos())
  registerIpc('photo:readExif', async (filePath: unknown) => readExif(filePath as string))
  registerIpc('photo:thumb', async (filePath: unknown, size: unknown) =>
    makeThumbnail(filePath as string, size as number),
  )
  // 仅移除 JsonTable 记录 + 孤儿缩略图，绝不碰硬盘原图（参见 photoStore.removePhotoRecords）
  registerIpc('photo:remove', async (ids: unknown) => removePhotoRecords(ids as string[]))
}
