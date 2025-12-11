import React from 'react';
import './Skeleton.css';

const Skeleton = ({
  variant = 'text',
  width,
  height,
  circle = false,
  animation = 'pulse',
  className = '',
  count = 1,
  ...props
}) => {
  const skeletonClass = [
    'ui-skeleton',
    `ui-skeleton-${variant}`,
    `ui-skeleton-animation-${animation}`,
    circle && 'ui-skeleton-circle',
    className
  ].filter(Boolean).join(' ');

  const style = {
    width: width || undefined,
    height: height || undefined
  };

  if (count > 1) {
    return (
      <div className="ui-skeleton-group">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className={skeletonClass} style={style} {...props} />
        ))}
      </div>
    );
  }

  return <div className={skeletonClass} style={style} {...props} />;
};

// Предопределённые скелетоны для частых случаев
Skeleton.Text = ({ lines = 3, width = '100%', ...props }) => (
  <Skeleton variant="text" width={width} count={lines} {...props} />
);

Skeleton.Avatar = ({ size = 40, ...props }) => (
  <Skeleton variant="circular" width={size} height={size} circle {...props} />
);

Skeleton.Card = ({ ...props }) => (
  <div className="ui-skeleton-card" {...props}>
    <Skeleton variant="rectangular" height={200} />
    <div style={{ padding: '16px' }}>
      <Skeleton variant="text" width="60%" height={24} />
      <Skeleton variant="text" count={2} />
    </div>
  </div>
);

Skeleton.Table = ({ rows = 5, columns = 4, ...props }) => (
  <div className="ui-skeleton-table" {...props}>
    {/* Header */}
    <div className="ui-skeleton-table-row">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={`header-${i}`} variant="text" height={40} />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={`row-${rowIndex}`} className="ui-skeleton-table-row">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={`cell-${rowIndex}-${colIndex}`} variant="text" height={48} />
        ))}
      </div>
    ))}
  </div>
);

Skeleton.List = ({ items = 5, avatar = true, ...props }) => (
  <div className="ui-skeleton-list" {...props}>
    {Array.from({ length: items }).map((_, index) => (
      <div key={index} className="ui-skeleton-list-item">
        {avatar && <Skeleton variant="circular" width={40} height={40} circle />}
        <div className="ui-skeleton-list-content">
          <Skeleton variant="text" width="80%" height={20} />
          <Skeleton variant="text" width="60%" height={16} />
        </div>
      </div>
    ))}
  </div>
);

export default Skeleton;
