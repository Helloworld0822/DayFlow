export type ScheduleCategory = 'appointment' | 'competition' | 'schedule'

export type Schedule = {
  id: string
  start: string
  end: string
  title: string
  description?: string
  category: ScheduleCategory
}

export type UserProfile = {
  id: number
  email: string
  created_at?: string | null
}

export type GoogleEvent = {
  start?: string
  summary?: string
}

export type SummaryResponse = {
  summary: string
}

export type PredictResponse = {
  dates: string[]
}

export type FreeDaysResponse = {
  free_days: string[]
}

export type GoogleFetchResponse = {
  events: GoogleEvent[]
}

export type MicrosoftEvent = {
  start?: string
  summary?: string
}

export type MSFetchResponse = {
  events: MicrosoftEvent[]
}

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text()

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'detail' in body && String((body as { detail: unknown }).detail)) ||
      (typeof body === 'string' && body) ||
      `Request failed with status ${response.status}`
    throw new ApiError(message, response.status, body)
  }

  return body as T
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return '요청에 실패했습니다.'
}

export function toFormBody(values: Record<string, string>) {
  const body = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => body.set(key, value))
  return body
}

export function fetchBackendStatus() {
  return apiRequest<{ status: string; service?: string }>('/')
}

export function loadSchedules() {
  return apiRequest<Schedule[]>('/schedules/')
}

export function createSchedule(payload: {
  start: string
  end: string
  title: string
  description?: string
  category: ScheduleCategory
}) {
  return apiRequest<Schedule>('/schedules/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function registerUser(email: string, password: string) {
  return apiRequest<UserProfile>('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export function loginUser(email: string, password: string) {
  return apiRequest<UserProfile>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember_me: false }),
  })
}

export function loginUserWithRemember(email: string, password: string, rememberMe: boolean) {
  return apiRequest<UserProfile>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
  })
}

export function loadProtectedProfile() {
  return apiRequest<UserProfile>('/auth/me')
}

export function logoutUser() {
  return apiRequest<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  })
}

export function summarizeSchedules(events: Schedule[]) {
  return apiRequest<SummaryResponse>('/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  })
}

export function predictBusyDays(events: Schedule[], months: number) {
  return apiRequest<PredictResponse>('/ai/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events, months }),
  })
}

export function findFreeDays(events: Schedule[], start: string, end: string) {
  return apiRequest<FreeDaysResponse>('/ai/free-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events, start, end }),
  })
}

export function fetchGoogleEvents(calendarId: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({ calendarId, timeMin, timeMax })
  return apiRequest<GoogleFetchResponse>(`/ai/google/fetch?${params.toString()}`)
}

export function fetchMicrosoftEvents(calendarId: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({ calendarId, timeMin, timeMax })
  return apiRequest<MSFetchResponse>(`/microsoft/events?${params.toString()}`)
}
