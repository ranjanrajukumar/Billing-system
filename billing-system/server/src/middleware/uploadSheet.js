import multer from 'multer';
import path from 'path';

/**
 * Uploads for the spreadsheet importers.
 *
 * The import routes previously borrowed the image uploader, whose filter
 * rejects anything that is not an image — so every product and purchase import
 * failed with "Only image uploads are allowed" before the parser ever saw the
 * file. The importers themselves were fine; nothing could reach them.
 *
 * Browsers disagree about the media type of a spreadsheet: the same .xlsx
 * arrives as the OpenXML type from one machine, as application/vnd.ms-excel
 * from another, and as application/octet-stream when the OS has no association
 * for it at all. A .csv is variously text/csv, application/csv, text/plain or
 * vnd.ms-excel. Filtering on media type alone therefore rejects real files from
 * real users, so the extension is what decides and the media type is only used
 * to catch an obvious mismatch.
 */

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

// Everything the three extensions above are known to arrive as.
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls, sometimes .csv
  'application/vnd.oasis.opendocument.spreadsheet',                    // .ods saved as .xlsx
  'text/csv',
  'application/csv',
  'text/plain',                                                        // .csv from some browsers
  'application/octet-stream',                                          // no association on the client
  '',                                                                  // some clients send none at all
]);

// Product catalogues run to thousands of rows, so the 2MB image limit is not a
// useful ceiling here.
const maxBytes = Number(process.env.IMPORT_MAX_BYTES || 10 * 1024 * 1024);

export const uploadSheet = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return cb(Object.assign(
        new Error('Upload a spreadsheet saved as .xlsx, .xls or .csv'),
        { status: 400 },
      ));
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(Object.assign(
        new Error(`A ${extension} file was expected but the upload looks like ${file.mimetype}`),
        { status: 400 },
      ));
    }

    return cb(null, true);
  },
});
