import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Button, Input, Modal, Skeleton, Tooltip } from './ui'
import ConfirmModal from './ConfirmModal'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './OrganizationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Inline SVG icons matching design reference
const Icons = {
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  edit: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  bldg: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" />
    </svg>
  ),
}

const OrganizationsList = () => {
  const { user: currentUser } = useAuth()
  const { success, error: showError, info } = useToast()

  const [organizations, setOrganizations] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState(null)
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
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase()
      .substring(0, 50)
  }

  const handleNameChange = (e) => {
    handleChange(e)
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

  const formatINN = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 10) {
      return digits.match(/.{1,4}/g)?.join(' ') || digits
    }
    return digits.slice(0, 10).match(/.{1,4}/g)?.join(' ') || digits.slice(0, 10)
  }

  const formatKPP = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 9) {
      return digits.length <= 4 ? digits : `${digits.slice(0, 4)} ${digits.slice(4)}`
    }
    const limited = digits.slice(0, 9)
    return `${limited.slice(0, 4)} ${limited.slice(4)}`
  }

  const formatOGRN = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 13) {
      return digits.match(/.{1,2}/g)?.join(' ') || digits
    }
    return digits.slice(0, 13).match(/.{1,2}/g)?.join(' ') || digits.slice(0, 13)
  }

  const formatBIK = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 9) {
      return digits.length <= 3 ? digits : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
    }
    const limited = digits.slice(0, 9)
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`
  }

  const formatAccount = (value) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 20) {
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
        // Non-blocking
      }
    }
    if (digits.length === 12) {
      const weights1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
      let sum1 = 0
      for (let i = 0; i < 10; i++) {
        sum1 += parseInt(digits[i], 10) * weights1[i]
      }
      const checkDigit1 = sum1 % 11
      const expectedCheck1 = checkDigit1 < 10 ? checkDigit1 : 0
      const actualCheck1 = parseInt(digits[10], 10)

      const weights2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
      let sum2 = 0
      for (let i = 0; i < 11; i++) {
        sum2 += parseInt(digits[i], 10) * weights2[i]
      }
      const checkDigit2 = sum2 % 11
      const expectedCheck2 = checkDigit2 < 10 ? checkDigit2 : 0
      const actualCheck2 = parseInt(digits[11], 10)

      if (actualCheck1 !== expectedCheck1 || actualCheck2 !== expectedCheck2) {
        // Non-blocking
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
    const taxCode = digits.slice(0, 4)
    if (taxCode === '0000') {
      return 'Неверный код налогового органа'
    }
    return null
  }

  const validateBIK = (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return null
    }
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 9) {
      return 'БИК должен содержать 9 цифр'
    }
    const regionCode = digits.slice(0, 2)
    if (regionCode === '00') {
      return 'Неверный код региона в БИК'
    }
    return null
  }

  const validateAccount = (value, fieldName = 'Счёт') => {
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

  useEffect(() => {
    if (search) {
      setCurrentPage(1)
    }
  }, [search])

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
          const items = data.items || []
          setOrganizations(items)
          setTotal(data.total || 0)
          // maintain selection if still present, else pick first
          setSelectedOrgId(prev => {
            if (prev && items.some(o => o.id === prev)) return prev
            return items.length ? items[0].id : null
          })
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

  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach(timer => {
        if (timer) clearTimeout(timer)
      })
      debounceTimersRef.current = {}
    }
  }, [])

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
      const items = data.items || []
      setOrganizations(items)
      setTotal(data.total || 0)
      setSelectedOrgId(prev => {
        if (prev && items.some(o => o.id === prev)) return prev
        return items.length ? items[0].id : null
      })
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
    const requiredFields = Object.keys(validationRules).filter(key => validationRules[key]?.required)
    const touchedFields = {}
    requiredFields.forEach(field => {
      touchedFields[field] = true
    })
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
    const requiredFields = Object.keys(validationRules).filter(key => validationRules[key]?.required)
    const touchedFields = {}
    requiredFields.forEach(field => {
      touchedFields[field] = true
    })
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

    setExpandedSections({
      contacts: !!(org.phone || org.email || org.website || org.contact_person || org.contact_phone),
      bankDetails: !!(org.bank_name || org.bank_account || org.bank_bik || org.bank_correspondent_account)
    })

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
    const hasChanges = Object.keys(newOrg).some(key => {
      if (key === 'is_active') return false
      const value = newOrg[key]
      return value !== '' && value !== null && value !== undefined
    })

    if (hasChanges) {
      setCancelConfirm(true)
    } else {
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

  const handleFormattedChange = (e) => {
    const { name, value } = e.target
    let formattedValue = value

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

  const handleLegalAddressChange = (e) => {
    handleChange(e)
    if (sameAsLegalAddress) {
      setValues(prev => ({
        ...prev,
        actual_address: e.target.value
      }))
    }
  }

  const hasErrorInSection = (fieldNames) => {
    return fieldNames.some(fieldName => touched[fieldName] && errors[fieldName])
  }

  const debounce = useCallback((key, func, delay = 500) => {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key])
    }
    debounceTimersRef.current[key] = setTimeout(() => {
      func()
      delete debounceTimersRef.current[key]
    }, delay)
  }, [])

  const handleINNBlur = useCallback((e) => {
    handleBlur(e)
    const inn = e.target.value.replace(/\D/g, '')
    if (inn.length === 10 || inn.length === 12) {
      // TODO: autocomplete by INN
    }
  }, [handleBlur, debounce])

  const handleBIKBlur = useCallback((e) => {
    handleBlur(e)
    const bik = e.target.value.replace(/\D/g, '')
    if (bik.length === 9) {
      // TODO: autocomplete bank by BIK
    }
  }, [handleBlur, debounce])

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
      <div className="org-root">
        <div className="org-empty">
          <p>У вас нет доступа к управлению организациями</p>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(total / limit)
  const activeCount = organizations.filter(o => o.is_active).length
  const selectedOrg = organizations.find(o => o.id === selectedOrgId) || organizations[0] || null

  const kpis = [
    { label: 'Всего организаций', value: total, color: 'var(--text-1)' },
    { label: 'Активных', value: activeCount, color: 'var(--green)' },
    { label: 'Неактивных', value: organizations.length - activeCount, color: 'var(--text-3)' },
    { label: 'На странице', value: organizations.length, color: 'var(--accent)' },
  ]

  return (
    <div className="org-root" data-testid="organizations-list">
      {/* KPI row */}
      <div className="org-kpi-grid">
        {kpis.map((k, i) => (
          <div key={k.label} className="org-kpi-card" data-testid={`org-kpi-${i}`}>
            <div className="org-kpi-accent" style={{ background: k.color }} />
            <div className="org-kpi-body">
              <div className="t-label">{k.label}</div>
              <div className="org-kpi-value" style={{ color: k.color }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="org-toolbar">
        <div className="org-search">
          <span className="org-search-icon">{Icons.search}</span>
          <input
            type="text"
            className="org-search-input"
            placeholder="Поиск по названию, коду, ИНН..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск организаций"
            data-testid="org-search-input"
          />
        </div>
        <button
          type="button"
          className="org-btn org-btn-primary"
          onClick={handleAdd}
          data-testid="org-add-btn"
          aria-label="Добавить организацию"
        >
          {Icons.plus}
          <span>Добавить</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="org-skeleton-wrap">
          <Skeleton count={5} />
        </div>
      ) : organizations.length === 0 ? (
        <div className="org-empty">
          <p>Организации не найдены</p>
        </div>
      ) : (
        <>
          <div className="org-split">
            {/* LEFT: list */}
            <div className="org-list-card">
              <div className="org-list-head">
                <span className="t-label" style={{ color: 'var(--text-3)' }}>
                  Список · {total}
                </span>
              </div>
              <div className="org-list-body">
                {organizations.map(org => {
                  const isActive = org.id === (selectedOrg && selectedOrg.id)
                  return (
                    <div
                      key={org.id}
                      className={`org-list-item ${isActive ? 'org-list-item-active' : ''}`}
                      onClick={() => setSelectedOrgId(org.id)}
                      data-testid={`org-list-item-${org.id}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedOrgId(org.id) }}
                    >
                      <div className="org-list-item-head">
                        <div className={`org-list-item-tile ${org.is_active ? 'org-list-item-tile-active' : ''}`}>
                          {Icons.bldg}
                        </div>
                        <div className="org-list-item-main">
                          <div className="org-list-item-name">{org.name}</div>
                          {org.inn && (
                            <div className="org-list-item-inn">ИНН {org.inn}</div>
                          )}
                        </div>
                        {!org.is_active && (
                          <span className="org-chip org-chip-muted">Неактивна</span>
                        )}
                      </div>
                      {org.code && (
                        <div className="org-list-item-code">{org.code}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* RIGHT: details */}
            {selectedOrg && (
              <div className="org-detail-card" data-testid="org-detail-card">
                <div className="org-detail-head">
                  <div className={`org-detail-badge ${selectedOrg.is_active ? 'org-detail-badge-active' : ''}`}>
                    <span style={{ transform: 'scale(1.3)', display: 'inline-flex' }}>{Icons.bldg}</span>
                  </div>
                  <div className="org-detail-info">
                    <div className="org-detail-title-row">
                      <h2 className="org-detail-title">{selectedOrg.name}</h2>
                      <span className={`org-chip ${selectedOrg.is_active ? 'org-chip-green' : 'org-chip-muted'}`}>
                        {selectedOrg.is_active ? 'Активна' : 'Неактивна'}
                      </span>
                    </div>
                    <div className="org-detail-sub">
                      {selectedOrg.description || 'Без описания'}
                    </div>
                  </div>
                  <div className="org-detail-actions">
                    <button
                      type="button"
                      className="org-btn org-btn-secondary"
                      onClick={() => handleEdit(selectedOrg)}
                      title="Редактировать"
                      aria-label="Редактировать"
                      data-testid={`org-edit-btn-${selectedOrg.id}`}
                    >
                      {Icons.edit}
                      <span>Изменить</span>
                    </button>
                    <button
                      type="button"
                      className="org-btn org-btn-secondary"
                      onClick={() => setDeleteConfirm({ isOpen: true, orgId: selectedOrg.id })}
                      title="Удалить"
                      aria-label="Удалить"
                      data-testid={`org-delete-btn-${selectedOrg.id}`}
                      style={{ color: 'var(--red)' }}
                    >
                      {Icons.trash}
                    </button>
                  </div>
                </div>

                {/* Реквизиты */}
                <div>
                  <div className="org-section-label">Реквизиты</div>
                  <div className="org-field-grid-2">
                    <div className="org-field-tile">
                      <div className="org-field-label">Код</div>
                      <div className="org-field-value org-field-value-mono">{selectedOrg.code || '—'}</div>
                    </div>
                    <div className="org-field-tile">
                      <div className="org-field-label">ИНН</div>
                      <div className="org-field-value org-field-value-mono">{selectedOrg.inn || '—'}</div>
                    </div>
                    <div className="org-field-tile">
                      <div className="org-field-label">КПП</div>
                      <div className="org-field-value org-field-value-mono">{selectedOrg.kpp || '—'}</div>
                    </div>
                    <div className="org-field-tile">
                      <div className="org-field-label">ОГРН</div>
                      <div className="org-field-value org-field-value-mono">{selectedOrg.ogrn || '—'}</div>
                    </div>
                  </div>
                </div>

                {/* Адреса */}
                {(selectedOrg.legal_address || selectedOrg.actual_address) && (
                  <div>
                    <div className="org-section-label">Адреса</div>
                    <div className="org-field-grid-2">
                      <div className="org-field-tile">
                        <div className="org-field-label">Юридический</div>
                        <div className="org-field-value" style={{ whiteSpace: 'normal' }}>
                          {selectedOrg.legal_address || '—'}
                        </div>
                      </div>
                      <div className="org-field-tile">
                        <div className="org-field-label">Фактический</div>
                        <div className="org-field-value" style={{ whiteSpace: 'normal' }}>
                          {selectedOrg.actual_address || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Контакты */}
                {(selectedOrg.phone || selectedOrg.email || selectedOrg.website || selectedOrg.contact_person || selectedOrg.contact_phone) && (
                  <div>
                    <div className="org-section-label">Контакты</div>
                    <div className="org-field-grid-2">
                      {selectedOrg.phone && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Телефон</div>
                          <div className="org-field-value org-field-value-mono">{selectedOrg.phone}</div>
                        </div>
                      )}
                      {selectedOrg.email && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Email</div>
                          <div className="org-field-value">{selectedOrg.email}</div>
                        </div>
                      )}
                      {selectedOrg.website && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Сайт</div>
                          <div className="org-field-value">{selectedOrg.website}</div>
                        </div>
                      )}
                      {selectedOrg.contact_person && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Контактное лицо</div>
                          <div className="org-field-value">{selectedOrg.contact_person}</div>
                        </div>
                      )}
                      {selectedOrg.contact_phone && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Контактный телефон</div>
                          <div className="org-field-value org-field-value-mono">{selectedOrg.contact_phone}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Банк */}
                {(selectedOrg.bank_name || selectedOrg.bank_account || selectedOrg.bank_bik || selectedOrg.bank_correspondent_account) && (
                  <div>
                    <div className="org-section-label">Банковские реквизиты</div>
                    <div className="org-field-grid-2">
                      {selectedOrg.bank_name && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Банк</div>
                          <div className="org-field-value">{selectedOrg.bank_name}</div>
                        </div>
                      )}
                      {selectedOrg.bank_bik && (
                        <div className="org-field-tile">
                          <div className="org-field-label">БИК</div>
                          <div className="org-field-value org-field-value-mono">{selectedOrg.bank_bik}</div>
                        </div>
                      )}
                      {selectedOrg.bank_account && (
                        <div className="org-field-tile">
                          <div className="org-field-label">Р/с</div>
                          <div className="org-field-value org-field-value-mono">{selectedOrg.bank_account}</div>
                        </div>
                      )}
                      {selectedOrg.bank_correspondent_account && (
                        <div className="org-field-tile">
                          <div className="org-field-label">К/с</div>
                          <div className="org-field-value org-field-value-mono">{selectedOrg.bank_correspondent_account}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="org-pagination" data-testid="org-pagination">
              <Button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                variant="secondary"
              >
                Назад
              </Button>
              <span>
                Страница {currentPage} из {totalPages} (всего: {total})
              </span>
              <Button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                variant="secondary"
              >
                Вперед
              </Button>
            </div>
          )}
        </>
      )}

      {/* Модальное окно создания/редактирования */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingOrg ? 'Редактировать организацию' : 'Создать организацию'}
        size="xl"
      >
        <Modal.Body>
          <div className="org-form">
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
                      <span className="tooltip-icon">ℹ️</span>
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
                      <span className="tooltip-icon">ℹ️</span>
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
                      <span className="tooltip-icon">ℹ️</span>
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
                <div className="sync-hint">
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
                />
                {touched.legal_address && errors.legal_address && (
                  <span className="error-message" role="alert" aria-live="polite">
                    <span className="error-icon">⚠️</span>
                    {errors.legal_address}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={sameAsLegalAddress}
                    onChange={handleSameAddressChange}
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
                  />
                </div>
              )}
            </div>

            {/* Контакты */}
            <div className="form-section">
              <div
                className={`form-section-header ${expandedSections.contacts ? 'expanded' : ''}`}
                onClick={() => setExpandedSections({ ...expandedSections, contacts: !expandedSections.contacts })}
                role="button"
                tabIndex={0}
              >
                <h3>
                  <span className="chev">▶</span>
                  Контакты
                  <span className="form-section-hint">(необязательно)</span>
                </h3>
              </div>
              {expandedSections.contacts && (
                <>
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
                </>
              )}
            </div>

            {/* Банковские реквизиты */}
            <div className={`form-section ${hasErrorInSection(['bank_name', 'bank_account', 'bank_bik', 'bank_correspondent_account']) ? 'has-error' : ''}`}>
              <div
                className={`form-section-header ${expandedSections.bankDetails ? 'expanded' : ''}`}
                onClick={() => setExpandedSections({ ...expandedSections, bankDetails: !expandedSections.bankDetails })}
                role="button"
                tabIndex={0}
              >
                <h3>
                  <span className="chev">▶</span>
                  Банковские реквизиты
                  <span className="form-section-hint">(необязательно)</span>
                </h3>
              </div>
              {expandedSections.bankDetails && (
                <>
                  <div className="form-group">
                    <label>Название банка</label>
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
                      <label>Расчетный счет</label>
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
                          <span className="tooltip-icon">ℹ️</span>
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
                        <span className="tooltip-icon">ℹ️</span>
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
                </>
              )}
            </div>

            <div className="form-section">
              <div className="form-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={newOrg.is_active}
                    onChange={handleChange}
                    aria-label="Организация активна"
                  />
                  <Tooltip content="Если отключено — организация не будет доступна для выбора в других модулях системы" position="top">
                    <span>Активна</span>
                  </Tooltip>
                </label>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          {!isValid && (
            <div className="validation-summary">
              <strong>⚠️ Исправьте ошибки:</strong>
              <ul>
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

                  issues.sort((a, b) => (a.priority || 2) - (b.priority || 2))

                  if (issues.length === 0) {
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
                            <li key={field} style={{ marginLeft: '1rem' }}>• {field}</li>
                          ))}
                        </>
                      )
                    }

                    const validationErrors = Object.keys(errors).filter(key => errors[key])
                    if (validationErrors.length > 0) {
                      return (
                        <>
                          <li>Ошибки валидации:</li>
                          {validationErrors.map(key => (
                            <li key={key} style={{ marginLeft: '1rem' }}>
                              <strong>{fieldLabels[key] || key}</strong>: {errors[key]}
                            </li>
                          ))}
                        </>
                      )
                    }

                    return <li>Проверьте заполнение всех обязательных полей</li>
                  }

                  return issues.map(issue => (
                    <li key={issue.key}>
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
          <div className="org-form">
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
