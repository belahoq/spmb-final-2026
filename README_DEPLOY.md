# SPMB SD Negeri 3 Pringgabaya - Gemini AI Input Helper

Paket ini berisi:

- `index.html` - form SPMB operator dengan fitur bantu input Gemini AI.
- `functions/api/extract-ai.js` - Cloudflare Pages Function untuk memanggil Gemini API secara aman dari backend.

## Cara deploy via GitHub + Cloudflare Pages

1. Buat repository GitHub, misalnya `spmb2026-sdn3pringgabaya`.
2. Upload file/folder berikut ke root repository:
   - `index.html`
   - folder `functions/api/extract-ai.js`
   - logo jika ada: `logo-kiri.png` dan `logo-kanan.png`
3. Masuk Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git.
4. Pilih repository.
5. Framework preset: `None`.
6. Build command: kosongkan.
7. Build output directory: `/` atau kosongkan sesuai tampilan Cloudflare.
8. Setelah deploy pertama, buka project Pages > Settings > Variables and Secrets.
9. Tambahkan secret:
   - Nama: `GEMINI_API_KEY`
   - Value: API key dari Google AI Studio.
10. Opsional tambahkan variable/secret:
   - Nama: `GEMINI_MODEL`
   - Value: `gemini-1.5-flash`
11. Redeploy.

## Catatan keamanan

- Jangan pernah menaruh API key Gemini di `index.html`.
- API key hanya disimpan di Cloudflare Pages Secret.
- File KK/Akta/KTP dikirim sementara ke Pages Function untuk dianalisis Gemini, tidak dikirim ke Google Apps Script.
- Data final yang dikirim ke Google Apps Script hanya data form setelah direview operator.
- Untuk akses operator yang benar-benar aman, aktifkan Cloudflare Access / Zero Trust pada domain SPMB.

## Endpoint

Frontend akan memanggil:

`/api/extract-ai`

Cloudflare Pages otomatis menjalankan file:

`functions/api/extract-ai.js`

## Patch 502 Cloudflare

Jika tombol Analisis Dokumen menampilkan error HTTP 502 dengan cuplikan HTML Cloudflare, gunakan versi patch ini. Perubahan penting:

- Gambar dikompres di browser menjadi JPG maksimal 2MB per dokumen sebelum dikirim ke `/api/extract-ai`.
- Endpoint Gemini memakai format resmi `:generateContent?key=GEMINI_API_KEY`.
- Payload gambar memakai `inline_data` dan `mime_type` sesuai contoh REST Gemini.
- Override `safetySettings` dihapus agar lebih kompatibel lintas model Gemini.

Setelah mengganti file, commit/push ke GitHub dan redeploy Cloudflare Pages. Tes endpoint:

```text
https://domain-bapak/api/extract-ai
```

Jika endpoint aktif, hasil GET harus JSON. Untuk analisis dokumen, gunakan tombol dari halaman form.
