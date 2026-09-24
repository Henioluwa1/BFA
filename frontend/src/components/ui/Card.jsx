import React from 'react';

export default function Card({ title, action, headerAction, children, className = '', ...props }) {
  const cardAction = action || headerAction;
  return (
    <div className={`card ${className}`} {...props}>
      {(title || cardAction) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {cardAction && <div className="card-action">{cardAction}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}
