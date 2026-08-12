# PROJECT DEVELOPMENT RULES & GUIDELINES

Dokumen ini berisi aturan wajib yang harus dipatuhi oleh seluruh developer dan AI Agent dalam pengkodean dan pemeliharaan proyek **Elysium Wallpaper Platform**.

---

## 1. ATURAN UKURAN FILE (MAX 1000 LINES)

- **Tidak ada file yang boleh melebihi 1000 baris kode.**
- Jika sebuah file mendekati atau melebihi 1000 baris:
  - Lakukan refactoring segera.
  - Pecah komponen, helper, modul, atau service ke dalam file tersendiri yang terpisah dan terfokus (Single Responsibility Principle).
  - Tempatkan modul baru di direktori yang sesuai (`src/components/`, `src/lib/`, `worker/services/`, dsb.).

---

## 2. KUALITAS & SKALABILITAS KODE

- **Mudah Dimengerti (Clean & Readable Code)**:
  - Gunakan penamaan variabel, fungsi, dan kelas yang deskriptif dan eksplisit.
  - Tambahkan dokumentasi/JSDoc pada fungsi kompleks.
  - Hindari trik kode tersembunyi (*magic numbers*, *nested callback/ternary overload*).
- **Mudah Di-scale (Scalable Architecture)**:
  - Pisahkan logika UI (`src/pages`, `src/components`) dengan logika bisnis/fetch API (`src/services`, `src/lib`).
  - Pisahkan logika Worker API (`worker/routes`) dengan akses database D1 / R2 (`worker/services`).
  - Manfaatkan TypeScript secara ketat (*strict mode*) tanpa pemakaian `any` secara serampangan.

---

## 3. PROTOKOL WAJIB EXECUTION TRACKING (`track.md`)

- **Setiap agen AI / developer yang melakukan eksekusi pekerjaan WAJIB membaca dan memperbarui file [`track.md`](file:///Users/apple/Programming/Projects/Personal/Elysium/track.md).**
- **Kapan Harus Memperbarui `track.md`**:
  1. Sebelum memulai eksekusi task/phase baru: Ubah status task terkait menjadi `[in-progress]`.
  2. Selesai melakukan eksekusi task/phase: Ubah status task menjadi `[x]` (Completed), lalu catat tanggal, ringkasan ringkas perubahan yang dilakukan, dan daftar file yang dibuat/diubah pada log aktivitas di `track.md`.
- **Dilarang**: Menyelesaikan sesi eksekusi tanpa memperbarui file `track.md`.

---

## 4. INTEGRITAS ARSITEKTUR & FILE ORIGINAL

- File gambar original yang di-upload ke R2 **tidak boleh** dimodifikasi, di-resize, di-re-encode, atau diubah formatnya pada saat proses download.
- Asset gallery & detail preview di website **hanya** boleh menggunakan file preview (WebP/AVIF) yang sudah dioptimalkan. File original **tidak pernah** dimuat langsung di halaman gallery/explore.
