use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageEncoder, ImageReader};
use std::io::Cursor;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImageFmt {
    Jpeg,
    Png,
    WebP,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FitMode {
    Cover,
    Contain,
    Stretch,
}

pub fn decode_dimensions(src: &[u8]) -> Option<(u32, u32)> {
    let cursor = Cursor::new(src);
    let reader = ImageReader::new(cursor).with_guessed_format().ok()?;
    reader.into_dimensions().ok()
}

fn _decode(src: &[u8]) -> Result<DynamicImage, String> {
    let cursor = Cursor::new(src);
    ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| format!("guess format: {e}"))?
        .decode()
        .map_err(|e| format!("decode: {e}"))
}

fn _encode(img: &DynamicImage, fmt: ImageFmt, quality: u8) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::new();
    match fmt {
        ImageFmt::Jpeg => {
            let rgb = img.to_rgb8();
            let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
            enc.write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .map_err(|e| format!("jpeg encode: {e}"))?;
        }
        ImageFmt::Png => {
            let rgba = img.to_rgba8();
            let enc = image::codecs::png::PngEncoder::new(&mut out);
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| format!("png encode: {e}"))?;
        }
        ImageFmt::WebP => {
            let rgba = img.to_rgba8();
            let enc = image::codecs::webp::WebPEncoder::new_lossless(&mut out);
            enc.write_image(
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| format!("webp encode: {e}"))?;
        }
    }
    Ok(out)
}

pub fn compress(src: &[u8], fmt: ImageFmt, max_dim: u32, quality: u8) -> Result<Vec<u8>, String> {
    let mut img = _decode(src)?;
    if max_dim > 0 {
        let (w, h) = img.dimensions();
        let largest = w.max(h);
        if largest > max_dim {
            img = img.resize(max_dim, max_dim, FilterType::Triangle);
        }
    }
    _encode(&img, fmt, quality)
}

pub fn thumbnail(src: &[u8], w: u32, h: u32, fit: FitMode, quality: u8) -> Result<Vec<u8>, String> {
    if w == 0 || h == 0 {
        return Err("thumbnail dims must be > 0".to_string());
    }
    let img = _decode(src)?;
    let resized = match fit {
        FitMode::Cover => img.resize_to_fill(w, h, FilterType::Triangle),
        FitMode::Contain => img.resize(w, h, FilterType::Triangle),
        FitMode::Stretch => img.resize_exact(w, h, FilterType::Triangle),
    };
    _encode(&resized, ImageFmt::Jpeg, quality)
}

pub fn blurhash_for(src: &[u8], x: u32, y: u32) -> Result<String, String> {
    let img = _decode(src)?;
    let small = img.resize(64, 64, FilterType::Triangle).to_rgba8();
    let (w, h) = small.dimensions();
    blurhash::encode(x, y, w, h, small.as_raw()).map_err(|e| format!("blurhash: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn _png_fixture() -> Vec<u8> {
        let img = image::RgbImage::from_fn(16, 16, |_, _| image::Rgb([255, 0, 0]));
        let mut buf = Vec::new();
        let enc = image::codecs::png::PngEncoder::new(&mut buf);
        enc.write_image(img.as_raw(), 16, 16, image::ExtendedColorType::Rgb8)
            .unwrap();
        buf
    }

    #[test]
    fn decode_dimensions_returns_16x16() {
        let png = _png_fixture();
        assert_eq!(decode_dimensions(&png), Some((16, 16)));
    }

    #[test]
    fn compress_to_jpeg_succeeds() {
        let png = _png_fixture();
        let out = compress(&png, ImageFmt::Jpeg, 0, 80).unwrap();
        assert!(!out.is_empty());
        // JPEG SOI marker
        assert_eq!(&out[0..2], &[0xFF, 0xD8]);
    }

    #[test]
    fn compress_to_png_succeeds() {
        let png = _png_fixture();
        let out = compress(&png, ImageFmt::Png, 0, 100).unwrap();
        // PNG signature
        assert_eq!(
            &out[0..8],
            &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
        );
    }

    #[test]
    fn thumbnail_cover_resizes_to_target() {
        let png = _png_fixture();
        let out = thumbnail(&png, 8, 8, FitMode::Cover, 80).unwrap();
        let dims = decode_dimensions(&out).unwrap();
        assert_eq!(dims, (8, 8));
    }

    #[test]
    fn compress_downscale_caps_max_dim() {
        let img = image::RgbImage::from_fn(32, 16, |_, _| image::Rgb([0, 128, 0]));
        let mut src = Vec::new();
        image::codecs::png::PngEncoder::new(&mut src)
            .write_image(img.as_raw(), 32, 16, image::ExtendedColorType::Rgb8)
            .unwrap();
        let out = compress(&src, ImageFmt::Jpeg, 16, 80).unwrap();
        let (w, h) = decode_dimensions(&out).unwrap();
        assert!(w <= 16 && h <= 16);
        assert!(w == 16 || h == 16);
    }

    #[test]
    fn blurhash_for_returns_nonempty() {
        let png = _png_fixture();
        let hash = blurhash_for(&png, 4, 3).unwrap();
        assert!(!hash.is_empty());
        assert_eq!(hash.len(), 28);
    }
}
