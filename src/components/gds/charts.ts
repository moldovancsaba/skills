import { createElement } from "react";
import {
  ResponsiveContainer as RechartsResponsiveContainer,
  type ResponsiveContainerProps,
} from "recharts";

export {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ResponsiveContainer({
  minWidth = 1,
  minHeight = 1,
  ...props
}: ResponsiveContainerProps) {
  return createElement(RechartsResponsiveContainer, {
    minWidth,
    minHeight,
    ...props,
  });
}
