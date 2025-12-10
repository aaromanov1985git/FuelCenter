import React from 'react'
import InputMask from 'react-input-mask'
import './MaskedInput.css'

/**
 * Компонент поля ввода с маской
 * 
 * @param {string} mask - Маска ввода (например: "9999 9999 9999" для карты)
 * @param {string} maskChar - Символ заполнения маски (по умолчанию "_")
 * @param {string} formatChars - Кастомные символы формата
 * @param {string} placeholder - Placeholder
 * @param {function} onChange - Обработчик изменения
 * @param {string} value - Значение
 * @param {string} className - Дополнительные CSS классы
 * @param {string} type - Тип input (по умолчанию "text")
 * @param {object} ...props - Остальные props передаются в InputMask
 */

const MaskedInput = ({
  mask,
  maskChar = '_',
  formatChars,
  placeholder,
  onChange,
  value,
  className = '',
  type = 'text',
  disabled = false,
  required = false,
  maskType, // Извлекаем maskType отдельно, чтобы не передавать в DOM
  ...props
}) => {
  // Предопределенные маски
  const predefinedMasks = {
    // Номер топливной карты: 1234 5678 9012
    cardNumber: {
      mask: '9999 9999 9999',
      formatChars: { '9': '[0-9]' },
      placeholder: '1234 5678 9012'
    },
    // Госномер РФ: А123ВС77 или А 123 ВС 77
    licensePlate: {
      // 2 или 3 цифры региона: а999аа99 или а999аа999
      mask: 'a999aa99[9]',
      formatChars: { 
        'a': '[А-Яа-яA-Za-z]',
        '9': '[0-9]'
      },
      placeholder: 'А123ВС777'
    },
    // Госномер РФ с пробелами: А 123 ВС 77
    licensePlateSpaced: {
      mask: 'a 999 aa 99[9]',
      formatChars: { 
        'a': '[А-Яа-яA-Za-z]',
        '9': '[0-9]'
      },
      placeholder: 'А 123 ВС 777'
    },
    // Дата: ДД.ММ.ГГГГ
    date: {
      mask: '99.99.9999',
      formatChars: { '9': '[0-9]' },
      placeholder: 'ДД.ММ.ГГГГ'
    },
    // Время: ЧЧ:ММ
    time: {
      mask: '99:99',
      formatChars: { '9': '[0-9]' },
      placeholder: 'ЧЧ:ММ'
    },
    // IP-адрес: 192.168.1.1
    ipAddress: {
      mask: '999.999.999.999',
      formatChars: { '9': '[0-9]' },
      placeholder: '192.168.1.1'
    },
    // Порт: 0-65535
    port: {
      mask: '99999',
      formatChars: { '9': '[0-9]' },
      placeholder: '3050'
    },
    // Телефон РФ: +7 (999) 999-99-99
    phone: {
      mask: '+7 (999) 999-99-99',
      formatChars: { '9': '[0-9]' },
      placeholder: '+7 (999) 999-99-99'
    }
  }

  // Если передан тип предопределенной маски
  let finalMask = mask
  let finalFormatChars = formatChars
  let finalPlaceholder = placeholder

  if (maskType && predefinedMasks[maskType]) {
    const predefined = predefinedMasks[maskType]
    finalMask = predefined.mask
    finalFormatChars = predefined.formatChars
    if (!finalPlaceholder) {
      finalPlaceholder = predefined.placeholder
    }
  }

  // Если маска не задана, возвращаем обычный input
  if (!finalMask) {
    return (
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={finalPlaceholder}
        className={`masked-input ${className}`}
        disabled={disabled}
        required={required}
        {...props}
      />
    )
  }

  const handleChange = (e) => {
    if (onChange) {
      onChange(e)
    }
  }

  return (
    <InputMask
      mask={finalMask}
      maskChar={maskChar}
      formatChars={finalFormatChars}
      value={value || ''}
      onChange={handleChange}
      disabled={disabled}
      alwaysShowMask={false}
      {...props}
    >
      {(inputProps) => (
        <input
          {...inputProps}
          type={type}
          placeholder={finalPlaceholder}
          className={`masked-input ${className}`}
          required={required}
        />
      )}
    </InputMask>
  )
}

export default MaskedInput

