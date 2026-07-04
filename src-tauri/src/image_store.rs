use base64::Engine;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader};
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// 保存剪贴板 DIB 字节：blake3 哈希命名，生成原图 PNG + 256px JPEG 预览
/// 返回 (hash, original_path, thumb_path)
pub fn save_image(dib_bytes: &[u8], image_dir: &Path) -> Result<(String, PathBuf, PathBuf), String> {
    let hash = blake3::hash(dib_bytes).to_hex().to_string();

    // CF_DIB 返回的是 BITMAPINFO（无 BITMAPFILEHEADER），image crate 不能直接解码
    // 需要补 14 字节 BITMAPFILEHEADER 拼成完整 BMP
    let bmp_bytes = dib_to_bmp(dib_bytes)?;
    let img = ImageReader::new(Cursor::new(bmp_bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| format!("decode failed: {}", e))?;

    // 原图保存为 PNG（无损 + 压缩）
    let original_path = image_dir.join(format!("{}.png", hash));
    img.save_with_format(&original_path, ImageFormat::Png)
        .map_err(|e| format!("save original failed: {}", e))?;

    // 256px 缩略图，JPEG 编码
    let thumb = resize_to_max_edge(img, 256);
    let thumb_path = image_dir.join(format!("{}_thumb.jpg", hash));
    let mut thumb_buf = Cursor::new(Vec::new());
    thumb
        .write_to(&mut thumb_buf, ImageFormat::Jpeg)
        .map_err(|e| format!("encode thumb failed: {}", e))?;
    std::fs::write(&thumb_path, thumb_buf.into_inner())
        .map_err(|e| format!("write thumb failed: {}", e))?;

    Ok((hash, original_path, thumb_path))
}

/// 读取缩略图文件并编码为 data URL（前端 <img src> 直接可用）
pub fn thumb_to_data_url(thumb_path: &Path) -> Option<String> {
    let bytes = std::fs::read(thumb_path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/jpeg;base64,{}", b64))
}

/// 把 PNG 原图重新编码为 DIB（BITMAPINFO + pixels，无 BITMAPFILEHEADER）用于 CF_DIB 粘贴
pub fn png_to_dib(png_path: &Path) -> Result<Vec<u8>, String> {
    let img = ImageReader::open(png_path)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| format!("decode png failed: {}", e))?;

    // 统一转成 RGBA8 再以 BGRA 顺序写入 BMP（CF_DIB 期望自下而上 BGRA）
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let row_size = ((w as usize * 4 + 3) & !3) as usize; // 4 字节对齐
    let pixel_size = row_size * h as usize;
    let header_size: u32 = 40; // BITMAPINFOHEADER
    let total_size = header_size as usize + pixel_size;

    let mut dib = Vec::with_capacity(total_size);
    // BITMAPINFOHEADER
    dib.extend_from_slice(&header_size.to_le_bytes()); // biSize
    dib.extend_from_slice(&(w as i32).to_le_bytes()); // biWidth
    dib.extend_from_slice(&(h as i32).to_le_bytes()); // biHeight（正数 = 自下而上）
    dib.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    dib.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    dib.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    dib.extend_from_slice(&(pixel_size as u32).to_le_bytes()); // biSizeImage
    dib.extend_from_slice(&0u32.to_le_bytes()); // biXPelsPerMeter
    dib.extend_from_slice(&0u32.to_le_bytes()); // biYPelsPerMeter
    dib.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    dib.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant

    // 像素：BMP 自下而上，每行 BGRA；padding 至 row_size
    let mut row = vec![0u8; row_size];
    for y in (0..h as usize).rev() {
        for x in 0..w as usize {
            let p = rgba.get_pixel(x as u32, y as u32);
            row[x * 4] = p[2]; // B
            row[x * 4 + 1] = p[1]; // G
            row[x * 4 + 2] = p[0]; // R
            row[x * 4 + 3] = p[3]; // A
        }
        dib.extend_from_slice(&row);
    }
    Ok(dib)
}

/// DIB (BITMAPINFO) → BMP (BITMAPFILEHEADER + BITMAPINFO + pixels)
fn dib_to_bmp(dib: &[u8]) -> Result<Vec<u8>, String> {
    if dib.len() < 40 {
        return Err("DIB too short".into());
    }
    let header_size = u32::from_le_bytes([dib[0], dib[1], dib[2], dib[3]]);
    // 读取 biBitCount（offset 14）和 biClrUsed（offset 32）以计算像素偏移
    let bit_count = u16::from_le_bytes([dib[14], dib[15]]);
    let clr_used = u32::from_le_bytes([dib[32], dib[33], dib[34], dib[35]]);
    let color_table_size = if bit_count < 24 {
        if clr_used > 0 {
            (clr_used as usize) * 4
        } else {
            (1usize << bit_count as usize) * 4
        }
    } else {
        0
    };
    let pixel_offset = 14 + header_size as usize + color_table_size;
    let file_size = 14 + dib.len();
    let mut bmp = Vec::with_capacity(file_size);
    // BITMAPFILEHEADER (14 bytes)
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&(file_size as u32).to_le_bytes());
    bmp.extend_from_slice(&0u16.to_le_bytes()); // reserved
    bmp.extend_from_slice(&0u16.to_le_bytes()); // reserved
    bmp.extend_from_slice(&(pixel_offset as u32).to_le_bytes());
    bmp.extend_from_slice(dib);
    Ok(bmp)
}

fn resize_to_max_edge(img: DynamicImage, max_edge: u32) -> DynamicImage {
    let (w, h) = img.dimensions();
    if w.max(h) <= max_edge {
        return img;
    }
    let scale = max_edge as f32 / w.max(h) as f32;
    let new_w = ((w as f32 * scale).round() as u32).max(1);
    let new_h = ((h as f32 * scale).round() as u32).max(1);
    img.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3)
}
