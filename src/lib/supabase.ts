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

export interface Islem {
  id: string
  tarih: string
  aciklama: string
  tutar: number
  tur: "gelir" | "gider"
  kategori: string
  kullanici_id: string
  created_at: string
}

export interface Malzeme {
  id: string
  ad: string
  kategori: string
  miktar: number
  birim: string
  min_miktar: number
  birim_fiyat: number
  aciklama: string
  kullanici_id: string
  created_at: string
  updated_at: string
}
