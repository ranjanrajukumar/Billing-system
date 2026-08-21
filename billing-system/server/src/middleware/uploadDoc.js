import multer from 'multer';

// Documents and images are persisted as BLOBs in the database, so uploads stay in memory
// and never touch the filesystem.
export const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for documents
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(Object.assign(new Error('Only images and PDFs are allowed'), { status: 400 }));
    }
    cb(null, true);
  }
});
