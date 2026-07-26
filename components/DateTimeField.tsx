import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { HapticPressable } from './HapticPressable';
import { useTheme } from '../context/ThemeContext';
import { formatPickerDate, parsePickerDate } from '../utils/datePicker';

interface DateTimeFieldProps {
  value?: string;
  mode: 'date';
  onChange: (next: string) => void;
  placeholder?: string;
  testID?: string;
}

export function DateTimeField({
  value,
  mode,
  onChange,
  placeholder = 'Sin fecha definida',
  testID,
}: DateTimeFieldProps) {
  const { theme } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);
  const pickerValue = useMemo(() => parsePickerDate(value), [value]);
  const displayValue = value || placeholder;

  return (
    <View>
      <HapticPressable
        onPress={() => setPickerVisible((current) => !current)}
        style={[
          styles.field,
          {
            borderColor: theme.primary,
            backgroundColor: theme.blurTint === 'light' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.07)',
          },
        ]}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <View style={styles.fieldContent}>
          <Text style={[styles.value, { color: value ? theme.text : theme.textMuted }]}>{displayValue}</Text>
          <Text style={[styles.action, { color: theme.primary }]}>{pickerVisible ? 'Ocultar selector' : 'Elegir fecha'}</Text>
        </View>
      </HapticPressable>

      {value ? (
        <HapticPressable onPress={() => onChange('')} style={styles.clearAction} testID={testID ? `${testID}-clear` : undefined}>
          <Text style={[styles.clearText, { color: theme.textMuted }]}>Quitar fecha</Text>
        </HapticPressable>
      ) : null}

      {pickerVisible ? (
        <DateTimePicker
          testID={testID}
          value={pickerValue}
          mode={mode}
          presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
          onDismiss={() => setPickerVisible(false)}
          onValueChange={(_, nextDate) => {
            onChange(formatPickerDate(nextDate));
            setPickerVisible(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  fieldContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  value: {
    flex: 1,
    fontSize: 16,
  },
  action: {
    fontSize: 13,
    fontWeight: '800',
  },
  clearAction: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  clearText: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
