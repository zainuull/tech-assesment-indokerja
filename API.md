# Dokumentasi REST API IndoKerja

Base URL lokal `http://localhost:3000/api`. Request dengan payload memakai `Content-Type: application/json`. Endpoint privat memerlukan `Authorization: Bearer <token>`. Waktu dikirim sebagai ISO 8601 dan ID resource menggunakan UUID, kecuali ID riwayat yang berupa bilangan urut.

| Metode dan path | Akses | Payload atau query | Sukses |
| --- | --- | --- | --- |
| `GET /health` | Publik | | 200, `{"status":"ok"}` jika PostgreSQL terhubung |
| `POST /auth/login` | Publik | `email`, `password` | 200, token dan user |
| `GET /auth/me` | Pengguna login | | 200, user aktif |
| `GET /jobs` | Publik | `q` (judul atau perusahaan), `location`, `jobType`, semuanya opsional | 200, array lowongan terbuka |
| `GET /jobs/:jobId` | Publik | | 200, detail lowongan terbuka atau ditutup |
| `GET /jobs/mine` | Company | | 200, array lowongan sendiri, `_count.applications`, dan `stageCounts` per status |
| `POST /jobs` | Company | `title`, `description`, `location`, `salaryMin`, `salaryMax`, `jobType`, opsional `state` | 201, lowongan baru |
| `GET /jobs/:jobId/manage` | Company pemilik lowongan | | 200, detail lowongan termasuk draf |
| `PATCH /jobs/:jobId` | Company pemilik lowongan | Field wajib yang sama dengan pembuatan lowongan | 200, detail hasil edit |
| `PATCH /jobs/:jobId/state` | Company pemilik lowongan | `state` | 200, detail dengan status lowongan terbaru |
| `POST /jobs/:jobId/applications` | Job Seeker | | 201, lamaran dengan status dan riwayat awal |
| `GET /applications/me` | Job Seeker | | 200, array lamaran sendiri, masing-masing dengan `job` dan `history` |
| `GET /jobs/:jobId/applications` | Company pemilik lowongan | | 200, detail lowongan dengan array `applications` |
| `GET /applications/company` | Company | | 200, daftar kandidat di seluruh lowongan milik sendiri |
| `GET /applications/:applicationId` | Company pemilik lowongan | | 200, detail kandidat, riwayat, dan catatan internal |
| `POST /applications/:applicationId/notes` | Company pemilik lowongan | `body` (1–2.000 karakter) | 201, catatan dengan `id`, `body`, dan `createdAt` |
| `PATCH /applications/:applicationId/status` | Company pemilik lowongan | `status` | 200, lamaran dengan status dan riwayat terbaru |

## Login

```json
{"email":"seeker@indokerja.test","password":"IndoKerjaDemo!"}
```

Contoh respons 200:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "b1489f3e-9081-4d9b-bbc6-e153a4246789",
    "name": "Raka Pratama",
    "email": "seeker@indokerja.test",
    "role": "JOB_SEEKER"
  }
}
```

## Lowongan

Contoh payload untuk membuat lowongan:

```json
{
  "title": "Frontend Developer",
  "description": "Bangun antarmuka web yang mudah digunakan.",
  "location": "Jakarta",
  "salaryMin": 8000000,
  "salaryMax": 12000000,
  "jobType": "FULL_TIME"
}
```

Respons pembuatan, daftar, dan detail memakai objek lowongan dengan kolom di atas serta `id`, `state`, `companyId`, `company: {id, name}`, `createdAt`, dan `updatedAt`. Untuk menyaring, misalnya `GET /jobs?q=frontend&location=jakarta&jobType=FULL_TIME`. Filter teks mengabaikan kapitalisasi.

`jobType` menerima `FULL_TIME`, `PART_TIME`, `CONTRACT`, atau `INTERNSHIP`. Kedua gaji merupakan bilangan bulat IDR per bulan antara 0 dan 2.147.483.647. Gaji maksimum harus lebih besar dari atau sama dengan gaji minimum.

`POST /jobs` menerima `"state":"DRAFT"` untuk menyimpan draf. Jika state tidak dikirim, lowongan langsung berstatus `OPEN`. Field detail wajib berlaku untuk kedua opsi. Gunakan `PATCH /jobs/:jobId/state` dengan `{"state":"OPEN"}` untuk memublikasikan draf atau membuka kembali lowongan, dan `{"state":"CLOSED"}` untuk menutup lowongan yang pernah terbit. Lowongan ditutup tetap dapat dibaca lewat URL detail. Daftar publik mengembalikan lowongan terbuka saja.

## Lamaran dan status

Contoh pembaruan: `PATCH /applications/9f512f8a-29a2-4905-8942-dc563502f7ac/status` dengan payload `{"status":"REVIEWING"}`.

```json
{
  "id": "9f512f8a-29a2-4905-8942-dc563502f7ac",
  "jobId": "a1900000-0000-4000-8000-000000000001",
  "seekerId": "b1489f3e-9081-4d9b-bbc6-e153a4246789",
  "status": "REVIEWING",
  "appliedAt": "2026-11-05T08:00:00.000Z",
  "updatedAt": "2026-11-05T09:00:00.000Z",
  "history": [
    {"id": 1, "fromStatus": null, "toStatus": "APPLIED", "changedAt": "2026-11-05T08:00:00.000Z"},
    {"id": 2, "fromStatus": "APPLIED", "toStatus": "REVIEWING", "changedAt": "2026-11-05T09:00:00.000Z"}
  ]
}
```

`status` menerima `APPLIED`, `REVIEWING`, `SHORTLISTED`, `REJECTED`, atau `ACCEPTED`. Setiap kandidat pada respons milik perusahaan memiliki `id`, `status`, `appliedAt`, `seeker: {name, email}`, dan `job: {id, title}`. Untuk menambah catatan internal, kirim `{"body":"Pengalaman sesuai kebutuhan tim."}` ke endpoint catatan. Catatan dikembalikan melalui detail kandidat milik perusahaan.

## Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Periksa kembali data yang dikirim.",
    "fields": {"salaryMax":"Gaji maksimum harus sama dengan atau lebih besar dari gaji minimum."}
  }
}
```

| HTTP | Kode | Arti |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_STATUS` | Format, parameter, atau nilai input tidak valid. `fields` tersedia untuk validasi field. |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Token absen/tidak valid atau kredensial login salah. |
| 403 | `FORBIDDEN` | Peran pengguna tidak sesuai. |
| 404 | `NOT_FOUND`, `JOB_NOT_FOUND`, `APPLICATION_NOT_FOUND` | Resource absen atau berada di luar kepemilikan pemanggil. |
| 409 | `ALREADY_APPLIED`, `STATUS_CONFLICT`, `JOB_CLOSED`, `INVALID_JOB_TRANSITION`, `APPLICATION_CONFLICT` | Lamaran sudah ada, lowongan ditutup, perubahan status lowongan tidak valid, atau terjadi benturan transaksi. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON melebihi 32 KiB. |
| 429 | `TOO_MANY_ATTEMPTS` | Terlalu banyak percobaan login dari sumber yang sama. |
| 500 | `INTERNAL_ERROR` | Kesalahan layanan. |
