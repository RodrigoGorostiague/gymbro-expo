import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AtmosphereId } from '../hooks/useLocalAtmosphere';
import { useAnimationActivity } from '../hooks/useAnimationActivity';
const palettes: Record<AtmosphereId, [
    string,
    string,
    string
]> = {
    'local-forge': ['#0D1117', '#281710', '#5F2715'],
    'local-aurora': ['#061321', '#102A42', '#16362E'],
    'local-summit': ['#0D1A2C', '#2D4A61', '#728491'],
    'local-orbit': ['#060A19', '#15153B', '#272044'],
};
/** Four code-native scenes, one animated layer each; static scene survives reduced motion. */
export function ProceduralAtmosphere({ id, animate = true }: {
    id: AtmosphereId;
    animate?: boolean;
}) {
    const active = useAnimationActivity(animate);
    const phase = useSharedValue(0);
    useEffect(() => {
        cancelAnimation(phase);
        phase.value = active ? withRepeat(withTiming(1, { duration: id === 'local-orbit' ? 24000 : 14000, easing: Easing.inOut(Easing.sin) }), -1, true) : 0;
        return () => cancelAnimation(phase);
    }, [active, id, phase]);
    const drift = useAnimatedStyle(() => ({
        opacity: 0.65 + phase.value * 0.2,
        transform: id === 'local-forge' ? [{ translateY: -phase.value * 60 }] : id === 'local-orbit' ? [{ rotate: `${phase.value * 16}deg` }] : [{ translateX: (phase.value - 0.5) * 35 }],
    }));
    return <View testID={`atmosphere-${id}`} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <LinearGradient colors={palettes[id]} style={StyleSheet.absoluteFill}/>
    <Svg width="100%" height="100%" viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">
      {id === 'local-forge' ? <><Path d="M 0 70 L 360 0 L 360 240 L 0 330 Z" fill="#151C23"/><Path d="M 0 420 L 360 340 L 360 600 L 0 690 Z" fill="#18212A"/><Path d="M 0 332 L 360 242 M 0 693 L 360 603" stroke="#FC7C36" strokeWidth="2" opacity="0.7"/></> : null}
      {id === 'local-aurora' ? <><Circle cx="270" cy="130" r="34" fill="#BBF7ED" opacity="0.2"/><Path d="M 0 630 L 75 545 L 130 610 L 220 530 L 360 655 L 360 720 L 0 720 Z" fill="#071520"/></> : null}
      {id === 'local-summit' ? <><Path d="M 0 450 L 130 210 L 270 440 L 360 300 L 360 720 L 0 720Z" fill="#617E91"/><Path d="M 80 300 L 130 210 L 190 310 L 148 281 L 125 290 L 113 267Z" fill="#D5E6EC"/><Path d="M 0 650 L 80 440 L 185 550 L 265 380 L 360 560 L 360 720 L 0 720Z" fill="#233B50"/></> : null}
      {id === 'local-orbit' ? <><Circle cx="240" cy="280" r="85" fill="#635CA3"/><Path d="M 180 222 Q 300 250 270 356 Q 190 365 180 222" fill="#383560"/>{[30, 90, 150, 220, 310].map((x, index) => <Circle key={x} cx={x} cy={60 + index * 115} r="1.5" fill="#CBD5FF"/>)}</> : null}
    </Svg>
    <Animated.View style={[StyleSheet.absoluteFill, drift]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice">
        {id === 'local-forge' ? [45, 100, 155, 235, 290].map((x, index) => <Rect key={x} x={x} y={390 + index * 52} width="3" height={8 + index * 3} rx="1" fill="#FFB663"/>) : null}
        {id === 'local-aurora' ? [0, 1, 2].map((index) => <Path key={index} d={`M -80 ${170 + index * 48} C 80 ${10 + index * 60}, 190 ${410 + index * 30}, 440 ${160 + index * 25}`} fill="none" stroke={['#44DCA9', '#5FC6E8', '#BA8AE5'][index]} strokeWidth={24 - index * 5} opacity={0.3 - index * 0.04}/>) : null}
        {id === 'local-summit' ? <><Ellipse cx="90" cy="155" rx="135" ry="18" fill="#D2E0E7" opacity="0.3"/><Ellipse cx="310" cy="365" rx="170" ry="22" fill="#B5CFDC" opacity="0.2"/></> : null}
        {id === 'local-orbit' ? <><Ellipse cx="240" cy="280" rx="150" ry="47" rotation="-28" origin="240, 280" fill="none" stroke="#BEA5FB" strokeWidth="12" opacity="0.6"/><Circle cx="70" cy="353" r="14" fill="#E9D3AF"/></> : null}
      </Svg>
    </Animated.View>
  </View>;
}
