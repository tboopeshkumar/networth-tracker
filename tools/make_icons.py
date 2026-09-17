"""Generate the home-screen / PWA icons into public/.

    python3 tools/make_icons.py

A rising line on the app's accent blue. Drawn at 2x and box-downsampled, so
the edges are smooth without needing an image library. iOS applies its own
rounded-corner mask, so the artwork is deliberately full-bleed and opaque.
"""
import pathlib
import struct
import zlib

BG = (42, 120, 214)        # --s1 / accent blue
INK = (255, 255, 255)
# A month-by-month climb, normalised to the icon box
POINTS = [(0.10, 0.72), (0.26, 0.62), (0.40, 0.66), (0.55, 0.47), (0.71, 0.52), (0.90, 0.24)]
SIZES = {"icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180}


def disc(radius):
    """Offsets covering a filled circle of this radius."""
    r2 = radius * radius
    return [(dx, dy) for dy in range(-radius, radius + 1) for dx in range(-radius, radius + 1)
            if dx * dx + dy * dy <= r2]


def render(size):
    """RGB bytearray of the icon at this pixel size."""
    px = bytearray(BG * (size * size))
    radius = max(2, round(size * 0.055))
    stamp = disc(radius)
    pts = [(x * size, y * size) for x, y in POINTS]

    def put(cx, cy):
        for dx, dy in stamp:
            x, y = int(cx) + dx, int(cy) + dy
            if 0 <= x < size and 0 <= y < size:
                i = (y * size + x) * 3
                px[i:i + 3] = bytes(INK)

    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        steps = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) / (radius / 3)))
        for s in range(steps + 1):
            t = s / steps
            put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
    put(*pts[-1])
    return px


def downsample(src, size):
    """2x box filter: size is the destination size."""
    out = bytearray(size * size * 3)
    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 3
            for c in range(3):
                total = 0
                for dy in (0, 1):
                    for dx in (0, 1):
                        total += src[(((y * 2 + dy) * size * 2) + (x * 2 + dx)) * 3 + c]
                out[i + c] = total // 4
    return out


def write_png(path, size, rgb):
    raw = b"".join(b"\x00" + bytes(rgb[y * size * 3:(y + 1) * size * 3]) for y in range(size))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def main():
    out = pathlib.Path(__file__).resolve().parent.parent / "public"
    out.mkdir(exist_ok=True)
    for name, size in SIZES.items():
        write_png(out / name, size, downsample(render(size * 2), size))
        print(f"  {name}  {size}x{size}  {(out / name).stat().st_size} bytes")


if __name__ == "__main__":
    main()
