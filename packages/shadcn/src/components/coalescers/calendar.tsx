import { Calendar, CalendarDayButton } from '../ui/calendar';

type CalendarComponent = typeof Calendar & {
  DayButton: typeof CalendarDayButton;
};

const AugmentedCalendar = Calendar as CalendarComponent;

AugmentedCalendar.DayButton = CalendarDayButton;

export { AugmentedCalendar as Calendar };
