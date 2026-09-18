import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase ortam değişkenleri eksik.\n" +
    "VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalıdır."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type UserRole = "admin" | "calisan"

export interface Sirket {
  id: string
  ad: string
  aktif: boolean
  /** HSL renk tonu (0-360). Uygulamanın vurgu rengini belirler. */
  tema_hue: number
  created_at: string
}

export interface AppUser {
  id: string
  email: string
  ad_soyad: string
  rol: UserRole
  aktif: boolean
  created_at: string
}

export interface Hesap {
  id: string
  sirket_id: string
  ad: string
  tur: "banka" | "kasa" | "kredi_karti" | "kisi" | "diger"
  sahip_tipi: "sirket" | "ortak" | "calisan"
  para_birimi: string
  bakiye_baslangic: number
  aktif: boolean
  notlar: string | null
  kullanici_id: string
  created_at: string
  updated_at: string
}

export interface Islem {
  id: string
  sirket_id: string
  tarih: string
  aciklama: string
  tutar: number
  tur: "gelir" | "gider"
  kategori: string
  kullanici_id: string
  hesap_id: string | null
  vade_tarihi: string | null
  notlar: string | null
  adam_saat: number | null
  nakliye_tutari: number | null
  nakliye_faturali: boolean
  faturali: boolean
  transfer_eslesme_id: string | null
  bagli_gelir_islem_id: string | null
  created_at: string
}

export interface Odeme {
  id: string
  sirket_id: string
  islem_id: string
  tarih: string
  tutar: number
  aciklama: string | null
  hesap_id: string | null
  kullanici_id: string
  created_at: string
}

export interface Uretim {
  id: string
  sirket_id: string
  tarih: string
  /** Üretilen ürün. */
  malzeme_id: string
  miktar: number
  iscilik_tutari: number
  adam_saat: number | null
  aciklama: string | null
  kullanici_id: string | null
  created_at: string
}

export interface IslemStok {
  id: string
  sirket_id: string
  /** Alış/satış hareketiyse dolu; üretim ve açılış stoğunda null. */
  islem_id: string | null
  uretim_id: string | null
  kaynak: "islem" | "uretim" | "acilis"
  tarih: string | null
  malzeme_id: string
  miktar: number
  tur: "giris" | "cikis"
  birim_fiyat: number
  created_at: string
}

export interface DemirbasGrubu {
  id: string
  sirket_id: string
  ad: string
  tarih: string | null
  aciklama: string | null
  kullanici_id: string | null
  created_at: string
}

export interface Demirbase {
  id: string
  sirket_id: string
  /** Adlandırılmış demirbaş listesi; null ise gruplanmamış. */
  grup_id: string | null
  ad: string
  kategori: string
  marka: string | null
  model: string | null
  seri_no: string | null
  /** Bu satırın temsil ettiği eşya sayısı. Toplam değer = alis_fiyati * adet. */
  adet: number
  alis_tarihi: string | null
  /** BİRİM alış fiyatı (grubun tamamı değil). */
  alis_fiyati: number | null
  konum: string | null
  durum: "aktif" | "bakimda" | "hurda" | "devredildi" | "satildi"
  satis_tarihi: string | null
  /** BİRİM satış fiyatı. */
  satis_fiyati: number | null
  satis_islem_id: string | null
  zimmet_kullanici_id: string | null
  zimmet_tarihi: string | null
  garanti_bitis: string | null
  son_bakim_tarihi: string | null
  sonraki_bakim_tarihi: string | null
  notlar: string | null
  kaynak_islem_id: string | null
  created_at: string
  updated_at: string
}

export interface Malzeme {
  id: string
  sirket_id: string
  ad: string
  kategori: string
  birim: string
  min_miktar: number
  aciklama: string
  kullanici_id: string
  created_at: string
  updated_at: string
}

export type MalzemeWithStok = Malzeme & {
  stok: number
  son_birim_fiyat: number | null
  son_giris_islem: {
    tutar: number
    nakliye_tutari: number | null
    nakliye_faturali: boolean
    tarih: string
    faturali: boolean
  } | null
}
