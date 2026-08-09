import React from 'react';
import { FlatList, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

type DraggableListProps<T extends { id: string }> = {
  items: readonly T[];
  labelForItem: (item: T, index: number) => string;
  disabled?: (item: T) => boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  children: (item: T, index: number) => React.ReactNode;
  renderPlaceholder?: (item: T, index: number) => React.ReactNode;
  dragEnabled?: boolean;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType<any> | React.ReactElement | null;
  stickyHeaderIndices?: readonly number[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

/** Thin adapter around the official list: drag starts only from its accessible handle. */
export function DraggableList<T extends { id: string }>({ items, labelForItem, disabled = () => false, onReorder, children, renderPlaceholder, dragEnabled = true, ListHeaderComponent, ListFooterComponent, stickyHeaderIndices, contentContainerStyle, style }: DraggableListProps<T>) {
  if (!dragEnabled || Platform.OS === 'android') {
    // Reanimated 4 on Android can still enter the library's removed layout-config path.
    return <FlatList
      data={[...items]}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      stickyHeaderIndices={stickyHeaderIndices ? [...stickyHeaderIndices] : undefined}
      contentContainerStyle={contentContainerStyle}
      style={style}
      renderItem={({ item, index }) => <View style={styles.content}>{children(item, index)}</View>}
    />;
  }

  return <DraggableFlatList
    data={[...items]}
    keyExtractor={(item) => item.id}
    activationDistance={8}
    autoscrollThreshold={56}
    autoscrollSpeed={120}
    ListHeaderComponent={ListHeaderComponent}
    ListFooterComponent={ListFooterComponent}
    stickyHeaderIndices={stickyHeaderIndices ? [...stickyHeaderIndices] : undefined}
    contentContainerStyle={contentContainerStyle}
    style={style}
    renderPlaceholder={({ item, index }) => renderPlaceholder?.(item, index) ?? <View pointerEvents="none" accessible accessibilityLabel={`Posición temporal ${labelForItem(item, index)}`} style={styles.placeholder}><Text style={styles.placeholderText}>Soltá para ubicar aquí</Text></View>}
    onDragBegin={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
    onDragEnd={({ from, to }) => { if (from !== to) onReorder(from, to); }}
    renderItem={({ item, drag, isActive }) => { const index = items.findIndex((candidate) => candidate.id === item.id); return <ScaleDecorator><View style={[styles.row, isActive && styles.active]}><View style={styles.content}>{children(item, index)}</View><Text
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Reordenar ${labelForItem(item, index)}`}
      accessibilityHint="Mantené y arrastrá hacia arriba o abajo para elegir la posición."
      onLongPress={disabled(item) ? undefined : drag}
      style={[styles.handle, disabled(item) && styles.disabled]}
    >☰</Text></View></ScaleDecorator>; }}
  />;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', gap: 6 }, content: { flex: 1 }, handle: { fontSize: 20, minHeight: 44, paddingHorizontal: 8, textAlignVertical: 'center' }, disabled: { opacity: 0.35 }, active: { opacity: 0.94 }, placeholder: { borderColor: '#9CA3AF', borderStyle: 'dashed', borderWidth: 1, borderRadius: 12, marginVertical: 6, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }, placeholderText: { color: '#9CA3AF', fontWeight: '700' } });
