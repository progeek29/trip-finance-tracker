import React from 'react';
import { getAvatarColor, getInitials } from '../../utils/avatar';

interface MemberAvatarProps {
  name: string;
  avatar?: string;
  memberId?: string;
  index?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const sizes: Record<string, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  name,
  avatar,
  memberId,
  index = 0,
  size = 'md',
  ring = true,
}) => {
  const [imgError, setImgError] = React.useState(false);
  const showImg = avatar && !imgError;
  if (showImg) {
    return (
      <img
        src={avatar}
        alt={name}
        title={name}
        onError={() => setImgError(true)}
        className={`${sizes[size]} rounded-full object-cover flex-shrink-0 ${ring ? 'border-2 border-white shadow-sm' : 'border border-slate-200'}`}
      />
    );
  }
  const color = getAvatarColor(memberId || name, index);
  return (
    <div
      title={name}
      className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-extrabold flex-shrink-0 ${color} ${ring ? 'border-2 border-white shadow-sm' : ''}`}
    >
      {getInitials(name)}
    </div>
  );
};
