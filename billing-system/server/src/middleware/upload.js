import multer from 'multer';

// Images are persisted as BLOBs in the database, so uploads stay in memory
// and never touch the filesystem.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(Object.assign(new Error('Only image uploads are allowed'), { status: 400 }));
    }
    cb(null, true);
  }
});
