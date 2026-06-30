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
  islem_id: string
  tarih: string
  tutar: number
  aciklama: string | null
  hesap_id: string | null
  kullanici_id: string
  created_at: string
}

export interface IslemStok {
  id: string
  islem_id: string
  malzeme_id: string
  miktar: number
  tur: "giris" | "cikis"
  birim_fiyat: number
  created_at: string
}

export interface Demirbase {
  id: string
  ad: string
  kategori: string
  marka: string | null
  model: string | null
  seri_no: string | null
  alis_tarihi: string | null
  alis_fiyati: number | null
  konum: string | null
  durum: "aktif" | "bakimda" | "hurda" | "devredildi"
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
