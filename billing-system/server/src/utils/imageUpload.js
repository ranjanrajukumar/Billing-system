// Maps an in-memory multer file onto a model's image columns.
// `prefix` is the column family: 'image' -> imageData/imageMimeType/imagePath.
export function imageColumns(file, prefix) {
  if (!file) return {};
  return {
    [`${prefix}Data`]: file.buffer,
    [`${prefix}MimeType`]: file.mimetype,
    [`${prefix}Path`]: null // superseded by the stored bytes
  };
}
