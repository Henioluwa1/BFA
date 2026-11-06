import React from 'react';
import './BfaCard.css';

/**
 * BfaCard - Restrained Hospitality Card Primitive
 */
export default function BfaCard({
  children,
  variant = 'default', // 'default' | 'ivory' | 'forest' | 'bordered'
  elevation = 'sm', // 'none' | 'xs' | 'sm' | 'md' | 'lg'
  interactive = false,
  className = '',
  as: Component = 'div',
  ...rest
}) {
  const classes = [
    'bfa-lux-card',
    `bfa-lux-card--${variant}`,
    `bfa-lux-card--elevation-${elevation}`,
    interactive ? 'bfa-lux-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}

