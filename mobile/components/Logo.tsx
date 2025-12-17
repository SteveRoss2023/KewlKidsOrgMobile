import React from 'react';
import Svg, { Circle, Path, Rect, Line, G } from 'react-native-svg';

interface LogoProps {
  width?: number;
  height?: number;
  color?: string;
}

export default function Logo({ width = 32, height = 32, color = '#007AFF' }: LogoProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 40 40" fill="none">
      {/* Background circle */}
      <Circle cx="20" cy="20" r="18" fill={color} opacity="0.1" />
      
      {/* Family/People icon */}
      <G fill={color}>
        {/* Adult 1 */}
        <Circle cx="14" cy="14" r="4" />
        <Path d="M14 20C14 20 10 22 10 24V26H18V24C18 22 14 20 14 20Z" />
        
        {/* Adult 2 */}
        <Circle cx="26" cy="14" r="4" />
        <Path d="M26 20C26 20 30 22 30 24V26H22V24C22 22 26 20 26 20Z" />
        
        {/* Child */}
        <Circle cx="20" cy="18" r="3" />
        <Path d="M20 22C20 22 17 23.5 17 25V27H23V25C23 23.5 20 22 20 22Z" />
      </G>
      
      {/* Calendar/Organizer accent */}
      <Rect x="12" y="28" width="16" height="8" rx="1" fill={color} opacity="0.3" />
      <Line x1="16" y1="28" x2="16" y2="36" stroke={color} strokeWidth="1" />
      <Line x1="20" y1="28" x2="20" y2="36" stroke={color} strokeWidth="1" />
      <Line x1="24" y1="28" x2="24" y2="36" stroke={color} strokeWidth="1" />
    </Svg>
  );
}














