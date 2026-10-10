// Връзка с базата данни (Supabase).
// Адресът и publishable ключът са публични по замисъл: данните са защитени
// с вход (Row Level Security), а не със скриване на ключа.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://mfblcwqycypgyifeeisb.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_yEq3iwLEJ52eUYqcn7X7uw_-mlwqCas'

export const supabase = createClient(url, key)

// Превежда техническите грешки от базата на разбираем език.
export function friendlyError(error) {
  if (!error) return ''
  if (error.code === '23505') return 'Такъв запис вече съществува (дублиране на уникално поле).'
  if (error.code === '23503') return 'Записът не може да се изтрие, защото се използва другаде (напр. в пътен лист).'
  if (error.code === '23514') return 'Някоя от стойностите е невалидна.'
  return error.message || 'Неочаквана грешка.'
}
