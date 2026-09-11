import React from 'react';

/** WanderSync logo — animated compass, same everywhere in the app. */
export const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <img
    src="/wandersync-compass-loop-v3.gif"
    alt="WanderSync"
    width={size}
    height={size}
    className="rounded-[30%] object-cover"
    style={{ width: size, height: size }}
  />
);
