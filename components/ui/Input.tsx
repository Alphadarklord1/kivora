'use client';

import React, { forwardRef, useState } from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth = true,
      className,
      style,
      id,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

    const sizeStyles = {
      sm: { padding: '6px 10px', fontSize: '13px' },
      md: { padding: '10px 14px', fontSize: '14px' },
      lg: { padding: '12px 16px', fontSize: '15px' },
    };

    return (
      <div style={{ width: fullWidth ? '100%' : 'auto', ...style }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary, #374151)',
            }}
          >
            {label}
            {props.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
          </label>
        )}

        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {leftIcon && (
            <span
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--text-secondary, #9ca3af)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            {...props}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            style={{
              width: '100%',
              ...sizeStyles[size],
              paddingLeft: leftIcon ? '40px' : sizeStyles[size].padding.split(' ')[1],
              paddingRight: rightIcon ? '40px' : sizeStyles[size].padding.split(' ')[1],
              border: `1px solid ${error ? '#ef4444' : focused ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #d1d5db)'}`,
              borderRadius: '8px',
              backgroundColor: 'var(--bg-primary, white)',
              color: 'var(--text-primary, #1f2937)',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: focused ? `0 0 0 3px ${error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'}` : 'none',
            }}
          />

          {rightIcon && (
            <span
              style={{
                position: 'absolute',
                right: '12px',
                color: 'var(--text-secondary, #9ca3af)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {rightIcon}
            </span>
          )}
        </div>

        {(error || hint) && (
          <p
            style={{
              marginTop: '6px',
              fontSize: '13px',
              color: error ? '#ef4444' : 'var(--text-secondary, #6b7280)',
            }}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Textarea component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, fullWidth = true, style, id, ...props }, ref) => {
    const [focused, setFocused] = useState(false);
    const textareaId = id || `textarea-${Math.random().toString(36).substring(2, 9)}`;

    return (
      <div style={{ width: fullWidth ? '100%' : 'auto', ...style }}>
        {label && (
          <label
            htmlFor={textareaId}
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary, #374151)',
            }}
          >
            {label}
            {props.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: '14px',
            border: `1px solid ${error ? '#ef4444' : focused ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #d1d5db)'}`,
            borderRadius: '8px',
            backgroundColor: 'var(--bg-primary, white)',
            color: 'var(--text-primary, #1f2937)',
            outline: 'none',
            resize: 'vertical',
            minHeight: '100px',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            boxShadow: focused ? `0 0 0 3px ${error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'}` : 'none',
            fontFamily: 'inherit',
          }}
        />

        {(error || hint) && (
          <p
            style={{
              marginTop: '6px',
              fontSize: '13px',
              color: error ? '#ef4444' : 'var(--text-secondary, #6b7280)',
            }}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Select component
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      size = 'md',
      fullWidth = true,
      placeholder,
      style,
      id,
      ...props
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const selectId = id || `select-${Math.random().toString(36).substring(2, 9)}`;

    const sizeStyles = {
      sm: { padding: '6px 32px 6px 10px', fontSize: '13px' },
      md: { padding: '10px 36px 10px 14px', fontSize: '14px' },
      lg: { padding: '12px 40px 12px 16px', fontSize: '15px' },
    };

    return (
      <div style={{ width: fullWidth ? '100%' : 'auto', ...style }}>
        {label && (
          <label
            htmlFor={selectId}
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary, #374151)',
            }}
          >
            {label}
            {props.required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
          </label>
        )}

        <div style={{ position: 'relative' }}>
          <select
            ref={ref}
            id={selectId}
            {...props}
            onFocus={(e) => {
              setFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              props.onBlur?.(e);
            }}
            style={{
              width: '100%',
              ...sizeStyles[size],
              border: `1px solid ${error ? '#ef4444' : focused ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #d1d5db)'}`,
              borderRadius: '8px',
              backgroundColor: 'var(--bg-primary, white)',
              color: 'var(--text-primary, #1f2937)',
              outline: 'none',
              appearance: 'none',
              cursor: 'pointer',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: focused ? `0 0 0 3px ${error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'}` : 'none',
            }}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown arrow */}
          <span
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-secondary, #9ca3af)',
            }}
          >
            ▼
          </span>
        </div>

        {(error || hint) && (
          <p
            style={{
              marginTop: '6px',
              fontSize: '13px',
              color: error ? '#ef4444' : 'var(--text-secondary, #6b7280)',
            }}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

// Checkbox component
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, style, id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substring(2, 9)}`;

    return (
      <div style={style}>
        <label
          htmlFor={checkboxId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
            opacity: props.disabled ? 0.6 : 1,
          }}
        >
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            {...props}
            style={{
              width: '18px',
              height: '18px',
              accentColor: 'var(--accent-color, #3b82f6)',
              cursor: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              color: 'var(--text-primary, #374151)',
            }}
          >
            {label}
          </span>
        </label>
        {error && (
          <p style={{ marginTop: '4px', marginLeft: '28px', fontSize: '13px', color: '#ef4444' }}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
