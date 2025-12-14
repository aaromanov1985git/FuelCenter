import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Card, Button, Input, Table, Modal, Badge, Skeleton, Tooltip } from './ui'
import ConfirmModal from './ConfirmModal'
import StatusBadge from './StatusBadge'
import IconButton from './IconButton'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './OrganizationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const OrganizationsList = () => {
  const { user: currentUser } = useAuth()
  const { success, error: showError, info } = useToast()

  const [organizations, setOrganizations] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingOrg, setEditingOrg] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, orgId: null })
  const [assignModal, setAssignModal] = useState({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })
  const [sameAsLegalAddress, setSameAsLegalAddress] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    contacts: false,
    bankDetails: false
  })
  
  // Refs для debounce таймеров
  const debounceTimersRef = useRef({})

  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50)

  // Функция транслитерации русского текста в латиницу
  const transliterate = (text) => {
    if (!text) return ''
    
    const translitMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
      'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
      'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
      'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
      'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    }
    
    return text
      .split('')
      .map(char => translitMap[char] || char)
      .join('')
      .replace(/[^a-zA-Z0-9_-]/g, '-') // Заменяем все не-латинские символы на дефис
      .replace(/-+/g, '-') // Убираем множественные дефисы
      .replace(/^-|-$/g, '') // Убираем дефисы в начале и конце
      .toUpperCase()
      .substring(0, 50) // Ограничиваем длину
  }

  // Обработчик изменения названия с автогенерацией кода
  const handleNameChange = (e) => {
    handleChange(e)
    // Автогенерируем код только при создании новой организации и если код пустой
    if (!editingOrg && !newOrg.code) {
      const generatedCode = transliterate(e.target.value)
      if (generatedCode) {
        setValues(prev => ({
          ...prev,
          name: e.target.value,
          code: generatedCode
        }))
      }
    }
  }

  // Функции форматирования с пробелами
  const formatINN = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 10) {
      // Форматируем с пробелами: 1234 5678 90
      return digits.match(/.{1,4}/g)?.join(' ') || digits
    }
    return digits.slice(0, 10).match(/.{1,4}/g)?.join(' ') || digits.slice(0, 10)
  }

  const formatKPP = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 9) {
      // Форматируем с пробелами: 1234 56789
      return digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`
    }
    const limited = digits.slice(0, 9)
    return `${limited.slice(0, 4)} ${limited.slice(4)}`
  }

  const formatOGRN = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 13) {
      // Форматируем с пробелами: 12 34 56 78 90 123
      return digits.match(/.{1,2}/g)?.join(' ') || digits
    }
    return digits.slice(0, 13).match(/.{1,2}/g)?.join(' ') || digits.slice(0, 13)
  }

  const formatBIK = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 9) {
      // Форматируем с пробелами: 044 525 225
      return digits.length <= 3 ? digits : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    }
    const limited = digits.slice(0, 9)
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`
  }

  const formatAccount = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 20) {
      // Форматируем с пробелами: 4070 2810 1000 0000 0000
      return digits.match(/.{1,4}/g)?.join(' ') || digits
    }
    return digits.slice(0, 20).match(/.{1,4}/g)?.join(' ') || digits.slice(0, 20)
  }

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits[0] === '8') {
      const cleaned = '7' + digits.slice(1)
      return formatPhoneNumber(cleaned)
    }
    if (digits[0] !== '7' && digits.length > 0) {
      return '+7' + digits
    }
    return formatPhoneNumber(digits)
  }

  const formatPhoneNumber = (digits) => {
    if (digits.length === 0) return ''
    if (digits.length <= 1) return `+${digits}`
    if (digits.length <= 4) return `+${digits.slice(0, 1)} (${digits.slice(1)}`
    if (digits.length <= 7) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4)}`
    if (digits.length <= 9) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }

  const validateINN = (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return 'ИНН обязателен для заполнения'
    }
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) {
      return 'ИНН обязателен для заполнения'
    }
    if (digits.length !== 10 && digits.length !== 12) {
      return 'ИНН должен содержать 10 (юр. лицо) или 12 (ИП) цифр'
    }
    // Проверка контрольной суммы для 10-значного ИНН
    if (digits.length === 10) {
      const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8]
      let sum = 0
      for (let i = 0; i < 9; i++) {
        sum += parseInt(digits[i], 10) * weights[i]
      }
      const checkDigit = sum % 11
      const expectedCheck = checkDigit < 10 ? checkDigit : 0
      const actualCheck = parseInt(digits[9], 10)
      if (actualCheck !== expectedCheck) {
        // Не блокируем форму из-за контрольной суммы, так как некоторые ИНН могут иметь особенности
        // Но можно вернуть ошибку для строгой валидации: return 'Неверная контрольная сумма ИНН'
        // Пока разрешаем, чтобы не блокировать работу
      }
    }
    // Проверка контрольной суммы для 12-значного ИНН
    if (digits.length === 12) {
      // Первая контрольная сумма
      const weights1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
      let sum1 = 0
      for (let i = 0; i < 10; i++) {
        sum1 += parseInt(digits[i], 10) * weights1[i]
      }
      const checkDigit1 = sum1 % 11
      const expectedCheck1 = checkDigit1 < 10 ? checkDigit1 : 0
      const actualCheck1 = parseInt(digits[10], 10)
      
      // Вторая контрольная сумма
      const weights2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
      let sum2 = 0
      for (let i = 0; i < 11; i++) {
        sum2 += parseInt(digits[i], 10) * weights2[i]
      }
      const checkDigit2 = sum2 % 11
      const expectedCheck2 = checkDigit2 < 10 ? checkDigit2 : 0
      const actualCheck2 = parseInt(digits[11], 10)
      
      if (actualCheck1 !== expectedCheck1 || actualCheck2 !== expectedCheck2) {
        // Не блокируем форму из-за контрольной суммы
      }
    }
    return null
  }

  const validateKPP = (value) => {
    if (!value) return null
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 9) {
      return 'КПП должен содержать 9 цифр'
    }
    // Проверка первых 4 цифр (код налогового органа)
    const taxCode = digits.slice(0, 4)
    if (taxCode === '0000') {
      return 'Неверный код налогового органа'
    }
    return null
  }

  const validateBIK = (value) => {
    // БИК необязателен, проверяем только если заполнен
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return null
    }
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 9) {
      return 'БИК должен содержать 9 цифр'
    }
    // Проверка первых 2 цифр (код региона)
    const regionCode = digits.slice(0, 2)
    if (regionCode === '00') {
      return 'Неверный код региона в БИК'
    }
    return null
  }

  const validateAccount = (value, fieldName = 'Счёт') => {
    // Счет необязателен, проверяем только если заполнен
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return null
    }
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 20) {
      return `${fieldName} должен содержать 20 цифр`
    }
    return null
  }

  const validateOGRN = (value) => {
    if (!value) return null
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 13 && digits.length !== 15) {
      return 'ОГРН должен содержать 13 (юр. лицо) или 15 (ИП) цифр'
    }
    return null
  }

  const validateEmail = (value) => {
    if (!value) return null
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      return 'Некорректный формат email'
    }
    return null
  }

  const validateURL = (value) => {
    if (!value) return null
    try {
      const url = value.startsWith('http://') || value.startsWith('https://') 
        ? value 
        : `https://${value}`
      new URL(url)
      return null
    } catch {
      return 'Некорректный формат URL'
    }
  }

  const isAdmin = useMemo(
    () => currentUser && (currentUser.role === 'admin' || currentUser.is_superuser),
    [currentUser]
  )

  const validationRules = {
    name: {
      required: true,
      minLength: 2,
      maxLength: 255,
      message: 'Название должно быть от 2 до 255 символов'
    },
    code: {
      required: true,
      minLength: 2,
      maxLength: 50,
      pattern: /^[A-Z0-9_-]+$/i,
      message: 'Код может содержать только буквы, цифры, дефисы и подчеркивания (2-50 символов)'
    },
    inn: {
      required: true,
      validate: validateINN
    },
    kpp: {
      validate: validateKPP
    },
    ogrn: {
      validate: validateOGRN
    },
    legal_address: {
      required: true,
      minLength: 5,
      message: 'Юридический адрес обязателен (минимум 5 символов)'
    },
    email: {
      validate: validateEmail
    },
    website: {
      validate: validateURL
    },
    phone: {
      pattern: /^\+?7?\s?\(?\d{3}\)?\s?\d{3}[- ]?\d{2}[- ]?\d{2}$/,
      message: 'Некорректный формат телефона'
    },
    contact_phone: {
      pattern: /^\+?7?\s?\(?\d{3}\)?\s?\d{3}[- ]?\d{2}[- ]?\d{2}$/,
      message: 'Некорректный формат телефона'
    },
    bank_name: {
      minLength: 2,
      message: 'Название банка должно быть не менее 2 символов'
    },
    bank_account: {
      validate: (value) => validateAccount(value, 'Расчётный счёт')
    },
    bank_bik: {
      validate: validateBIK
    },
    bank_correspondent_account: {
      validate: (value) => validateAccount(value, 'Корреспондентский счёт')
    }
  }

  const {
    values: newOrg,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate,
    isValid,
    reset,
    setValues,
    setTouched,
    setErrors
  } = useFormValidation(
    { 
      name: '', 
      code: '', 
      description: '', 
      inn: '',
      kpp: '',
      ogrn: '',
      legal_address: '',
      actual_address: '',
      phone: '',
      email: '',
      website: '',
      contact_person: '',
      contact_phone: '',
      bank_name: '',
      bank_account: '',
      bank_bik: '',
      bank_correspondent_account: '',
      is_active: true 
    },
    validationRules
  )

  // Сбрасываем на первую страницу при изменении поиска
  useEffect(() => {
    if (search) {
      setCurrentPage(1)
    }
  }, [search])

  // Загружаем данные при изменении страницы, поиска или статуса админа
  useEffect(() => {
    if (!isAdmin) return
    
    let cancelled = false
    
    const loadData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.append('skip', ((currentPage - 1) * limit).toString())
        params.append('limit', limit.toString())
        if (search.trim()) {
          params.append('search', search.trim())
        }

        const response = await authFetch(`${API_URL}/api/v1/organizations?${params.toString()}`)
        if (cancelled) return
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || 'Не удалось загрузить организации')
        }

        const data = await response.json()
        if (!cancelled) {
          setOrganizations(data.items || [])
          setTotal(data.total || 0)
        }
      } catch (err) {
        if (cancelled) return
        if (err.isUnauthorized) {
          return
        }
        showError(err.message)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()
    
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, currentPage, search])

  // Cleanup debounce таймеров при размонтировании
  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(timer => {
        if (timer) clearTimeout(timer)
      })
      debounceTimersRef.current = {}
    }
  }, [])

  // Функция для загрузки организаций (используется в обработчиках)
  const loadOrganizations = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      if (search.trim()) {
        params.append('search', search.trim())
      }

      const response = await authFetch(`${API_URL}/api/v1/organizations?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось загрузить организации')
      }

      const data = await response.json()
      setOrganizations(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    // Помечаем все обязательные поля как touched для показа ошибок
    const requiredFields = Object.keys(validationRules).filter(key => validationRules[key]?.required)
    const touchedFields = {}
    requiredFields.forEach(field => {
      touchedFields[field] = true
    })
    // Также помечаем поля с ошибками
    Object.keys(errors).forEach(field => {
      touchedFields[field] = true
    })
    setTouched(prev => ({ ...prev, ...touchedFields }))

    if (!validate()) {
      const errorFields = Object.keys(errors).filter(key => errors[key])
      const errorMessages = errorFields.map(key => {
        const fieldLabel = {
          name: 'Название',
          code: 'Код',
          inn: 'ИНН',
          legal_address: 'Юридический адрес'
        }[key] || key
        return `${fieldLabel}: ${errors[key]}`
      }).join('; ')
      showError(`Исправьте ошибки: ${errorMessages}`)
      // Автоскролл к первому полю с ошибкой
      const firstErrorField = errorFields[0]
      if (firstErrorField) {
        const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          errorElement.focus()
        }
      }
      return
    }

    try {
      // Очищаем форматирование перед отправкой (убираем пробелы, скобки)
      const dataToSend = {
        ...newOrg,
        inn: newOrg.inn?.replace(/\D/g, '') || null,
        kpp: newOrg.kpp?.replace(/\D/g, '') || null,
        ogrn: newOrg.ogrn?.replace(/\D/g, '') || null,
        phone: newOrg.phone?.replace(/\D/g, '').replace(/^8/, '7') || null,
        contact_phone: newOrg.contact_phone?.replace(/\D/g, '').replace(/^8/, '7') || null,
        bank_bik: newOrg.bank_bik?.replace(/\D/g, '') || null,
        bank_account: newOrg.bank_account?.replace(/\D/g, '') || null,
        bank_correspondent_account: newOrg.bank_correspondent_account?.replace(/\D/g, '') || null,
        website: newOrg.website && !newOrg.website.startsWith('http') 
          ? `https://${newOrg.website}` 
          : newOrg.website || null
      }

      const response = await authFetch(`${API_URL}/api/v1/organizations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось создать организацию')
      }

      success('✅ Организация успешно создана')
      // Небольшая задержка перед закрытием для показа успешного сообщения
      setTimeout(() => {
        reset()
        setShowModal(false)
        setSameAsLegalAddress(false)
        loadOrganizations()
      }, 500)
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const handleUpdate = async () => {
    // Помечаем все обязательные поля как touched для показа ошибок
    const requiredFields = Object.keys(validationRules).filter(key => validationRules[key]?.required)
    const touchedFields = {}
    requiredFields.forEach(field => {
      touchedFields[field] = true
    })
    // Также помечаем поля с ошибками
    Object.keys(errors).forEach(field => {
      touchedFields[field] = true
    })
    setTouched(prev => ({ ...prev, ...touchedFields }))

    if (!validate()) {
      const errorFields = Object.keys(errors).filter(key => errors[key])
      const errorMessages = errorFields.map(key => {
        const fieldLabel = {
          name: 'Название',
          code: 'Код',
          inn: 'ИНН',
          legal_address: 'Юридический адрес'
        }[key] || key
        return `${fieldLabel}: ${errors[key]}`
      }).join('; ')
      showError(`Исправьте ошибки: ${errorMessages}`)
      // Автоскролл к первому полю с ошибкой
      const firstErrorField = errorFields[0]
      if (firstErrorField) {
        const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          errorElement.focus()
        }
      }
      return
    }

    try {
      // Очищаем форматирование перед отправкой
      const dataToSend = {
        ...newOrg,
        inn: newOrg.inn?.replace(/\D/g, '') || null,
        kpp: newOrg.kpp?.replace(/\D/g, '') || null,
        ogrn: newOrg.ogrn?.replace(/\D/g, '') || null,
        phone: newOrg.phone?.replace(/\D/g, '').replace(/^8/, '7') || null,
        contact_phone: newOrg.contact_phone?.replace(/\D/g, '').replace(/^8/, '7') || null,
        bank_bik: newOrg.bank_bik?.replace(/\D/g, '') || null,
        bank_account: newOrg.bank_account?.replace(/\D/g, '') || null,
        bank_correspondent_account: newOrg.bank_correspondent_account?.replace(/\D/g, '') || null,
        website: newOrg.website && !newOrg.website.startsWith('http') 
          ? `https://${newOrg.website}` 
          : newOrg.website || null
      }

      const response = await authFetch(`${API_URL}/api/v1/organizations/${editingOrg.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось обновить организацию')
      }

      success('✅ Организация успешно обновлена')
      // Небольшая задержка перед закрытием для показа успешного сообщения
      setTimeout(() => {
        setShowModal(false)
        setEditingOrg(null)
        setSameAsLegalAddress(false)
        reset()
        loadOrganizations()
      }, 500)
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.orgId) return

    try {
      const response = await authFetch(`${API_URL}/api/v1/organizations/${deleteConfirm.orgId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось удалить организацию')
      }

      success('Организация успешно удалена')
      setDeleteConfirm({ isOpen: false, orgId: null })
      loadOrganizations()
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const handleEdit = (org) => {
    setEditingOrg(org)
    const legalAddr = org.legal_address || ''
    const actualAddr = org.actual_address || ''
    setSameAsLegalAddress(legalAddr && legalAddr === actualAddr)
    
    // Разворачиваем секции, если в них есть данные
    setExpandedSections({
      contacts: !!(org.phone || org.email || org.website || org.contact_person || org.contact_phone),
      bankDetails: !!(org.bank_name || org.bank_account || org.bank_bik || org.bank_correspondent_account)
    })
    
    // Форматируем данные при загрузке для отображения
    const formatPhoneForDisplay = (phone) => {
      if (!phone) return ''
      const digits = phone.replace(/\D/g, '')
      if (digits.length === 0) return ''
      return formatPhone(digits)
    }

    const formatINNForDisplay = (inn) => {
      if (!inn) return ''
      const digits = inn.replace(/\D/g, '')
      return formatINN(digits)
    }

    const formatKPPForDisplay = (kpp) => {
      if (!kpp) return ''
      const digits = kpp.replace(/\D/g, '')
      return formatKPP(digits)
    }

    const formatOGRNForDisplay = (ogrn) => {
      if (!ogrn) return ''
      const digits = ogrn.replace(/\D/g, '')
      return formatOGRN(digits)
    }

    const formatBIKForDisplay = (bik) => {
      if (!bik) return ''
      const digits = bik.replace(/\D/g, '')
      return formatBIK(digits)
    }

    const formatAccountForDisplay = (account) => {
      if (!account) return ''
      const digits = account.replace(/\D/g, '')
      return formatAccount(digits)
    }
    
    setValues({
      name: org.name || '',
      code: org.code || '',
      description: org.description || '',
      inn: formatINNForDisplay(org.inn),
      kpp: formatKPPForDisplay(org.kpp),
      ogrn: formatOGRNForDisplay(org.ogrn),
      legal_address: legalAddr,
      actual_address: actualAddr,
      phone: formatPhoneForDisplay(org.phone),
      email: org.email || '',
      website: org.website || '',
      contact_person: org.contact_person || '',
      contact_phone: formatPhoneForDisplay(org.contact_phone),
      bank_name: org.bank_name || '',
      bank_account: formatAccountForDisplay(org.bank_account),
      bank_bik: formatBIKForDisplay(org.bank_bik),
      bank_correspondent_account: formatAccountForDisplay(org.bank_correspondent_account),
      is_active: org.is_active !== undefined ? org.is_active : true
    })
    setShowModal(true)
  }

  const handleAdd = () => {
    setEditingOrg(null)
    setSameAsLegalAddress(false)
    setExpandedSections({
      contacts: false,
      bankDetails: false
    })
    reset()
    setShowModal(true)
  }

  const handleCloseModal = () => {
    // Проверяем, есть ли несохраненные изменения
    const hasChanges = Object.keys(newOrg).some(key => {
      if (key === 'is_active') return false
      const value = newOrg[key]
      return value !== '' && value !== null && value !== undefined
    })

    if (hasChanges) {
      // Показываем подтверждение при наличии изменений
      setCancelConfirm(true)
    } else {
      // Если изменений нет - просто закрываем
      setShowModal(false)
      setEditingOrg(null)
      setSameAsLegalAddress(false)
      reset()
    }
  }

  const handleCancelConfirm = () => {
    setShowModal(false)
    setEditingOrg(null)
    setSameAsLegalAddress(false)
    setCancelConfirm(false)
    reset()
  }

  const handleCancelReject = () => {
    setCancelConfirm(false)
  }

  // Обработчик изменения с форматированием
  const handleFormattedChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value

    // Применяем форматирование в зависимости от поля
    if (name === 'inn') {
      formattedValue = formatINN(value)
    } else if (name === 'kpp') {
      formattedValue = formatKPP(value)
    } else if (name === 'ogrn') {
      formattedValue = formatOGRN(value)
    } else if (name === 'bank_bik') {
      formattedValue = formatBIK(value)
    } else if (name === 'bank_account' || name === 'bank_correspondent_account') {
      formattedValue = formatAccount(value)
    } else if (name === 'phone' || name === 'contact_phone') {
      formattedValue = formatPhone(value)
    }

    // Создаем синтетическое событие с отформатированным значением
    const syntheticEvent = {
      target: {
        name,
        value: formattedValue,
        type: e.target.type,
        checked: e.target.checked
      }
    }
    handleChange(syntheticEvent)
  }

  // Обработчик изменения юридического адреса
  const handleLegalAddressChange = (e) => {
    handleChange(e)
    // Автоматически обновляем фактический адрес, если флажок установлен
    if (sameAsLegalAddress) {
      setValues(prev => ({
        ...prev,
        actual_address: e.target.value
      }))
    }
  }

  // Проверка наличия ошибок в секции
  const hasErrorInSection = (fieldNames) => {
    return fieldNames.some(fieldName => touched[fieldName] && errors[fieldName])
  }

  // Debounce функция для будущих API запросов (ИНН, БИК)
  const debounce = useCallback((key, func, delay = 500) => {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key])
    }
    debounceTimersRef.current[key] = setTimeout(() => {
      func()
      delete debounceTimersRef.current[key]
    }, delay)
  }, [])

  // Обработчик для будущего автозаполнения по ИНН
  const handleINNBlur = useCallback((e) => {
    handleBlur(e)
    const inn = e.target.value.replace(/\D/g, '')
    if (inn.length === 10 || inn.length === 12) {
      // TODO: Реализовать запрос к API для автозаполнения по ИНН
      // debounce('inn', () => {
      //   fetchOrganizationByINN(inn).then(data => {
      //     if (data) {
      //       setValues(prev => ({
      //         ...prev,
      //         name: data.name || prev.name,
      //         ogrn: data.ogrn || prev.ogrn,
      //         legal_address: data.legal_address || prev.legal_address,
      //         kpp: data.kpp || prev.kpp
      //       }))
      //     } else {
      //       info('Данные не найдены. Проверьте ИНН.')
      //     }
      //   }).catch(() => {
      //     info('Не удалось получить данные. Проверьте ИНН.')
      //   })
      // }, 500)
    }
  }, [handleBlur, debounce])

  // Обработчик для будущего автозаполнения по БИК
  const handleBIKBlur = useCallback((e) => {
    handleBlur(e)
    const bik = e.target.value.replace(/\D/g, '')
    if (bik.length === 9) {
      // TODO: Реализовать запрос к API для автозаполнения по БИК
      // debounce('bik', () => {
      //   fetchBankByBIK(bik).then(data => {
      //     if (data) {
      //       setValues(prev => ({
      //         ...prev,
      //         bank_name: data.bank_name || prev.bank_name,
      //         bank_correspondent_account: data.correspondent_account || prev.bank_correspondent_account
      //       }))
      //     } else {
      //       info('Банк не найден. Введите вручную.')
      //     }
      //   }).catch(() => {
      //     info('Не удалось получить данные банка. Введите вручную.')
      //   })
      // }, 500)
    }
  }, [handleBlur, debounce])

  // Обработчик изменения флажка "Совпадает с юридическим"
  const handleSameAddressChange = (e) => {
    const checked = e.target.checked
    setSameAsLegalAddress(checked)
    if (checked) {
      setValues(prev => ({
        ...prev,
        actual_address: prev.legal_address
      }))
    }
  }

  const handleAssignOrgs = async () => {
    if (!assignModal.userId || !assignModal.selectedOrgs.length) {
      showError('Выберите хотя бы одну организацию')
      return
    }

    try {
      const response = await authFetch(`${API_URL}/api/v1/organizations/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: assignModal.userId,
          organization_ids: assignModal.selectedOrgs
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось назначить организации')
      }

      success('Организации успешно назначены пользователю')
      setAssignModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })
      // Перезагружаем список пользователей, если нужно
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const openAssignModal = (userId, userName, currentOrgs = []) => {
    setAssignModal({
      isOpen: true,
      userId,
      userName,
      selectedOrgs: currentOrgs.map(org => org.id)
    })
  }

  if (!isAdmin) {
    return (
      <Card className="organizations-list">
        <div className="empty-state">
          <p>У вас нет доступа к управлению организациями</p>
        </div>
      </Card>
    )
  }

  const columns = [
    { key: 'id', label: 'ID', sortable: false },
    { key: 'name', label: 'Название', sortable: false },
    { key: 'code', label: 'Код', sortable: false },
    { key: 'description', label: 'Описание', sortable: false },
    { key: 'is_active', label: 'Статус', sortable: false },
    { key: 'actions', label: 'Действия', sortable: false }
  ]

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="organizations-list">
      <Card>
        <div className="organizations-header">
          <h2>Организации</h2>
          <div className="organizations-actions">
            <Input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            <Button onClick={handleAdd} variant="primary" icon="+" iconPosition="left">
              Добавить
            </Button>
          </div>
        </div>

        {loading ? (
          <Skeleton count={5} />
        ) : organizations.length === 0 ? (
          <div className="empty-state">
            <p>Организации не найдены</p>
          </div>
        ) : (
          <>
            <Table
              columns={columns}
              data={organizations.map(org => ({
                id: org.id,
                name: org.name,
                code: <Badge variant="secondary">{org.code}</Badge>,
                description: org.description || <span className="text-muted">—</span>,
                is_active: <StatusBadge status={org.is_active ? 'active' : 'inactive'} />,
                actions: (
                  <div className="action-buttons">
                    <IconButton
                      icon="edit"
                      onClick={() => handleEdit(org)}
                      title="Редактировать"
                    />
                    <IconButton
                      icon="trash"
                      onClick={() => setDeleteConfirm({ isOpen: true, orgId: org.id })}
                      title="Удалить"
                      variant="danger"
                    />
                  </div>
                )
              }))}
            />

            {totalPages > 1 && (
              <div className="pagination-wrapper">
                <Button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Назад
                </Button>
                <span>
                  Страница {currentPage} из {totalPages} (всего: {total})
                </span>
                <Button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Вперед
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Модальное окно создания/редактирования */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingOrg ? 'Редактировать организацию' : 'Создать организацию'}
        size="xl"
      >
        <Modal.Body>
          {/* Основная информация */}
          <div className="form-section">
            <h3>Основная информация</h3>
            <div className={`form-group ${touched.name && errors.name ? 'has-error' : ''} ${!newOrg.name && touched.name ? 'required-empty' : ''}`}>
              <label>
                Название <span className="required">*</span>
              </label>
              <Input
                type="text"
                name="name"
                value={newOrg.name}
                onChange={handleNameChange}
                onBlur={handleBlur}
                error={touched.name && errors.name ? `⚠️ ${errors.name}` : undefined}
                placeholder="ООО «Пример»"
                maxLength={255}
                aria-label="Название организации"
                aria-required="true"
                aria-invalid={touched.name && !!errors.name}
              />
            </div>

            <div className="form-row">
              <div className={`form-group ${touched.code && errors.code ? 'has-error' : ''} ${!newOrg.code && touched.code ? 'required-empty' : ''}`}>
                <label>
                  Код <span className="required">*</span>
                </label>
                <Input
                  type="text"
                  name="code"
                  value={newOrg.code}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={touched.code && errors.code ? `⚠️ ${errors.code}` : undefined}
                  placeholder="Автогенерация из названия"
                  maxLength={50}
                  aria-label="Код организации"
                  aria-required="true"
                  aria-invalid={touched.code && !!errors.code}
                />
              </div>
              <div className="form-group">
                <label>
                  ОГРН
                  <Tooltip content="Основной государственный регистрационный номер. Для юридических лиц — 13 цифр, для ИП — 15 цифр." position="top">
                    <span style={{ marginLeft: '0.25rem', cursor: 'help', color: 'var(--text-secondary)' }}>ℹ️</span>
                  </Tooltip>
                </label>
                <Input
                  type="text"
                  name="ogrn"
                  value={newOrg.ogrn || ''}
                  onChange={handleFormattedChange}
                  onBlur={handleBlur}
                  placeholder="12 34 56 78 90 123"
                  error={touched.ogrn && errors.ogrn ? `⚠️ ${errors.ogrn}` : undefined}
                  aria-label="ОГРН организации"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Описание</label>
              <textarea
                name="description"
                value={newOrg.description || ''}
                onChange={handleChange}
                onBlur={handleBlur}
              rows={1}
              className="form-textarea"
              placeholder="Дополнительная информация об организации"
              style={{
                width: '100%',
                padding: '0.25rem 0.375rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                resize: 'vertical',
                minHeight: '1.75rem',
                lineHeight: '1.3'
              }}
              />
            </div>
          </div>

          {/* Реквизиты организации */}
          <div className={`form-section ${hasErrorInSection(['inn', 'kpp', 'ogrn']) ? 'has-error' : ''}`}>
            <h3>Реквизиты</h3>
            <div className="form-row">
              <div className={`form-group ${touched.inn && errors.inn ? 'has-error' : ''} ${!newOrg.inn && touched.inn ? 'required-empty' : ''}`}>
                <label>
                  ИНН <span className="required">*</span>
                  <Tooltip content="Идентификационный номер налогоплательщика. Для юридических лиц — 10 цифр, для ИП — 12 цифр. Включает контрольную сумму." position="top">
                    <span style={{ marginLeft: '0.25rem', cursor: 'help', color: 'var(--text-secondary)' }}>ℹ️</span>
                  </Tooltip>
                </label>
                <Input
                  type="text"
                  name="inn"
                  value={newOrg.inn || ''}
                  onChange={handleFormattedChange}
                  onBlur={handleINNBlur}
                  placeholder="1234 5678 90"
                  error={touched.inn && errors.inn ? `⚠️ ${errors.inn}` : undefined}
                  aria-label="ИНН организации"
                  aria-required="true"
                  aria-invalid={touched.inn && !!errors.inn}
                />
              </div>
              <div className={`form-group ${touched.kpp && errors.kpp ? 'has-error' : ''}`}>
                <label>
                  КПП
                  <Tooltip content="Код причины постановки на учёт — 9 цифр. Первые 4 цифры — код налогового органа, обычно совпадает с первыми 4 цифрами ИНН." position="top">
                    <span style={{ marginLeft: '0.25rem', cursor: 'help', color: 'var(--text-secondary)' }}>ℹ️</span>
                  </Tooltip>
                </label>
                <Input
                  type="text"
                  name="kpp"
                  value={newOrg.kpp || ''}
                  onChange={handleFormattedChange}
                  onBlur={handleBlur}
                  placeholder="1234 56789"
                  error={touched.kpp && errors.kpp ? `⚠️ ${errors.kpp}` : undefined}
                  aria-label="КПП организации"
                />
              </div>
            </div>
          </div>

        {/* Адреса */}
        <div className={`form-section ${hasErrorInSection(['legal_address', 'actual_address']) ? 'has-error' : ''}`}>
          <h3>Адреса</h3>
          {sameAsLegalAddress && (
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontStyle: 'italic' }}>
              💡 При изменении юридического адреса фактический адрес автоматически обновится
            </div>
          )}
          <div className={`form-group ${touched.legal_address && errors.legal_address ? 'has-error' : ''} ${!newOrg.legal_address && touched.legal_address ? 'required-empty' : ''}`}>
            <label>
              Юридический адрес <span className="required">*</span>
            </label>
            <textarea
              name="legal_address"
              value={newOrg.legal_address || ''}
              onChange={handleLegalAddressChange}
              onBlur={handleBlur}
              rows={1}
              className="form-textarea"
              placeholder="г. Москва, ул. Ленина, д. 1, стр. 2"
              aria-label="Юридический адрес организации"
              aria-required="true"
              aria-invalid={touched.legal_address && !!errors.legal_address}
              style={{
                width: '100%',
                padding: '0.25rem 0.375rem',
                border: touched.legal_address && errors.legal_address ? '1px solid var(--error)' : '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                resize: 'vertical',
                minHeight: '1.75rem',
                lineHeight: '1.3'
              }}
            />
            {touched.legal_address && errors.legal_address && (
              <span className="error-message" role="alert" aria-live="polite">
                <span className="error-icon">⚠️</span>
                {errors.legal_address}
              </span>
            )}
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={sameAsLegalAddress}
                onChange={handleSameAddressChange}
                style={{ marginRight: '0.5rem' }}
              />
              Совпадает с юридическим адресом
            </label>
          </div>
          {!sameAsLegalAddress && (
            <div className="form-group">
              <label>Фактический адрес</label>
              <textarea
                name="actual_address"
                value={newOrg.actual_address || ''}
                onChange={handleChange}
                onBlur={handleBlur}
              rows={1}
              className="form-textarea"
              placeholder="г. Москва, ул. Ленина, д. 1, стр. 2"
              aria-label="Фактический адрес организации"
              style={{
                width: '100%',
                padding: '0.25rem 0.375rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                resize: 'vertical',
                minHeight: '1.75rem',
                lineHeight: '1.3'
              }}
              />
            </div>
          )}
          {sameAsLegalAddress && (
            <div className="form-group">
              <label>Фактический адрес</label>
              <textarea
                name="actual_address"
                value={newOrg.actual_address || ''}
                readOnly
              rows={1}
              className="form-textarea"
              aria-label="Фактический адрес организации (совпадает с юридическим)"
              style={{
                width: '100%',
                padding: '0.25rem 0.375rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                resize: 'vertical',
                minHeight: '1.75rem',
                lineHeight: '1.3',
                backgroundColor: 'var(--bg-secondary)',
                cursor: 'not-allowed'
              }}
              />
            </div>
          )}
        </div>

        {/* Контакты */}
        <div className="form-section collapsible-section">
          <div 
            className="form-section-header"
            onClick={() => setExpandedSections({ ...expandedSections, contacts: !expandedSections.contacts })}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                display: 'inline-block', 
                transition: 'transform 0.2s',
                transform: expandedSections.contacts ? 'rotate(90deg)' : 'rotate(0deg)'
              }}>
                ▶
              </span>
              Контакты <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(необязательно)</span>
            </h3>
          </div>
          {expandedSections.contacts && (
            <div className="form-section-content">
              <div className="form-row">
            <div className="form-group">
              <label>Телефон</label>
              <Input
                type="text"
                name="phone"
                value={newOrg.phone || ''}
                onChange={handleFormattedChange}
                onBlur={handleBlur}
                placeholder="+7 (999) 123-45-67"
                error={touched.phone && errors.phone ? `⚠️ ${errors.phone}` : undefined}
                aria-label="Телефон организации"
                aria-invalid={touched.phone && !!errors.phone}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <Input
                type="email"
                name="email"
                value={newOrg.email || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="org@example.com"
                error={touched.email && errors.email ? `⚠️ ${errors.email}` : undefined}
                aria-label="Email организации"
                aria-invalid={touched.email && !!errors.email}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Веб-сайт</label>
            <Input
              type="text"
              name="website"
              value={newOrg.website || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="https://example.com или example.com"
              error={touched.website && errors.website ? `⚠️ ${errors.website}` : undefined}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Контактное лицо</label>
              <Input
                type="text"
                name="contact_person"
                value={newOrg.contact_person || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div className="form-group">
              <label>Контактный телефон</label>
              <Input
                type="text"
                name="contact_phone"
                value={newOrg.contact_phone || ''}
                onChange={handleFormattedChange}
                onBlur={handleBlur}
                placeholder="+7 (999) 123-45-67"
                error={touched.contact_phone && errors.contact_phone ? `⚠️ ${errors.contact_phone}` : undefined}
                aria-label="Контактный телефон"
                aria-invalid={touched.contact_phone && !!errors.contact_phone}
              />
            </div>
          </div>
            </div>
          )}
        </div>

        {/* Банковские реквизиты */}
        <div className={`form-section collapsible-section ${hasErrorInSection(['bank_name', 'bank_account', 'bank_bik', 'bank_correspondent_account']) ? 'has-error' : ''}`}>
          <div 
            className="form-section-header"
            onClick={() => setExpandedSections({ ...expandedSections, bankDetails: !expandedSections.bankDetails })}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ 
                display: 'inline-block', 
                transition: 'transform 0.2s',
                transform: expandedSections.bankDetails ? 'rotate(90deg)' : 'rotate(0deg)'
              }}>
                ▶
              </span>
              Банковские реквизиты <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(необязательно)</span>
            </h3>
          </div>
          {expandedSections.bankDetails && (
            <div className="form-section-content">
              <div className="form-group">
            <label>
              Название банка
            </label>
            <Input
              type="text"
              name="bank_name"
              value={newOrg.bank_name || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="ПАО Банк"
              error={touched.bank_name && errors.bank_name ? `⚠️ ${errors.bank_name}` : undefined}
              aria-label="Название банка"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>
                Расчетный счет
              </label>
              <Input
                type="text"
                name="bank_account"
                value={newOrg.bank_account || ''}
                onChange={handleFormattedChange}
                onBlur={handleBlur}
                placeholder="4070 2810 1000 0000 0000"
                error={touched.bank_account && errors.bank_account ? `⚠️ ${errors.bank_account}` : undefined}
                aria-label="Расчетный счет"
              />
            </div>
            <div className="form-group">
              <label>
                БИК
                <Tooltip content="Банковский идентификационный код — 9 цифр. Первые 2 цифры — код региона. Указывает на конкретный банк." position="top">
                  <span style={{ marginLeft: '0.25rem', cursor: 'help', color: 'var(--text-secondary)' }}>ℹ️</span>
                </Tooltip>
              </label>
              <Input
                type="text"
                name="bank_bik"
                value={newOrg.bank_bik || ''}
                onChange={handleFormattedChange}
                onBlur={handleBIKBlur}
                placeholder="044 525 225"
                error={touched.bank_bik && errors.bank_bik ? `⚠️ ${errors.bank_bik}` : undefined}
                aria-label="БИК банка"
                aria-invalid={touched.bank_bik && !!errors.bank_bik}
              />
            </div>
          </div>
          <div className="form-group">
            <label>
              Корреспондентский счет
              <Tooltip content="Счёт банка в Центральном банке РФ. Обычно начинается с 301. Используется для межбанковских операций." position="top">
                <span style={{ marginLeft: '0.25rem', cursor: 'help', color: 'var(--text-secondary)' }}>ℹ️</span>
              </Tooltip>
            </label>
            <Input
              type="text"
              name="bank_correspondent_account"
              value={newOrg.bank_correspondent_account || ''}
              onChange={handleFormattedChange}
              onBlur={handleBlur}
              placeholder="3010 1810 1000 0000 0593"
              error={touched.bank_correspondent_account && errors.bank_correspondent_account ? `⚠️ ${errors.bank_correspondent_account}` : undefined}
              aria-label="Корреспондентский счет"
            />
          </div>
            </div>
          )}
        </div>

        <div className="form-section">
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                name="is_active"
                checked={newOrg.is_active}
                onChange={handleChange}
                aria-label="Организация активна"
              />
              <Tooltip content="Если отключено — организация не будет доступна для выбора в других модулях системы" position="top">
                <span style={{ marginLeft: '0.5rem' }}>Активна</span>
              </Tooltip>
            </label>
          </div>
        </div>

        </Modal.Body>
        <Modal.Footer>
          {!isValid && (
            <div className="validation-summary" style={{
              flex: 1,
              padding: '0.5rem',
              marginRight: '0.5rem',
              backgroundColor: 'rgba(220, 53, 69, 0.1)',
              border: '1px solid rgba(220, 53, 69, 0.3)',
              borderRadius: '4px',
              fontSize: '0.75rem',
              color: 'var(--error, #dc3545)',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              <strong>⚠️ Исправьте ошибки:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                {(() => {
                  const fieldLabels = {
                    name: 'Название',
                    code: 'Код',
                    inn: 'ИНН',
                    legal_address: 'Юридический адрес',
                    kpp: 'КПП',
                    ogrn: 'ОГРН',
                    email: 'Email',
                    website: 'Веб-сайт',
                    phone: 'Телефон',
                    contact_phone: 'Контактный телефон',
                    bank_name: 'Название банка',
                    bank_account: 'Расчетный счет',
                    bank_bik: 'БИК',
                    bank_correspondent_account: 'Корреспондентский счет'
                  }
                  
                  const issues = []
                  
                  // Сначала проверяем ошибки валидации (они более конкретные)
                  Object.keys(errors).forEach(key => {
                    if (errors[key]) {
                      issues.push({
                        key,
                        label: fieldLabels[key] || key,
                        message: errors[key],
                        priority: 1
                      })
                    }
                  })
                  
                  // Затем проверяем незаполненные обязательные поля (если нет ошибки валидации)
                  Object.keys(validationRules).forEach(key => {
                    const rule = validationRules[key]
                    if (rule && rule.required) {
                      const value = newOrg[key]
                      const isEmpty = !value || (typeof value === 'string' && value.trim() === '')
                      const hasError = errors[key]
                      
                      if (isEmpty && !hasError) {
                        issues.push({
                          key,
                          label: fieldLabels[key] || key,
                          message: 'Не заполнено',
                          priority: 2
                        })
                      }
                    }
                  })
                  
                  // Сортируем по приоритету (ошибки валидации сначала)
                  issues.sort((a, b) => (a.priority || 2) - (b.priority || 2))
                  
                  if (issues.length === 0) {
                    // Если нет явных ошибок, но форма невалидна, проверяем обязательные поля
                    const missingRequired = Object.keys(validationRules)
                      .filter(key => {
                        const rule = validationRules[key]
                        if (!rule || !rule.required) return false
                        const value = newOrg[key]
                        const isEmpty = value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')
                        return isEmpty
                      })
                      .map(key => fieldLabels[key] || key)
                    
                    if (missingRequired.length > 0) {
                      return (
                        <>
                          <li>Не заполнены обязательные поля:</li>
                          {missingRequired.map(field => (
                            <li key={field} style={{ marginLeft: '1rem', marginBottom: '0.125rem' }}>
                              • {field}
                            </li>
                          ))}
                        </>
                      )
                    }
                    
                    // Проверяем, есть ли ошибки валидации, которые не были добавлены в issues
                    const validationErrors = Object.keys(errors).filter(key => errors[key])
                    if (validationErrors.length > 0) {
                      return (
                        <>
                          <li>Ошибки валидации:</li>
                          {validationErrors.map(key => (
                            <li key={key} style={{ marginLeft: '1rem', marginBottom: '0.125rem' }}>
                              <strong>{fieldLabels[key] || key}</strong>: {errors[key]}
                            </li>
                          ))}
                        </>
                      )
                    }
                    
                    return <li>Проверьте заполнение всех обязательных полей</li>
                  }
                  
                  return issues.map(issue => (
                    <li key={issue.key} style={{ marginBottom: '0.125rem' }}>
                      <strong>{issue.label}</strong>: {issue.message}
                    </li>
                  ))
                })()}
              </ul>
            </div>
          )}
          <Button 
            onClick={handleCloseModal} 
            variant="secondary"
            aria-label="Отменить создание организации"
          >
            Отмена
          </Button>
          <Button
            onClick={editingOrg ? handleUpdate : handleCreate}
            variant="primary"
            disabled={!isValid}
            aria-label={editingOrg ? 'Сохранить изменения организации' : 'Создать организацию'}
            title={!isValid ? 'Заполните все обязательные поля и исправьте ошибки' : ''}
          >
            {editingOrg ? 'Сохранить' : 'Создать'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Модальное окно подтверждения удаления */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, orgId: null })}
        onConfirm={handleDelete}
        title="Удалить организацию?"
        message="Это действие нельзя отменить. Все связанные данные будут потеряны."
      />

      {/* Модальное окно подтверждения отмены */}
      <ConfirmModal
        isOpen={cancelConfirm}
        onClose={handleCancelReject}
        onConfirm={handleCancelConfirm}
        title="Отменить создание организации?"
        message="Вы уверены, что хотите отменить создание организации? Все введенные данные будут потеряны."
        confirmText="Да, отменить"
        cancelText="Продолжить редактирование"
      />

      {/* Модальное окно назначения организаций пользователю */}
      <Modal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })}
        title={`Назначить организации пользователю: ${assignModal.userName}`}
      >
        <Modal.Body>
          <div className="form-group">
          <label>Выберите организации:</label>
          {organizations.map(org => (
            <label key={org.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={assignModal.selectedOrgs.includes(org.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setAssignModal(prev => ({
                      ...prev,
                      selectedOrgs: [...prev.selectedOrgs, org.id]
                    }))
                  } else {
                    setAssignModal(prev => ({
                      ...prev,
                      selectedOrgs: prev.selectedOrgs.filter(id => id !== org.id)
                    }))
                  }
                }}
              />
              {org.name} ({org.code})
            </label>
          ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            onClick={() => setAssignModal({ isOpen: false, userId: null, userName: '', selectedOrgs: [] })}
            variant="secondary"
          >
            Отмена
          </Button>
          <Button
            onClick={handleAssignOrgs}
            variant="primary"
            disabled={!assignModal.selectedOrgs.length}
          >
            Назначить
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default OrganizationsList
