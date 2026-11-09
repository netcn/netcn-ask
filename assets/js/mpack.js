// Minimal MessagePack decoder (supports the subset the ask build emits)
export function decodeMsgpack(buf) {
  const dv = new DataView(buf);
  const td = new TextDecoder("utf-8");
  let off = 0;
  function u8() { return dv.getUint8(off++); }
  function str(n) { const ab = buf.slice(off, off + n); off += n; return td.decode(ab); }
  function arr(n) { const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; }
  function map(n) { const o = {}; for (let i = 0; i < n; i++) { const k = read(); o[k] = read(); } return o; }
  function read() {
    const b = u8();
    if (b <= 0x7f) return b;                 // positive fixint
    if (b >= 0xe0) return b - 0x100;        // negative fixint
    if (b === 0xc0) return null;
    if (b === 0xc2) return false;
    if (b === 0xc3) return true;
    if (b === 0xcc) return u8();
    if (b === 0xcd) { const v = dv.getUint16(off); off += 2; return v; }
    if (b === 0xce) { const v = dv.getUint32(off); off += 4; return v; }
    if (b === 0xd0) { const v = dv.getInt8(off); off += 1; return v; }
    if (b === 0xd1) { const v = dv.getInt16(off); off += 2; return v; }
    if (b === 0xd2) { const v = dv.getInt32(off); off += 4; return v; }
    if (b === 0xca) { const v = dv.getFloat32(off); off += 4; return v; }
    if (b === 0xcb) { const v = dv.getFloat64(off); off += 8; return v; }
    if ((b & 0xf0) === 0x90) return arr(b & 0x0f);
    if (b === 0xdc) { const n = dv.getUint16(off); off += 2; return arr(n); }
    if (b === 0xdd) { const n = dv.getUint32(off); off += 4; return arr(n); }
    if ((b & 0xf0) === 0x80) return map(b & 0x0f);
    if (b === 0xde) { const n = dv.getUint16(off); off += 2; return map(n); }
    if (b === 0xdf) { const n = dv.getUint32(off); off += 4; return map(n); }
    if ((b & 0xe0) === 0xa0) return str(b & 0x1f);
    if (b === 0xd9) { const n = u8(); return str(n); }
    if (b === 0xda) { const n = dv.getUint16(off); off += 2; return str(n); }
    if (b === 0xdb) { const n = dv.getUint32(off); off += 4; return str(n); }
    if (b === 0xc4) { const n = u8(); off += n; return null; }
    if (b === 0xc5) { const n = dv.getUint16(off); off += 2; off += n; return null; }
    throw new Error("mpack: unknown 0x" + b.toString(16));
  }
  return read();
}
