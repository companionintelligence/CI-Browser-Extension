import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";

type ChartComponent = typeof ChartContainer & {
  Legend: typeof ChartLegend;
  LegendContent: typeof ChartLegendContent;
  Style: typeof ChartStyle;
  Tooltip: typeof ChartTooltip;
  TooltipContent: typeof ChartTooltipContent;
};

const AugmentedChart = ChartContainer as ChartComponent;

AugmentedChart.Legend = ChartLegend;
AugmentedChart.LegendContent = ChartLegendContent;
AugmentedChart.Style = ChartStyle;
AugmentedChart.Tooltip = ChartTooltip;
AugmentedChart.TooltipContent = ChartTooltipContent;

export { AugmentedChart as Chart };
