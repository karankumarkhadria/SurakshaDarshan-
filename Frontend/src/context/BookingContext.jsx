import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react'
import { ML_API_URL, WEATHER_API_KEY } from '../config/api'

const BookingContext = createContext(null)

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WEATHER_FALLBACK = { temperature: 28, precipitation: 0 }
const DEFAULT_WEATHER_LOCATION = { lat: 21.233, lon: 72.867, label: 'Surat, Gujarat' }

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const festivalKeywords = [
  { value: 'Diwali', label: 'Diwali', keywords: ['diwali', 'deepavali'] },
  { value: 'Holi', label: 'Holi', keywords: ['holi'] },
  { value: 'Janmashtami', label: 'Janmashtami', keywords: ['janmashtami'] },
  { value: 'Makar Sankranti', label: 'Makar Sankranti', keywords: ['makar sankranti', 'makara sankranti', 'pongal'] },
  { value: 'MahaShivratri', label: 'Maha Shivaratri', keywords: ['maha shivaratri', 'maha shivratri', 'shivaratri'] },
  { value: 'Navratri', label: 'Navratri', keywords: ['navratri', 'navaratri', 'maha navami'] },
]

const publicHolidayKeywords = [
  'Independence Day',
  'Gandhi Jayanti',
  'Republic Day',
]

const calendarCache = new Map()

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function parseDateParts(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return { year, month, day }
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
}

function dateStringToUtcMs(dateString) {
  const { year, month, day } = parseDateParts(dateString)
  return Date.UTC(year, month - 1, day)
}

function getDaysAhead(visitDate) {
  const today = formatDateKey(new Date())
  return Math.round((dateStringToUtcMs(visitDate) - dateStringToUtcMs(today)) / MS_PER_DAY)
}

async function loadCalendarData(year) {
  if (calendarCache.has(year)) {
    return calendarCache.get(year)
  }

  const response = await fetch(`https://jayantur13.github.io/calendar-bharat/calendar/${year}.json`)

  if (!response.ok) {
    throw new Error('Calendar data not available')
  }

  const data = await response.json()
  calendarCache.set(year, data)
  return data
}

function matchFestival(eventName) {
  const lowerEventName = eventName.toLowerCase()
  const match = festivalKeywords.find((festival) =>
    festival.keywords.some((keyword) => lowerEventName.includes(keyword))
  )

  return match || null
}

function isPublicHoliday(eventName, eventType) {
  const lowerEventName = eventName.toLowerCase()
  const hasHolidayName = publicHolidayKeywords.some((holiday) =>
    lowerEventName.includes(holiday.toLowerCase())
  )

  return hasHolidayName || eventType.toLowerCase().includes('government holiday')
}

function getCalendarEntry(calendarData, visitDate) {
  const { year, month, day } = parseDateParts(visitDate)
  const monthName = monthNames[month - 1]
  const monthData = calendarData?.[String(year)]?.[`${monthName} ${year}`]

  if (!monthData) {
    return null
  }

  const datePrefix = `${monthName} ${day}, ${year},`
  const found = Object.entries(monthData).find(([dateKey]) => dateKey.startsWith(datePrefix))

  return found ? found[1] : null
}

function getWeatherLocationForTemple(temple) {
  if (temple?.weather?.lat && temple?.weather?.lon) {
    return {
      query: `${temple.weather.lat},${temple.weather.lon}`,
      label: temple.city || temple.name,
    }
  }

  if (temple?.city) {
    return {
      query: `${temple.city}, India`,
      label: temple.city,
    }
  }

  return {
    query: `${DEFAULT_WEATHER_LOCATION.lat},${DEFAULT_WEATHER_LOCATION.lon}`,
    label: DEFAULT_WEATHER_LOCATION.label,
  }
}

function getDayOfWeek(dateString) {
  const { year, month, day } = parseDateParts(dateString)
  const date = new Date(year, month - 1, day)
  const dayIndex = date.getDay() 
  return dayIndex === 0 ? 6 : dayIndex - 1
}

function isWeekend(dateString) {
  const dayOfWeek = getDayOfWeek(dateString)
  return dayOfWeek === 5 || dayOfWeek === 6 ? 1 : 0
}

const buildInitialBooking = () => ({
  temple: null,
  searchQuery: '',
  visitDate: '',
  visitSlot: '',
  phone: '',
  email: '',
  total: 1,
  elders: 0,
  differentlyAbled: 0,
  notes: '',
  isReturningVisitor: false,
  otpVerified: false,
  isAuthenticated: false,
  authChecked: false,
  pendingPath: '',
  currentBooking: null,
  currentBookings: [],
  pastBookings: [],
  cancelledBookings: [],
  visitors: {
    name: '',
    phone: '',
    email: '',
    total: 1,
    elders: 0,
    differentlyAbled: 0,
    notes: '',
  },
  
  temperature: null,
  precipitation: null,
  weatherLocation: '',
  weatherSource: '',
  festival: "None",
  festivalDisplayName: "None",
  calendarEvent: null,
  calendarEventType: null,
  publicHoliday: 0,
 
  predictedVisitors: null,
  predictionLoading: false,
  predictionError: null,
  predictionDetails: null,
})

export const BookingProvider = ({ children }) => {
  const [booking, setBooking] = useState(buildInitialBooking)
  const [language, setLanguage] = useState('en')

  const updateBooking = useCallback((partial) => {
    setBooking((prev) => ({
      ...prev,
      ...partial,
      visitors: {
        ...prev.visitors,
        ...(partial.visitors ?? {}),
      },
    }))
  }, [])

  const resetBooking = useCallback(() => {
    setBooking((prev) => {
      const nextBooking = buildInitialBooking()

      return {
        ...nextBooking,
        isAuthenticated: prev.isAuthenticated,
        authChecked: prev.authChecked,
        visitors: prev.visitors,
        currentBooking: prev.currentBooking,
        currentBookings: prev.currentBookings,
        pastBookings: prev.pastBookings,
        cancelledBookings: prev.cancelledBookings,
      }
    })
  }, [])

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await fetch('/api/v1/users/me', {
          credentials: 'include',
        })

        if (!response.ok) {
          setBooking((prev) => ({
            ...prev,
            isAuthenticated: false,
            authChecked: true,
          }))
          return
        }

        const result = await response.json()
        const user = result?.data?.user

        setBooking((prev) => ({
          ...prev,
          isAuthenticated: true,
          authChecked: true,
          visitors: {
            ...prev.visitors,
            name: user ? `${user.firstname || ''} ${user.lastname || ''}`.trim() : prev.visitors.name,
            phone: user?.phoneno || prev.visitors.phone,
          },
        }))
      } catch (error) {
        setBooking((prev) => ({
          ...prev,
          isAuthenticated: false,
          authChecked: true,
        }))
      }
    }

    restoreSession()
  }, [])

  const fetchWeatherData = useCallback(async (visitDate) => {
    const apiKey = WEATHER_API_KEY
    const location = getWeatherLocationForTemple(booking.temple)

    try {
      if (!apiKey) {
        return {
          ...WEATHER_FALLBACK,
          weatherLocation: location.label,
          weatherSource: 'fallback',
        }
      }

      const daysAhead = getDaysAhead(visitDate)

      if (daysAhead < 0) {
        return {
          temperature: null,
          precipitation: null,
          weatherLocation: location.label,
          weatherSource: 'unavailable',
          error: 'Weather forecast is only available for today or future dates',
        }
      }

      if (daysAhead > 365) {
        return {
          temperature: null,
          precipitation: null,
          weatherLocation: location.label,
          weatherSource: 'unavailable',
          error: 'WeatherAPI future forecast is available only up to 365 days ahead',
        }
      }

      let endpoint
      const params = new URLSearchParams({
        key: apiKey,
        q: location.query,
        dt: visitDate,
        aqi: 'no',
      })

      if (daysAhead <= 14) {
        endpoint = 'forecast.json'
        params.set('days', String(Math.max(1, Math.min(daysAhead + 1, 14))))
      } else {
        endpoint = 'future.json'
      }
      
      const url = `https://api.weatherapi.com/v1/${endpoint}?${params.toString()}`
      
      const res = await fetch(url)
      if (!res.ok) {
        const errorText = await res.text()
        let errorMessage = 'Weather data not available'

        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson?.error?.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }

        return {
          temperature: null,
          precipitation: null,
          weatherLocation: location.label,
          weatherSource: endpoint,
          error: errorMessage,
        }
      }

      const data = await res.json()
      
      const fd0 = data?.forecast?.forecastday?.[0]
      if (!fd0) {
        return {
          temperature: null,
          precipitation: null,
          weatherLocation: location.label,
          weatherSource: endpoint,
          error: 'Weather API returned no forecast for the selected date',
        }
      }
  
      const temp = fd0.day?.avgtemp_c
      const precipitation = fd0.day?.totalprecip_mm
      return {
        temperature: temp,
        precipitation,
        weatherLocation: location.label,
        weatherSource: endpoint,
      }
      
    } catch (err) {
      return {
        temperature: null,
        precipitation: null,
        weatherLocation: location.label,
        weatherSource: 'unavailable',
        error: 'Unable to connect to WeatherAPI',
      }
    }
  }, [booking.temple])

  const fetchFestivalData = useCallback(async (visitDate) => {
    try {
      const { year } = parseDateParts(visitDate)
      const data = await loadCalendarData(year)
      const eventData = getCalendarEntry(data, visitDate)

      if (!eventData) {
        return {
          festival: 'None',
          festivalDisplayName: 'None',
          calendarEvent: null,
          calendarEventType: null,
          publicHoliday: 0,
        }
      }

      const fetchedEvent = eventData?.event || ''
      const fetchedEventType = eventData?.type || ''
      const matchedFestival = matchFestival(fetchedEvent)
      const publicHoliday = isPublicHoliday(fetchedEvent, fetchedEventType) ? 1 : 0

      if (matchedFestival) {
        return {
          festival: matchedFestival.value,
          festivalDisplayName: matchedFestival.label,
          calendarEvent: fetchedEvent,
          calendarEventType: fetchedEventType,
          publicHoliday,
        }
      }

      return {
        festival: 'None',
        festivalDisplayName: 'None',
        calendarEvent: publicHoliday ? fetchedEvent : null,
        calendarEventType: publicHoliday ? fetchedEventType : null,
        publicHoliday,
      }
      
    } catch (err) {
      return {
        festival: 'None',
        festivalDisplayName: 'None',
        calendarEvent: null,
        calendarEventType: null,
        publicHoliday: 0,
      }
    }
  }, [])

  const fetchPrediction = useCallback(async (visitDate, temperature, precipitation, festival, publicHoliday) => {
    // console.log("Calling ML API")
    
    try {
      const dayOfWeek = getDayOfWeek(visitDate)
      const isWeekendFlag = isWeekend(visitDate)
      const festivalFlag = festival !== "None" ? 1 : 0
      
      const payload = {
        date: visitDate,
        temperature: temperature,
        precipitation: precipitation,
        festival: festival,
        temple_name: booking.temple?.name || 'Ambaji',
        day_of_week: dayOfWeek,
        is_weekend: isWeekendFlag,
        festival_flag: festivalFlag,
        public_holiday: publicHoliday
      }
      
      const response = await fetch(`${ML_API_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        return { 
          success: false, 
          error: error.error || 'Prediction failed' 
        }
      }

      const result = await response.json()
      
      return {
        success: true,
        predictedVisitors: Math.floor(1.1 * result.predicted_visitors),
        details: result
      }

    } catch (err) {
      return {
        success: false,
        error: 'Unable to connect to prediction service'
      }
    }
  }, [booking.temple?.name])

  useEffect(() => {
    if (!booking.visitDate) return

    const fetchAllData = async () => {
      setBooking(prev => ({
        ...prev,
        predictionLoading: true,
        predictionError: null
      }))
      
      const [weatherData, festivalData] = await Promise.all([
        fetchWeatherData(booking.visitDate),
        fetchFestivalData(booking.visitDate)
      ])
      
      // console.log("Weather:", weatherData.temperature, "°C,", weatherData.precipitation, "mm")
      // console.log("Festival:", festivalData.festival, ", Public Holiday:", festivalData.publicHoliday)
      
      setBooking(prev => ({
        ...prev,
        temperature: weatherData.temperature,
        precipitation: weatherData.precipitation,
        weatherLocation: weatherData.weatherLocation,
        weatherSource: weatherData.weatherSource,
        festival: festivalData.festival,
        festivalDisplayName: festivalData.festivalDisplayName,
        calendarEvent: festivalData.calendarEvent,
        calendarEventType: festivalData.calendarEventType,
        publicHoliday: festivalData.publicHoliday
      }))
      
      if (weatherData.temperature !== null && weatherData.precipitation !== null) {
        const predictionResult = await fetchPrediction(
          booking.visitDate,
          weatherData.temperature,
          weatherData.precipitation,
          festivalData.festival,
          festivalData.publicHoliday
        )
        
        if (predictionResult.success) {
          setBooking(prev => ({
            ...prev,
            predictedVisitors: predictionResult.predictedVisitors,
            predictionDetails: predictionResult.details,
            predictionLoading: false,
            predictionError: null
          }))
        } else {
          setBooking(prev => ({
            ...prev,
            predictedVisitors: null,
            predictionDetails: null,
            predictionLoading: false,
            predictionError: predictionResult.error
          }))
        }
      } else {
        setBooking(prev => ({
          ...prev,
          predictedVisitors: null,
          predictionLoading: false,
          predictionError: weatherData.error || 'Weather data not available'
        }))
      }
    }

    fetchAllData()
  }, [booking.visitDate, fetchWeatherData, fetchFestivalData, fetchPrediction])

  const value = useMemo(
    () => ({
      booking,
      updateBooking,
      resetBooking,
      language,
      setLanguage,
    }),
    [booking, updateBooking, resetBooking, language],
  )

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  )
}

export const useBooking = () => {
  const ctx = useContext(BookingContext)
  if (!ctx) {
    throw new Error('useBooking must be used inside BookingProvider')
  }
  return ctx
}
