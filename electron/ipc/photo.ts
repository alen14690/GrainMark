import { readExif } from '../services/exif/reader.js'
import { makeThumbnail } from '../services/filter-engine/thumbnail.js'
import { importPhotos, listPhotos, removePhotoRecords } from '../services/storage/photoStore.js'
import { registerIpc } from './safeRegister.js'

export function registerPhotoIpc() {
  // F1：导入接收任意路径数组 → 必须逐个过 PathGuard
  registerIpc('photo:import', async (paths: unknown) => importPhotos(paths as string[]), {
    pathFields: ['arg.*'],
  })
  registerIpc('photo:list', async () => listPhotos())
  registerIpc('photo:readExif', async (filePath: unknown) => readExif(filePath as string), {
    pathFields: ['arg'],
  })
  registerIpc(
    'photo:thumb',
    async (filePath: unknown, size: unknown) => makeThumbnail(filePath as string, size as number),
    { pathFields: ['args.0'] },
  )
  // 仅移除 JsonTable 记录 + 孤儿缩略图，绝不碰硬盘原图（参见 photoStore.removePhotoRecords）
  // 这里的参数是 id 数组，不涉及路径
  registerIpc('photo:remove', async (ids: unknown) => removePhotoRecords(ids as string[]))
}
