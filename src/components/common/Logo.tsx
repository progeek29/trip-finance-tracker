import React from 'react';

/** WanderSync logo — static PNG pair (the 1.8MB gif is retired).
 * File naming = tile background: `on-indigo` is an indigo tile for
 * white pages (`tone="indigo"`, default); `on-white` is a light tile
 * for indigo headers (`tone="white"`). */
export const Logo: React.FC<{ size?: number; tone?: 'indigo' | 'white' }> = ({
  size = 32,
  tone = 'indigo',
}) => (
  <img
    src={tone === 'white' ? '/wandersync-logo-on-white.png' : '/wandersync-logo-on-indigo.png'}
    alt="WanderSync"
    width={size}
    height={size}
    className="rounded-[30%] object-cover"
    style={{ width: size, height: size }}
  />
);
