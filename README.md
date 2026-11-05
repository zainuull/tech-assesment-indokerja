# IndoKerja Job Application Management

Aplikasi simulasi rekrutmen dengan React, TypeScript, dan Vite di frontend, Express dan TypeScript di backend, serta PostgreSQL dengan Prisma. Pencari kerja dapat mencari lowongan, melamar, dan mengikuti status. Perusahaan dapat memublikasikan lowongan dan mengelola kandidatnya.

## Jalankan secara lokal

Prasyarat: Node.js 22.12+ atau 24 LTS, npm, dan Docker Compose. Jika PostgreSQL 17 sudah tersedia, gunakan URL database tersebut dan lewati perintah Docker.

```sh
npm ci
cp .env.example .env
chmod 600 .env
node --input-type=module -e "import { randomBytes } from 'node:crypto'; import { readFileSync, writeFileSync } from 'node:fs'; const env = readFileSync('.env', 'utf8'); writeFileSync('.env', env.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + randomBytes(32).toString('hex')));"
docker compose up -d --wait
npx prisma generate
npm run db:migrate
npm run db:seed
npm run dev
```

Buka [http://localhost:5173](http://localhost:5173). Vite meneruskan `/api` ke Express di port 3000. Data PostgreSQL tetap tersimpan di volume Compose ketika container dihentikan. Gunakan `docker compose stop` untuk menghentikan database lokal.

Untuk menjalankan satu server dengan hasil build frontend:

```sh
npm run build
npm start
```

Buka [http://localhost:3000](http://localhost:3000). Jika server development masih aktif, hentikan terlebih dahulu agar port 3000 tersedia.

| Variabel | Penggunaan |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL. Compose menggunakan port host 55432. |
| `JWT_SECRET` | Secret acak minimal 32 byte. Wajib diisi. |
| `HOST`, `PORT` | Alamat dan port Express. Default `127.0.0.1:3000`. |
| `TRUST_PROXY` | Set `1` jika Express berada tepat satu hop di belakang reverse proxy tepercaya. |
| `VITE_SHOW_DEMO_ACCOUNTS` | Set `true` sebelum build/dev untuk menampilkan kredensial seed lokal di halaman login. |

### Akun seed lokal

| Peran | Email | Kata sandi |
| --- | --- | --- |
| Pencari Kerja | `seeker@indokerja.test` | `IndoKerjaDemo!` |
| Perusahaan | `company@indokerja.test` | `IndoKerjaDemo!` |
| Perusahaan lain | `studio@indokerja.test` | `IndoKerjaDemo!` |
| Perusahaan lain | `nusa@indokerja.test` | `IndoKerjaDemo!` |

Seed menyiapkan enam lowongan dan satu lamaran contoh. Menjalankan seed kembali mempertahankan lamaran, status, dan perubahan yang telah dibuat. Database hasil seed menggunakan kredensial publik khusus pengembangan lokal.

## Verifikasi

```sh
npm run build
npm test
```

Tes API membuat skema sementara, menjalankan migrasi, menggunakan HTTP melalui Express, lalu menghapus skema tes. Jalankan dengan PostgreSQL lokal yang mengizinkan pembuatan skema. Tes mencakup login, validasi, peran, kepemilikan data, filter, permintaan melamar serentak, perubahan status serentak, dan rantai riwayat.

Untuk mencoba alur lengkap di browser:

1. Masuk sebagai Perusahaan dan buat lowongan baru. Halaman kandidat akan menampilkan konfirmasi publikasi.
2. Keluar, cari lowongan sebagai tamu, lalu pilih **Masuk untuk melamar** dari halaman detail. Masuk sebagai Pencari Kerja dan pastikan halaman detail terbuka kembali. Klik **Lamar sekarang**. Buka ulang detail untuk memeriksa keterangan bahwa lamaran sudah dikirim.
3. Masuk lagi sebagai Perusahaan, buka daftar kandidat lowongan tadi, ubah status ke **Reviewing**, lalu ke **Accepted**.
4. Masuk sebagai Pencari Kerja dan buka **Lamaran saya**. Periksa status **Accepted** dan buka **Riwayat status**.

## Keputusan implementasi

- Rentang gaji menggunakan bilangan bulat IDR per bulan. Jenis pekerjaan yang tersedia adalah penuh waktu, paruh waktu, kontrak, dan magang.
- Lamaran dimulai dari `APPLIED`. Perusahaan pemilik lowongan dapat memilih setiap status yang valid. Menyimpan status yang sama mempertahankan riwayat yang sudah ada.
- PostgreSQL menegakkan keunikan pasangan lowongan dan pelamar. Perubahan status dan riwayat disimpan bersama, dengan pengulangan transaksi terbatas ketika terjadi benturan.
- Kata sandi di-hash dengan scrypt. Token Bearer berlaku delapan jam dan disimpan dalam sesi tab browser. Server memeriksa peran dan kepemilikan untuk setiap operasi terlindungi.
- Frontend dan API memakai origin yang sama, termasuk saat development melalui proxy Vite. Deployment menggunakan HTTPS di reverse proxy.

## Deploy dan serahkan assessment

Aplikasi dapat dijalankan sebagai satu layanan Node.js dengan PostgreSQL terpisah. Untuk Railway, tambahkan PostgreSQL dan hubungkan repository ke layanan web. Konfigurasi di `railway.json` menjalankan build, migrasi, dan pemeriksaan kesehatan.

1. Atur `DATABASE_URL` layanan web ke referensi PostgreSQL, `HOST=0.0.0.0`, `NODE_ENV=production`, `TRUST_PROXY=1` untuk satu hop Railway, dan `JWT_SECRET` acak. Railway menyediakan port. Set `NPM_CONFIG_PRODUCTION=false` agar Prisma CLI dan Vite tersedia selama build serta migrasi saat startup.
2. Buat domain HTTPS lalu verifikasi `/api/health` dan beranda. Rujukan: [PostgreSQL di Railway](https://docs.railway.com/guides/postgresql).
3. Buat akun reviewer dari shell layanan yang sudah memiliki akses ke database. Jalankan dua kali menggunakan email berbeda dan `ACCOUNT_ROLE` masing-masing `JOB_SEEKER` dan `COMPANY`:

   ```sh
   export ACCOUNT_NAME='Nama reviewer' ACCOUNT_EMAIL='reviewer@example.com' ACCOUNT_ROLE='JOB_SEEKER'
   printf 'Kata sandi (minimal 16 karakter): '
   stty -echo
   IFS= read -r ACCOUNT_PASSWORD
   stty echo
   printf '\n'
   ACCOUNT_PASSWORD="$ACCOUNT_PASSWORD" npm run db:account
   unset ACCOUNT_PASSWORD
   ```

4. Coba kedua akun melalui URL HTTPS. Buat Google Docs baru yang memuat URL repository dan URL demo. Berikan reviewer akses ke kedua tautan dan bagikan kredensial reviewer melalui akses terbatas. Gunakan formulir pada PDF assessment untuk pengumpulan.

Lihat [dokumentasi REST API](API.md) untuk payload, respons, dan akses per endpoint.
