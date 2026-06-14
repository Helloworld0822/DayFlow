import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import logoDayflow from './assets/logo-dayflow.svg'
import './App.css'
import {
  Bell,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Link,
  LogOut,
  Key,
  Sparkles,
  BarChart3,
  TrendingUp,
  Calendar,
  Loader2,
} from 'lucide-react'
import {
  createSchedule,
  deleteSchedule,
  updateSchedule,
  fetchGoogleEvents,
  fetchMicrosoftEvents,
  findFreeDays,
  getErrorMessage,
  loadProtectedProfile,
  loadSchedules,
  loginUserWithRemember,
  predictBusyDays,
  registerUser,
  logoutUser,
  summarizeSchedules,
  type GoogleEvent,
  type MicrosoftEvent,
  type Schedule,
  type ScheduleCategory,
  type UserProfile,
} from './lib/api'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  appointment: '약속',
  competition: '대회',
  schedule: '스케줄',
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatDateISO(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))
}

function formatLocalDateTimeInput(dateIso: string, time = '09:00') {
  return `${dateIso}T${time}`
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: Array<Array<{ day: number | null; iso?: string }>> = []
  let week: Array<{ day: number | null; iso?: string }> = []

  for (let i = 0; i < startDay; i += 1) week.push({ day: null })
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = formatDateISO(new Date(year, month, day))
    week.push({ day, iso })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ day: null })
    weeks.push(week)
  }
  return weeks
}

function buildDateEventMap(schedules: Schedule[]) {
  const map = new Map<string, Schedule[]>()
  for (const event of schedules) {
    const start = new Date(event.start)
    const end = new Date(event.end)
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    const msPerDay = 86400000
    const days = Math.round((endDay.getTime() - startDay.getTime()) / msPerDay) + 1
    for (let i = 0; i < days; i++) {
      const d = new Date(startDay.getTime() + i * msPerDay)
      const key = formatDateISO(d)
      const arr = map.get(key)
      if (arr) {
        arr.push(event)
      } else {
        map.set(key, [event])
      }
    }
  }
  return map
}

function formatTimeLocal(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(11, 16)
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function App() {
  const [today] = useState(() => formatDateISO(new Date()))
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState(today)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleError, setScheduleError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startLocal, setStartLocal] = useState(formatLocalDateTimeInput(today, '09:00'))
  const [endLocal, setEndLocal] = useState(formatLocalDateTimeInput(today, '10:00'))
  const [category, setCategory] = useState<ScheduleCategory>('appointment')

  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authRememberMe, setAuthRememberMe] = useState(false)
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  const [summaryText, setSummaryText] = useState('')
  const [predictMonths, setPredictMonths] = useState(3)
  const [predictDates, setPredictDates] = useState<string[]>([])
  const [freeStart, setFreeStart] = useState(today)
  const [freeEnd, setFreeEnd] = useState(formatDateISO(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 14)))
  const [freeDays, setFreeDays] = useState<string[]>([])
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleTimeMin, setGoogleTimeMin] = useState(formatLocalDateTimeInput(today, '00:00'))
  const [googleTimeMax, setGoogleTimeMax] = useState(formatLocalDateTimeInput(formatDateISO(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 30)), '23:59'))
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [googleError, setGoogleError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const [msCalendarId, setMsCalendarId] = useState('')
  const [msTimeMin, setMsTimeMin] = useState(formatLocalDateTimeInput(today, '00:00'))
  const [msTimeMax, setMsTimeMax] = useState(formatLocalDateTimeInput(formatDateISO(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 30)), '23:59'))
  const [msEvents, setMsEvents] = useState<MicrosoftEvent[]>([])
  const [msError, setMsError] = useState('')
  const [msLoading, setMsLoading] = useState(false)

  const [integrationModalOpen, setIntegrationModalOpen] = useState(false)

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const dateEventMap = useMemo(() => buildDateEventMap(schedules), [schedules])
  const selectedMonthLabel = useMemo(() => formatMonthLabel(viewYear, viewMonth), [viewYear, viewMonth])
  const isAuthenticated = Boolean(authProfile)

  const refreshSchedules = useCallback(async () => {
    try {
      const data = await loadSchedules()
      setSchedules(data)
      setScheduleError('')
    } catch (error) {
      setScheduleError(getErrorMessage(error))
    }
  }, [])

  const refreshProtectedProfile = useCallback(async () => {
    try {
      const profile = await loadProtectedProfile()
      setAuthProfile(profile)
      setAuthError('')
    } catch (error) {
      setAuthProfile(null)
      const message = getErrorMessage(error)
      if (message !== 'Could not validate credentials' && message !== 'Not authenticated') {
        setAuthError(message)
      }
    }
  }, [])

  useEffect(() => {
    void refreshSchedules()
    void refreshProtectedProfile()
  }, [refreshSchedules, refreshProtectedProfile])

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }, [viewMonth, viewYear])

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }, [viewMonth, viewYear])

  const goToToday = useCallback(() => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    setSelectedDate(formatDateISO(now))
  }, [])

  const openAddModal = useCallback((dateIso?: string) => {
    const target = dateIso || today
    setSelectedDate(target)
    setTitle('')
    setDescription('')
    setStartLocal(formatLocalDateTimeInput(target, '09:00'))
    setEndLocal(formatLocalDateTimeInput(target, '10:00'))
    setCategory('appointment')
    setModalOpen(true)
  }, [today])

  async function handleCreateSchedule() {
    if (!startLocal || !endLocal) return
    if (new Date(endLocal) <= new Date(startLocal)) {
      setScheduleError('종료 시간은 시작 시간보다 이후여야 합니다.')
      return
    }

    try {
      await createSchedule({
        start: startLocal,
        end: endLocal,
        title: title || 'Untitled',
        description: description || undefined,
        category,
      })
      setModalOpen(false)
      await refreshSchedules()
    } catch (error) {
      setScheduleError(getErrorMessage(error))
    }
  }

  async function handleDeleteSchedule(id: string) {
    try {
      await deleteSchedule(id)
      await refreshSchedules()
    } catch (error) {
      setScheduleError(getErrorMessage(error))
    }
  }

  function openEditModal(schedule: Schedule) {
    setEditingSchedule(schedule)
    setTitle(schedule.title)
    setDescription(schedule.description || '')
    setStartLocal(schedule.start.slice(0, 16))
    setEndLocal(schedule.end.slice(0, 16))
    setCategory(schedule.category)
    setEditModalOpen(true)
  }

  async function handleUpdateSchedule() {
    if (!editingSchedule || !startLocal || !endLocal) return
    if (new Date(endLocal) <= new Date(startLocal)) {
      setScheduleError('종료 시간은 시작 시간보다 이후여야 합니다.')
      return
    }

    try {
      await updateSchedule(editingSchedule.id, {
        start: startLocal,
        end: endLocal,
        title: title || 'Untitled',
        description: description || undefined,
        category,
      })
      setEditModalOpen(false)
      setEditingSchedule(null)
      await refreshSchedules()
    } catch (error) {
      setScheduleError(getErrorMessage(error))
    }
  }

  async function handleRegister() {
    if (!authEmail || !authPassword) {
      setAuthError('이메일과 비밀번호를 입력해주세요.')
      setAuthMessage('')
      return
    }
    try {
      setAuthLoading(true)
      setAuthError('')
      setAuthMessage('')
      await registerUser(authEmail, authPassword)
      setAuthMessage('회원가입이 완료되었습니다. 로그인하세요.')
      setAuthMode('login')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogin() {
    if (!authEmail || !authPassword) {
      setAuthError('이메일과 비밀번호를 입력해주세요.')
      setAuthMessage('')
      return
    }
    try {
      setAuthLoading(true)
      setAuthError('')
      setAuthMessage('')
      const profile = await loginUserWithRemember(authEmail, authPassword, authRememberMe)
      setAuthProfile(profile)
      setAuthMessage('로그인 완료')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    try {
      setAuthError('')
      setAuthMessage('')
      await logoutUser()
      setAuthProfile(null)
      setAuthMessage('로그아웃했습니다.')
    } catch (error) {
      setAuthError(getErrorMessage(error))
    }
  }

  async function handleSummarize() {
    try {
      setAiLoading(true)
      setAiError('')
      setPredictDates([])
      setFreeDays([])
      const result = await summarizeSchedules(schedules)
      setSummaryText(result.summary)
    } catch (error) {
      setAiError(getErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  async function handlePredict() {
    try {
      setAiLoading(true)
      setAiError('')
      setSummaryText('')
      setFreeDays([])
      const result = await predictBusyDays(schedules, predictMonths)
      setPredictDates(result.dates)
    } catch (error) {
      setAiError(getErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  async function handleFreeDays() {
    try {
      setAiLoading(true)
      setAiError('')
      setSummaryText('')
      setPredictDates([])
      const result = await findFreeDays(schedules, freeStart, freeEnd)
      setFreeDays(result.free_days)
    } catch (error) {
      setAiError(getErrorMessage(error))
    } finally {
      setAiLoading(false)
    }
  }

  async function handleGoogleFetch() {
    try {
      setGoogleLoading(true)
      setGoogleError('')
      const result = await fetchGoogleEvents(googleCalendarId, googleTimeMin, googleTimeMax)
      setGoogleEvents(result.events)
    } catch (error) {
      setGoogleError(getErrorMessage(error))
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleMicrosoftFetch() {
    try {
      setMsLoading(true)
      setMsError('')
      const result = await fetchMicrosoftEvents(
        msCalendarId || '',
        msTimeMin,
        msTimeMax,
      )
      setMsEvents(result.events)
    } catch (error) {
      setMsError(getErrorMessage(error))
    } finally {
      setMsLoading(false)
    }
  }

  const selectedEvents = useMemo(() => {
    const dayStart = new Date(`${selectedDate}T00:00:00`)
    const dayEnd = new Date(`${selectedDate}T23:59:59.999`)
    return schedules.filter((event) => {
      const start = new Date(event.start)
      const end = new Date(event.end)
      return start <= dayEnd && end >= dayStart
    })
  }, [schedules, selectedDate])

  const todayEvents = useMemo(() => {
    return selectedEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }, [selectedEvents])

  const upcomingEvents = useMemo(() => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return schedules
      .filter((event) => {
        const start = new Date(event.start)
        return start > now && start <= nextWeek
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5)
  }, [schedules])

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase()
  }

  return (
    <div className="app-shell">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src={logoDayflow} width={32} height={32} alt="logo" />
            <span className="sidebar-brand-name">DayFlow</span>
          </div>

          {isAuthenticated && authProfile && (
            <div className="sidebar-profile">
              <div className="sidebar-profile-avatar">{getInitials(authProfile.email)}</div>
              <span className="sidebar-profile-name">{authProfile.email}</span>
            </div>
          )}
        </div>

        <div className="sidebar-bottom">
          <button
            className="sidebar-link"
            onClick={() => setIntegrationModalOpen(true)}
            title="연동 관리"
          >
            <Link size={18} />
            <span>연동</span>
          </button>

          {isAuthenticated ? (
            <button
              className="sidebar-link"
              onClick={() => void handleLogout()}
              title="로그아웃"
            >
              <LogOut size={18} />
              <span>로그아웃</span>
            </button>
          ) : (
            <button
              className="sidebar-link"
              onClick={() => undefined}
              title="로그인"
            >
              <Key size={18} />
              <span>로그인</span>
            </button>
          )}

          <br />

          <button
            className="sidebar-link"
            onClick={toggleTheme}
            title={theme === 'dark' ? '화이트 모드' : '다크 모드'}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={18} />
                <span>라이트</span>
              </>
            ) : (
              <>
                <Moon size={18} />
                <span>다크</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="app-content">
      {/* Header */}
      <header className="header">
        <div className="header-search">
          <input type="text" placeholder="일정 검색..." />
        </div>

        <div className="header-actions">
          <button className="header-btn" title="알림">
            <Bell width={20} height={20} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="main-layout">
        {/* Calendar Section */}
        <section className="calendar-section">
          <div className="calendar-header">
            <div className="calendar-nav">
              <button className="calendar-nav-btn" onClick={prevMonth}>
                <ChevronLeft width={16} height={16} />
              </button>
              <span className="calendar-month">{selectedMonthLabel}</span>
              <button className="calendar-nav-btn" onClick={nextMonth}>
                <ChevronRight width={16} height={16} />
              </button>
            </div>
            <button className="calendar-today-btn" onClick={goToToday}>
              오늘
            </button>
          </div>

          <div className="calendar-grid-container">
            <div className="calendar-weekdays">
              {WEEKDAYS.map((day) => (
                <span key={day} className="calendar-weekday">{day}</span>
              ))}
            </div>
            <div className="calendar-days">
              {monthGrid.map((week, weekIndex) =>
                week.map((cell, cellIndex) => {
                  const dayEvents = cell.iso ? dateEventMap.get(cell.iso) ?? [] : []
                  const selected = cell.iso === selectedDate
                  const isToday = cell.iso === today
                  const isOtherMonth = !cell.day
                  const isBusy = cell.iso && predictDates.includes(cell.iso)

                  return (
                    <motion.button
                      key={`${weekIndex}-${cellIndex}`}
                      type="button"
                      className={`calendar-day ${selected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''} ${isOtherMonth ? 'calendar-day--other-month' : ''} ${!cell.day ? 'calendar-day--empty' : ''} ${isBusy ? 'calendar-day--busy' : ''}`}
                      onClick={() => cell.iso && setSelectedDate(cell.iso)}
                      whileHover={{ scale: cell.day ? 1.02 : 1 }}
                      whileTap={{ scale: cell.day ? 0.98 : 1 }}
                    >
                      <div className="calendar-day-number">{cell.day ? `${cell.day}일` : ''}</div>
                      <div className="calendar-day-events">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={`calendar-event-chip calendar-event-chip--${event.category}`}
                            title={event.title}
                          >
                            <span className={`calendar-event-dot calendar-event-dot--${event.category}`} />
                            <span className="calendar-event-chip-text">{event.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="calendar-event-more">+{dayEvents.length - 2}개</span>
                        )}
                      </div>
                    </motion.button>
                  )
                }),
              )}
            </div>
          </div>
        </section>

        {/* Schedule Panel */}
        <aside className="schedule-panel">
          {/* Today's Schedule */}
          <div className="schedule-section">
            <div className="schedule-section-header">
              <span className="schedule-section-title">오늘 일정</span>
              <span className="schedule-section-count">{todayEvents.length}개</span>
            </div>
            {scheduleError && <div className="alert alert-error">{scheduleError}</div>}
            <div className="schedule-list">
              {todayEvents.length > 0 ? (
                todayEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    className="schedule-item"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="schedule-item-time">{formatTimeLocal(event.start)}</span>
                    <div className="schedule-item-content">
                      <div className="schedule-item-title">{event.title}</div>
                      <div className="schedule-item-category">{CATEGORY_LABEL[event.category]}</div>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        className="schedule-edit-btn"
                        onClick={() => openEditModal(event)}
                        title="수정"
                      >
                        <Pencil width={14} height={14} />
                      </button>
                      <button
                        className="schedule-delete-btn"
                        onClick={() => void handleDeleteSchedule(event.id)}
                        title="삭제"
                      >
                        <Trash2 width={14} height={14} />
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="schedule-empty">일정이 없습니다</div>
              )}
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="schedule-section">
            <div className="schedule-section-header">
              <span className="schedule-section-title">다가오는 일정</span>
              <span className="schedule-section-count">{upcomingEvents.length}개</span>
            </div>
            <div className="schedule-list">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    className="schedule-item"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="schedule-item-time">{formatTimeLocal(event.start)}</span>
                    <div className="schedule-item-content">
                      <div className="schedule-item-title">{event.title}</div>
                      <div className="schedule-item-category">{CATEGORY_LABEL[event.category]}</div>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        className="schedule-edit-btn"
                        onClick={() => openEditModal(event)}
                        title="수정"
                      >
                        <Pencil width={14} height={14} />
                      </button>
                      <button
                        className="schedule-delete-btn"
                        onClick={() => void handleDeleteSchedule(event.id)}
                        title="삭제"
                      >
                        <Trash2 width={14} height={14} />
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="schedule-empty">다가오는 일정이 없습니다</div>
              )}
            </div>
          </div>

          {/* AI Section */}
          <div className="ai-section">
            <div className="ai-section-header">
              <div className="ai-icon"><Sparkles size={14} /></div>
              <span className="ai-section-title">AI 분석</span>
            </div>
            
            {aiError && <div className="alert alert-error">{aiError}</div>}

            {aiLoading && (
              <div className="ai-loading">
                <Loader2 size={16} className="ai-loading-spinner" />
                <span>분석 중...</span>
              </div>
            )}

            <div className="ai-suggestions">
              <button
                className="ai-suggestion"
                onClick={() => void handleSummarize()}
                disabled={aiLoading}
              >
                <span className="ai-suggestion-icon"><BarChart3 size={14} /></span>
                <span>일정 요약</span>
              </button>
              <button
                className="ai-suggestion"
                onClick={() => void handlePredict()}
                disabled={aiLoading}
              >
                <span className="ai-suggestion-icon"><TrendingUp size={14} /></span>
                <span>바쁜 날 예측</span>
              </button>
              <button
                className="ai-suggestion"
                onClick={() => void handleFreeDays()}
                disabled={aiLoading}
              >
                <span className="ai-suggestion-icon"><Calendar size={14} /></span>
                <span>빈 날짜 찾기</span>
              </button>
            </div>

            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field-label">예측 기간 (개월)</label>
              <input
                className="field-input"
                type="number"
                min="1"
                max="12"
                value={predictMonths}
                onChange={(e) => setPredictMonths(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="field">
                <label className="field-label">시작</label>
                <input
                  className="field-input"
                  value={freeStart}
                  onChange={(e) => setFreeStart(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">종료</label>
                <input
                  className="field-input"
                  value={freeEnd}
                  onChange={(e) => setFreeEnd(e.target.value)}
                />
              </div>
            </div>

            {summaryText && (
              <div className="schedule-item" style={{ marginTop: '12px' }}>
                <div className="schedule-item-content">
                  <div className="schedule-item-title">요약</div>
                  <div className="markdown-body"><ReactMarkdown>{summaryText}</ReactMarkdown></div>
                </div>
              </div>
            )}

            {predictDates.length > 0 && (
              <div className="schedule-item" style={{ marginTop: '12px' }}>
                <div className="schedule-item-content">
                  <div className="schedule-item-title">예측 날짜</div>
                  <div className="schedule-item-category">{predictDates.join(', ')}</div>
                </div>
              </div>
            )}

            {freeDays.length > 0 && (
              <div className="schedule-item" style={{ marginTop: '12px' }}>
                <div className="schedule-item-content">
                  <div className="schedule-item-title">빈 날짜</div>
                  <div className="schedule-item-category">{freeDays.join(', ')}</div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
      </div>

      {/* FAB Button */}
      <motion.button
        className="fab"
        onClick={() => openAddModal()}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="fab-icon">+</span>
        <span>일정 추가</span>
      </motion.button>

      {/* Login Modal */}
      <AnimatePresence>
        {!isAuthenticated && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal login-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 className="modal-title">로그인</h2>
              </div>
              <div className="modal-body">
                <div className="login-tabs">
                  <button
                    className={`login-tab ${authMode === 'login' ? 'login-tab--active' : ''}`}
                    onClick={() => setAuthMode('login')}
                  >
                    로그인
                  </button>
                  <button
                    className={`login-tab ${authMode === 'register' ? 'login-tab--active' : ''}`}
                    onClick={() => setAuthMode('register')}
                  >
                    회원가입
                  </button>
                </div>

                {authError && <div className="alert alert-error">{authError}</div>}
                {authMessage && <div className="alert alert-success">{authMessage}</div>}

                <div className="field">
                  <label className="field-label">이메일</label>
                  <input
                    className="field-input"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="field">
                  <label className="field-label">비밀번호</label>
                  <input
                    className="field-input"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {authMode === 'login' && (
                  <div className="field-checkbox">
                    <input
                      type="checkbox"
                      id="remember-me"
                      checked={authRememberMe}
                      onChange={(e) => setAuthRememberMe(e.target.checked)}
                    />
                    <label htmlFor="remember-me" className="field-label">로그인 유지</label>
                  </div>
                )}

                <div className="modal-footer" style={{ border: 'none', padding: '16px 0 0' }}>
                  {authMode === 'login' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => void handleLogin()}
                      disabled={authLoading}
                    >
                      {authLoading ? '로그인 중...' : '로그인'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => void handleRegister()}
                      disabled={authLoading}
                    >
                      {authLoading ? '가입 중...' : '회원가입'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              className="modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 className="modal-title">일정 추가</h2>
                <button className="modal-close" onClick={() => setModalOpen(false)}>
                  <X width={16} height={16} />
                </button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label className="field-label">제목</label>
                  <input
                    className="field-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="일정 제목"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="field-label">시작</label>
                    <input
                      className="field-input"
                      type="datetime-local"
                      value={startLocal}
                      onChange={(e) => setStartLocal(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">종료</label>
                    <input
                      className="field-input"
                      type="datetime-local"
                      value={endLocal}
                      onChange={(e) => setEndLocal(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field-label">분류</label>
                  <select
                    className="field-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ScheduleCategory)}
                  >
                    <option value="appointment">약속</option>
                    <option value="competition">대회</option>
                    <option value="schedule">스케줄</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">메모</label>
                  <textarea
                    className="field-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="일정 메모 (선택사항)"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  취소
                </button>
                <button className="btn btn-primary" onClick={() => void handleCreateSchedule()}>
                  저장
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Schedule Modal */}
      <AnimatePresence>
        {editModalOpen && editingSchedule && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditModalOpen(false)}
          >
            <motion.div
              className="modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 className="modal-title">일정 수정</h2>
                <button className="modal-close" onClick={() => setEditModalOpen(false)}>
                  <X width={16} height={16} />
                </button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label className="field-label">제목</label>
                  <input
                    className="field-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="일정 제목"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="field-label">시작</label>
                    <input
                      className="field-input"
                      type="datetime-local"
                      value={startLocal}
                      onChange={(e) => setStartLocal(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">종료</label>
                    <input
                      className="field-input"
                      type="datetime-local"
                      value={endLocal}
                      onChange={(e) => setEndLocal(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field-label">분류</label>
                  <select
                    className="field-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ScheduleCategory)}
                  >
                    <option value="appointment">약속</option>
                    <option value="competition">대회</option>
                    <option value="schedule">스케줄</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field-label">메모</label>
                  <textarea
                    className="field-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="일정 메모 (선택사항)"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditModalOpen(false)}>
                  취소
                </button>
                <button className="btn btn-primary" onClick={() => void handleUpdateSchedule()}>
                  저장
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Integration Modal */}
      <AnimatePresence>
        {integrationModalOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIntegrationModalOpen(false)}
          >
            <motion.div
              className="modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '560px' }}
            >
              <div className="modal-header">
                <h2 className="modal-title">연동 관리</h2>
                <button className="modal-close" onClick={() => setIntegrationModalOpen(false)}>
                  <X width={16} height={16} />
                </button>
              </div>
              <div className="modal-body">
                {/* Google Calendar */}
                <div className="schedule-section" style={{ marginBottom: '16px' }}>
                  <div className="schedule-section-header">
                    <span className="schedule-section-title">Google 캘린더</span>
                  </div>
                  {googleError && <div className="alert alert-error">{googleError}</div>}
                  <a className="btn btn-primary" href="/google/login" style={{ marginBottom: '12px', textDecoration: 'none' }}>
                    Google 계정 연결
                  </a>
                  <div className="field">
                    <label className="field-label">캘린더 ID</label>
                    <input
                      className="field-input"
                      value={googleCalendarId}
                      onChange={(e) => setGoogleCalendarId(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="field">
                      <label className="field-label">시작 날짜</label>
                      <input
                        className="field-input"
                        value={googleTimeMin}
                        onChange={(e) => setGoogleTimeMin(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">종료 날짜</label>
                      <input
                        className="field-input"
                        value={googleTimeMax}
                        onChange={(e) => setGoogleTimeMax(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void handleGoogleFetch()}
                    disabled={googleLoading}
                  >
                    {googleLoading ? '불러오는 중...' : '일정 불러오기'}
                  </button>
                  {googleEvents.length > 0 && (
                    <div className="schedule-list" style={{ marginTop: '12px' }}>
                      {googleEvents.slice(0, 5).map((event, index) => (
                        <div key={`${event.summary ?? 'event'}-${index}`} className="schedule-item">
                          <div className="schedule-item-content">
                            <div className="schedule-item-title">{event.summary ?? '(no title)'}</div>
                            <div className="schedule-item-category">{event.start ?? '-'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Microsoft 365 */}
                <div className="schedule-section">
                  <div className="schedule-section-header">
                    <span className="schedule-section-title">Microsoft 365</span>
                  </div>
                  {msError && <div className="alert alert-error">{msError}</div>}
                  <a className="btn btn-primary" href="/microsoft/login" style={{ marginBottom: '12px', textDecoration: 'none' }}>
                    Microsoft 계정 연결
                  </a>
                  <div className="field">
                    <label className="field-label">캘린더 ID</label>
                    <input
                      className="field-input"
                      value={msCalendarId}
                      onChange={(e) => setMsCalendarId(e.target.value)}
                      placeholder="(비우면 기본 캘린더)"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="field">
                      <label className="field-label">시작 날짜</label>
                      <input
                        className="field-input"
                        value={msTimeMin}
                        onChange={(e) => setMsTimeMin(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">종료 날짜</label>
                      <input
                        className="field-input"
                        value={msTimeMax}
                        onChange={(e) => setMsTimeMax(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void handleMicrosoftFetch()}
                    disabled={msLoading}
                  >
                    {msLoading ? '불러오는 중...' : '일정 불러오기'}
                  </button>
                  {msEvents.length > 0 && (
                    <div className="schedule-list" style={{ marginTop: '12px' }}>
                      {msEvents.slice(0, 5).map((event, index) => (
                        <div key={`${event.summary ?? 'ms'}-${index}`} className="schedule-item">
                          <div className="schedule-item-content">
                            <div className="schedule-item-title">{event.summary ?? '(no title)'}</div>
                            <div className="schedule-item-category">{event.start ?? '-'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
