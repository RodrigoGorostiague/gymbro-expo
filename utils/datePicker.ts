const formatDatePart = (value: number) => value.toString().padStart(2, '0');

export const formatPickerDate = (value: Date) => (
  `${value.getFullYear()}-${formatDatePart(value.getMonth() + 1)}-${formatDatePart(value.getDate())}`
);

export const parsePickerDate = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }

  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};
