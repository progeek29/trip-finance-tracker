import React from 'react';

interface MemberAvatarProps {
  name: string;
  avatar?: string;
  memberId?: string;
  index?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const sizes: Record<string, string> = {
  xs: 'w-6 h-6 text-[13px]',
  sm: 'w-8 h-8 text-base',
  md: 'w-10 h-10 text-xl',
  lg: 'w-12 h-12 text-2xl',
};

/** Lightweight member avatar: initials only, with no image or network cost. */
export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  name,
  avatar,
  memberId,
  index = 0,
  size = 'md',
  ring = true,
}) => {
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div
      title={name}
      className={`${sizes[size]} rounded-full flex items-center justify-center flex-shrink-0 bg-indigo-600 text-white ${ring ? 'border-2 border-white shadow-sm' : 'border border-indigo-500 shadow-sm'}`}
    >
      <span className="leading-none font-extrabold">{initials}</span>
    </div>
  );
};
