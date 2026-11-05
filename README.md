# IndoKerja Job Application Management

Aplikasi simulasi rekrutmen dengan React, TypeScript, dan Vite di frontend, Express dan TypeScript di backend, serta PostgreSQL dengan Prisma. Pencari kerja dapat mencari lowongan, melamar, dan mengikuti status. Perusahaan dapat memublikasikan lowongan dan mengelola kandidatnya.

## Jalankan secara lokal

Prasyarat: Node.js 22.12+ atau 24 LTS, npm, dan Docker Compose. Jika PostgreSQL 17 sudah tersedia, gunakan URL database tersebut dan lewati perintah Docker.

```sh
npm ci
cp .env.example .env
chmod 600 .env
node --input-type=module -e "import { randomBytes } from 'node:crypto'; import { readFileSync, writeFileSync } from 'node:fs'; const env = readFileSync('.env', 'utf8'); writeFileSync('.env', env.replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET=' + randomBytes(32).toString('hex')));"
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
| `SESSION_SECRET` | Secret acak minimal 32 byte. Instalasi lama dapat memakai `JWT_SECRET` sebagai fallback. |
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

Seed menyiapkan enam lowongan terbuka, satu draf, satu lowongan ditutup, dan tujuh lamaran contoh. Pipeline **Frontend Developer** berisi kandidat fiktif dalam kelima tahap seleksi. Menjalankan seed kembali mempertahankan lamaran, status, dan perubahan yang telah dibuat. Database hasil seed menggunakan kredensial publik khusus pengembangan lokal.

## Verifikasi

```sh
npm run build
npm test
```

Tes API membuat skema sementara, menjalankan migrasi, menggunakan HTTP melalui Express, lalu menghapus skema tes. Jalankan dengan PostgreSQL lokal yang mengizinkan pembuatan skema. Tes mencakup validasi, login akun lama, pencabutan sesi, proteksi permintaan browser, peran, kepemilikan, pagination, privasi catatan, lamaran duplikat, perubahan status serentak, serta pengiriman lamaran saat lowongan sedang ditutup.

Untuk mencoba alur lengkap di browser:

1. Masuk sebagai Perusahaan, lalu klik **Lamaran baru** dari dashboard untuk membuka pipeline dengan filter Applied. Coba cari nama dan buka detail kandidat untuk melihat riwayat serta menambahkan catatan internal.
2. Buat lowongan dan pilih **Simpan draf** setelah mengisi formulir. Buka **Kelola** untuk mengeditnya, simpan perubahan, lalu pilih **Publikasikan draf**.
3. Sebagai tamu, cari dan buka lowongan yang baru terbit, pilih **Masuk untuk melamar**, lalu masuk sebagai Pencari Kerja dan kirim lamaran.
4. Masuk sebagai Perusahaan. Buka pipeline lowongan itu, ubah status kandidat, lalu tutup lowongan melalui menu **Kelola**.
5. Sebagai Pencari Kerja, buka **Lamaran saya** untuk melihat status, waktu perubahan terakhir, dan riwayat. Detail lowongan yang ditutup menampilkan pemberitahuan bahwa penerimaan lamaran sudah berakhir.

Untuk memperbarui instalasi yang sudah memiliki data, jalankan `npm ci`, `npm run db:migrate`, dan `npm run build`, lalu mulai ulang server. Migrasi menambah tabel sesi, indeks pipeline per lowongan, serta trigger yang melindungi proses lamaran. Data lowongan, lamaran, riwayat, dan catatan tetap tersedia. Pengguna perlu masuk lagi untuk memperoleh sesi baru. Setelah hash akun pertama diperbarui, pemulihan aplikasi perlu memakai versi server yang dapat membaca hash scrypt v2. Jalankan `npm run db:seed` untuk menambahkan contoh demo pada database lokal bila diperlukan.

## Keputusan implementasi

- Draf dapat disimpan setelah detail wajib diisi. Draf bersifat privat, dan daftar publik hanya menampilkan lowongan terbuka. Detail lowongan ditutup tetap dapat dibuka melalui tautan langsung.
- **Lamaran baru** menghitung Applied, sedangkan **Menunggu keputusan** menghitung Shortlisted. Keduanya mencakup lamaran yang masih perlu ditangani pada lowongan milik perusahaan.
- Rentang gaji menggunakan bilangan bulat IDR per bulan. Jenis pekerjaan yang tersedia adalah penuh waktu, paruh waktu, kontrak, dan magang.
- Lamaran dimulai dari `APPLIED`. Perusahaan pemilik lowongan dapat memilih setiap status yang valid. Menyimpan status yang sama mempertahankan riwayat yang sudah ada.
- PostgreSQL menegakkan keunikan pasangan lowongan dan pelamar. Perubahan status dan riwayat disimpan bersama, dengan pengulangan transaksi terbatas ketika terjadi benturan.
- Lamaran baru memerlukan lowongan berstatus Terbuka. PostgreSQL menahan row lock sampai transaksi lamaran selesai, sehingga perubahan status lowongan dan lamaran yang datang bersamaan diproses dengan urutan yang konsisten.
- Kata sandi memakai scrypt v2 dengan `N=32768, r=8, p=3`. Hash lama ditingkatkan setelah login berhasil. [Panduan penyimpanan kata sandi OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- Browser memakai cookie HttpOnly dan SameSite=Strict. Production mengaktifkan Secure. API klien memakai token Bearer. PostgreSQL menyimpan sidik token yang kedaluwarsa setelah delapan jam dan dapat dicabut lewat logout. [Panduan sesi OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- Pembatasan percobaan login berlaku per proses. Gunakan penyimpanan rate limit bersama bila menjalankan beberapa replika.
- Frontend dan API memakai origin yang sama, termasuk saat development melalui proxy Vite. Deployment menggunakan HTTPS di reverse proxy.

## Deploy dan serahkan assessment

Aplikasi dapat dijalankan sebagai satu layanan Node.js dengan PostgreSQL terpisah. Untuk Railway, tambahkan PostgreSQL dan hubungkan repository ke layanan web. Konfigurasi di `railway.json` menjalankan build, migrasi, dan pemeriksaan kesehatan.

1. Atur `DATABASE_URL` layanan web ke referensi PostgreSQL, `HOST=0.0.0.0`, `NODE_ENV=production`, `TRUST_PROXY=1` untuk satu hop Railway, dan `SESSION_SECRET` acak. Railway menyediakan port. Set `NPM_CONFIG_PRODUCTION=false` agar Prisma CLI dan Vite tersedia selama build serta migrasi saat startup.
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
