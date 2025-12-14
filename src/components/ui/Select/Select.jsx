import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Select.css';

const Select = ({
  options = [],
  value,
  onChange,
  label,
  placeholder = 'Выберите...',
  error,
  helperText,
  disabled = false,
  required = false,
  searchable = false,
  clearable = false,
  fullWidth = false,
  className = '',
  name,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const selectRef = useRef(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Вычисление позиции выпадающего списка
  const updateDropdownPosition = () => {
    if (!selectRef.current) return;
    
    const rect = selectRef.current.getBoundingClientRect();
    
    setDropdownPosition({
      top: rect.bottom + 4, // Для fixed позиционирования используем координаты viewport
      left: rect.left,
      width: rect.width
    });
  };

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      
      const handleResize = () => updateDropdownPosition();
      const handleScroll = () => updateDropdownPosition();
      
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      // Небольшая задержка, чтобы не закрыть сразу после открытия
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleToggle = () => {
    if (!disabled) {
      const newIsOpen = !isOpen;
      setIsOpen(newIsOpen);
      if (newIsOpen) {
        // Обновляем позицию при открытии
        setTimeout(() => updateDropdownPosition(), 0);
      }
    }
  };

  const handleSelect = (option) => {
    onChange?.(option.value);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const wrapperClasses = [
    'select-wrapper',
    error && 'select-error',
    disabled && 'select-disabled',
    fullWidth && 'select-full-width',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses} ref={selectRef}>
      {label && (
        <label className="select-label" htmlFor={name}>
          {label}
          {required && <span className="select-required">*</span>}
        </label>
      )}

      <div
        className={`select-control ${isOpen ? 'select-open' : ''}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
      >
        <div className="select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </div>

        <div className="select-icons">
          {clearable && selectedOption && !disabled && (
            <button
              type="button"
              className="select-clear"
              onClick={handleClear}
              aria-label="Clear selection"
            >
              ×
            </button>
          )}
          <span className={`select-arrow ${isOpen ? 'select-arrow-up' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          ref={dropdownRef}
          className="select-dropdown select-dropdown-portal" 
          role="listbox"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            zIndex: 1100
          }}
        >
          {searchable && (
            <div className="select-search">
              <input
                ref={searchInputRef}
                type="text"
                className="select-search-input"
                placeholder="Поиск..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="select-options">
            {filteredOptions.length === 0 ? (
              <div className="select-empty">Ничего не найдено</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={`select-option ${
                    option.value === value ? 'select-option-selected' : ''
                  }`}
                  onClick={() => handleSelect(option)}
                  role="option"
                  aria-selected={option.value === value}
                >
                  {option.label}
                  {option.value === value && (
                    <span className="select-check">✓</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {(error || helperText) && (
        <div className={`select-helper ${error ? 'select-helper-error' : ''}`}>
          {error || helperText}
        </div>
      )}
    </div>
  );
};

export default Select;
