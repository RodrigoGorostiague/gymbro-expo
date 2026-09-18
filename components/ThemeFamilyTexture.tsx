import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import type { ThemeFamilyId } from '../constants/themeFamilies';
/** Bounded vector primitives: no canvas per card, no timers and no remote assets. */
export function ThemeFamilyTexture({ family, color, opacity = 0.12 }: {
    family: ThemeFamilyId;
    color: string;
    opacity?: number;
}) {
    return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }]}>
    <Svg width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice">
      {family === 'essential' ? <><Line x1="24" y1="0" x2="24" y2="640" stroke={color}/><Line x1="336" y1="0" x2="336" y2="640" stroke={color}/></> : null}
      {family === 'forge' ? Array.from({ length: 7 }, (_, index) => <Path key={index} d={`M -80 ${index * 120} L 440 ${index * 120 - 150}`} stroke={color} strokeWidth={index % 2 ? 3 : 18}/>) : null}
      {family === 'aurora' ? [0, 1, 2].map((index) => <Path key={index} d={`M -90 ${90 + index * 180} C 220 ${-70 + index * 180}, 100 ${330 + index * 180}, 440 ${130 + index * 180}`} fill="none" stroke={color} strokeWidth={30 - index * 7}/>) : null}
      {family === 'prism' ? <><Polygon points="-30,80 280,0 160,330" fill={color}/><Polygon points="180,340 420,200 370,620" fill="none" stroke={color} strokeWidth="5"/>{[80, 180, 280, 380, 480, 580].map((y) => <Line key={y} x1="0" x2="360" y1={y} y2={y} stroke={color}/>)}</> : null}
      {family === 'forest' ? [0, 1, 2, 3].map((index) => <Path key={index} d={`M ${index * 100 - 40} 680 Q ${index * 100 + 120} 350 ${index * 100 - 30} -20`} fill="none" stroke={color} strokeWidth={index === 1 ? 24 : 4}/>) : null}
      {family === 'summit' ? [0, 1, 2, 3].map((index) => <Path key={index} d={`M -40 ${640 - index * 90} L 130 ${240 - index * 40} L 250 ${420 - index * 55} L 400 ${150 - index * 50}`} fill="none" stroke={color} strokeWidth={index === 0 ? 30 : 3}/>) : null}
      {family === 'orbit' ? [75, 145, 215, 290].map((radius) => <Circle key={radius} cx="290" cy="180" r={radius} fill="none" stroke={color} strokeWidth={radius === 145 ? 14 : 2}/>) : null}
      {family === 'podium' ? <><Rect x="12" y="12" width="336" height="616" rx="12" fill="none" stroke={color} strokeWidth="4"/><Rect x="23" y="23" width="314" height="594" rx="9" fill="none" stroke={color}/><Path d="M 80 0 L 130 0 L 280 640 L 230 640 Z" fill={color}/></> : null}
    </Svg>
  </View>;
}
