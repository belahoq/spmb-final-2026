const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const DEFAULT_MODEL = 'gemini-1.5-flash';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function safeJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Gemini tidak mengembalikan teks.');
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini tidak mengembalikan JSON.');
    return JSON.parse(match[0]);
  }
}

function normalizeExtractedData(data) {
  const clean = data && typeof data === 'object' ? data : {};
  const fields = [
    'nama', 'jk', 'agama', 'no_kk', 'nik', 'tempat_lahir', 'tgl_lahir', 'alamat', 'no_hp', 'penerima_kip', 'tinggal_bersama',
    'nama_ayah', 'tahun_ayah', 'pdk_ayah', 'kerja_ayah', 'hasil_ayah', 'nama_ibu', 'tahun_ibu', 'pdk_ibu', 'kerja_ibu', 'hasil_ibu',
    'nama_wali', 'tahun_wali', 'pdk_wali', 'kerja_wali', 'hasil_wali', 'ibu_kandung_wali', 'tahun_ibu_wali',
    'tinggi', 'berat', 'anak_ke', 'saudara', 'asal_sekolah'
  ];
  const out = {};
  for (const key of fields) {
    const value = clean[key];
    out[key] = value === undefined ? null : value;
  }
  out.confidence = clean.confidence && typeof clean.confidence === 'object' ? clean.confidence : {};
  out.peringatan = Array.isArray(clean.peringatan) ? clean.peringatan : [];
  out.catatan = Array.isArray(clean.catatan) ? clean.catatan : [];
  out.jenis_dokumen_terbaca = Array.isArray(clean.jenis_dokumen_terbaca) ? clean.jenis_dokumen_terbaca : [];
  return out;
}

export async function onRequestOptions() {
  return jsonResponse({ ok: true, endpoint: 'extract-ai', method: 'OPTIONS' });
}

export async function onRequestGet(context) {
  const hasKey = Boolean(context.env && context.env.GEMINI_API_KEY);
  return jsonResponse({
    ok: true,
    endpoint: 'extract-ai',
    message: 'Endpoint AI aktif. Gunakan metode POST dari form untuk analisis dokumen.',
    gemini_key_configured: hasKey,
    model: (context.env && context.env.GEMINI_MODEL) || DEFAULT_MODEL
  });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ ok: false, error: 'Secret GEMINI_API_KEY belum disetel di Cloudflare Pages.' }, 500);
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ ok: false, error: 'Request harus multipart/form-data.' }, 400);
    }

    const form = await request.formData();
    const docs = [
      { key: 'kk', label: 'Kartu Keluarga', file: form.get('kk') },
      { key: 'akta', label: 'Akta Kelahiran', file: form.get('akta') },
      { key: 'ktp', label: 'KTP Orang Tua/Wali', file: form.get('ktp') }
    ].filter((item) => item.file && typeof item.file === 'object' && typeof item.file.arrayBuffer === 'function');

    if (!docs.length) {
      return jsonResponse({ ok: false, error: 'Minimal upload satu dokumen gambar.' }, 400);
    }

    for (const item of docs) {
      if (!ALLOWED_MIME_TYPES.has(item.file.type)) {
        return jsonResponse({ ok: false, error: `${item.label} harus JPG, PNG, atau WEBP.` }, 400);
      }
      if (item.file.size > MAX_FILE_SIZE) {
        return jsonResponse({ ok: false, error: `${item.label} lebih dari 2MB setelah kompresi.` }, 400);
      }
    }

    const prompt = `
Anda adalah asisten input data SPMB SD Negeri 3 Pringgabaya tahun ajaran 2026/2027.
Tugas Anda hanya mengekstrak data yang terlihat dari dokumen Indonesia seperti Kartu Keluarga, Akta Kelahiran, dan KTP.
Aturan wajib:
1. Jangan menebak data yang tidak terlihat. Isi null jika tidak terbaca.
2. Jangan mengarang NIK/KK. NIK dan nomor KK harus 16 digit angka, selain itu isi null dan beri peringatan.
3. Jika ada beberapa anggota keluarga pada KK, pilih calon siswa usia masuk SD sekitar 5-8 tahun berdasarkan tanggal lahir. Jika ragu, isi peringatan.
4. Tanggal harus format ISO YYYY-MM-DD jika bisa dibaca.
5. Jenis kelamin hanya "Laki-laki", "Perempuan", atau null.
6. Pendidikan gunakan salah satu: "SD", "SMP", "SMA", "D1/D2/D3", "S1/S2/S3", "Tidak Tamat SD", "Tidak Bersekolah", atau null.
7. Tinggal bersama gunakan "Bersama Orang Tua", "Bersama Wali", atau null.
8. Penerima KIP gunakan "Ya", "Tidak", atau null.
9. Kembalikan hanya JSON valid tanpa markdown.

Schema JSON wajib:
{
  "nama": null,
  "jk": null,
  "agama": null,
  "no_kk": null,
  "nik": null,
  "tempat_lahir": null,
  "tgl_lahir": null,
  "alamat": null,
  "no_hp": null,
  "penerima_kip": null,
  "tinggal_bersama": null,
  "nama_ayah": null,
  "tahun_ayah": null,
  "pdk_ayah": null,
  "kerja_ayah": null,
  "hasil_ayah": null,
  "nama_ibu": null,
  "tahun_ibu": null,
  "pdk_ibu": null,
  "kerja_ibu": null,
  "hasil_ibu": null,
  "nama_wali": null,
  "tahun_wali": null,
  "pdk_wali": null,
  "kerja_wali": null,
  "hasil_wali": null,
  "ibu_kandung_wali": null,
  "tahun_ibu_wali": null,
  "tinggi": null,
  "berat": null,
  "anak_ke": null,
  "saudara": null,
  "asal_sekolah": null,
  "confidence": {
    "nama": 0,
    "nik": 0,
    "no_kk": 0,
    "tgl_lahir": 0,
    "nama_ayah": 0,
    "nama_ibu": 0,
    "alamat": 0
  },
  "peringatan": [],
  "catatan": [],
  "jenis_dokumen_terbaca": []
}`.trim();

    const parts = [{ text: prompt }];
    for (const item of docs) {
      const base64 = await fileToBase64(item.file);
      parts.push({ text: `Dokumen berikut adalah ${item.label}.` });
      parts.push({ inline_data: { mime_type: item.file.type, data: base64 } });
    }

    const model = env.GEMINI_MODEL || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json'
        },
        // Safety settings tidak dioverride. Biarkan default Gemini agar kompatibel lintas model.
      })
    });

    const geminiText = await geminiResponse.text();
    let geminiJson = null;
    try {
      geminiJson = JSON.parse(geminiText);
    } catch (_) {
      geminiJson = null;
    }
    if (!geminiResponse.ok) {
      const message = geminiJson?.error?.message || geminiText.slice(0, 500) || `Gemini API error HTTP ${geminiResponse.status}`;
      return jsonResponse({ ok: false, error: message, http_status: geminiResponse.status }, 502);
    }
    if (!geminiJson) {
      return jsonResponse({ ok: false, error: 'Gemini API tidak mengembalikan JSON valid.', raw: geminiText.slice(0, 500) }, 502);
    }

    const text = geminiJson?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim();
    const extracted = normalizeExtractedData(safeJsonFromText(text));

    return jsonResponse({ ok: true, model, data: extracted });
  } catch (error) {
    return jsonResponse({ ok: false, error: error && error.stack ? error.stack.slice(0, 1200) : (error.message || 'Kesalahan tidak diketahui.') }, 500);
  }
}
