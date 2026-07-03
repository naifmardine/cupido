// Parser mínimo de EXIF: extrai DateTimeOriginal (0x9003) de um JPEG.
// Retorna um Date, ou null se a foto não tiver EXIF (prints/WhatsApp não têm).
window.lerHorarioDaFoto = function (file) {
  return new Promise((resolve) => {
    if (!file || !/jpe?g$/i.test(file.type) && !/jpe?g$/i.test(file.name || '')) {
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parse(new DataView(reader.result)));
      } catch (e) { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 131072)); // 128 KB bastam pro cabeçalho
  });
};

function parse(view) {
  if (view.getUint16(0) !== 0xffd8) return null; // não é JPEG
  let offset = 2;
  const len = view.byteLength;
  while (offset < len) {
    if (view.getUint16(offset) === 0xffe1) { // APP1
      return parseApp1(view, offset + 4);
    }
    if ((view.getUint16(offset) & 0xff00) !== 0xff00) break;
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

function parseApp1(view, start) {
  if (view.getUint32(start) !== 0x45786966) return null; // "Exif"
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949; // II = little-endian
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);

  const ifd0 = tiff + u32(tiff + 4);
  const exifPtr = findTag(view, ifd0, 0x8769, u16, u32);
  if (exifPtr == null) return null;

  const exifIfd = tiff + exifPtr;
  const strOff = findTagAscii(view, exifIfd, 0x9003, tiff, u16, u32); // DateTimeOriginal
  if (strOff == null) return null;

  // formato "YYYY:MM:DD HH:MM:SS"
  let s = '';
  for (let i = 0; i < 19; i++) s += String.fromCharCode(view.getUint8(strOff + i));
  const m = s.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function findTag(view, ifd, tag, u16, u32) {
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === tag) return u32(entry + 8);
  }
  return null;
}

// retorna o offset absoluto (a partir do início do view) do valor ASCII da tag
function findTagAscii(view, ifd, tag, tiff, u16, u32) {
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === tag) {
      const count = u32(entry + 4);
      return count <= 4 ? entry + 8 : tiff + u32(entry + 8);
    }
  }
  return null;
}
