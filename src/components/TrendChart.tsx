import { useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** The Home trend chart. Its own file so recharts (the biggest script on Home) loads after the numbers. */
export default function TrendChart({
  points,
  metric,
  label,
  format,
}: {
  points: Array<Record<string, number | string>>;
  metric: string;
  label: string;
  format: (v: number) => string;
}) {
  const reduced = useReducedMotion();
  // Hairline horizontal grid and quiet axes, so the data line carries the card.
  const axis = {
    tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
    axisLine: false,
    tickLine: false,
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.18} />
            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="day" {...axis} minTickGap={24} />
        <YAxis {...axis} width={52} tickFormatter={format} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            fontSize: 12,
            color: "hsl(var(--foreground))",
            boxShadow: "0 12px 32px -8px hsl(var(--shadow) / 0.25)",
          }}
          formatter={(v: number) => [format(v), label]}
        />
        <Area
          type="monotone"
          dataKey={metric}
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          fill="url(#trend-fill)"
          isAnimationActive={!reduced}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
