import { useCallback, useEffect, useMemo, useState } from 'react'
import heroImg from './assets/hero.png'
import './App.css'
import {
  createSchedule,
  fetchGoogleEvents,
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
  type Schedule,
  type ScheduleCategory,
  type UserProfile,
} from './lib/api'

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

function formatTimeLocal(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(11, 16)
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function scheduleLabel(category: ScheduleCategory) {
  if (category === 'appointment') return '약속'
  if (category === 'competition') return '대회'
  return '스케줄'
}

function App() {
  const today = new Date()

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(formatDateISO(today))

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startLocal, setStartLocal] = useState(formatLocalDateTimeInput(formatDateISO(today), '09:00'))
  const [endLocal, setEndLocal] = useState(formatLocalDateTimeInput(formatDateISO(today), '10:00'))
  const [category, setCategory] = useState<ScheduleCategory>('appointment')

  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authRememberMe, setAuthRememberMe] = useState(false)
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [summaryText, setSummaryText] = useState('')
  const [predictMonths, setPredictMonths] = useState(3)
  const [predictDates, setPredictDates] = useState<string[]>([])
  const [freeStart, setFreeStart] = useState(formatDateISO(today))
  const [freeEnd, setFreeEnd] = useState(formatDateISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)))
  const [freeDays, setFreeDays] = useState<string[]>([])
  const [aiError, setAiError] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const [googleCalendarId, setGoogleCalendarId] = useState('primary')
  const [googleTimeMin, setGoogleTimeMin] = useState(formatLocalDateTimeInput(formatDateISO(today), '00:00'))
  const [googleTimeMax, setGoogleTimeMax] = useState(formatLocalDateTimeInput(formatDateISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)), '23:59'))
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [googleError, setGoogleError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const isAuthenticated = Boolean(authProfile)

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((year) => year - 1)
    } else {
      setViewMonth((month) => month - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((year) => year + 1)
    } else {
      setViewMonth((month) => month + 1)
    }
  }

  const refreshSchedules = useCallback(async () => {
    try {
      setScheduleLoading(true)
      const data = await loadSchedules()
      setSchedules(data)
      setScheduleError('')
    } catch (error) {
      setScheduleError(getErrorMessage(error))
    } finally {
      setScheduleLoading(false)
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

  function openAddModal(dateIso = selectedDate) {
    setSelectedDate(dateIso)
    setTitle('')
    setDescription('')
    setStartLocal(formatLocalDateTimeInput(dateIso, '09:00'))
    setEndLocal(formatLocalDateTimeInput(dateIso, '10:00'))
    setCategory('appointment')
    setModalOpen(true)
  }

  async function handleCreateSchedule() {
    if (!startLocal || !endLocal) return
    if (new Date(endLocal) <= new Date(startLocal)) {
      setScheduleError('종료 시간은 시작 시간보다 이후여야 합니다.')
      return
    }

    try {
      setScheduleLoading(true)
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
    } finally {
      setScheduleLoading(false)
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
      await logoutUser()
    } finally {
      setAuthProfile(null)
      setAuthMessage('로그아웃했습니다.')
    }
  }

  async function handleSummarize() {
    try {
      setAiLoading(true)
      setAiError('')
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

  const selectedEvents = useMemo(
    () =>
      schedules.filter((event) => {
        const dayStart = new Date(`${selectedDate}T00:00:00`)
        const dayEnd = new Date(`${selectedDate}T23:59:59.999`)
        const start = new Date(event.start)
        const end = new Date(event.end)
        return start <= dayEnd && end >= dayStart
      }),
    [schedules, selectedDate],
  )

  const selectedMonthLabel = formatMonthLabel(viewYear, viewMonth)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src={heroImg} width={44} height={44} alt="logo" />
          <div>
            <h1>Simple Calendar</h1>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="card card--wide">
          <div className="card__header">
            <div>
              <h2>일정</h2>
            </div>
            <div className="toolbar">
              <button className="button button--ghost" onClick={() => void refreshSchedules()}>
                새로고침
              </button>
              <button className="button button--primary" onClick={() => openAddModal()}>
                일정 추가
              </button>
            </div>
          </div>

          {scheduleError && <div className="alert alert--error">{scheduleError}</div>}

          <div className="calendar-toolbar">
            <button className="button button--ghost" onClick={prevMonth}>
              이전
            </button>
            <strong>{selectedMonthLabel}</strong>
            <button className="button button--ghost" onClick={nextMonth}>
              다음
            </button>
          </div>

          <div className="calendar">
            <div className="calendar__weekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar__grid">
              {monthGrid.map((week, weekIndex) =>
                week.map((cell, cellIndex) => {
                  const dayEvents = cell.iso ? schedules.filter((event) => {
                    const start = new Date(event.start)
                    const end = new Date(event.end)
                    const dayStart = new Date(`${cell.iso}T00:00:00`)
                    const dayEnd = new Date(`${cell.iso}T23:59:59.999`)
                    return start <= dayEnd && end >= dayStart
                  }) : []
                  const selected = cell.iso === selectedDate

                  return (
                    <button
                      key={`${weekIndex}-${cellIndex}`}
                      type="button"
                      className={`day ${selected ? 'day--selected' : ''}`}
                      onClick={() => cell.iso && setSelectedDate(cell.iso)}
                    >
                      <div className="day__top">
                        <span>{cell.day ?? ''}</span>
                        {cell.iso && (
                          <span className="day__add" onClick={(event) => { event.stopPropagation(); openAddModal(cell.iso); }}>
                            + add
                          </span>
                        )}
                      </div>
                      <div className="day__events">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div key={event.id} className="event-chip">
                            <strong>{formatTimeLocal(event.start)}</strong>
                            <span>{event.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && <div className="day__more">+{dayEvents.length - 2} more</div>}
                      </div>
                    </button>
                  )
                }),
              )}
            </div>
          </div>

          <div className="details-grid">
            <div className="panel">
              <h3>{selectedDate}</h3>
              <p>{selectedEvents.length ? `${selectedEvents.length}개 일정` : '일정 없음'}</p>
              <div className="stack">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="detail-row">
                    <strong>{event.title}</strong>
                    <span>{formatTimeLocal(event.start)} - {formatTimeLocal(event.end)} · {scheduleLabel(event.category)}</span>
                    {event.description && <p>{event.description}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <h3>{scheduleLoading ? '불러오는 중...' : '내 일정'}</h3>
              <div className="stack">
                {schedules.slice(0, 6).map((event) => (
                  <div key={event.id} className="detail-row detail-row--compact">
                    <strong>{event.title}</strong>
                    <span>{formatTimeLocal(event.start)} · {scheduleLabel(event.category)}</span>
                  </div>
                ))}
                {!schedules.length && <p>등록된 일정이 없습니다.</p>}
              </div>
            </div>
          </div>
        </section>

        <aside className="sidebar">
          <section className="card">
            <div className="card__header">
              <div>
                <h2>계정</h2>
              </div>
            </div>

            {authError && <div className="alert alert--error">{authError}</div>}
            {authMessage && <div className="alert alert--success">{authMessage}</div>}

            {isAuthenticated ? (
              <div className="stack">
                <div className="detail-row">
                  <strong>{authProfile?.email}</strong>
                </div>
                <div className="toolbar">
                  <button className="button button--danger" onClick={() => void handleLogout()}>
                    로그아웃
                  </button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <p>로그인이 필요합니다.</p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2>Google 캘린더</h2>
              </div>
            </div>

            {googleError && <div className="alert alert--error">{googleError}</div>}

            <div className="stack">
              <a className="button button--primary button--link" href="/google/login">
                Google 계정 연결
              </a>
              <label className="field">
                <span>캘린더</span>
                <input value={googleCalendarId} onChange={(event) => setGoogleCalendarId(event.target.value)} />
              </label>
              <label className="field">
                <span>시작 날짜</span>
                <input value={googleTimeMin} onChange={(event) => setGoogleTimeMin(event.target.value)} />
              </label>
              <label className="field">
                <span>종료 날짜</span>
                <input value={googleTimeMax} onChange={(event) => setGoogleTimeMax(event.target.value)} />
              </label>
              <button className="button button--ghost" onClick={() => void handleGoogleFetch()} disabled={googleLoading}>
                일정 불러오기
              </button>
              <div className="stack">
                {googleEvents.slice(0, 5).map((event, index) => (
                  <div key={`${event.summary ?? 'event'}-${index}`} className="detail-row detail-row--compact">
                    <strong>{event.summary ?? '(no title)'}</strong>
                    <span>{event.start ?? '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2>AI 분석</h2>
              </div>
            </div>

            {aiError && <div className="alert alert--error">{aiError}</div>}

            <div className="stack">
              <div className="toolbar">
                <button className="button button--ghost" onClick={() => void handleSummarize()} disabled={aiLoading}>
                  일정 요약
                </button>
                <button className="button button--ghost" onClick={() => void handlePredict()} disabled={aiLoading}>
                  바쁜 날 예측
                </button>
              </div>
              <label className="field">
                <span>예측 기간 (개월)</span>
                <input type="number" min="1" max="12" value={predictMonths} onChange={(event) => setPredictMonths(Number(event.target.value))} />
              </label>
              <button className="button button--primary" onClick={() => void handleFreeDays()} disabled={aiLoading}>
                빈 날짜 찾기
              </button>
              <label className="field">
                <span>시작 날짜</span>
                <input value={freeStart} onChange={(event) => setFreeStart(event.target.value)} />
              </label>
              <label className="field">
                <span>종료 날짜</span>
                <input value={freeEnd} onChange={(event) => setFreeEnd(event.target.value)} />
              </label>
              {summaryText && (
                <div className="panel panel--soft">
                  <h3>요약</h3>
                  <p>{summaryText}</p>
                </div>
              )}
              {predictDates.length > 0 && (
                <div className="panel panel--soft">
                  <h3>예측 날짜</h3>
                  <p>{predictDates.join(', ')}</p>
                </div>
              )}
              {freeDays.length > 0 && (
                <div className="panel panel--soft">
                  <h3>빈 날짜</h3>
                  <p>{freeDays.join(', ')}</p>
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>

      {!isAuthenticated && (
        <div className="modal-backdrop modal-backdrop--login">
          <div className="modal modal--login" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="card__header">
              <div>
                <h2 id="login-title">로그인</h2>
              </div>
            </div>

            {authError && <div className="alert alert--error">{authError}</div>}
            {authMessage && <div className="alert alert--success">{authMessage}</div>}

            <div className="stack">
              <label className="field">
                <span>Email</span>
                <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} type="email" />
              </label>
              <label className="field">
                <span>Password</span>
                <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" />
              </label>
              <label className="field field--inline">
                <input
                  type="checkbox"
                  checked={authRememberMe}
                  onChange={(event) => setAuthRememberMe(event.target.checked)}
                />
                <span>로그인 유지</span>
              </label>
              <div className="toolbar toolbar--end">
                <button className="button button--ghost" onClick={() => void handleRegister()} disabled={authLoading}>
                  회원가입
                </button>
                <button className="button button--primary" onClick={() => void handleLogin()} disabled={authLoading}>
                  로그인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="card__header">
              <div>
                <h2>일정 추가</h2>
              </div>
            </div>
            <div className="stack">
              <label className="field">
                <span>시작</span>
                <input type="datetime-local" value={startLocal} onChange={(event) => setStartLocal(event.target.value)} />
              </label>
              <label className="field">
                <span>종료</span>
                <input type="datetime-local" value={endLocal} onChange={(event) => setEndLocal(event.target.value)} />
              </label>
              <label className="field">
                <span>제목</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span>분류</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as ScheduleCategory)}>
                  <option value="appointment">약속</option>
                  <option value="competition">대회</option>
                  <option value="schedule">스케줄</option>
                </select>
              </label>
              <label className="field">
                <span>메모</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
              </label>
              <div className="toolbar toolbar--end">
                <button className="button button--ghost" onClick={() => setModalOpen(false)}>
                  취소
                </button>
                <button className="button button--primary" onClick={() => void handleCreateSchedule()}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
