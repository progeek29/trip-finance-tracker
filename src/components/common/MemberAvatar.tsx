import React from 'react';
import { getAvatarColor, getEmojiFor, isEmojiAvatar } from '../../utils/avatar';

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

/** Squad face: simple emoji in a colored circle (photos come later). */
export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  name,
  avatar,
  memberId,
  index = 0,
  size = 'md',
  ring = true,
}) => {
  const emoji = isEmojiAvatar(avatar) ? avatar! : getEmojiFor(`${memberId || ''}${name}`, index);
  const color = getAvatarColor(memberId || name, index);
  return (
    <div
      title={name}
      className={`${sizes[size]} rounded-full flex items-center justify-center flex-shrink-0 ${color} ${ring ? 'border-2 border-white shadow-sm' : ''}`}
    >
      <span className="leading-none">{emoji}</span>
    </div>
  );
};
