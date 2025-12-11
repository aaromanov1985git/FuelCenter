import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { useScrollLock } from '../../../hooks/useScrollLock';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = ''
}) => {
  const modalRef = useFocusTrap(isOpen);
  useScrollLock(isOpen);

  useEffect(() => {
    if (!closeOnEsc) return;

    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, closeOnEsc]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalClasses = [
    'ui-modal',
    `ui-modal-${size}`,
    className
  ].filter(Boolean).join(' ');

  return createPortal(
    <div className="ui-modal-overlay" onClick={handleOverlayClick}>
      <div ref={modalRef} className={modalClasses} role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined}>
        {(title || showCloseButton) && (
          <div className="ui-modal-header">
            {title && <h3 id="modal-title" className="ui-modal-title">{title}</h3>}
            {showCloseButton && (
              <button
                className="ui-modal-close"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="ui-modal-content">{children}</div>
      </div>
    </div>,
    document.body
  );
};

Modal.Body = ({ children, className = '' }) => (
  <div className={`ui-modal-body ${className}`}>{children}</div>
);

Modal.Footer = ({ children, className = '' }) => (
  <div className={`ui-modal-footer ${className}`}>{children}</div>
);

export default Modal;
